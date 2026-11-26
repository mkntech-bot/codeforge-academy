
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-student-token",
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

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const token = req.headers.get("x-student-token");

    if (!token) {
      return jsonResponse({ error: "Student session is missing." }, 401);
    }

    const { assignment_id, answers } = await req.json();

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(assignment_id || "")) {
      return jsonResponse({ error: "Invalid assignment ID." }, 400);
    }

    if (!Array.isArray(answers)) {
      return jsonResponse({ error: "Invalid answers format." }, 400);
    }

    if (answers.length > 200) {
      return jsonResponse({ error: "Too many answers." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Server configuration is incomplete.");
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // VERIFY STUDENT SESSION
    const tokenHash = await sha256(token);

    const { data: session, error: sessionError } = await supabase
      .from("student_sessions")
      .select("student_id, expires_at")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session) {
      return jsonResponse(
        { error: "Your session has expired. Please log in again." },
        401
      );
    }

    // VERIFY STUDENT IS ACTIVE
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, registration_status")
      .eq("id", session.student_id)
      .maybeSingle();

    if (
      studentError ||
      !student ||
      student.registration_status !== "active"
    ) {
      return jsonResponse(
        { error: "Your student account is not active." },
        403
      );
    }

    // VERIFY ASSIGNMENT
    const { data: assignment, error: assignmentError } =
      await supabase
        .from("assignments")
        .select("id, published, due_date")
        .eq("id", assignment_id)
        .maybeSingle();

    if (assignmentError || !assignment) {
      return jsonResponse(
        { error: "Assignment not found." },
        404
      );
    }

    if (!assignment.published) {
      return jsonResponse(
        { error: "This assignment is not available." },
        403
      );
    }

    if (
      assignment.due_date &&
      new Date(assignment.due_date).getTime() < Date.now()
    ) {
      return jsonResponse(
        { error: "The submission deadline has passed." },
        403
      );
    }

    // LOAD QUESTIONS AND ANSWER KEYS ON THE SERVER ONLY
    const { data: questions, error: questionsError } =
      await supabase
        .from("assignment_questions")
        .select("id, question_type, correct_answer, marks")
        .eq("assignment_id", assignment_id);

    if (questionsError) {
      console.error("Question retrieval failed:", questionsError);
      throw new Error("Unable to retrieve assignment questions.");
    }

    if (!questions || questions.length === 0) {
      return jsonResponse(
        { error: "This assignment has no questions." },
        400
      );
    }

    if (answers.length !== questions.length) {
      return jsonResponse(
        { error: "Please answer every question before submitting." },
        400
      );
    }

    const questionMap = new Map(
      questions.map((question) => [question.id, question])
    );

    const seenQuestionIds = new Set<string>();

    let autoMarks = 0;
    let manualMarkingRequired = false;

    const savedAnswers = [];

    // VALIDATE AND MARK ANSWERS
    for (const submittedAnswer of answers) {
      const questionId = submittedAnswer?.question_id;
      const answerText = submittedAnswer?.answer;

      if (
        typeof questionId !== "string" ||
        typeof answerText !== "string"
      ) {
        return jsonResponse(
          { error: "One or more answers are invalid." },
          400
        );
      }

      if (
        seenQuestionIds.has(questionId) ||
        !questionMap.has(questionId)
      ) {
        return jsonResponse(
          { error: "Invalid or duplicate question answer." },
          400
        );
      }

      seenQuestionIds.add(questionId);

      const question = questionMap.get(questionId);
      const cleanAnswer = answerText.trim();

      let isCorrect: boolean | null = null;
      let marksAwarded: number | null = null;

      if (
        question.question_type === "mcq" ||
        question.question_type === "fill_blank"
      ) {
        const expectedAnswer = question.correct_answer || "";

        isCorrect =
          normalizeAnswer(cleanAnswer) ===
          normalizeAnswer(expectedAnswer);

        marksAwarded = isCorrect
          ? Number(question.marks)
          : 0;

        autoMarks += marksAwarded;
      } else if (
        question.question_type === "written" ||
        question.question_type === "programming"
      ) {
        manualMarkingRequired = true;
      } else {
        return jsonResponse(
          { error: "Unsupported question type." },
          400
        );
      }

      savedAnswers.push({
        question_id: questionId,
        answer_text: cleanAnswer,
        is_correct: isCorrect,
        marks_awarded: marksAwarded,
      });
    }

    // CREATE SUBMISSION
    // The database unique constraint prevents duplicate submissions.
    const { data: submission, error: submissionError } =
      await supabase
        .from("student_submissions")
        .insert({
          student_id: student.id,
          assignment_id,
          auto_marks: autoMarks,
          manual_marking_required: manualMarkingRequired,
        })
        .select("id, submitted_at")
        .single();

    if (submissionError) {
      if (submissionError.code === "23505") {
        return jsonResponse(
          { error: "You have already submitted this assignment." },
          409
        );
      }

      console.error("Submission creation failed:", submissionError);
      throw new Error("Unable to save your submission.");
    }

    // SAVE ALL ANSWERS
    const answerRows = savedAnswers.map((answer) => ({
      submission_id: submission.id,
      ...answer,
    }));

    const { error: answerError } = await supabase
      .from("student_submission_answers")
      .insert(answerRows);

    if (answerError) {
      console.error("Answer saving failed:", answerError);

      // Remove incomplete submission if saving answers fails.
      await supabase
        .from("student_submissions")
        .delete()
        .eq("id", submission.id);

      throw new Error("Unable to save all your answers. Please try again.");
    }

    return jsonResponse({
      success: true,
      message: "Your assignment was submitted successfully.",
      submission_id: submission.id,
      submitted_at: submission.submitted_at,
      auto_marks: autoMarks,
      manual_marking_required: manualMarkingRequired,
    });
  } catch (error) {
    console.error("Submission function error:", error);

    return jsonResponse(
      { error: error.message || "An unexpected server error occurred." },
      500
    );
  }
});
