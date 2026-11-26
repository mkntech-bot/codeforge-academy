
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

  if (req.method !== "GET") {
    return jsonResponse(
      { success: false, message: "Method not allowed." },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        { success: false, message: "Authentication required." },
        401
      );
    }

    const token = authorization.replace("Bearer ", "");

    // Verify the signed-in administrator.
    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      }
    );

    const {
      data: userData,
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !userData.user) {
      return jsonResponse(
        { success: false, message: "Invalid or expired session." },
        401
      );
    }

    // Confirm administrator role.
    const {
      data: isAdmin,
      error: adminError,
    } = await userClient.rpc("is_admin");

    if (adminError || isAdmin !== true) {
      return jsonResponse(
        { success: false, message: "Administrator access required." },
        403
      );
    }

    // Privileged client created only after admin verification.
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

    // Retrieve submissions including result information.
    const {
      data: submissions,
      error: submissionsError,
    } = await supabaseAdmin
      .from("student_submissions")
      .select(
        "id, student_id, assignment_id, submitted_at, auto_marks, manual_marking_required, result_published, instructor_feedback, final_score, marked_at"
      )
      .order("submitted_at", { ascending: false });

    if (submissionsError) {
      console.error(
        "Submissions query failed:",
        submissionsError.message
      );

      return jsonResponse(
        { success: false, message: "Could not load submissions." },
        500
      );
    }

    const submissionRows = submissions ?? [];

    if (submissionRows.length === 0) {
      return jsonResponse({
        success: true,
        submissions: [],
      });
    }

    const studentIds = [
      ...new Set(
        submissionRows.map((item) => item.student_id)
      ),
    ];

    const assignmentIds = [
      ...new Set(
        submissionRows.map((item) => item.assignment_id)
      ),
    ];

    const submissionIds = submissionRows.map(
      (item) => item.id
    );

    // Load student profile fields.
    const {
      data: students,
      error: studentsError,
    } = await supabaseAdmin
      .from("students")
      .select("id, full_name, student_code, class_group")
      .in("id", studentIds);

    if (studentsError) {
      console.error(
        "Students query failed:",
        studentsError.message
      );

      return jsonResponse(
        {
          success: false,
          message: "Could not load student information.",
        },
        500
      );
    }

    // Load assignment information.
    const {
      data: assignments,
      error: assignmentsError,
    } = await supabaseAdmin
      .from("assignments")
      .select("id, title, total_marks, due_date")
      .in("id", assignmentIds);

    if (assignmentsError) {
      console.error(
        "Assignments query failed:",
        assignmentsError.message
      );

      return jsonResponse(
        {
          success: false,
          message: "Could not load assignments.",
        },
        500
      );
    }

    // Load submitted answers.
    const {
      data: answers,
      error: answersError,
    } = await supabaseAdmin
      .from("student_submission_answers")
      .select(
        "id, submission_id, question_id, answer_text, is_correct, marks_awarded"
      )
      .in("submission_id", submissionIds);

    if (answersError) {
      console.error(
        "Answers query failed:",
        answersError.message
      );

      return jsonResponse(
        {
          success: false,
          message: "Could not load submitted answers.",
        },
        500
      );
    }

    const answerRows = answers ?? [];

    const questionIds = [
      ...new Set(
        answerRows.map((item) => item.question_id)
      ),
    ];

    let questions: any[] = [];

    if (questionIds.length > 0) {
      const {
        data: questionData,
        error: questionsError,
      } = await supabaseAdmin
        .from("assignment_questions")
        .select(
          "id, question_text, question_type, options, correct_answer, marks"
        )
        .in("id", questionIds);

      if (questionsError) {
        console.error(
          "Questions query failed:",
          questionsError.message
        );

        return jsonResponse(
          {
            success: false,
            message: "Could not load question details.",
          },
          500
        );
      }

      questions = questionData ?? [];
    }

    // Create lookup maps.
    const studentMap = new Map(
      (students ?? []).map((student) => [
        student.id,
        student,
      ])
    );

    const assignmentMap = new Map(
      (assignments ?? []).map((assignment) => [
        assignment.id,
        assignment,
      ])
    );

    const questionMap = new Map(
      questions.map((question) => [
        question.id,
        question,
      ])
    );

    const answersBySubmission =
      new Map<string, any[]>();

    for (const answer of answerRows) {
      const question = questionMap.get(
        answer.question_id
      );

      const enrichedAnswer = {
        id: answer.id,
        question_id: answer.question_id,
        answer_text: answer.answer_text,
        is_correct: answer.is_correct,
        marks_awarded: answer.marks_awarded,
        question: question ?? null,
      };

      const existing =
        answersBySubmission.get(
          answer.submission_id
        ) ?? [];

      existing.push(enrichedAnswer);

      answersBySubmission.set(
        answer.submission_id,
        existing
      );
    }

    // Combine submission, student, assignment and answers.
    const result = submissionRows.map(
      (submission) => ({
        ...submission,
        student:
          studentMap.get(submission.student_id) ??
          null,
        assignment:
          assignmentMap.get(
            submission.assignment_id
          ) ?? null,
        answers:
          answersBySubmission.get(
            submission.id
          ) ?? [],
      })
    );

    return jsonResponse({
      success: true,
      submissions: result,
    });
  } catch (error) {
    console.error(
      "Admin submissions function error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        message: "An unexpected server error occurred.",
      },
      500
    );
  }
});
