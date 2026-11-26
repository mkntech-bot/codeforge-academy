
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function Assignments() {
  // ASSIGNMENT DETAILS
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalMarks, setTotalMarks] = useState("");
  const [dueDate, setDueDate] = useState("");

  // GENERAL STATES
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [createdAssignment, setCreatedAssignment] = useState(null);

  // ALL ASSIGNMENTS
  const [allAssignments, setAllAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [updatingAssignment, setUpdatingAssignment] = useState(null);

  // QUESTION FORM
  const [questionType, setQuestionType] = useState("mcq");
  const [questionText, setQuestionText] = useState("");

  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");

  const [correctAnswer, setCorrectAnswer] = useState("");
  const [questionMarks, setQuestionMarks] = useState("1");

  // QUESTION MANAGEMENT
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deletingQuestion, setDeletingQuestion] = useState(null);
  const [editingQuestionId, setEditingQuestionId] = useState(null);

  // QUESTION TYPES
  const questionTypes = [
    { value: "mcq", label: "Multiple Choice Questions (MCQ)" },
    { value: "fill_blank", label: "Fill in the Blanks" },
    { value: "written", label: "Written / Essay Questions" },
    { value: "programming", label: "Programming Questions" },
  ];

  useEffect(() => {
    loadAllAssignments();
  }, []);

  function getQuestionTypeName(type) {
    const found = questionTypes.find((item) => item.value === type);
    return found ? found.label : type;
  }

  // LOAD ALL ASSIGNMENTS
  async function loadAllAssignments() {
    setLoadingAssignments(true);

    try {
      const { data, error: fetchError } = await supabase
        .from("assignments")
        .select("id, title, description, total_marks, due_date, published, created_at")
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setAllAssignments(data || []);
    } catch (err) {
      setError(err.message || "Unable to load assignments.");
    } finally {
      setLoadingAssignments(false);
    }
  }

  // CREATE ASSIGNMENT
  async function handleCreateAssignment(e) {
    e.preventDefault();

    setLoading(true);
    setMessage("");
    setError("");
    setCreatedAssignment(null);
    setQuestions([]);
    resetQuestionForm();

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Unable to verify your admin account.");
        return;
      }

      const { data: newAssignment, error: insertError } =
        await supabase
          .from("assignments")
          .insert({
            title: title.trim(),
            description: description.trim(),
            total_marks: Number(totalMarks),
            due_date: dueDate,
            created_by: user.id,
            published: false,
          })
          .select()
          .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setCreatedAssignment(newAssignment);

      setTitle("");
      setDescription("");
      setTotalMarks("");
      setDueDate("");

      setMessage("Assignment created successfully!");

      await loadQuestions(newAssignment.id);
      await loadAllAssignments();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // LOAD QUESTIONS
  async function loadQuestions(assignmentId) {
    setLoadingQuestions(true);

    try {
      const { data, error: fetchError } = await supabase
        .from("assignment_questions")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setQuestions(data || []);
    } catch (err) {
      setError(err.message || "Unable to load questions.");
    } finally {
      setLoadingQuestions(false);
    }
  }

  // RESET QUESTION FORM
  function resetQuestionForm() {
    setQuestionType("mcq");
    setQuestionText("");

    setOptionA("");
    setOptionB("");
    setOptionC("");
    setOptionD("");

    setCorrectAnswer("");
    setQuestionMarks("1");

    setEditingQuestionId(null);
  }

  // SAVE OR UPDATE QUESTION
  async function saveQuestion(e) {
    e.preventDefault();

    if (!createdAssignment) {
      setError("Create an assignment first.");
      return;
    }

    if (!questionText.trim()) {
      setError("Please enter the question.");
      return;
    }

    if (!questionMarks || Number(questionMarks) < 1) {
      setError("Question marks must be at least 1.");
      return;
    }

    if (
      questionType === "mcq" &&
      (!optionA.trim() ||
        !optionB.trim() ||
        !optionC.trim() ||
        !optionD.trim())
    ) {
      setError("Please complete all four options.");
      return;
    }

    if (
      (questionType === "mcq" || questionType === "fill_blank") &&
      !correctAnswer.trim()
    ) {
      setError("Please provide the correct answer.");
      return;
    }

    setSavingQuestion(true);
    setError("");
    setMessage("");

    try {
      const questionData = {
        assignment_id: createdAssignment.id,
        question_text: questionText.trim(),
        question_type: questionType,
        options:
          questionType === "mcq"
            ? {
                A: optionA.trim(),
                B: optionB.trim(),
                C: optionC.trim(),
                D: optionD.trim(),
              }
            : null,
        correct_answer: correctAnswer.trim() || null,
        marks: Number(questionMarks),
      };

      let saveError;

      if (editingQuestionId) {
        const { error: updateError } = await supabase
          .from("assignment_questions")
          .update(questionData)
          .eq("id", editingQuestionId)
          .eq("assignment_id", createdAssignment.id);

        saveError = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("assignment_questions")
          .insert(questionData);

        saveError = insertError;
      }

      if (saveError) {
        setError(saveError.message);
        return;
      }

      const wasEditing = Boolean(editingQuestionId);

      resetQuestionForm();

      await loadQuestions(createdAssignment.id);
      await loadAllAssignments();

      setMessage(
        wasEditing
          ? "Question updated successfully!"
          : "Question added successfully!"
      );
    } catch (err) {
      setError(err.message || "Unable to save question.");
    } finally {
      setSavingQuestion(false);
    }
  }

  // EDIT QUESTION
  function editQuestion(question) {
    setEditingQuestionId(question.id);

    setQuestionType(question.question_type);
    setQuestionText(question.question_text || "");

    setOptionA(question.options?.A || "");
    setOptionB(question.options?.B || "");
    setOptionC(question.options?.C || "");
    setOptionD(question.options?.D || "");

    setCorrectAnswer(question.correct_answer || "");
    setQuestionMarks(String(question.marks || 1));

    setMessage("Editing question. Make your changes below.");
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // DELETE QUESTION
  async function deleteQuestion(questionId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this question?"
    );

    if (!confirmed) return;

    setDeletingQuestion(questionId);
    setError("");
    setMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("assignment_questions")
        .delete()
        .eq("id", questionId)
        .eq("assignment_id", createdAssignment.id);

      if (deleteError) {
        setError(deleteError.message);
        return;
      }

      if (editingQuestionId === questionId) {
        resetQuestionForm();
      }

      await loadQuestions(createdAssignment.id);
      await loadAllAssignments();

      setMessage("Question deleted successfully!");
    } catch (err) {
      setError(err.message || "Unable to delete question.");
    } finally {
      setDeletingQuestion(null);
    }
  }

  // OPEN AN EXISTING ASSIGNMENT
  async function openAssignment(assignment) {
    setCreatedAssignment(assignment);
    setQuestions([]);
    resetQuestionForm();
    setMessage("");
    setError("");

    await loadQuestions(assignment.id);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // PUBLISH OR UNPUBLISH
  async function togglePublication(assignment) {
    setError("");
    setMessage("");

    if (!assignment.published) {
      if (updatingAssignment) return;

      const { data: assignmentQuestions, error: questionError } =
        await supabase
          .from("assignment_questions")
          .select("marks")
          .eq("assignment_id", assignment.id);

      if (questionError) {
        setError(questionError.message);
        return;
      }

      if (!assignmentQuestions || assignmentQuestions.length === 0) {
        setError("Add questions before publishing this assignment.");
        return;
      }

      const allocatedMarks = assignmentQuestions.reduce(
        (total, question) => total + Number(question.marks || 0),
        0
      );

      if (allocatedMarks !== Number(assignment.total_marks)) {
        setError(
          `Cannot publish. The questions have ${allocatedMarks} marks, but the assignment total is ${assignment.total_marks}.`
        );
        return;
      }
    }

    setUpdatingAssignment(assignment.id);

    try {
      const { error: updateError } = await supabase
        .from("assignments")
        .update({
          published: !assignment.published,
        })
        .eq("id", assignment.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setMessage(
        assignment.published
          ? "Assignment unpublished successfully."
          : "Assignment published successfully. Students can now access it."
      );

      await loadAllAssignments();

      if (createdAssignment?.id === assignment.id) {
        setCreatedAssignment({
          ...createdAssignment,
          published: !assignment.published,
        });
      }
    } catch (err) {
      setError(err.message || "Unable to update publication status.");
    } finally {
      setUpdatingAssignment(null);
    }
  }

  // GROUP QUESTIONS BY SECTION
  const groupedQuestions = questionTypes
    .map((type) => ({
      ...type,
      questions: questions.filter(
        (question) => question.question_type === type.value
      ),
    }))
    .filter((section) => section.questions.length > 0);

  // TOTAL QUESTION MARKS
  const calculatedMarks = questions.reduce(
    (total, question) => total + Number(question.marks || 0),
    0
  );

  return (
    <div className="admin-dashboard">
      <main className="admin-main">

        <div className="admin-welcome">
          <div>
            <p className="admin-eyebrow">ACADEMIC MANAGEMENT</p>
            <h1>Assignment Management</h1>
            <p>
              Create examinations with different question sections
              for your students.
            </p>
          </div>
        </div>

        {message && <div className="admin-success">{message}</div>}
        {error && <div className="admin-error">{error}</div>}

        {/* ALL ASSIGNMENTS */}
        <section className="assignment-form">
          <h2>All Assignments</h2>

          <button
            type="button"
            onClick={loadAllAssignments}
            disabled={loadingAssignments}
          >
            {loadingAssignments ? "Refreshing..." : "Refresh Assignments"}
          </button>

          {loadingAssignments ? (
            <p>Loading assignments...</p>
          ) : allAssignments.length === 0 ? (
            <p>No assignments have been created yet.</p>
          ) : (
            allAssignments.map((assignment) => (
              <article
                className="question-list-item"
                key={assignment.id}
              >
                <h3>{assignment.title}</h3>

                <p>
                  <strong>Marks:</strong> {assignment.total_marks}
                </p>

                <p>
                  <strong>Deadline:</strong>{" "}
                  {assignment.due_date
                    ? new Date(assignment.due_date).toLocaleString()
                    : "No deadline"}
                </p>

                <p>
                  <strong>Status:</strong>{" "}
                  {assignment.published ? "Published" : "Unpublished"}
                </p>

                <button
                  type="button"
                  className="question-edit-btn"
                  onClick={() => openAssignment(assignment)}
                >
                  Manage Questions
                </button>

                <button
                  type="button"
                  onClick={() => togglePublication(assignment)}
                  disabled={updatingAssignment !== null}
                >
                  {updatingAssignment === assignment.id
                    ? "Updating..."
                    : assignment.published
                      ? "Unpublish"
                      : "Publish"}
                </button>
              </article>
            ))
          )}
        </section>

        {/* CREATE ASSIGNMENT */}
        <form
          className="assignment-form"
          onSubmit={handleCreateAssignment}
        >
          <h2>Create New Assignment</h2>

          <label>Assignment Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Computer Science Examination"
            required
          />

          <label>Instructions / Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Write the examination instructions..."
            rows={6}
            required
          />

          <label>Total Marks</label>
          <input
            type="number"
            min="1"
            value={totalMarks}
            onChange={(e) => setTotalMarks(e.target.value)}
            placeholder="e.g. 100"
            required
          />

          <label>Submission Deadline</label>
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Assignment"}
          </button>
        </form>

        {/* CURRENT ASSIGNMENT */}
        {createdAssignment && (
          <section className="assignment-form">
            <h2>Current Assignment</h2>

            <p>
              <strong>Title:</strong> {createdAssignment.title}
            </p>

            <p>
              <strong>Total Marks:</strong>{" "}
              {createdAssignment.total_marks}
            </p>

            <p>
              <strong>Publication:</strong>{" "}
              {createdAssignment.published ? "Published" : "Unpublished"}
            </p>

            <p>
              <strong>Questions:</strong> {questions.length}
            </p>

            <p>
              <strong>Marks Allocated:</strong> {calculatedMarks}
            </p>

            {calculatedMarks > Number(createdAssignment.total_marks) && (
              <p className="admin-error">
                Warning: Your question marks exceed the assignment total.
              </p>
            )}

            {calculatedMarks < Number(createdAssignment.total_marks) && (
              <p className="assignment-help-text">
                You still have{" "}
                {Number(createdAssignment.total_marks) - calculatedMarks}{" "}
                marks available to allocate.
              </p>
            )}
          </section>
        )}

        {/* QUESTION BUILDER */}
        {createdAssignment && (
          <form className="assignment-form" onSubmit={saveQuestion}>
            <h2>
              {editingQuestionId ? "Edit Question" : "Add New Question"}
            </h2>

            <p>Assignment: {createdAssignment.title}</p>

            <label>Question Section / Type</label>
            <select
              value={questionType}
              onChange={(e) => {
                setQuestionType(e.target.value);
                setOptionA("");
                setOptionB("");
                setOptionC("");
                setOptionD("");
                setCorrectAnswer("");
              }}
              required
            >
              {questionTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            <p className="assignment-help-text">
              Select the section this question belongs to.
              You can use different sections in the same assignment.
            </p>

            <label>Question</label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Type your question here..."
              rows={4}
              required
            />

            {questionType === "mcq" && (
              <>
                <h3>Answer Options</h3>

                {[
                  ["Option A", optionA, setOptionA],
                  ["Option B", optionB, setOptionB],
                  ["Option C", optionC, setOptionC],
                  ["Option D", optionD, setOptionD],
                ].map(([label, value, setter]) => (
                  <div key={label}>
                    <label>{label}</label>
                    <input
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      placeholder={`Enter ${label.toLowerCase()}`}
                      required
                    />
                  </div>
                ))}

                <label>Correct Answer</label>
                <select
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  required
                >
                  <option value="">Select correct answer</option>
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              </>
            )}

            {questionType === "fill_blank" && (
              <>
                <label>Correct Answer</label>
                <input
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  placeholder="Enter the expected answer"
                  required
                />
                <p className="assignment-help-text">
                  Use blank spaces or underscores in the question
                  to indicate where students should fill in their answers.
                </p>
              </>
            )}

            {questionType === "written" && (
              <>
                <label>Expected Answer / Marking Guide</label>
                <textarea
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  placeholder="Enter the expected answer or marking guide..."
                  rows={5}
                />
                <p className="assignment-help-text">
                  This is teacher guidance for marking.
                </p>
              </>
            )}

            {questionType === "programming" && (
              <>
                <label>Expected Solution / Marking Guide</label>
                <textarea
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  placeholder="Describe the expected solution, output or marking criteria..."
                  rows={6}
                />
                <p className="assignment-help-text">
                  Include the expected output, important requirements
                  or marking criteria for the programming task.
                </p>
              </>
            )}

            <label>Question Marks</label>
            <input
              type="number"
              min="1"
              value={questionMarks}
              onChange={(e) => setQuestionMarks(e.target.value)}
              required
            />

            <button type="submit" disabled={savingQuestion}>
              {savingQuestion
                ? "Saving..."
                : editingQuestionId
                  ? "Save Changes"
                  : "Add Question"}
            </button>

            {editingQuestionId && (
              <button
                type="button"
                className="question-cancel-btn"
                onClick={() => {
                  resetQuestionForm();
                  setMessage("Editing cancelled.");
                  setError("");
                }}
                disabled={savingQuestion}
              >
                Cancel Editing
              </button>
            )}
          </form>
        )}

        {/* QUESTION LIST */}
        {createdAssignment && (
          <section className="assignment-form">
            <h2>Examination Sections</h2>

            <p className="assignment-help-text">
              Your questions are automatically organised
              according to their question types.
            </p>

            {loadingQuestions ? (
              <p>Loading questions...</p>
            ) : questions.length === 0 ? (
              <p>No questions added yet.</p>
            ) : (
              groupedQuestions.map((section) => (
                <div
                  key={section.value}
                  className="assignment-question-section"
                >
                  <h3>{section.label}</h3>

                  <p className="assignment-help-text">
                    {section.questions.length} question(s)
                  </p>

                  {section.questions.map((question, index) => (
                    <div
                      key={question.id}
                      className="question-list-item"
                    >
                      <h3>Question {index + 1}</h3>
                      <p>{question.question_text}</p>

                      {question.question_type === "mcq" &&
                        question.options && (
                          <ul>
                            {Object.entries(question.options).map(
                              ([letter, option]) => (
                                <li key={letter}>
                                  {letter}. {option}
                                </li>
                              )
                            )}
                          </ul>
                        )}

                      {question.correct_answer && (
                        <p>
                          <strong>
                            {question.question_type === "written" ||
                            question.question_type === "programming"
                              ? "Marking Guide / Expected Solution:"
                              : "Correct Answer:"}
                          </strong>{" "}
                          {question.correct_answer}
                        </p>
                      )}

                      <p>
                        <strong>Marks:</strong> {question.marks}
                      </p>

                      <button
                        type="button"
                        className="question-edit-btn"
                        onClick={() => editQuestion(question)}
                        disabled={
                          savingQuestion ||
                          deletingQuestion !== null
                        }
                      >
                        Edit Question
                      </button>

                      <button
                        type="button"
                        className="question-delete-btn"
                        onClick={() => deleteQuestion(question.id)}
                        disabled={deletingQuestion === question.id}
                      >
                        {deletingQuestion === question.id
                          ? "Deleting..."
                          : "Delete Question"}
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default Assignments;
