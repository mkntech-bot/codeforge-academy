
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, message: "Method not allowed." },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        { success: false, message: "Authentication required." },
        401
      );
    }

    const token = authorization.replace("Bearer ", "");

    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: { Authorization: authorization },
        },
      }
    );

    const { data: userData, error: userError } =
      await userClient.auth.getUser(token);

    if (userError || !userData.user) {
      return jsonResponse(
        { success: false, message: "Invalid or expired session." },
        401
      );
    }

    const { data: isAdmin, error: adminError } =
      await userClient.rpc("is_admin");

    if (adminError || isAdmin !== true) {
      return jsonResponse(
        { success: false, message: "Administrator access required." },
        403
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const body = await req.json();

    const {
      action,
      submission_id,
      answer_id,
      marks_awarded,
      feedback,
    } = body;

    if (!submission_id || !action) {
      return jsonResponse(
        { success: false, message: "Missing required information." },
        400
      );
    }

    // Load submission.
    const { data: submission, error: submissionError } =
      await supabaseAdmin
        .from("student_submissions")
        .select("id, auto_marks, result_published, assignment_id")
        .eq("id", submission_id)
        .maybeSingle();

    if (submissionError || !submission) {
      return jsonResponse(
        { success: false, message: "Submission not found." },
        404
      );
    }

    if (submission.result_published) {
      return jsonResponse(
        {
          success: false,
          message: "This result has already been published.",
        },
        409
      );
    }

    // ACTION 1: Save manual marks.
    if (action === "save_mark") {
      if (
        !answer_id ||
        !Number.isInteger(marks_awarded) ||
        marks_awarded < 0
      ) {
        return jsonResponse(
          { success: false, message: "Invalid marks entered." },
          400
        );
      }

      const { data: answer, error: answerError } =
        await supabaseAdmin
          .from("student_submission_answers")
          .select("id, question_id")
          .eq("id", answer_id)
          .eq("submission_id", submission_id)
          .maybeSingle();

      if (answerError || !answer) {
        return jsonResponse(
          { success: false, message: "Submitted answer not found." },
          404
        );
      }

      const { data: question, error: questionError } =
        await supabaseAdmin
          .from("assignment_questions")
          .select("question_type, marks")
          .eq("id", answer.question_id)
          .maybeSingle();

      if (questionError || !question) {
        return jsonResponse(
          { success: false, message: "Question not found." },
          404
        );
      }

      if (
        question.question_type !== "written" &&
        question.question_type !== "programming"
      ) {
        return jsonResponse(
          {
            success: false,
            message: "Only written and programming answers can be manually marked.",
          },
          400
        );
      }

      if (
        marks_awarded > question.marks ||
        marks_awarded < 0
      ) {
        return jsonResponse(
          {
            success: false,
            message: `Marks must be between 0 and ${question.marks}.`,
          },
          400
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from("student_submission_answers")
        .update({
          marks_awarded,
          is_correct: null,
        })
        .eq("id", answer_id)
        .eq("submission_id", submission_id);

      if (updateError) {
        console.error("Mark update failed:", updateError.message);

        return jsonResponse(
          { success: false, message: "Could not save marks." },
          500
        );
      }

      // Check whether manual marking is complete.
      const { data: allAnswers, error: allAnswersError } =
        await supabaseAdmin
          .from("student_submission_answers")
          .select("question_id, marks_awarded")
          .eq("submission_id", submission_id);

      if (allAnswersError) {
        return jsonResponse(
          { success: false, message: "Could not verify marking progress." },
          500
        );
      }

      const questionIds = [
        ...new Set(
          (allAnswers ?? []).map((item) => item.question_id)
        ),
      ];

      const { data: questions, error: questionsError } =
        await supabaseAdmin
          .from("assignment_questions")
          .select("id, question_type")
          .in("id", questionIds);

      if (questionsError) {
        return jsonResponse(
          { success: false, message: "Could not verify questions." },
          500
        );
      }

      const questionMap = new Map(
        (questions ?? []).map((item) => [item.id, item])
      );

      const manualPending = (allAnswers ?? []).some((item) => {
        const relatedQuestion = questionMap.get(item.question_id);

        return (
          (
            relatedQuestion?.question_type === "written" ||
            relatedQuestion?.question_type === "programming"
          ) &&
          item.marks_awarded === null
        );
      });

      const { error: progressError } = await supabaseAdmin
        .from("student_submissions")
        .update({
          manual_marking_required: manualPending,
        })
        .eq("id", submission_id);

      if (progressError) {
        return jsonResponse(
          {
            success: false,
            message: "Marks saved, but progress could not be updated.",
          },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: "Marks saved successfully.",
        manual_marking_required: manualPending,
      });
    }

    // ACTION 2: Save instructor feedback.
    if (action === "save_feedback") {
      if (
        typeof feedback !== "string" ||
        feedback.length > 5000
      ) {
        return jsonResponse(
          { success: false, message: "Invalid feedback." },
          400
        );
      }

      const { error: feedbackError } = await supabaseAdmin
        .from("student_submissions")
        .update({
          instructor_feedback: feedback.trim(),
        })
        .eq("id", submission_id);

      if (feedbackError) {
        return jsonResponse(
          { success: false, message: "Could not save feedback." },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: "Feedback saved successfully.",
      });
    }

    // ACTION 3: Publish completed result.
    if (action === "publish_result") {
      const { data: answers, error: answersError } =
        await supabaseAdmin
          .from("student_submission_answers")
          .select("question_id, marks_awarded")
          .eq("submission_id", submission_id);

      if (answersError) {
        return jsonResponse(
          { success: false, message: "Could not load submitted answers." },
          500
        );
      }

      if (!answers || answers.length === 0) {
        return jsonResponse(
          { success: false, message: "No submitted answers found." },
          400
        );
      }

      const questionIds = [
        ...new Set(answers.map((item) => item.question_id)),
      ];

      const { data: questions, error: questionsError } =
        await supabaseAdmin
          .from("assignment_questions")
          .select("id, question_type, marks")
          .in("id", questionIds);

      if (questionsError) {
        return jsonResponse(
          { success: false, message: "Could not load question details." },
          500
        );
      }

      const questionMap = new Map(
        (questions ?? []).map((item) => [item.id, item])
      );

      let manualMarks = 0;
      let pending = false;

      for (const answer of answers) {
        const question = questionMap.get(answer.question_id);

        if (!question) {
          return jsonResponse(
            { success: false, message: "A submitted question could not be found." },
            400
          );
        }

        if (
          question.question_type === "written" ||
          question.question_type === "programming"
        ) {
          if (answer.marks_awarded === null) {
            pending = true;
            break;
          }

          if (
            answer.marks_awarded < 0 ||
            answer.marks_awarded > question.marks
          ) {
            return jsonResponse(
              { success: false, message: "Invalid manual marks detected." },
              400
            );
          }

          manualMarks += answer.marks_awarded;
        }
      }

      if (pending) {
        return jsonResponse(
          {
            success: false,
            message: "Please mark every written and programming answer before publishing.",
          },
          400
        );
      }

      const { data: assignment, error: assignmentError } =
        await supabaseAdmin
          .from("assignments")
          .select("total_marks")
          .eq("id", submission.assignment_id)
          .maybeSingle();

      if (assignmentError || !assignment) {
        return jsonResponse(
          { success: false, message: "Assignment information not found." },
          500
        );
      }

      const finalScore = submission.auto_marks + manualMarks;

      if (
        finalScore < 0 ||
        finalScore > assignment.total_marks
      ) {
        return jsonResponse(
          {
            success: false,
            message: "The calculated score exceeds the assignment total. Please review the marks.",
          },
          400
        );
      }

      const updateData: Record<string, unknown> = {
        result_published: true,
        manual_marking_required: false,
        final_score: finalScore,
        marked_at: new Date().toISOString(),
        marked_by: userData.user.id,
      };

      if (typeof feedback === "string") {
        if (feedback.length > 5000) {
          return jsonResponse(
            { success: false, message: "Feedback is too long." },
            400
          );
        }

        updateData.instructor_feedback = feedback.trim();
      }

      const { data: published, error: publishError } =
        await supabaseAdmin
          .from("student_submissions")
          .update(updateData)
          .eq("id", submission_id)
          .eq("result_published", false)
          .select("id")
          .maybeSingle();

      if (publishError || !published) {
        console.error(
          "Result publishing failed:",
          publishError?.message
        );

        return jsonResponse(
          { success: false, message: "Could not publish result." },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: "Result published successfully.",
        final_score: finalScore,
        total_marks: assignment.total_marks,
      });
    }

    return jsonResponse(
      { success: false, message: "Unknown action." },
      400
    );
  } catch (error) {
    console.error("Admin result management error:", error);

    return jsonResponse(
      { success: false, message: "An unexpected server error occurred." },
      500
    );
  }
});
