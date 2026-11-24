import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import "./Auth.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    // Client-side validation
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("http://localhost:8080/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password: password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrorMessage(data.message || "Invalid email or password. Please check your credentials.");
        return;
      }

      setSuccessMessage("Login successful! Redirecting to interview...");

      // Save logged-in user info in localStorage
      localStorage.setItem("user", JSON.stringify(data));

      // Smooth transition to setup
      setTimeout(() => {
        navigate("/setup");
      }, 600);

    } catch (error) {
      console.error("Login request error:", error);
      setErrorMessage("Unable to connect to the authentication server. Please ensure the backend is running on port 8080.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("Password reset is managed by the administrator. Contact support or register a new account.");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* LOGO & HEADING */}
        <div className="auth-header">
          <div className="auth-logo">✦</div>
          <h1>Welcome Back</h1>
          <p className="auth-subtitle">
            Sign in to continue your AI-powered interview practice.
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

        {/* LOGIN FORM */}
        <form onSubmit={handleLogin} className="auth-form" noValidate>
          {/* EMAIL INPUT */}
          <div className="form-group">
            <label htmlFor="login-email">Email Address</label>
            <div className="input-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                id="login-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
          </div>

          {/* PASSWORD INPUT */}
          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                required
                autoComplete="current-password"
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

          {/* PRIMARY FULL-WIDTH LOGIN BUTTON DIRECTLY BELOW PASSWORD FIELD */}
          <button
            type="submit"
            className="auth-button"
            disabled={loading}
          >
            {loading ? (
              <span className="button-loading-content">
                <span className="button-spinner"></span>
                <span>Signing In...</span>
              </span>
            ) : (
              <span className="button-label-content">
                <span>Login</span>
                <ArrowRight size={17} />
              </span>
            )}
          </button>
        </form>

        {/* FOOTER: FORGOT PASSWORD, CREATE ACCOUNT & BACK HOME */}
        <div className="auth-footer">
          <a
            href="#forgot-password"
            className="forgot-link"
            onClick={handleForgotPassword}
          >
            Forgot password?
          </a>

          <div className="auth-divider"></div>

          <p className="auth-switch">
            Don't have an account?{" "}
            <Link to="/register" className="auth-link">
              Create Account
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

export default Login;