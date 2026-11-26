
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

import {
  BookOpen,
  Calendar,
  LogOut,
  GraduationCap,
  AlertCircle,
  Award,
} from "lucide-react";

function StudentPortal() {
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignmentError, setAssignmentError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      const token = sessionStorage.getItem(
        "codeforge_student_token"
      );

      if (!token) {
        window.location.replace("/student-assignments");
        return;
      }

      // STEP 1: VERIFY STUDENT SESSION

      try {
        const { data, error: sessionError } =
          await supabase.functions.invoke("student-session", {
            headers: {
              "x-student-token": token,
            },
          });

        if (sessionError || !data?.success || !data?.student) {
          throw new Error(
            data?.error || "Your session has expired. Please log in again."
          );
        }

        if (!active) return;

        setStudent(data.student);
        setLoading(false);

      } catch (err) {
        if (!active) return;

        setError(err.message || "Session verification failed.");

        sessionStorage.removeItem("codeforge_student_token");

        window.location.replace("/student-assignments");
        return;
      }

      // STEP 2: LOAD ASSIGNMENTS SEPARATELY

      try {
        const { data, error: fetchError } =
          await supabase.functions.invoke("student-assignments", {
            headers: {
              "x-student-token": token,
            },
          });

        if (fetchError) {
          throw new Error(
            fetchError.message || "Unable to load assignments."
          );
        }

        if (!data?.success) {
          throw new Error(
            data?.error || "Unable to load assignments."
          );
        }

        if (active) {
          setAssignments(data.assignments || []);
        }

      } catch (err) {
        if (active) {
          setAssignmentError(
            err.message || "Unable to load assignments."
          );
        }
      } finally {
        if (active) {
          setAssignmentsLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  function handleLogout() {
    sessionStorage.removeItem("codeforge_student_token");
    window.location.replace("/student-assignments");
  }

  function formatDate(date) {
    if (!date) return "No deadline";

    return new Date(date).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  if (loading) {
    return (
      <div className="student-portal-page">
        <h1>Verifying your account...</h1>
        <p>Please wait.</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="student-portal-page">
        <h1>Unable to access your account</h1>
        <p>{error || "Please log in again."}</p>
      </div>
    );
  }

  return (
    <div className="student-portal-page">

      <header>
        <div>
          <h1>CodeForge Academy</h1>
          <p>Student Portal</p>
        </div>

        <button onClick={handleLogout}>
          <LogOut size={17} />
          Logout
        </button>
      </header>

      <main>

        <section>
          <h1>Welcome, {student.full_name}!</h1>
          <p>Your student dashboard</p>
        </section>

        <section className="student-profile-card">
          <h2>
            <GraduationCap size={21} />
            My Profile
          </h2>

          <p>
            <strong>Student Name:</strong> {student.full_name}
          </p>

          <p>
            <strong>Student Code:</strong> {student.student_code}
          </p>

          <p>
            <strong>Class:</strong> {student.class_group}
          </p>
        </section>

        {/* MY RESULTS NAVIGATION */}

        <section className="student-results-shortcut">
          <div className="student-results-shortcut-info">
            <Award size={30} />

            <div>
              <h2>My Results</h2>
              <p>
                View your published assignment results and instructor feedback.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/student-results")}
          >
            View My Results
            <span>→</span>
          </button>
        </section>

        <section className="student-assignments-section">

          <div>
            <h2>
              <BookOpen size={22} />
              My Assignments
            </h2>

            <p>Complete your available assignments here.</p>
          </div>

          {assignmentsLoading ? (
            <p>Loading your assignments...</p>
          ) : assignmentError ? (
            <p className="student-error">
              <AlertCircle size={17} />
              {assignmentError}
            </p>
          ) : assignments.length === 0 ? (
            <div className="student-no-assignments">
              <BookOpen size={35} />
              <h3>No assignments available</h3>
              <p>
                Your assignments will appear here when
                your instructor publishes them.
              </p>
            </div>
          ) : (
            <div className="student-assignment-list">

              {assignments.map((assignment) => (
                <article
                  className="student-assignment-card"
                  key={assignment.id}
                >
                  <h3>{assignment.title}</h3>

                  <p>
                    {assignment.description ||
                      "No additional instructions."}
                  </p>

                  <div className="student-assignment-info">
                    <span>
                      <GraduationCap size={16} />
                      {assignment.total_marks} Marks
                    </span>

                    <span>
                      <Calendar size={16} />
                      {formatDate(assignment.due_date)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/student-assignment/${assignment.id}`
                      )
                    }
                  >
                    <BookOpen size={17} />
                    Start Assignment
                  </button>
                </article>
              ))}

            </div>
          )}

        </section>
      </main>
    </div>
  );
}

export default StudentPortal;
