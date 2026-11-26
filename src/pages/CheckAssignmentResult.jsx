
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import jsPDF from "jspdf";

function CheckAssignmentResult() {
  const [studentCode, setStudentCode] = useState("");
  const [pin, setPin] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [student, setStudent] = useState(null);
  const [checked, setChecked] = useState(false);

  const turnstileContainer = useRef(null);
  const turnstileWidgetId = useRef(null);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  // LOAD CLOUDFLARE TURNSTILE
  useEffect(() => {
    let cancelled = false;
    let script = null;

    const renderTurnstile = () => {
      if (
        cancelled ||
        !window.turnstile ||
        !turnstileContainer.current ||
        turnstileWidgetId.current !== null
      ) {
        return;
      }

      turnstileWidgetId.current = window.turnstile.render(
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
            setError("Security verification failed. Please try again.");
          },
        }
      );
    };

    if (!siteKey) {
      setError("Security verification is not configured.");
      return;
    }

    if (window.turnstile) {
      renderTurnstile();
    } else {
      script = document.querySelector(
        'script[src*="challenges.cloudflare.com/turnstile"]'
      );

      if (!script) {
        script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      const handleLoad = () => renderTurnstile();

      script.addEventListener("load", handleLoad);

      return () => {
        cancelled = true;
        script.removeEventListener("load", handleLoad);

        if (
          turnstileWidgetId.current !== null &&
          window.turnstile
        ) {
          window.turnstile.remove(turnstileWidgetId.current);
          turnstileWidgetId.current = null;
        }
      };
    }

    return () => {
      cancelled = true;

      if (
        turnstileWidgetId.current !== null &&
        window.turnstile
      ) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
    };
  }, [siteKey]);

  // RESET TURNSTILE
  const resetTurnstile = () => {
    setTurnstileToken("");

    if (
      window.turnstile &&
      turnstileWidgetId.current !== null
    ) {
      window.turnstile.reset(turnstileWidgetId.current);
    }
  };

  // STUDENT LOGIN AND FETCH ALL PUBLISHED RESULTS
  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setResults([]);
    setStudent(null);
    setChecked(false);

    const formattedCode = studentCode.trim().toUpperCase();

    if (!/^CFA-[A-HJ-NP-Z2-9]{3}$/.test(formattedCode)) {
      setError("Enter a valid Student Code.");
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
      // STEP 1: VERIFY STUDENT CREDENTIALS
      const { data: loginData, error: loginError } =
        await supabase.functions.invoke("student-login", {
          body: {
            student_code: formattedCode,
            pin,
            turnstile_token: turnstileToken,
          },
        });

      if (
        loginError ||
        !loginData?.success ||
        !loginData?.session_token
      ) {
        throw new Error(
          "Invalid Student Code or PIN. Please check your details."
        );
      }

      const sessionToken = loginData.session_token;

      sessionStorage.setItem(
        "codeforge_student_token",
        sessionToken
      );

      // STEP 2: FETCH ALL OF THIS STUDENT'S PUBLISHED RESULTS
      const { data: resultData, error: resultError } =
        await supabase.functions.invoke("student-results", {
          headers: {
            "x-student-token": sessionToken,
          },
        });

      if (resultError) {
        throw new Error(
          resultError.message || "Unable to retrieve your results."
        );
      }

      if (!resultData?.success) {
        throw new Error(
          resultData?.message || "Unable to retrieve your results."
        );
      }

      setStudent(resultData.student || loginData.student || null);
      setResults(
        Array.isArray(resultData.results) ? resultData.results : []
      );

      setChecked(true);
      setPin("");
    } catch (err) {
      setError(
        err.message || "Something went wrong. Please try again."
      );

      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  // CHECK ANOTHER STUDENT
  const checkAnotherTime = () => {
    setResults([]);
    setStudent(null);
    setChecked(false);
    setError("");
    setStudentCode("");
    setPin("");

    sessionStorage.removeItem("codeforge_student_token");

    resetTurnstile();
  };

  // DOWNLOAD ONE RESULT AS PDF
  const downloadResultPDF = (result) => {
    if (!result || !student) {
      alert("No result data is available to download.");
      return;
    }

    try {
      const doc = new jsPDF();

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;

      const finalScore = Number(result.final_score || 0);
      const totalMarks = Number(result.total_marks || 0);
      const automaticMarks = Number(result.auto_marks || 0);
      const instructorMarks = finalScore - automaticMarks;

      const percentage =
        totalMarks > 0
          ? Math.round((finalScore / totalMarks) * 100)
          : 0;

      // HEADER
      doc.setFillColor(24, 35, 66);
      doc.rect(0, 0, pageWidth, 40, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("CodeForge Academy", margin, 18);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("ASSIGNMENT RESULT REPORT", margin, 28);

      let y = 55;

      // STUDENT INFORMATION
      doc.setTextColor(24, 35, 66);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Student Information", margin, y);

      y += 12;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);

      doc.text(`Name: ${student.full_name || "Student"}`, margin, y);
      y += 8;

      doc.text(
        `Student Code: ${student.student_code || studentCode}`,
        margin,
        y
      );
      y += 8;

      doc.text(
        `Class: ${student.class_group || "Not available"}`,
        margin,
        y
      );

      y += 15;

      // ASSIGNMENT DETAILS
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(24, 35, 66);
      doc.text("Assignment Details", margin, y);

      y += 12;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);

      const assignmentTitle = doc.splitTextToSize(
        `Assignment: ${result.assignment_title || "Assignment"}`,
        pageWidth - margin * 2
      );

      doc.text(assignmentTitle, margin, y);
      y += assignmentTitle.length * 6 + 5;

      doc.text(
        `Submitted: ${
          result.submitted_at
            ? new Date(result.submitted_at).toLocaleString()
            : "Not available"
        }`,
        margin,
        y
      );

      y += 8;

      doc.text(
        `Published: ${
          result.published_at
            ? new Date(result.published_at).toLocaleString()
            : "Not available"
        }`,
        margin,
        y
      );

      y += 18;

      // FINAL SCORE
      doc.setFillColor(242, 238, 252);
      doc.roundedRect(
        margin,
        y,
        pageWidth - margin * 2,
        38,
        3,
        3,
        "F"
      );

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(105, 76, 190);
      doc.text("FINAL SCORE", margin + 7, y + 10);

      doc.setFontSize(22);
      doc.setTextColor(24, 35, 66);
      doc.text(
        `${finalScore} / ${totalMarks}`,
        margin + 7,
        y + 27
      );

      doc.setFontSize(12);
      doc.text(
        `${percentage}%`,
        pageWidth - margin - 7,
        y + 27,
        { align: "right" }
      );

      y += 52;

      // SCORE BREAKDOWN
      doc.setFontSize(14);
      doc.setTextColor(24, 35, 66);
      doc.text("Score Breakdown", margin, y);

      y += 12;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);

      doc.text(`Automatic Marks: ${automaticMarks}`, margin, y);
      y += 8;

      doc.text(`Instructor Marks: ${instructorMarks}`, margin, y);
      y += 8;

      doc.text(`Total Marks: ${totalMarks}`, margin, y);

      y += 18;

      // FEEDBACK
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(24, 35, 66);
      doc.text("Instructor Feedback", margin, y);

      y += 10;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);

      const feedback = doc.splitTextToSize(
        result.instructor_feedback || "No feedback provided.",
        pageWidth - margin * 2
      );

      doc.text(feedback, margin, y);

      // FOOTER
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        "CodeForge Academy | Learn. Code. Build.",
        margin,
        285
      );

      const safeName = (student.full_name || "Student")
        .replace(/[^a-z0-9]/gi, "_");

      const safeAssignment = (
        result.assignment_title || "Assignment"
      ).replace(/[^a-z0-9]/gi, "_");

      doc.save(
        `CodeForge_${safeName}_${safeAssignment}_Result.pdf`
      );
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("PDF generation failed. Check the browser console for details.");
    }
  };

  return (
    <div className="assignment-result-page">
      <header className="assignment-check-header">
        <h1>CodeForge Academy</h1>
        <p>Student Result Checker</p>
      </header>

      <main className="assignment-check-content">
        {!checked && (
          <div className="assignment-login-card">
            <div className="assignment-login-icon">
              🎓
            </div>

            <h2>Check Your Results</h2>

            <p className="assignment-login-description">
              Enter your Student Code and PIN to securely
              view all your published assignment results.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="assignment-form-group">
                <label>Student Code</label>

                <input
                  type="text"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="Example: CFA-K6H"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="assignment-form-group">
                <label>8-Digit PIN</label>

                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter your 8-digit PIN"
                  inputMode="numeric"
                  maxLength={8}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="assignment-turnstile">
                <div ref={turnstileContainer}></div>
              </div>

              {error && (
                <div className="assignment-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="assignment-login-button"
                disabled={loading || !turnstileToken}
              >
                {loading
                  ? "Checking Results..."
                  : "Check My Results"}
              </button>
            </form>
          </div>
        )}

        {checked && (
          <div className="assignment-result-wrapper">
            <section className="assignment-student-card">
              <div className="assignment-student-avatar">
                {student?.full_name
                  ? student.full_name.charAt(0).toUpperCase()
                  : "S"}
              </div>

              <div>
                <h2>
                  Welcome, {student?.full_name || "Student"}!
                </h2>

                <p>
                  Student Code:{" "}
                  {student?.student_code || studentCode.toUpperCase()}
                </p>

                {student?.class_group && (
                  <p>Class: {student.class_group}</p>
                )}
              </div>
            </section>

            <div className="assignment-details-heading">
              <h2>Your Published Results</h2>
              <p>
                Here are all the assignment results published for your account.
              </p>
            </div>

            {results.length === 0 ? (
              <div className="assignment-empty-card">
                <div className="assignment-empty-icon">
                  📄
                </div>

                <h2>No Published Results Yet</h2>

                <p>
                  You don't have any published assignment results yet.
                  Please check again later.
                </p>
              </div>
            ) : (
              results.map((result, index) => {
                const finalScore = Number(result.final_score || 0);
                const totalMarks = Number(result.total_marks || 0);
                const automaticMarks = Number(result.auto_marks || 0);
                const instructorMarks = finalScore - automaticMarks;

                const percentage =
                  totalMarks > 0
                    ? Math.round((finalScore / totalMarks) * 100)
                    : 0;

                return (
                  <section
                    className="assignment-result-card"
                    key={result.id || `${result.assignment_title}-${index}`}
                  >
                    <div className="assignment-published-label">
                      <span>✓</span>
                      Result Published
                    </div>

                    <div className="assignment-result-heading">
                      <span>ASSIGNMENT {index + 1}</span>

                      <h2>
                        {result.assignment_title || "Assignment Result"}
                      </h2>
                    </div>

                    <div className="assignment-score-panel">
                      <div>
                        <span className="assignment-score-label">
                          FINAL SCORE
                        </span>

                        <h3>
                          {finalScore}
                          <span> / {totalMarks}</span>
                        </h3>
                      </div>

                      <div className="assignment-percentage">
                        {percentage}%
                      </div>
                    </div>

                    <div className="assignment-progress-track">
                      <div
                        className="assignment-progress-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, percentage)
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="assignment-breakdown">
                      <div className="assignment-breakdown-item">
                        <span>Automatic Marks</span>
                        <strong>{automaticMarks}</strong>
                      </div>

                      <div className="assignment-breakdown-item">
                        <span>Instructor Marks</span>
                        <strong>{instructorMarks}</strong>
                      </div>

                      <div className="assignment-breakdown-item assignment-final-mark">
                        <span>Final Score</span>
                        <strong>
                          {finalScore} / {totalMarks}
                        </strong>
                      </div>
                    </div>

                    <div className="assignment-feedback">
                      <h3>Instructor Feedback</h3>

                      <p>
                        {result.instructor_feedback ||
                          "No feedback provided."}
                      </p>
                    </div>

                    <div className="assignment-result-dates">
                      <p>
                        <span>Submitted:</span>{" "}
                        {result.submitted_at
                          ? new Date(result.submitted_at).toLocaleString()
                          : "Not available"}
                      </p>

                      <p>
                        <span>Published:</span>{" "}
                        {result.published_at
                          ? new Date(result.published_at).toLocaleString()
                          : "Not available"}
                      </p>
                    </div>

                    <div className="assignment-result-actions">
                      <button
                        type="button"
                        className="assignment-download-button"
                        onClick={() => downloadResultPDF(result)}
                      >
                        📄 Download This Result PDF
                      </button>
                    </div>
                  </section>
                );
              })
            )}

            <div className="assignment-result-actions">
              <button
                type="button"
                className="assignment-check-again-button"
                onClick={checkAnotherTime}
              >
                Check Another Student
              </button>
            </div>

            <p className="assignment-result-footer">
              CodeForge Academy · Learn. Code. Build.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default CheckAssignmentResult;
