import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import "./Auth.css";

function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    // Validation
    if (!trimmedName) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (trimmedName.length < 2) {
      setErrorMessage("Full name must be at least 2 characters long.");
      return;
    }

    if (!trimmedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address (e.g. candidate@example.com).");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter a password.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter your password confirmation.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("http://localhost:8080/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password: password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 400 && data.message?.toLowerCase().includes("email already registered")) {
          setErrorMessage("This email address is already registered. Please login or use a different email.");
        } else {
          setErrorMessage(data.message || "Failed to create account. Please check your details and try again.");
        }
        return;
      }

      setSuccessMessage("Account created successfully! Redirecting to login...");

      // Automatically navigate to login after showing success feedback
      setTimeout(() => {
        navigate("/login");
      }, 1200);

    } catch (error) {
      console.error("Registration request error:", error);
      setErrorMessage("Unable to connect to the authentication server. Please ensure the backend is running on port 8080.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* LOGO & HEADING */}
        <div className="auth-header">
          <div className="auth-logo">✦</div>
          <h1>Create Account</h1>
          <p className="auth-subtitle">
            Join AI Interview Analyzer to start practicing with realistic AI evaluations.
          </p>
        </div>

        {/* FEEDBACK BANNERS */}
        {errorMessage && (
          <div className="auth-message error">
            <AlertCircle size={16} className="message-icon" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="auth-message success">
            <CheckCircle2 size={16} className="message-icon" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* REGISTRATION FORM */}
        <form onSubmit={handleRegister} className="auth-form" noValidate>
          {/* FULL NAME */}
          <div className="form-group">
            <label htmlFor="register-name">Full Name</label>
            <div className="input-wrapper">
              <User size={18} className="input-icon" />
              <input
                id="register-name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                required
                autoComplete="name"
                autoFocus
              />
            </div>
          </div>

          {/* EMAIL ADDRESS */}
          <div className="form-group">
            <label htmlFor="register-email">Email Address</label>
            <div className="input-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                id="register-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                required
                autoComplete="email"
              />
            </div>
          </div>

          {/* PASSWORD */}
          <div className="form-group">
            <label htmlFor="register-password">Password</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="register-password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* CONFIRM PASSWORD */}
          <div className="form-group">
            <label htmlFor="register-confirm-password">Confirm Password</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="register-confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* CREATE ACCOUNT BUTTON */}
          <button
            type="submit"
            className="auth-button"
            disabled={loading}
          >
            {loading ? (
              <span className="button-loading-content">
                <span className="button-spinner"></span>
                <span>Creating Account...</span>
              </span>
            ) : (
              <span className="button-label-content">
                <span>Create Account</span>
                <ArrowRight size={17} />
              </span>
            )}
          </button>
        </form>

        {/* FOOTER SWITCH & BACK HOME */}
        <div className="auth-footer">
          <p className="auth-switch">
            Already have an account?{" "}
            <Link to="/login" className="auth-link">
              Login
            </Link>
          </p>

          <Link to="/" className="back-home">
            <ArrowLeft size={14} />
            <span>Back to Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Register;
