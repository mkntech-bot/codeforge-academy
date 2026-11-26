
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

// Hash the session token using SHA-256.
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
    const serviceKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Server configuration is missing.");
    }

    const supabase = createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Read the student's private session token.
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

    const tokenHash = await hashSessionToken(token);

    // Find a matching, unexpired session.
    const { data: session, error: sessionError } =
      await supabase
        .from("student_sessions")
        .select("id, student_id, expires_at")
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

    if (sessionError) {
      console.error("Session lookup failed:", sessionError);
      throw new Error("Could not verify session.");
    }

    if (!session) {
      return respond(
        { error: "Your session has expired. Please log in again." },
        401
      );
    }

    // Confirm that the student still has an active account.
    const { data: student, error: studentError } =
      await supabase
        .from("students")
        .select(
          "id, full_name, student_code, class_group, registration_status"
        )
        .eq("id", session.student_id)
        .maybeSingle();

    if (studentError) {
      console.error("Student lookup failed:", studentError);
      throw new Error("Could not verify student.");
    }

    if (
      !student ||
      student.registration_status !== "active"
    ) {
      // Remove this session if the account is no longer active.
      await supabase
        .from("student_sessions")
        .delete()
        .eq("id", session.id);

      return respond(
        { error: "Your account is not active." },
        403
      );
    }

    return respond({
      success: true,
      authenticated: true,
      student: {
        id: student.id,
        full_name: student.full_name,
        student_code: student.student_code,
        class_group: student.class_group,
      },
      expires_at: session.expires_at,
    });

  } catch (error) {
    console.error("Student session error:", error);

    return respond(
      { error: "Something went wrong. Please try again later." },
      500
    );
  }
});
