
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ShieldCheck, Lock, Mail, AlertCircle } from "lucide-react";

function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      // Authenticate the admin
      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError) {
        throw new Error("Invalid email or password.");
      }

      // Verify admin privileges
      const { data: isAdmin, error: adminError } =
        await supabase.rpc("is_admin");

      if (adminError) {
        await supabase.auth.signOut();
        throw new Error("Could not verify administrator access.");
      }

      if (!isAdmin) {
        await supabase.auth.signOut();
        throw new Error("Access denied. Admin privileges are required.");
      }

      // Admin verified
      navigate("/dashboard", { replace: true });

    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">

        <div className="admin-login-icon">
          <ShieldCheck size={30} />
        </div>

        <h1>Admin Login</h1>

        <p className="admin-login-description">
          Sign in to access the CodeForge Academy administration panel.
        </p>

        {error && (
          <div className="admin-login-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>

          <label>Email Address</label>

          <div className="admin-login-input">
            <Mail size={18} />
            <input
              type="email"
              placeholder="Enter your admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <label>Password</label>

          <div className="admin-login-input">
            <Lock size={18} />
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="admin-login-button"
            disabled={loading}
          >
            {loading ? "Verifying..." : "Sign In to Dashboard"}
          </button>

        </form>

        <Link to="/" className="admin-login-back">
          ← Back to homepage
        </Link>

        <div className="admin-login-footer">
          Protected Administrator Access
        </div>

      </div>
    </div>
  );
}

export default AdminLogin;
