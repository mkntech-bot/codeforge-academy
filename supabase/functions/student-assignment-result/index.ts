
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-student-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Server configuration is missing.");
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const token = req.headers.get("x-student-token");

    if (
      !token ||
      token.length > 200 ||
      !/^[A-Za-z0-9_-]+$/.test(token)
    ) {
      return respond(
        { error: "Your session is invalid. Please log in again." },
        401
      );
    }

    const body = await req.json().catch(() => null);
    const assignmentId = body?.assignment_id;

    if (
      typeof assignmentId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        assignmentId
      )
    ) {
      return respond({ error: "Invalid assignment link." }, 400);
    }

    const tokenHash = await hashSessionToken(token);

    const { data: session, error: sessionError } = await supabase
      .from("student_sessions")
      .select("id, student_id")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionError) {
      console.error("Session verification failed:", sessionError);
      throw new Error("Could not verify student session.");
    }

    if (!session) {
      return respond(
        { error: "Your session has expired. Please log in again." },
        401
      );
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, full_name, student_code, class_group, registration_status")
      .eq("id", session.student_id)
      .maybeSingle();

    if (studentError) {
      console.error("Student lookup failed:", studentError);
      throw new Error("Could not verify student account.");
    }

    if (!student || student.registration_status !== "active") {
      await supabase
        .from("student_sessions")
        .delete()
        .eq("id", session.id);

      return respond({ error: "Your account is not active." }, 403);
    }

    const { data: submission, error: submissionError } = await supabase
      .from("student_submissions")
      .select(`
        id,
        assignment_id,
        submitted_at,
        auto_marks,
        final_score,
        instructor_feedback,
        marked_at,
        assignments (
          title,
          total_marks
        )
      `)
      .eq("student_id", student.id)
      .eq("assignment_id", assignmentId)
      .eq("result_published", true)
      .maybeSingle();

    if (submissionError) {
      console.error("Assignment result lookup failed:", submissionError);
      throw new Error("Could not retrieve assignment result.");
    }

    if (!submission) {
      return respond({
        success: true,
        result: null,
        message: "No published result is available for this assignment.",
      });
    }

    return respond({
      success: true,
      student: {
        full_name: student.full_name,
        student_code: student.student_code,
        class_group: student.class_group,
      },
      result: {
        submission_id: submission.id,
        assignment_id: submission.assignment_id,
        assignment_title:
          submission.assignments?.title || "Assignment",
        total_marks: submission.assignments?.total_marks ?? 0,
        final_score: submission.final_score,
        auto_marks: submission.auto_marks,
        instructor_feedback: submission.instructor_feedback || "",
        submitted_at: submission.submitted_at,
        published_at: submission.marked_at,
      },
    });
  } catch (error) {
    console.error("Student assignment result error:", error);

    return respond(
      { error: "Something went wrong. Please try again later." },
      500
    );
  }
});
