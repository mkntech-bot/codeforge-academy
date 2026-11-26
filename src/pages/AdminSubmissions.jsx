import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  ClipboardList,
  Clock,
  CheckCircle,
  AlertCircle,
  GraduationCap,
} from "lucide-react";

import { supabase } from "../lib/supabase";

function AdminSubmissions() {
  const navigate = useNavigate();

  const [submissions, setSubmissions] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadSubmissions(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    const { data, error } = await supabase.functions.invoke(
      "admin-submissions",
      {
        method: "GET",
      }
    );

    if (error) {
      setError(error.message || "Could not load submissions.");
      setSubmissions([]);
    } else if (!data?.success) {
      setError(data?.message || "Could not load submissions.");
      setSubmissions([]);
    } else {
      setSubmissions(data.submissions || []);
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    loadSubmissions();
  }, []);

  const filteredSubmissions = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    if (!searchText) {
      return submissions;
    }

    return submissions.filter((submission) => {
      const studentName =
        submission.student?.full_name?.toLowerCase() || "";

      const studentCode =
        submission.student?.student_code?.toLowerCase() || "";

      const assignmentTitle =
        submission.assignment?.title?.toLowerCase() || "";

      return (
        studentName.includes(searchText) ||
        studentCode.includes(searchText) ||
        assignmentTitle.includes(searchText)
      );
    });
  }, [submissions, search]);

  function formatDate(date) {
    if (!date) return "—";

    return new Date(date).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <div className="admin-submissions-page">
      <header>
        <div className="admin-submissions-brand">
          <div className="admin-submissions-logo">CF</div>

          <div>
            <h1>CodeForge Academy</h1>
            <span>Administration Panel</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={17} />
          Dashboard
        </button>
      </header>

      <main>
        <div className="admin-submissions-heading">
          <div>
            <p className="admin-submissions-eyebrow">
              ADMINISTRATION
            </p>

            <h1>Assignment Submissions</h1>

            <p>
              Review student work and monitor assignment performance.
            </p>
          </div>

          <button
            type="button"
            className="admin-submissions-refresh"
            onClick={() => loadSubmissions(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={17}
              className={
                refreshing ? "admin-refresh-spinning" : ""
              }
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <section className="admin-submissions-summary">
          <div className="admin-submissions-summary-icon">
            <ClipboardList size={22} />
          </div>

          <div>
            <span>Total Submissions</span>
            <h2>{submissions.length}</h2>
          </div>
        </section>

        <section className="admin-submissions-list-section">
          <div className="admin-submissions-section-heading">
            <div>
              <h2>Submitted Assignments</h2>
              <p>
                Search by student name, student code, or assignment.
              </p>
            </div>

            <span className="admin-submissions-count">
              {filteredSubmissions.length} found
            </span>
          </div>

          <div className="admin-submissions-search">
            <Search size={18} />

            <input
              type="text"
              placeholder="Search submissions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {error && (
            <div className="admin-submissions-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="admin-submissions-empty">
              <RefreshCw size={25} />
              <p>Loading submissions...</p>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="admin-submissions-empty">
              <GraduationCap size={38} />

              <h3>No submissions found</h3>

              <p>
                Student submissions will appear here after they
                complete and submit an assignment.
              </p>
            </div>
          ) : (
            <div className="admin-submissions-cards">
              {filteredSubmissions.map((submission) => {
                const student = submission.student;
                const assignment = submission.assignment;

                return (
                  <article
                    className="admin-submission-card"
                    key={submission.id}
                  >
                    <div className="admin-submission-card-top">
                      <div className="admin-submission-student">
                        <div className="admin-submission-avatar">
                          {student?.full_name
                            ?.charAt(0)
                            ?.toUpperCase() || "S"}
                        </div>

                        <div>
                          <h3>
                            {student?.full_name || "Unknown Student"}
                          </h3>

                          <span>
                            {student?.student_code || "No student code"}
                            {student?.class_group
                              ? ` · ${student.class_group}`
                              : ""}
                          </span>
                        </div>
                      </div>

                      <span
                        className={
                          submission.manual_marking_required
                            ? "admin-submission-status pending"
                            : "admin-submission-status completed"
                        }
                      >
                        {submission.manual_marking_required
                          ? "Manual marking"
                          : "Auto-marked"}
                      </span>
                    </div>

                    <div className="admin-submission-card-details">
                      <div>
                        <span>Assignment</span>
                        <strong>
                          {assignment?.title || "Unknown Assignment"}
                        </strong>
                      </div>

                      <div>
                        <span>Auto-marked score</span>
                        <strong>
                          {submission.auto_marks ?? 0}
                          {assignment?.total_marks != null
                            ? ` / ${assignment.total_marks}`
                            : ""}
                        </strong>
                      </div>

                      <div>
                        <span>Submitted</span>
                        <strong>
                          <Clock size={15} />
                          {formatDate(submission.submitted_at)}
                        </strong>
                      </div>
                    </div>

                    <div className="admin-submission-card-footer">
                      {submission.manual_marking_required ? (
                        <p>
                          <AlertCircle size={16} />
                          Written or programming answers need marking.
                        </p>
                      ) : (
                        <p>
                          <CheckCircle size={16} />
                          No manual marking pending.
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                        navigate(`/admin-submission/${submission.id}`)
                        }
                      >
                       View Submission →
                       </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminSubmissions;