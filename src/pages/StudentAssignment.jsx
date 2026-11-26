
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

function StudentAssignment() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState("");

  // LOAD ASSIGNMENT
  useEffect(() => {
    let cancelled = false;

    async function loadAssignment() {
      setLoading(true);
      setError("");

      const token = sessionStorage.getItem(
        "codeforge_student_token"
      );

      if (!token) {
        navigate("/student-assignments");
        return;
      }

      try {
        const { data, error: functionError } =
          await supabase.functions.invoke(
            "student-assignment-details",
            {
              body: { assignment_id: id },
              headers: {
                "x-student-token": token,
              },
            }
          );

        if (functionError) {
          throw new Error(
            functionError.message ||
              "Unable to load assignment."
          );
        }

        if (!data?.success) {
          throw new Error(
            data?.error ||
              "Assignment could not be found."
          );
        }

        if (!cancelled) {
          setAssignment(data.assignment);
          setQuestions(data.questions || []);

          // RESTORE PREVIOUS SUBMISSION STATUS
          if (data.already_submitted) {
            setSubmitted(true);

            setSubmissionMessage(
              `You submitted this assignment on ${
                data.submitted_at
                  ? new Date(
                      data.submitted_at
                    ).toLocaleString()
                  : "an earlier date"
              }.`
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message || "Something went wrong."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAssignment();

    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // UPDATE ANSWER
  function updateAnswer(questionId, value) {
    if (submitted || submitting) return;

    setAnswers((previous) => ({
      ...previous,
      [questionId]: value,
    }));
  }

  // SUBMIT ASSIGNMENT
  async function handleSubmit() {
    if (submitted || submitting) return;

    const unanswered = questions.filter(
      (question) =>
        !(answers[question.id] || "").trim()
    );

    if (unanswered.length > 0) {
      alert(
        `Please answer all ${unanswered.length} remaining question(s).`
      );
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to submit? You cannot change your answers after submission."
    );

    if (!confirmed) return;

    const token = sessionStorage.getItem(
      "codeforge_student_token"
    );

    if (!token) {
      navigate("/student-assignments");
      return;
    }

    setSubmitting(true);
    setSubmissionMessage("");

    try {
      const { data, error: submitError } =
        await supabase.functions.invoke(
          "student-submit-assignment",
          {
            body: {
              assignment_id: id,
              answers: questions.map((question) => ({
                question_id: question.id,
                answer: answers[question.id] || "",
              })),
            },
            headers: {
              "x-student-token": token,
            },
          }
        );

      if (submitError) {
        throw new Error(submitError.message);
      }

      if (!data?.success) {
        throw new Error(
          data?.error || "Submission failed."
        );
      }

      setSubmitted(true);

      setSubmissionMessage(
        data.message ||
          "Your assignment was submitted successfully."
      );
    } catch (err) {
      alert(
        err.message || "Unable to submit assignment."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // LOADING SCREEN
  if (loading) {
    return (
      <div className="student-assignment-page">
        <p>Loading assignment...</p>
      </div>
    );
  }

  // ERROR SCREEN
  if (error) {
    return (
      <div className="student-assignment-page">
        <h2>Unable to Open Assignment</h2>
        <p>{error}</p>

        <button onClick={() => navigate("/student")}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  // MAIN PAGE
  return (
    <div className="student-assignment-page">
      <header>
        <h1>CodeForge Academy</h1>

        <button
          onClick={() => navigate("/student")}
          disabled={submitting}
        >
          Back to Dashboard
        </button>
      </header>

      <main>
        {/* ASSIGNMENT DETAILS */}
        <section className="student-assignment-heading">
          <p>STUDENT ASSESSMENT</p>

          <h1>{assignment?.title}</h1>

          <p>{assignment?.description}</p>

          <div>
            <strong>Total Marks:</strong>{" "}
            {assignment?.total_marks}
          </div>

          {assignment?.due_date && (
            <div>
              <strong>Deadline:</strong>{" "}
              {new Date(
                assignment.due_date
              ).toLocaleString()}
            </div>
          )}
        </section>

        {/* PREVIOUS SUBMISSION NOTICE */}
        {submitted && (
          <div className="student-submission-success">
            <h2>Assignment Already Submitted!</h2>

            <p>{submissionMessage}</p>

            <p>
              Your answers are locked. You cannot
              submit this assignment again.
            </p>
          </div>
        )}

        {/* QUESTIONS */}
        <section className="student-assignment-questions">
          <h2>Questions</h2>

          {questions.length === 0 ? (
            <p>
              No questions are available in this assignment.
            </p>
          ) : (
            questions.map((question, index) => (
              <article
                className="student-question-card"
                key={question.id}
              >
                <div className="student-question-top">
                  <h3>Question {index + 1}</h3>
                  <span>{question.marks} marks</span>
                </div>

                <p className="student-question-text">
                  {question.question_text}
                </p>

                {/* MCQ */}
                {question.question_type === "mcq" && (
                  <div className="student-mcq-options">
                    {Object.entries(
                      question.options || {}
                    ).map(([letter, option]) => (
                      <label
                        key={letter}
                        className={
                          answers[question.id] === letter
                            ? "selected"
                            : ""
                        }
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={letter}
                          checked={
                            answers[question.id] === letter
                          }
                          disabled={submitted || submitting}
                          onChange={() =>
                            updateAnswer(
                              question.id,
                              letter
                            )
                          }
                        />

                        <span>
                          <strong>{letter}.</strong>{" "}
                          {option}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* FILL IN THE BLANK */}
                {question.question_type === "fill_blank" && (
                  <input
                    type="text"
                    placeholder="Type your answer here..."
                    value={answers[question.id] || ""}
                    disabled={submitted || submitting}
                    onChange={(e) =>
                      updateAnswer(
                        question.id,
                        e.target.value
                      )
                    }
                  />
                )}

                {/* WRITTEN */}
                {question.question_type === "written" && (
                  <textarea
                    rows={6}
                    placeholder="Write your answer here..."
                    value={answers[question.id] || ""}
                    disabled={submitted || submitting}
                    onChange={(e) =>
                      updateAnswer(
                        question.id,
                        e.target.value
                      )
                    }
                  />
                )}

                {/* PROGRAMMING */}
                {question.question_type === "programming" && (
                  <textarea
                    rows={12}
                    className="student-code-answer"
                    placeholder="// Write your code here..."
                    value={answers[question.id] || ""}
                    disabled={submitted || submitting}
                    onChange={(e) =>
                      updateAnswer(
                        question.id,
                        e.target.value
                      )
                    }
                    spellCheck={false}
                  />
                )}
              </article>
            ))
          )}
        </section>

        {/* SUBMISSION BUTTON */}
        {!submitted && (
          <>
            <p className="student-assignment-notice">
              Review your answers carefully before
              submitting. You cannot edit your answers
              after submission.
            </p>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                submitting || questions.length === 0
              }
              className="student-submit-btn"
            >
              {submitting
                ? "Submitting..."
                : "Submit Assignment"}
            </button>
          </>
        )}

        {/* SUBMISSION SUCCESS */}
        {submitted && (
          <div className="student-submission-success">
            <h2>Assignment Submitted!</h2>

            <p>{submissionMessage}</p>

            <p>Your answers are now locked.</p>

            <button onClick={() => navigate("/student")}>
              Return to Dashboard
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default StudentAssignment;
