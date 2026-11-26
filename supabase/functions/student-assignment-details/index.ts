
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-student-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "Method not allowed." },
      405
    );
  }

  try {
    const token = req.headers.get("x-student-token");

    if (!token || token.length > 512) {
      return jsonResponse(
        { success: false, error: "Student session is missing." },
        401
      );
    }

    const { assignment_id } = await req.json();

    if (
      typeof assignment_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assignment_id)
    ) {
      return jsonResponse(
        { success: false, error: "Invalid assignment ID." },
        400
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase environment configuration.");

      return jsonResponse(
        { success: false, error: "Server configuration error." },
        500
      );
    }

    const supabaseAdmin = createClient(
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
    const tokenHash = await hashToken(token);

    const { data: session, error: sessionError } =
      await supabaseAdmin
        .from("student_sessions")
        .select("student_id")
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

    if (sessionError || !session) {
      return jsonResponse(
        {
          success: false,
          error: "Your session has expired. Please log in again.",
        },
        401
      );
    }

    // VERIFY STUDENT ACCOUNT
    const { data: student, error: studentError } =
      await supabaseAdmin
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
        { success: false, error: "Student account is unavailable." },
        403
      );
    }

    // CHECK THAT THE ASSIGNMENT IS PUBLISHED
    const { data: assignment, error: assignmentError } =
      await supabaseAdmin
        .from("assignments")
        .select("id, title, description, total_marks, due_date")
        .eq("id", assignment_id)
        .eq("published", true)
        .maybeSingle();

    if (assignmentError) {
      console.error(
        "Assignment lookup failed:",
        assignmentError.message
      );

      return jsonResponse(
        { success: false, error: "Unable to load this assignment." },
        500
      );
    }

    if (!assignment) {
      return jsonResponse(
        {
          success: false,
          error: "Assignment not found or not published.",
        },
        404
      );
    }

    // CHECK WHETHER THIS STUDENT HAS ALREADY SUBMITTED
    const { data: submission, error: submissionError } =
      await supabaseAdmin
        .from("student_submissions")
        .select("id, submitted_at")
        .eq("student_id", student.id)
        .eq("assignment_id", assignment_id)
        .maybeSingle();

    if (submissionError) {
      console.error(
        "Submission lookup failed:",
        submissionError.message
      );

      return jsonResponse(
        {
          success: false,
          error: "Unable to check submission status.",
        },
        500
      );
    }

    // FETCH QUESTIONS WITHOUT CORRECT ANSWERS
    const { data: questions, error: questionsError } =
      await supabaseAdmin
        .from("assignment_questions")
        .select("id, question_text, question_type, options, marks")
        .eq("assignment_id", assignment_id)
        .order("created_at", { ascending: true });

    if (questionsError) {
      console.error(
        "Question retrieval failed:",
        questionsError.message
      );

      return jsonResponse(
        {
          success: false,
          error: "Unable to load assignment questions.",
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      assignment,
      questions: questions ?? [],
      already_submitted: Boolean(submission),
      submitted_at: submission?.submitted_at ?? null,
    });

  } catch (error) {
    console.error("Student assignment details error:", error);

    return jsonResponse(
      {
        success: false,
        error: "Something went wrong. Please try again.",
      },
      500
    );
  }
});
