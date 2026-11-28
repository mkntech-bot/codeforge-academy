
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

import {
  Users,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  GraduationCap,
  LogOut,
  AlertCircle,
  Copy,
  ExternalLink,
  Award,
  Sparkles,
} from "lucide-react";

function Dashboard() {
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testingAi, setTestingAi] = useState(false);

  const [editingStudent, setEditingStudent] = useState(null);
  const [newStudentName, setNewStudentName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // UNIVERSAL STUDENT RESULT LINK
  const resultLink = `${window.location.origin}/check-results`;

  // LOAD STUDENTS
  async function loadStudents() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .order("registered_at", { ascending: false });

    if (error) {
      setError(error.message);
      setStudents([]);
    } else {
      setStudents(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadStudents();
  }, []);

  // COPY RESULT LINK WITH FALLBACK
  async function handleCopyResultLink() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(resultLink);
      } else {
        const textArea = document.createElement("textarea");

        textArea.value = resultLink;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";

        document.body.appendChild(textArea);
        textArea.select();

        const copied = document.execCommand("copy");

        document.body.removeChild(textArea);

        if (!copied) {
          throw new Error("Clipboard copy was unsuccessful.");
        }
      }

      setNotice("Student results link copied successfully!");
    } catch (err) {
      console.error("Clipboard error:", err);
      setNotice("Copy failed. Select the link manually.");
    }

    setTimeout(() => {
      setNotice("");
    }, 4000);
  }

  // TEST AI MARKING CONNECTION (ADMIN ONLY)
  async function handleTestAiMarking() {
    setTestingAi(true);
    setNotice("Testing AI marking connection...");

    try {
      const { data, error } = await supabase.functions.invoke(
        "test-ai-marking",
        { body: {} }
      );

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "The AI connection test failed.");
      }

      setNotice(
        `AI connection successful. Sample answer was marked: ${data.sample_decision}.`
      );
    } catch (err) {
      console.error("AI marking test error:", err);
      setNotice(err.message || "Unable to test the AI connection.");
    } finally {
      setTestingAi(false);
    }
  }

  // STUDENT STATISTICS
  const totalStudents = students.length;

  const activeStudents = students.filter(
    (student) => student.registration_status === "active"
  ).length;

  const inactiveStudents = students.filter(
    (student) => student.registration_status === "inactive"
  ).length;

  // AVAILABLE CLASSES
  const classes = [
    ...new Set(
      students
        .map((student) => student.class_group)
        .filter(Boolean)
    ),
  ];

  // SEARCH AND FILTER
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const searchMatch =
        student.full_name
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||
        student.student_code
          ?.toLowerCase()
          .includes(search.toLowerCase());

      const classMatch =
        classFilter === "all" ||
        student.class_group === classFilter;

      return searchMatch && classMatch;
    });
  }, [students, search, classFilter]);

  // LOGOUT
  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setError(error.message);
      return;
    }

    window.location.href = "/admin-login";
  }

  // ACTIVATE OR DEACTIVATE STUDENT
  async function toggleStudentStatus(student) {
    const newStatus =
      student.registration_status === "active"
        ? "inactive"
        : "active";

    const { error } = await supabase
      .from("students")
      .update({ registration_status: newStatus })
      .eq("id", student.id);

    if (error) {
      setError(error.message);
      return;
    }

    setStudents((previousStudents) =>
      previousStudents.map((item) =>
        item.id === student.id
          ? { ...item, registration_status: newStatus }
          : item
      )
    );

    setError("");
  }

  // SAVE STUDENT NAME
  async function saveStudentName() {
    const updatedName = newStudentName.trim();

    if (!updatedName) {
      setError("Student name cannot be empty.");
      return;
    }

    setSavingName(true);
    setError("");

    const { error } = await supabase
      .from("students")
      .update({ full_name: updatedName })
      .eq("id", editingStudent.id);

    if (error) {
      setError(error.message);
      setSavingName(false);
      return;
    }

    setStudents((previousStudents) =>
      previousStudents.map((student) =>
        student.id === editingStudent.id
          ? { ...student, full_name: updatedName }
          : student
      )
    );

    setEditingStudent(null);
    setNewStudentName("");
    setSavingName(false);
  }

  return (
    <div className="admin-dashboard">

      {/* HEADER */}

      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-logo">CF</div>

          <div>
            <h2>CodeForge Academy</h2>
            <span>Administration Panel</span>
          </div>
        </div>

        <button className="admin-logout" onClick={handleLogout}>
          <LogOut size={17} />
          Logout
        </button>
      </header>

      <main className="admin-main">

        {/* WELCOME */}

        <div className="admin-welcome">
          <div>
            <p className="admin-eyebrow">ADMINISTRATION</p>

            <h1>Dashboard</h1>

            <p>
              Manage your academy and registered students.
            </p>
          </div>

          <button
            className="admin-refresh"
            onClick={loadStudents}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        {/* ASSIGNMENT MANAGEMENT NAVIGATION */}

        <div className="admin-navigation">
          <button
            type="button"
            onClick={() => navigate("/assignments")}
          >
            <GraduationCap size={20} />
            Assignment Management →
          </button>

          <button
            type="button"
            onClick={() => navigate("/admin-submissions")}
          >
            <Users size={20} />
            Assignment Submissions →
          </button>

          <button
            type="button"
            onClick={handleTestAiMarking}
            disabled={testingAi}
          >
            <Sparkles size={20} />
            {testingAi ? "Testing AI..." : "Test AI Marking"}
          </button>
        </div>

        {/* STUDENT RESULTS PORTAL */}

        <section className="admin-details-card">
          <h2>
            <Award size={21} />
            Student Results Portal
          </h2>

          <p>
            Share this universal link with students so they
            can securely check all their published assignment
            results.
          </p>

          <div className="results-link-actions">
            <input
              type="text"
              value={resultLink}
              readOnly
              onClick={(event) => event.target.select()}
              aria-label="Universal student results link"
            />

            <button
              type="button"
              onClick={handleCopyResultLink}
            >
              <Copy size={17} />
              Copy Student Result Link
            </button>

            <button
              type="button"
              onClick={() => navigate("/check-results")}
            >
              <ExternalLink size={17} />
              Preview Results
            </button>
          </div>

          {notice && (
            <p className="results-link-notice" role="status">
              {notice}
            </p>
          )}

          <p className="results-link-description">
            Students must enter their own Student Code and
            PIN. They can only see their own published results.
          </p>
        </section>

        {/* ERROR MESSAGE */}

        {error && (
          <div className="admin-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {/* STUDENT STATISTICS */}

        <section className="admin-stats">

          <div className="admin-stat-card">
            <div className="admin-stat-icon blue">
              <Users size={22} />
            </div>

            <span>Total Students</span>
            <h2>{totalStudents}</h2>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon green">
              <UserCheck size={22} />
            </div>

            <span>Active Students</span>
            <h2>{activeStudents}</h2>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon red">
              <UserX size={22} />
            </div>

            <span>Inactive Students</span>
            <h2>{inactiveStudents}</h2>
          </div>

        </section>

        {/* REGISTERED STUDENTS */}

        <section className="admin-students-section">

          <div className="admin-section-heading">
            <div>
              <h2>Registered Students</h2>
              <p>View and manage academy registrations.</p>
            </div>

            <span className="admin-count">
              {filteredStudents.length} Students
            </span>
          </div>

          {/* SEARCH AND FILTER */}

          <div className="admin-filters">

            <div className="admin-search">
              <Search size={18} />

              <input
                type="text"
                placeholder="Search name or student code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="all">All Classes / Groups</option>

              {classes.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>

          </div>

          {/* STUDENT TABLE */}

          {loading ? (
            <div className="admin-empty">
              Loading students...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="admin-empty">
              <GraduationCap size={35} />

              <h3>No students found</h3>

              <p>Registered students will appear here.</p>
            </div>
          ) : (
            <div className="admin-table-wrapper">

              <table className="admin-table">

                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Student Code</th>
                    <th>Class / Group</th>
                    <th>Email</th>
                    <th>Registered</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>

                      <td>
                        <strong>{student.full_name}</strong>
                      </td>

                      <td>
                        <span className="student-code">
                          {student.student_code}
                        </span>
                      </td>

                      <td>{student.class_group || "—"}</td>

                      <td>{student.email || "—"}</td>

                      <td>
                        {student.registered_at
                          ? new Date(
                              student.registered_at
                            ).toLocaleDateString()
                          : "—"}
                      </td>

                      <td>
                        <span
                          className={`student-status ${student.registration_status}`}
                        >
                          {student.registration_status}
                        </span>
                      </td>

                      <td>
                        <div className="student-actions">

                          <button
                            className="student-action-btn"
                            onClick={() =>
                              toggleStudentStatus(student)
                            }
                          >
                            {student.registration_status === "active"
                              ? "Deactivate"
                              : "Activate"}
                          </button>

                          <button
                            className="student-edit-btn"
                            onClick={() => {
                              setEditingStudent(student);
                              setNewStudentName(student.full_name);
                            }}
                          >
                            Edit Name
                          </button>

                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>

              </table>

            </div>
          )}

          {/* EDIT STUDENT MODAL */}

          {editingStudent && (
            <div className="student-edit-modal">

              <div className="student-edit-card">

                <h2>Edit Student Name</h2>

                <p>
                  Update the name of {editingStudent.full_name}.
                </p>

                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) =>
                    setNewStudentName(e.target.value)
                  }
                  placeholder="Enter new student name"
                />

                <div className="student-edit-actions">

                  <button
                    onClick={() => {
                      setEditingStudent(null);
                      setNewStudentName("");
                    }}
                    disabled={savingName}
                  >
                    Cancel
                  </button>

                  <button
                    onClick={saveStudentName}
                    disabled={savingName}
                  >
                    {savingName ? "Saving..." : "Save Changes"}
                  </button>

                </div>

              </div>
            </div>
          )}

        </section>
      </main>
    </div>
  );
}

export default Dashboard;
