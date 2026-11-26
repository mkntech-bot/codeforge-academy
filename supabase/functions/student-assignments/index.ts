
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

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
        .select("id, student_id, expires_at")
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

    if (sessionError || !session) {
      return jsonResponse(
        { success: false, error: "Your session has expired. Please log in again." },
        401
      );
    }

    // VERIFY STUDENT ACCOUNT
    const { data: student, error: studentError } =
      await supabaseAdmin
        .from("students")
        .select("id, full_name, student_code, class_group, registration_status")
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

    // FETCH ONLY PUBLISHED ASSIGNMENTS
    const { data: assignments, error: assignmentsError } =
      await supabaseAdmin
        .from("assignments")
        .select(
          "id, title, description, total_marks, due_date, created_at"
        )
        .eq("published", true)
        .order("created_at", { ascending: false });

    if (assignmentsError) {
      console.error("Assignment retrieval failed:", assignmentsError.message);

      return jsonResponse(
        { success: false, error: "Unable to load assignments." },
        500
      );
    }

    return jsonResponse({
      success: true,
      student: {
        full_name: student.full_name,
        student_code: student.student_code,
        class_group: student.class_group,
      },
      assignments: assignments ?? [],
    });
  } catch (error) {
    console.error("Student assignments error:", error);

    return jsonResponse(
      { success: false, error: "Something went wrong. Please try again." },
      500
    );
  }
});
