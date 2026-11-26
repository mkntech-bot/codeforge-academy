import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ArrowLeft,
  User,
  ClipboardList,
  AlertCircle,
  Save,
  Award,
  Send,
  RefreshCw,
  Copy,
  ExternalLink,
} from "lucide-react";

import { supabase } from "../lib/supabase";

function AdminSubmissionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [marksInputs, setMarksInputs] = useState({});
  const [feedback, setFeedback] = useState("");

  const [savingAnswerId, setSavingAnswerId] = useState(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function loadSubmission() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.functions.invoke(
      "admin-submissions",
      {
        method: "GET",
      }
    );

    if (error) {
      setError(error.message || "Could not load submission.");
      setLoading(false);
      return;
    }

    if (!data?.success) {
      setError(data?.message || "Could not load submission.");
      setLoading(false);
      return;
    }

    const found = (data.submissions || []).find(
      (item) => item.id === id
    );

    if (!found) {
      setError("Submission not found.");
      setLoading(false);
      return;
    }

    setSubmission(found);
    setFeedback(found.instructor_feedback || "");

    const initialMarks = {};

    (found.answers || []).forEach((answer) => {
      initialMarks[answer.id] =
        answer.marks_awarded == null
          ? ""
          : String(answer.marks_awarded);
    });

    setMarksInputs(initialMarks);
    setLoading(false);
  }

  useEffect(() => {
    loadSubmission();
  }, [id]);

  function formatDate(date) {
    if (!date) return "—";

    return new Date(date).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function updateMark(answerId, value) {
    setMarksInputs((previous) => ({
      ...previous,
      [answerId]: value,
    }));
  }

  async function callResultFunction(body) {
    const { data, error } = await supabase.functions.invoke(
      "admin-manage-results",
      {
        body,
      }
    );

    if (error) {
      throw new Error(error.message || "Request failed.");
    }

    if (!data?.success) {
      throw new Error(data?.message || "Request failed.");
    }

    return data;
  }

  async function handleSaveMark(answer) {
    const question = answer.question;
    const rawMark = marksInputs[answer.id];

    if (rawMark === "" || rawMark == null) {
      setNotice("Enter the marks awarded before saving.");
      return;
    }

    const marks = Number(rawMark);
    const maximumMarks = Number(question?.marks ?? 0);

    if (
      !Number.isInteger(marks) ||
      marks < 0 ||
      marks > maximumMarks
    ) {
      setNotice(
        `Enter a whole number between 0 and ${maximumMarks}.`
      );
      return;
    }

    setSavingAnswerId(answer.id);
    setNotice("");

    try {
      await callResultFunction({
        action: "save_mark",
        submission_id: submission.id,
        answer_id: answer.id,
        marks_awarded: marks,
      });

      setNotice("Marks saved successfully.");
      await loadSubmission();
    } catch (err) {
      setNotice(err.message || "Could not save marks.");
    } finally {
      setSavingAnswerId(null);
    }
  }

  async function handleSaveFeedback() {
    setSavingFeedback(true);
    setNotice("");

    try {
      await callResultFunction({
        action: "save_feedback",
        submission_id: submission.id,
        feedback,
      });

      setNotice("Instructor feedback saved successfully.");
      await loadSubmission();
    } catch (err) {
      setNotice(err.message || "Could not save feedback.");
    } finally {
      setSavingFeedback(false);
    }
  }

  async function handlePublishResult() {
    const confirmed = window.confirm(
      "Are you sure you want to publish this student's result? Published results cannot be changed using this marking system."
    );

    if (!confirmed) return;

    setPublishing(true);
    setNotice("");

    try {
      await callResultFunction({
        action: "publish_result",
        submission_id: submission.id,
        feedback,
      });

      setNotice("Result published successfully.");
      await loadSubmission();
    } catch (err) {
      setNotice(err.message || "Could not publish result.");
    } finally {
      setPublishing(false);
    }
  }

  // COPY UNIVERSAL RESULT LINK
  async function handleCopyResultLink() {
    const resultLink = `${window.location.origin}/check-results`;

    try {
      await navigator.clipboard.writeText(resultLink);

      setNotice(
        "Universal result link copied successfully! Share it with your students."
      );
    } catch (err) {
      console.error("Clipboard error:", err);

      setNotice(
        `Clipboard access unavailable. Copy this link manually: ${resultLink}`
      );
    }
  }

  if (loading) {
    return (
      <div className="admin-submission-details-page">
        <p>Loading submission...</p>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="admin-submission-details-page">
        <button onClick={() => navigate("/admin-submissions")}>
          <ArrowLeft size={17} />
          Back to submissions
        </button>

        <p className="admin-details-error">
          {error || "Submission not found."}
        </p>

        <button onClick={loadSubmission}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  }

  const student = submission.student;
  const assignment = submission.assignment;
  const isPublished = submission.result_published === true;

  const manualAnswers = (submission.answers || []).filter(
    (answer) =>
      answer.question?.question_type === "written" ||
      answer.question?.question_type === "programming"
  );

  const manualMarks = manualAnswers.reduce((total, answer) => {
    const value = marksInputs[answer.id];

    if (value === "" || value == null) return total;

    const number = Number(value);

    return Number.isInteger(number) && number >= 0
      ? total + number
      : total;
  }, 0);

  const allManualMarksEntered = manualAnswers.every((answer) => {
    const value = marksInputs[answer.id];

    if (value === "" || value == null) return false;

    const number = Number(value);

    return (
      Number.isInteger(number) &&
      number >= 0 &&
      number <= Number(answer.question?.marks ?? 0)
    );
  });

  const scorePreview =
    Number(submission.auto_marks || 0) + manualMarks;

  return (
    <div className="admin-submission-details-page">
      <header>
        <div>
          <h1>CodeForge Academy</h1>
          <span>Submission Review</span>
        </div>

        <button onClick={() => navigate("/admin-submissions")}>
          <ArrowLeft size={17} />
          Back
        </button>
      </header>

      <main>
        <div className="admin-details-heading">
          <div>
            <p>ADMINISTRATION / SUBMISSIONS</p>
            <h1>Submission Details</h1>
          </div>
        </div>

        {notice && (
          <div className="admin-details-notice">
            {notice}
          </div>
        )}

        <section className="admin-details-card">
          <h2>
            <User size={20} />
            Student Information
          </h2>

          <p>
            <strong>Name:</strong>{" "}
            {student?.full_name || "Unknown"}
          </p>

          <p>
            <strong>Student Code:</strong>{" "}
            {student?.student_code || "—"}
          </p>

          <p>
            <strong>Class:</strong>{" "}
            {student?.class_group || "—"}
          </p>
        </section>

        <section className="admin-details-card">
          <h2>
            <ClipboardList size={20} />
            Assignment Information
          </h2>

          <p>
            <strong>Assignment:</strong>{" "}
            {assignment?.title || "Unknown"}
          </p>

          <p>
            <strong>Total Marks:</strong>{" "}
            {assignment?.total_marks ?? "—"}
          </p>

          <p>
            <strong>Auto-marked Score:</strong>{" "}
            {submission.auto_marks ?? 0}
          </p>

          <p>
            <strong>Submitted:</strong>{" "}
            {formatDate(submission.submitted_at)}
          </p>

          <p>
            <strong>Result Status:</strong>{" "}
            {isPublished ? "Published" : "Not published"}
          </p>

          {isPublished && (
            <p>
              <strong>Final Score:</strong>{" "}
              {submission.final_score ?? 0} /{" "}
              {assignment?.total_marks ?? 0}
            </p>
          )}
        </section>

        <section className="admin-details-card">
          <h2>Submitted Answers</h2>

          {submission.answers?.length ? (
            submission.answers.map((answer, index) => {
              const question = answer.question;

              const needsManualMarking =
                question?.question_type === "written" ||
                question?.question_type === "programming";

              return (
                <article
                  className="admin-details-question"
                  key={answer.id}
                >
                  <div className="admin-details-question-top">
                    <h3>Question {index + 1}</h3>

                    <span>
                      {question?.marks ?? 0} marks
                    </span>
                  </div>

                  <p className="admin-details-question-text">
                    {question?.question_text ||
                      "Question unavailable"}
                  </p>

                  <div className="admin-details-answer">
                    <strong>Student's Answer</strong>

                    <p>
                      {answer.answer_text?.trim()
                        ? answer.answer_text
                        : "No answer provided"}
                    </p>
                  </div>

                  {question?.question_type === "mcq" && (
                    <p>
                      <strong>Correct Option:</strong>{" "}
                      {question?.correct_answer || "—"}
                    </p>
                  )}

                  {question?.question_type === "fill_blank" && (
                    <p>
                      <strong>Correct Answer:</strong>{" "}
                      {question?.correct_answer || "—"}
                    </p>
                  )}

                  {needsManualMarking && (
                    <div className="admin-details-manual">
                      <AlertCircle size={17} />
                      Manual marking required.
                    </div>
                  )}

                  <p className="admin-details-awarded">
                    <strong>Marks awarded:</strong>{" "}
                    {answer.marks_awarded == null
                      ? "Pending"
                      : answer.marks_awarded}
                    {" / "}
                    {question?.marks ?? 0}
                  </p>

                  {needsManualMarking && (
                    <div className="admin-marking-controls">
                      <label>
                        Award marks (maximum{" "}
                        {question?.marks ?? 0})
                      </label>

                      <input
                        type="number"
                        min="0"
                        max={question?.marks ?? 0}
                        step="1"
                        value={marksInputs[answer.id] ?? ""}
                        disabled={isPublished}
                        placeholder="Enter marks"
                        onChange={(event) =>
                          updateMark(answer.id, event.target.value)
                        }
                      />

                      {!isPublished && (
                        <button
                          type="button"
                          onClick={() => handleSaveMark(answer)}
                          disabled={savingAnswerId === answer.id}
                        >
                          <Save size={16} />
                          {savingAnswerId === answer.id
                            ? "Saving..."
                            : "Save Marks"}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <p>No submitted answers found.</p>
          )}
        </section>

        <section className="admin-details-card">
          <h2>
            <Award size={20} />
            Result Management
          </h2>

          <p>
            <strong>Auto-marked score:</strong>{" "}
            {submission.auto_marks ?? 0}
          </p>

          <p>
            <strong>Manual marks:</strong>{" "}
            {manualMarks}
          </p>

          {!isPublished && (
            <p>
              <strong>Estimated final score:</strong>{" "}
              {scorePreview} / {assignment?.total_marks ?? 0}
            </p>
          )}

          <div className="admin-feedback-control">
            <label htmlFor="instructor-feedback">
              Instructor Feedback
            </label>

            <textarea
              id="instructor-feedback"
              rows="5"
              maxLength="5000"
              value={feedback}
              disabled={isPublished}
              placeholder="Write feedback for the student..."
              onChange={(event) =>
                setFeedback(event.target.value)
              }
            />
          </div>

          {isPublished ? (
            <>
              <div className="admin-details-manual">
                <Award size={18} />
                This result has already been published.
              </div>

              <div className="admin-result-actions">
                <button
                  type="button"
                  onClick={handleCopyResultLink}
                >
                  <Copy size={17} />
                  Copy Result Link
                </button>

                <button
                  type="button"
                  onClick={() => {
                    window.open(
                      `${window.location.origin}/check-results`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                >
                  <ExternalLink size={17} />
                  Preview Result Page
                </button>
              </div>
            </>
          ) : (
            <div className="admin-result-actions">
              <button
                type="button"
                onClick={handleSaveFeedback}
                disabled={savingFeedback}
              >
                <Save size={16} />
                {savingFeedback
                  ? "Saving feedback..."
                  : "Save Feedback"}
              </button>

              <button
                type="button"
                onClick={handlePublishResult}
                disabled={
                  publishing ||
                  !allManualMarksEntered
                }
              >
                <Send size={16} />
                {publishing
                  ? "Publishing..."
                  : "Publish Result"}
              </button>
            </div>
          )}

          {!isPublished && !allManualMarksEntered && (
            <p>
              Enter and save marks for every written and
              programming answer before publishing the result.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminSubmissionDetails;