import { BrowserRouter, Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import AdminLogin from "./pages/AdminLogin";
import Dashboard from "./pages/Dashboard";
import StudentRegistration from "./pages/StudentRegistration";
import StudentPortal from "./pages/StudentPortal";
import StudentAssignments from "./pages/StudentAssignments";
import StudentResults from "./pages/StudentResults";
import ProtectedRoute from "./ProtectedRoute";
import Assignments from "./pages/Assignments";
import StudentAssignment from "./pages/StudentAssignment";
import AdminSubmissions from "./pages/AdminSubmissions";
import AdminSubmissionDetails from "./pages/AdminSubmissionDetails";
import CheckAssignmentResult from "./pages/CheckAssignmentResult";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route path="/admin-login" element={<AdminLogin />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/assignments"
          element={
            <ProtectedRoute>
              <Assignments />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin-submissions"
          element={
            <ProtectedRoute>
              <AdminSubmissions />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin-submission/:id"
          element={
            <ProtectedRoute>
              <AdminSubmissionDetails />
            </ProtectedRoute>
          }
        />

        <Route path="/register" element={<StudentRegistration />} />
        <Route path="/student" element={<StudentPortal />} />
        <Route path="/student-assignments" element={<StudentAssignments />} />
        <Route path="/student-results" element={<StudentResults />} />

        <Route
          path="/student-assignment/:id"
          element={<StudentAssignment />}
        />

        <Route
          path="/check-results"
          element={<CheckAssignmentResult />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;