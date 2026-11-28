
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://codeforge-academy-delta.vercel.app",
  "http://localhost:5173",
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-student-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };

  if (allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
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

// Normalize wording for fill-in-the-blank answers without changing MCQ rules.
function normalizeSemanticAnswer(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Small, explicit computing vocabulary aliases. These are deterministic rules,
// not an AI model. Teachers can add question-specific alternatives using "|".
function canonicalizeAnswer(value: string) {
  let answer = normalizeSemanticAnswer(value);

  const aliases: Array<[RegExp, string]> = [
    [/\b(?:computer )?hardware components?\b/g, "hardware"],
    [/\b(?:computer )?hardware parts?\b/g, "hardware"],
    [/\bhardwares\b/g, "hardware"],
    [/\bsoftwares\b/g, "software"],
    [/\bcentral processing unit\b/g, "cpu"],
    [/\brandom access memory\b/g, "ram"],
    [/\bread only memory\b/g, "rom"],
  ];

  for (const [pattern, replacement] of aliases) {
    answer = answer.replace(pattern, replacement);
  }

  return answer.replace(/\s+/g, " ").trim();
}

function isAcceptedFillBlankAnswer(studentAnswer: string, expectedAnswer: string) {
  const acceptedAnswers = expectedAnswer
    .split(/[|\n]+/)
    .map((answer) => canonicalizeAnswer(answer))
    .filter(Boolean);

  if (acceptedAnswers.length === 0) return false;

  const normalizedStudentAnswer = canonicalizeAnswer(studentAnswer);
  return acceptedAnswers.includes(normalizedStudentAnswer);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed." }, 405);
  }

  try {
    const token = req.headers.get("x-student-token");

    if (!token) {
      return jsonResponse(req, { error: "Student session is missing." }, 401);
    }

    const { assignment_id, answers } = await req.json();

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(assignment_id || "")) {
      return jsonResponse(req, { error: "Invalid assignment ID." }, 400);
    }

    if (!Array.isArray(answers)) {
      return jsonResponse(req, { error: "Invalid answers format." }, 400);
    }

    if (answers.length > 200) {
      return jsonResponse(req, { error: "Too many answers." }, 400);
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
        req,
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
        req,
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
      return jsonResponse(req, { error: "Assignment not found." }, 404);
    }

    if (!assignment.published) {
      return jsonResponse(
        req,
        { error: "This assignment is not available." },
        403
      );
    }

    if (
      assignment.due_date &&
      new Date(assignment.due_date).getTime() < Date.now()
    ) {
      return jsonResponse(
        req,
        { error: "The submission deadline has passed." },
        403
      );
    }

    // LOAD QUESTIONS AND ANSWER KEYS ON THE SERVER ONLY
    const { data: questions, error: questionsError } =
      await supabase
        .from("assignment_questions")
        .select("id, question_text, question_type, correct_answer, marks")
        .eq("assignment_id", assignment_id);

    if (questionsError) {
      console.error("Question retrieval failed:", questionsError);
      throw new Error("Unable to retrieve assignment questions.");
    }

    if (!questions || questions.length === 0) {
      return jsonResponse(
        req,
        { error: "This assignment has no questions." },
        400
      );
    }

    if (answers.length !== questions.length) {
      return jsonResponse(
        req,
        { error: "Please answer every question before submitting." },
        400
      );
    }

    const questionMap = new Map(
      questions.map((question) => [question.id, question])
    );

    const seenQuestionIds = new Set<string>();
    const preparedAnswers: Array<{
      question_id: string;
      answer_text: string;
      question: any;
    }> = [];

    // VALIDATE ALL ANSWERS BEFORE MARKING.
    for (const submittedAnswer of answers) {
      const questionId = submittedAnswer?.question_id;
      const answerText = submittedAnswer?.answer;

      if (
        typeof questionId !== "string" ||
        typeof answerText !== "string"
      ) {
        return jsonResponse(
          req,
          { error: "One or more answers are invalid." },
          400
        );
      }

      if (
        seenQuestionIds.has(questionId) ||
        !questionMap.has(questionId)
      ) {
        return jsonResponse(
          req,
          { error: "Invalid or duplicate question answer." },
          400
        );
      }

      seenQuestionIds.add(questionId);

      const question = questionMap.get(questionId);

      if (
        question.question_type !== "mcq" &&
        question.question_type !== "fill_blank" &&
        question.question_type !== "written" &&
        question.question_type !== "programming"
      ) {
        return jsonResponse(
          req,
          { error: "Unsupported question type." },
          400
        );
      }

      preparedAnswers.push({
        question_id: questionId,
        answer_text: answerText.trim(),
        question,
      });
    }

    let autoMarks = 0;
    let manualMarkingRequired = false;
    const savedAnswers = [];

    // MARK ANSWERS
    for (const item of preparedAnswers) {
      const question = item.question;
      const cleanAnswer = item.answer_text;

      let isCorrect: boolean | null = null;
      let marksAwarded: number | null = null;

      if (question.question_type === "mcq") {
        const expectedAnswer = question.correct_answer || "";

        isCorrect =
          normalizeAnswer(cleanAnswer) ===
          normalizeAnswer(expectedAnswer);

        marksAwarded = isCorrect ? Number(question.marks) : 0;
        autoMarks += marksAwarded;
      } else if (question.question_type === "fill_blank") {
        const expectedAnswer = question.correct_answer || "";

        if (isAcceptedFillBlankAnswer(cleanAnswer, expectedAnswer)) {
          isCorrect = true;
        } else if (!cleanAnswer || !expectedAnswer.trim()) {
          isCorrect = false;
        } else {
          // Unrecognized wording is left for the instructor instead of
          // being incorrectly marked wrong by a non-AI rule.
          isCorrect = null;
          manualMarkingRequired = true;
        }

        if (isCorrect === null) {
          marksAwarded = null;
        } else {
          marksAwarded = isCorrect ? Number(question.marks) : 0;
          autoMarks += marksAwarded;
        }
      } else if (
        question.question_type === "written" ||
        question.question_type === "programming"
      ) {
        manualMarkingRequired = true;
      }

      savedAnswers.push({
        question_id: item.question_id,
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
          req,
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

    return jsonResponse(req, {
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
      req,
      { error: error instanceof Error ? error.message : "An unexpected server error occurred." },
      500
    );
  }
});
