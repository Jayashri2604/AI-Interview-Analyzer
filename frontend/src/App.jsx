
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import "./App.css";
import InterviewSetup from "./InterviewSetup";
import Interview from "./Interview";
import Results from "./Results";
import Login from "./Login";
import Register from "./Register";
import Terminated from "./Terminated";
import History from "./History";
import Profile from "./Profile";

/* =====================================================
   NAVBAR
===================================================== */

function Navbar({ darkMode, setDarkMode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem("user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const syncUser = () => {
      try {
        const u = localStorage.getItem("user");
        setUser(u ? JSON.parse(u) : null);
      } catch {
        setUser(null);
      }
    };
    syncUser();
    window.addEventListener("user-updated", syncUser);
    window.addEventListener("storage", syncUser);
    return () => {
      window.removeEventListener("user-updated", syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  const isHome = location.pathname === "/";

  return (
    <nav className="navbar">

      {/* LOGO */}
      <Link to="/" className="logo">

        <div className="logo-icon">
          ✦
        </div>

        <div className="logo-text">
          <span>Interview</span>
          <strong>Analyzer</strong>
        </div>

        <span className="nav-ai-badge">
          AI
        </span>

      </Link>


      {/* NAVIGATION */}
      <div className="nav-links">

        <Link
          to="/"
          className={isHome ? "nav-link active" : "nav-link"}
        >
          <span>⌂</span>
          Home
        </Link>

        <a href="/#how-it-works" className="nav-link">
          <span>◈</span>
          How It Works
        </a>

        <a href="/#features" className="nav-link">
          <span>✦</span>
          Features
        </a>

        <a href="/#about" className="nav-link">
          <span>ⓘ</span>
          About
        </a>

        <Link
          to="/profile"
          className={location.pathname === "/profile" ? "nav-link active" : "nav-link"}
          title="View your profile and previous interview records"
        >
          <span>👤</span>
          Profile
        </Link>

      </div>


      {/* RIGHT SIDE */}
      <div className="nav-right">

        {/* AI STATUS */}
        <div className="ai-status">

          <span className="status-dot"></span>

          AI Online

        </div>


        {/* THEME TOGGLE */}
        <button
          className="theme-toggle"
          onClick={() => setDarkMode((prev) => !prev)}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          title={darkMode ? "Dark Mode (click for Light Mode)" : "Light Mode (click for Dark Mode)"}
        >
          {darkMode ? "🌙" : "☀️"}
        </button>


        {/* USER AUTH AREA: PROFILE & LOGOUT OR LOGIN */}
        {user ? (
          <div className="nav-auth-group">
            <Link
              to="/profile"
              className={location.pathname === "/profile" ? "nav-profile-btn active" : "nav-profile-btn"}
              title="Go to My Profile & Previous Interview Records"
            >
              <div className="nav-profile-avatar-thumb">
                <img
                  src={user.avatar || localStorage.getItem(`user_avatar_${user.email}`) || "/default-avatar.svg"}
                  alt={user.name || "Candidate"}
                  onError={(e) => { e.currentTarget.src = "/default-avatar.svg"; }}
                />
              </div>
              <span className="nav-profile-name">
                {user.name ? user.name.split(" ")[0] : "Profile"}
              </span>
            </Link>

            <button
              type="button"
              className="nav-logout-btn"
              onClick={handleLogout}
              title="Logout from your account"
            >
              Logout
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className={location.pathname === "/login" ? "nav-login-btn active" : "nav-login-btn"}
          >
            Login
          </Link>
        )}


        {/* START BUTTON */}
        <Link to="/setup" className="nav-btn">

          <span>
            🎙
          </span>

          Start Interview

          <b>
            →
          </b>

        </Link>

      </div>

    </nav>
  );
}


/* =====================================================
   HOME PAGE
===================================================== */

function Home() {

  return (
    <div className="app">

      {/* HERO */}
      <main className="hero">

        <div className="glow glow-one"></div>
        <div className="glow glow-two"></div>


        {/* HERO CONTENT */}
        <div className="hero-content">

          <div className="ai-badge">

            <span className="pulse-dot"></span>

            AI-POWERED INTERVIEW COACH

          </div>


          <h1>

            Your Interview.

            <br />

            <span>
              Smarter with AI.
            </span>

          </h1>


          <p className="description">

            Practice real-world interviews and get intelligent
            feedback on your confidence, eye contact, speech
            and answers — all powered by artificial intelligence.

          </p>


           {/* BUTTONS */}
<div className="hero-buttons">

  <Link to="/setup" className="start-btn">

    <span>
      🎤
    </span>

    Start AI Interview

    <b>
      →
    </b>

  </Link>


  <Link
    to="/register"
    className="register-home-btn"
  >
    Create Account
  </Link>


  <a
    href="#how-it-works"
    className="learn-btn"
  >

    <span>
      ▶
    </span>

    See how it works

  </a>

</div>

          {/* TRUST */}
          <div className="trust-section">

            <div className="trust-avatars">

              <div>👩🏻</div>
              <div>👨🏻</div>
              <div>👩🏽</div>
              <div>👨🏽</div>
              <span>+</span>

            </div>


            <div className="trust-text">

              <div className="stars">
                ★★★★★
              </div>

              <p>
                Built for confident interview preparation
              </p>

            </div>

          </div>

        </div>


        {/* DASHBOARD CARD - PROJECT SHOWCASE */}
        <div className="hero-visual">

          <div className="floating-badge badge-top">
            <span className="green-dot"></span>
            AI Analysis Active
          </div>

          <div className="dashboard-card hero-image-card">

            <div className="card-top">
              <div>
                <small>LIVE ANALYSIS</small>
                <h3>Interview Performance</h3>
              </div>
              <span className="sparkle">✨</span>
            </div>

            {/* REAL-TIME AI INTERVIEW SESSION VISUAL */}
            <div className="card-image-container">
              <img
                src="/hero-interview.jpg"
                alt="AI Interview Analyzer Live Session"
                className="card-feature-img"
              />
              <div className="card-img-badge-top">
                <span className="card-status-pill proctor">
                  🛡️ Proctoring Active
                </span>
                <span className="card-status-pill live">
                  <span className="pulse-rec"></span> LIVE
                </span>
              </div>
              <div className="card-img-badge-bottom">
                <span className="card-audio-pill">
                  🎙️ Faster-Whisper Acoustic Detection
                </span>
              </div>
            </div>

            <div className="card-features-grid">
              <div className="feature-chip">
                <span>🛡️</span> Smart Camera Proctoring
              </div>
              <div className="feature-chip">
                <span>⚡</span> Strict & Helpful AI Mentorship
              </div>
            </div>

          </div>

          <div className="floating-badge badge-bottom">
            <span>⚡</span>
            Real-time AI Feedback
          </div>

        </div>

      </main>


      {/* STATS */}
      <section className="stats">

        <Stat number="4+" text="AI Metrics" />

        <Stat number="Real-time" text="Analysis" />

        <Stat number="AI" text="Powered Feedback" />

        <Stat number="100%" text="Personalized" />

      </section>


      {/* FEATURES */}
      <section
        className="features"
        id="features"
      >

        <div className="section-heading">

          <span>
            POWERFUL AI FEATURES
          </span>

          <h2>

            Everything you need to

            <br />

            <em>
              ace your interview.
            </em>

          </h2>

          <p>
            Get deeper insights into your interview performance
            and improve with every practice session.
          </p>

        </div>


        <div className="feature-grid">

          <Feature
            icon="👁"
            title="Eye Contact"
            text="AI analyzes your eye contact and helps you appear more confident and engaged."
            type="purple"
          />

          <Feature
            icon="🎙"
            title="Speech Analysis"
            text="Understand your speaking speed, pauses, filler words and clarity."
            type="blue"
          />

          <Feature
            icon="🧠"
            title="Answer Analysis"
            text="AI evaluates answer relevance, completeness and quality."
            type="pink"
          />

          <Feature
            icon="📊"
            title="Performance Report"
            text="Receive a complete performance report with personalized improvement tips."
            type="orange"
          />

        </div>

      </section>


      {/* HOW IT WORKS */}
      <section
        className="how-section"
        id="how-it-works"
      >

        <div className="section-heading">

          <span>
            SIMPLE PROCESS
          </span>

          <h2>

            Interview practice,

            <br />

            <em>
              reimagined.
            </em>

          </h2>

        </div>


        <div className="steps">

          <Step
            number="01"
            icon="⚙️"
            title="Choose Interview"
            text="Select your role, interview type and difficulty level."
          />

          <div className="step-line"></div>

          <Step
            number="02"
            icon="🎤"
            title="Start Interview"
            text="Answer AI-generated questions using your camera and microphone."
          />

          <div className="step-line"></div>

          <Step
            number="03"
            icon="📈"
            title="Get AI Insights"
            text="Receive scores, insights and personalized improvement feedback."
          />

        </div>

      </section>


      {/* CTA */}
      <section
        className="final-cta"
        id="about"
      >

        <div className="cta-glow"></div>

        <span className="cta-badge">
          🚀 READY TO IMPROVE?
        </span>

        <h2>

          Turn interview anxiety

          <br />

          into <span>confidence.</span>

        </h2>

        <p>
          Practice smarter. Understand your weaknesses.
          Become interview-ready.
        </p>

        <Link
          to="/setup"
          className="cta-button"
        >

          Start Your AI Interview

          <span>
            →
          </span>

        </Link>

      </section>


      {/* FOOTER */}
      <footer>

        <div className="footer-logo">

          <div className="logo-icon">
            ✦
          </div>

          <div>

            <strong>
              Interview Analyzer
            </strong>

            <span>
              AI-powered interview practice
            </span>

          </div>

        </div>


        <p>
          © 2026 AI Interview Analyzer. Built with AI.
        </p>

      </footer>

    </div>
  );
}


/* =====================================================
   SMALL COMPONENTS
===================================================== */

function Metric({ icon, title, value, width }) {

  return (
    <div className="metric">

      <div className="metric-top">

        <span>
          {icon} {title}
        </span>

        <strong>
          {value}
        </strong>

      </div>

      <div className="progress">

        <div style={{ width }}></div>

      </div>

    </div>
  );
}


function Stat({ number, text }) {

  return (
    <div className="stat">

      <strong>
        {number}
      </strong>

      <span>
        {text}
      </span>

    </div>
  );
}


function Feature({ icon, title, text, type }) {

  return (
    <div className="feature">

      <div className={`feature-icon ${type}`}>
        {icon}
      </div>

      <h3>
        {title}
      </h3>

      <p>
        {text}
      </p>

      <span className="feature-arrow">
        →
      </span>

    </div>
  );
}


function Step({ number, icon, title, text }) {

  return (
    <div className="step">

      <div className="step-number">
        {number}
      </div>

      <div className="step-icon">
        {icon}
      </div>

      <h3>
        {title}
      </h3>

      <p>
        {text}
      </p>

    </div>
  );
}


/* =====================================================
   APP
===================================================== */

function App() {

  const [darkMode, setDarkMode] = useState(() => {

    const saved = localStorage.getItem("ai-interview-theme");

    return saved === "dark";

  });


  useEffect(() => {
    document.body.classList.toggle("dark-theme", darkMode);
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem(
      "ai-interview-theme",
      darkMode ? "dark" : "light"
    );
  }, [darkMode]);


  return (

    <BrowserRouter>

      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      <Routes>

        {/* HOME */}
        <Route
          path="/"
          element={<Home />}
        />

        {/* AUTHENTICATION */}
        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />

        {/* INTERVIEW */}
        <Route
          path="/setup"
          element={<InterviewSetup />}
        />

        <Route
          path="/interview"
          element={<Interview />}
        />

        <Route
          path="/results"
          element={<Results />}
        />

        <Route
          path="/history"
          element={<Profile />}
        />

        <Route
          path="/profile"
          element={<Profile />}
        />

        <Route
          path="/terminated"
          element={<Terminated />}
        />

      </Routes>

    </BrowserRouter>

  );
}

export default App;

