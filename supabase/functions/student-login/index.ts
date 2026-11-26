
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

function fromBase64Url(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    base64 + "=".repeat((4 - base64.length % 4) % 4);

  const binary = atob(padded);

  return Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0)
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// VERIFY STUDENT PIN
async function verifyPin(
  pin: string,
  storedHash: string
): Promise<boolean> {
  try {
    const parts = storedHash.split("$");

    if (parts.length !== 4) return false;

    const [algorithm, iterationText, saltText, hashText] = parts;

    if (algorithm !== "pbkdf2-sha256") return false;

    const iterations = Number(iterationText);

    if (iterations !== 310000) return false;

    const salt = fromBase64Url(saltText);
    const expectedHash = fromBase64Url(hashText);

    if (salt.length !== 16 || expectedHash.length !== 32) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(pin),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      key,
      256
    );

    const actualHash = new Uint8Array(derivedBits);

    let difference = 0;

    for (let i = 0; i < expectedHash.length; i++) {
      difference |= actualHash[i] ^ expectedHash[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}

// GENERATE STUDENT SESSION TOKEN
async function generateSessionToken(): Promise<string> {
  const randomBytes = crypto.getRandomValues(
    new Uint8Array(32)
  );

  return toBase64Url(randomBytes);
}

// HASH SESSION TOKEN
async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// VERIFY CLOUDFLARE TURNSTILE
async function verifyTurnstile(
  token: string,
  secret: string
): Promise<boolean> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    10000
  );

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret,
          response: token,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      console.error(
        "Cloudflare verification request failed:",
        response.status
      );

      return false;
    }

    const result = await response.json();

    if (!result.success) {
      console.error(
        "Turnstile verification rejected:",
        result["error-codes"]
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return respond(
      { error: "Method not allowed." },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const serviceKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    const turnstileSecret = Deno.env.get(
      "TURNSTILE_SECRET_KEY"
    );

    if (!supabaseUrl || !serviceKey || !turnstileSecret) {
      console.error("Required server configuration is missing.");

      return respond(
        { error: "Login service is not configured correctly." },
        500
      );
    }

    const body = await req.json();

    const studentCode =
      typeof body.student_code === "string"
        ? body.student_code.trim().toUpperCase()
        : "";

    const pin =
      typeof body.pin === "string"
        ? body.pin
        : "";

    const turnstileToken =
      typeof body.turnstile_token === "string"
        ? body.turnstile_token
        : "";

    // VALIDATE INPUT FORMAT
    if (!/^CFA-[A-HJ-NP-Z2-9]{3}$/.test(studentCode)) {
      return respond(
        { error: "Invalid student code or PIN." },
        401
      );
    }

    if (!/^\d{8}$/.test(pin)) {
      return respond(
        { error: "Invalid student code or PIN." },
        401
      );
    }

    if (
      !turnstileToken ||
      turnstileToken.length > 2048
    ) {
      return respond(
        { error: "Please complete the security verification." },
        400
      );
    }

    // CLOUDFLARE VERIFICATION
    const challengePassed = await verifyTurnstile(
      turnstileToken,
      turnstileSecret
    );

    if (!challengePassed) {
      return respond(
        {
          error:
            "Security verification failed. Please try again.",
        },
        403
      );
    }

    // CREATE SUPABASE ADMIN CLIENT
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

    // CHECK WHETHER THIS STUDENT IS LOCKED
    const { data: attempts, error: attemptsError } =
      await supabase
        .from("student_login_attempts")
        .select("failed_attempts, locked_until")
        .eq("student_code", studentCode)
        .maybeSingle();

    if (attemptsError) {
      console.error("Login lock lookup failed:", attemptsError);
      throw new Error("Could not check login lock.");
    }

    if (attempts?.locked_until) {
      const lockExpiresAt = new Date(
        attempts.locked_until
      );

      if (lockExpiresAt.getTime() > Date.now()) {
        const retryAfter = Math.ceil(
          (lockExpiresAt.getTime() - Date.now()) / 1000
        );

        return respond(
          {
            error:
              "Too many unsuccessful attempts. Please try again later.",
            locked: true,
            retry_after_seconds: retryAfter,
            locked_until: attempts.locked_until,
          },
          429
        );
      }
    }

    // RECORD A FAILED LOGIN ATTEMPT
    async function recordFailedAttempt() {
      const { data, error } = await supabase.rpc(
        "record_student_login_failure",
        {
          p_student_code: studentCode,
        }
      );

      if (error) {
        console.error("Failed-attempt recording failed:", error);
        throw new Error("Could not record failed login.");
      }

      return data?.[0] ?? null;
    }

    // FIND STUDENT
    const { data: student, error: studentError } =
      await supabase
        .from("students")
        .select(
          "id, full_name, student_code, class_group, registration_status, pin_hash"
        )
        .eq("student_code", studentCode)
        .maybeSingle();

    if (studentError) {
      console.error("Student lookup failed:", studentError);
      throw new Error("Student lookup failed.");
    }

    // INVALID, INACTIVE OR UNREGISTERED STUDENT
    if (
      !student ||
      student.registration_status !== "active" ||
      !student.pin_hash
    ) {
      await recordFailedAttempt();

      return respond(
        { error: "Invalid student code or PIN." },
        401
      );
    }

    // VERIFY PIN
    const pinIsValid = await verifyPin(
      pin,
      student.pin_hash
    );

    if (!pinIsValid) {
      const failure = await recordFailedAttempt();

      if (
        failure?.lock_expires_at &&
        new Date(failure.lock_expires_at).getTime() > Date.now()
      ) {
        const retryAfter = Math.ceil(
          (new Date(failure.lock_expires_at).getTime() -
            Date.now()) / 1000
        );

        return respond(
          {
            error:
              "Too many unsuccessful attempts. Please try again later.",
            locked: true,
            retry_after_seconds: retryAfter,
            locked_until: failure.lock_expires_at,
          },
          429
        );
      }

      return respond(
        { error: "Invalid student code or PIN." },
        401
      );
    }

    // RESET FAILED ATTEMPTS AFTER SUCCESSFUL PIN VERIFICATION
    const { error: resetError } = await supabase.rpc(
      "reset_student_login_attempts",
      {
        p_student_code: studentCode,
      }
    );

    if (resetError) {
      console.error("Login-attempt reset failed:", resetError);
      throw new Error("Could not reset login attempts.");
    }

    // CREATE STUDENT SESSION
    const sessionToken = await generateSessionToken();

    const tokenHash = await hashSessionToken(
      sessionToken
    );

    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: sessionError } = await supabase
      .from("student_sessions")
      .insert({
        student_id: student.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (sessionError) {
      console.error("Session creation failed:", sessionError);
      throw new Error("Could not create student session.");
    }

    // RETURN SUCCESS
    return respond({
      success: true,
      message: "Login successful.",
      session_token: sessionToken,
      expires_at: expiresAt,
      student: {
        id: student.id,
        full_name: student.full_name,
        student_code: student.student_code,
        class_group: student.class_group,
      },
    });

  } catch (error) {
    console.error("Student login error:", error);

    return respond(
      {
        error: "Something went wrong. Please try again later.",
      },
      500
    );
  }
});
