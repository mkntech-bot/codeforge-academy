
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Convert bytes to URL-safe Base64
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

// Securely hash the student's PIN using PBKDF2
async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 310000;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256
  );

  return [
    "pbkdf2-sha256",
    iterations,
    toBase64Url(salt),
    toBase64Url(new Uint8Array(hash)),
  ].join("$");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

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

    const body = await req.json();

    const fullName =
      typeof body.full_name === "string"
        ? body.full_name.trim()
        : "";

    const classGroup =
      typeof body.class_group === "string"
        ? body.class_group.trim()
        : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const pin =
      typeof body.pin === "string"
        ? body.pin
        : "";

    // Validate required information
    if (!fullName || !classGroup) {
      return respond(
        { error: "Full name and class/group are required." },
        400
      );
    }

    if (fullName.length > 100 || classGroup.length > 50) {
      return respond(
        { error: "Some information is too long." },
        400
      );
    }

    if (!/^\d{8}$/.test(pin)) {
      return respond(
        { error: "Your PIN must contain exactly 8 digits." },
        400
      );
    }

    if (
      email &&
      (email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      return respond(
        { error: "Please enter a valid email address." },
        400
      );
    }

    // Check whether registration is open
    const { data: settings, error: settingsError } =
      await supabase
        .from("academy_settings")
        .select("registration_open")
        .eq("id", 1)
        .single();

    if (settingsError || !settings) {
      console.error("Settings query failed:", settingsError);

      throw new Error(
        settingsError?.message ||
          "Settings row was not found."
      );
    }

    if (!settings.registration_open) {
      return respond(
        { error: "Student registration is currently closed." },
        403
      );
    }

    // Generate the student's unique code
    const { data: studentCode, error: codeError } =
      await supabase.rpc("generate_student_code");

    if (codeError || !studentCode) {
      console.error("Student code generation failed:", codeError);

      throw new Error("Could not generate student code.");
    }

    // Hash the PIN before storing it
    const pinHash = await hashPin(pin);

    // Save the student
    const { error: insertError } = await supabase
      .from("students")
      .insert({
        full_name: fullName,
        class_group: classGroup,
        email: email || null,
        student_code: studentCode,
        pin_hash: pinHash,
      });

    if (insertError) {
      console.error("Student insertion failed:", insertError);

      if (insertError.code === "23505") {
        return respond(
          {
            error:
              "Registration could not be completed. Please try again.",
          },
          409
        );
      }

      throw new Error("Could not save student registration.");
    }

    return respond({
      success: true,
      message: "Registration completed successfully.",
      student_code: studentCode,
    });

  } catch (error) {
    console.error("Registration error:", error);

    return respond(
      { error: "Something went wrong. Please try again later." },
      500
    );
  }
});
