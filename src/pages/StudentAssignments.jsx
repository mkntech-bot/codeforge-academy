
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

function StudentAssignments() {
  const [studentCode, setStudentCode] = useState("");
  const [pin, setPin] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const turnstileContainer = useRef(null);
  const widgetId = useRef(null);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  // LOAD CLOUDFLARE TURNSTILE
  useEffect(() => {
    if (!siteKey) {
      setError("Turnstile Site Key is missing.");
      return;
    }

    function renderWidget() {
      if (
        !window.turnstile ||
        !turnstileContainer.current ||
        widgetId.current !== null
      ) {
        return;
      }

      widgetId.current = window.turnstile.render(
        turnstileContainer.current,
        {
          sitekey: siteKey,

          callback: (token) => {
            setTurnstileToken(token);
            setError("");
          },

          "expired-callback": () => {
            setTurnstileToken("");
          },

          "error-callback": () => {
            setTurnstileToken("");
            setError(
              "Turnstile verification failed. Please try again."
            );
          },
        }
      );
    }

    let script = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]'
    );

    if (!script) {
      script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", renderWidget);
    renderWidget();

    return () => {
      script.removeEventListener("load", renderWidget);

      if (
        widgetId.current !== null &&
        window.turnstile
      ) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  // STUDENT LOGIN
  async function handleContinue(e) {
    e.preventDefault();

    setError("");

    const formattedCode = studentCode.trim().toUpperCase();

    if (!/^CFA-[A-HJ-NP-Z2-9]{3}$/.test(formattedCode)) {
      setError("Please enter a valid student code.");
      return;
    }

    if (!/^\d{8}$/.test(pin)) {
      setError("Your PIN must contain exactly 8 digits.");
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the security verification.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: loginError } =
        await supabase.functions.invoke("student-login", {
          body: {
            student_code: formattedCode,
            pin,
            turnstile_token: turnstileToken,
          },
        });

      if (loginError) {
        throw new Error(
          loginError.message ||
          "Unable to contact the login service."
        );
      }

      if (!data?.success || !data?.session_token) {
        throw new Error(
          data?.error || "Invalid student code or PIN."
        );
      }

      sessionStorage.setItem(
        "codeforge_student_token",
        data.session_token
      );

      // REDIRECT TO STUDENT DASHBOARD
      window.location.href = "/student";

    } catch (err) {
      setError(
        err.message || "Login failed. Please try again."
      );

      setTurnstileToken("");

      if (
        window.turnstile &&
        widgetId.current !== null
      ) {
        window.turnstile.reset(widgetId.current);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="student-assignments-page">
      <div className="student-access-card">

        <div className="student-access-icon">CF</div>

        <h1>Student Assignments</h1>

        <p>
          Enter your student code and PIN to access
          your CodeForge Academy account.
        </p>

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        <form onSubmit={handleContinue}>

          <label htmlFor="studentCode">
            Student Code
          </label>

          <input
            id="studentCode"
            type="text"
            placeholder="e.g. CFA-K6H"
            value={studentCode}
            onChange={(e) =>
              setStudentCode(e.target.value)
            }
            autoComplete="off"
            maxLength={7}
            required
          />

          <label htmlFor="studentPin">
            8-Digit PIN
          </label>

          <input
            id="studentPin"
            type="password"
            inputMode="numeric"
            placeholder="Enter your 8-digit PIN"
            value={pin}
            onChange={(e) =>
              setPin(
                e.target.value.replace(/\D/g, "").slice(0, 8)
              )
            }
            maxLength={8}
            autoComplete="current-password"
            required
          />

          <div className="student-turnstile">
            <div ref={turnstileContainer}></div>
          </div>

          <button
            type="submit"
            disabled={loading || !turnstileToken}
          >
            {loading ? "Verifying..." : "Continue →"}
          </button>

        </form>

        <div className="student-access-footer">
          Don't have a student code? Contact your academy administrator.
        </div>

      </div>
    </div>
  );
}

export default StudentAssignments;
