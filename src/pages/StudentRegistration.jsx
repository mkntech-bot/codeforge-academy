
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  Code,
  User,
  Users,
  Mail,
  ArrowLeft,
  Copy,
  CheckCircle,
  LockKeyhole,
} from "lucide-react";

function StudentRegistration() {
  const [form, setForm] = useState({
    full_name: "",
    class_group: "",
    email: "",
    pin: "",
    confirmPin: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [copied, setCopied] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");
    setStudentCode("");

    try {
      if (!/^\d{8}$/.test(form.pin)) {
        throw new Error("Your Student PIN must contain exactly 8 digits.");
      }

      if (form.pin !== form.confirmPin) {
        throw new Error("Your PINs do not match.");
      }

      const { data, error } = await supabase.functions.invoke(
        "student-register",
        {
          body: {
            full_name: form.full_name,
            class_group: form.class_group,
            email: form.email,
            pin: form.pin,
          },
        }
      );

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "Registration failed.");
      }

      setStudentCode(data.student_code);
    } catch (err) {
      console.error("Registration error:", err);
      setError(
        err.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(studentCode);
      setCopied(true);
    } catch {
      setError("Unable to copy your code. Please write it down.");
    }
  };

  if (studentCode) {
    return (
      <div className="registration-page">
        <div className="registration-card success-card">
          <div className="success-icon">
            <CheckCircle size={38} />
          </div>

          <h1>Registration Successful!</h1>

          <p>
            Welcome to CodeForge Academy. Your registration is complete.
          </p>

          <div className="student-code-box">
            <span>Your Student Identification Code</span>
            <h2>{studentCode}</h2>

            <button onClick={copyCode} className="copy-code-btn">
              {copied ? (
                <CheckCircle size={18} />
              ) : (
                <Copy size={18} />
              )}
              {copied ? "Copied!" : "Copy Code"}
            </button>
          </div>

          <p className="code-warning">
            Keep your student code and PIN safe. You'll need both
            to access assignments. Your student code will also
            be used to check your results.
          </p>

          <Link to="/" className="registration-back">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="registration-page">
      <div className="registration-card">

        <Link to="/" className="registration-back">
          <ArrowLeft size={17} />
          Back to Home
        </Link>

        <div className="registration-heading">
          <div className="registration-logo">
            <Code size={28} />
          </div>

          <h1>Join CodeForge Academy</h1>

          <p>
            Register today and begin your coding journey.
          </p>
        </div>

        <form onSubmit={handleRegister}>

          <label>Full Name</label>
          <div className="registration-input">
            <User size={19} />
            <input
              type="text"
              name="full_name"
              placeholder="Enter your full name"
              value={form.full_name}
              onChange={handleChange}
              maxLength={100}
              required
            />
          </div>

          <label>Class / Group</label>
          <div className="registration-input">
            <Users size={19} />
            <input
              type="text"
              name="class_group"
              placeholder="e.g. SC-1C"
              value={form.class_group}
              onChange={handleChange}
              maxLength={50}
              required
            />
          </div>

          <label>Email Address <span>(Optional)</span></label>
          <div className="registration-input">
            <Mail size={19} />
            <input
              type="email"
              name="email"
              placeholder="Enter your email address"
              value={form.email}
              onChange={handleChange}
            />
          </div>

          <label>Create Student PIN (8 digits)</label>
          <div className="registration-input">
            <LockKeyhole size={19} />
            <input
              type="password"
              name="pin"
              placeholder="Create an 8-digit PIN"
              value={form.pin}
              onChange={handleChange}
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              autoComplete="new-password"
              required
            />
          </div>

          <label>Confirm Student PIN</label>
          <div className="registration-input">
            <LockKeyhole size={19} />
            <input
              type="password"
              name="confirmPin"
              placeholder="Enter your PIN again"
              value={form.confirmPin}
              onChange={handleChange}
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              autoComplete="new-password"
              required
            />
          </div>

          <p className="registration-footer">
            Keep your PIN private. Do not share it with anyone.
          </p>

          {error && (
            <div className="registration-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="registration-submit"
            disabled={loading}
          >
            {loading ? "Registering..." : "Complete Registration"}
          </button>

        </form>

        <p className="registration-footer">
          Learn. Code. Build.
        </p>
      </div>
    </div>
  );
}

export default StudentRegistration;
