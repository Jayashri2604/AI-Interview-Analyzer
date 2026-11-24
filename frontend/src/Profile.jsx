import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  User,
  Mail,
  Shield,
  Award,
  Calendar,
  Clock,
  ArrowRight,
  ChevronRight,
  RotateCcw,
  FileText,
  Sparkles,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
  Target,
  Search,
  Filter,
  Trash2,
  Edit3,
  Lock,
  LogOut,
  Sliders,
  Check,
  Briefcase,
  Camera,
  Upload,
  Image as ImageIcon
} from "lucide-react";
import "./Profile.css";

function Profile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab: "records" (default), "competencies", "settings"
  const initialTab = searchParams.get("tab") || "records";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync tab with URL
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const u = localStorage.getItem("user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Settings / Edit Profile State
  const [editName, setEditName] = useState(currentUser?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("");
  const [profileErrorMsg, setProfileErrorMsg] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const avatarInputRef = useRef(null);

  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileErrorMsg("Please select a valid image file (PNG, JPG, JPEG, WEBP).");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setProfileErrorMsg("Image size exceeds 8MB. Please choose a smaller image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = Math.min(img.width, img.height);
        const startX = (img.width - size) / 2;
        const startY = (img.height - size) / 2;
        canvas.width = 300;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, startX, startY, size, size, 0, 0, 300, 300);
        const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.88);

        saveNewAvatar(optimizedDataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const saveNewAvatar = (avatarUrl) => {
    const updated = { ...currentUser, avatar: avatarUrl };
    setCurrentUser(updated);
    localStorage.setItem("user", JSON.stringify(updated));
    if (currentUser?.email) {
      localStorage.setItem(`user_avatar_${currentUser.email}`, avatarUrl);
    }
    window.dispatchEvent(new Event("user-updated"));
    setProfileSuccessMsg("Profile photo updated successfully!");
    setTimeout(() => setProfileSuccessMsg(""), 4000);
  };

  // Fetch user profile and sessions
  useEffect(() => {
    if (!currentUser?.email) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);

      // 1. Fetch latest profile
      try {
        const profRes = await fetch(
          `http://localhost:8080/api/auth/profile?email=${encodeURIComponent(currentUser.email)}`
        );
        if (profRes.ok) {
          const profData = await profRes.json();
          if (profData?.name) {
            const merged = { ...currentUser, name: profData.name };
            setCurrentUser(merged);
            localStorage.setItem("user", JSON.stringify(merged));
            setEditName(profData.name);
          }
        }
      } catch (e) {
        console.warn("Could not fetch remote profile:", e);
      }

      // 2. Fetch sessions from Spring Boot & MySQL
      try {
        const histRes = await fetch(
          `http://localhost:8080/api/interview/history?email=${encodeURIComponent(currentUser.email)}`
        );
        if (histRes.ok) {
          const histData = await histRes.json();
          if (histData.success && Array.isArray(histData.history) && histData.history.length > 0) {
            setSessions(histData.history);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Could not fetch history from backend:", err);
      }

      // Fallback: check localStorage pastInterviewSessions and interviewResult
      try {
        const localPast = localStorage.getItem("pastInterviewSessions");
        if (localPast) {
          const parsed = JSON.parse(localPast);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSessions(parsed);
            setLoading(false);
            return;
          }
        }

        const localSingle = localStorage.getItem("interviewResult");
        if (localSingle) {
          const parsedSingle = JSON.parse(localSingle);
          setSessions([parsedSingle]);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn("Error parsing local fallback sessions:", e);
      }

      setSessions([]);
      setLoading(false);
    };

    loadData();
  }, [currentUser?.email]);

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem("user");
    setCurrentUser(null);
    navigate("/login");
  };

  // Delete an individual record
  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm("Are you sure you want to delete this interview record? This action cannot be undone.")) {
      return;
    }

    try {
      await fetch(`http://localhost:8080/api/interview/session/${sessionId}`, {
        method: "DELETE"
      });
    } catch (e) {
      console.warn("Backend delete request failed, proceeding to clean local state:", e);
    }

    // Clean state
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));

    // Clean localStorage pastInterviewSessions
    try {
      const localPast = JSON.parse(localStorage.getItem("pastInterviewSessions") || "[]");
      const filtered = localPast.filter((s) => s.sessionId !== sessionId);
      localStorage.setItem("pastInterviewSessions", JSON.stringify(filtered));

      const single = localStorage.getItem("interviewResult");
      if (single) {
        const parsed = JSON.parse(single);
        if (parsed.sessionId === sessionId) {
          localStorage.removeItem("interviewResult");
        }
      }
    } catch (e) {}
  };

  // Inspect detailed report
  const handleInspectReport = (session) => {
    try {
      if (session.resultJson) {
        localStorage.setItem("interviewResult", session.resultJson);
      } else {
        localStorage.setItem("interviewResult", JSON.stringify(session));
      }
      navigate("/results");
    } catch (e) {
      console.error("Unable to load session for results page:", e);
      navigate("/results");
    }
  };

  // Retake interview with same role/difficulty
  const handleRetake = (session) => {
    localStorage.setItem(
      "interviewConfig",
      JSON.stringify({
        role: session.role || "Software Developer",
        type: session.interviewType || session.type || "Mixed",
        difficulty: session.difficulty || "Intermediate"
      })
    );
    navigate("/interview");
  };

  // Save profile changes
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSuccessMsg("");
    setProfileErrorMsg("");

    if (!editName.trim()) {
      setProfileErrorMsg("Name cannot be empty.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const payload = {
        email: currentUser.email,
        name: editName.trim()
      };

      if (newPassword.trim()) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword.trim();
      }

      const res = await fetch("http://localhost:8080/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setProfileErrorMsg(data.message || "Failed to update profile.");
        setIsSavingProfile(false);
        return;
      }

      const updated = { ...currentUser, name: editName.trim() };
      setCurrentUser(updated);
      localStorage.setItem("user", JSON.stringify(updated));

      setCurrentPassword("");
      setNewPassword("");
      setProfileSuccessMsg("Profile updated successfully!");
    } catch (err) {
      setProfileErrorMsg("Could not connect to backend server.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Computed Aggregate Stats
  const totalInterviews = sessions.length;
  const averageOverallScore = totalInterviews > 0
    ? Math.round(sessions.reduce((acc, s) => acc + (Number(s.overallScore) || 0), 0) / totalInterviews)
    : 0;

  const highestScore = totalInterviews > 0
    ? Math.max(...sessions.map((s) => Number(s.overallScore) || 0))
    : 0;

  const avgTechnical = totalInterviews > 0
    ? Math.round(
        sessions.reduce(
          (acc, s) => acc + (Number(s.technicalScore || s.technicalAccuracyScore) || 0),
          0
        ) / totalInterviews
      )
    : 0;

  const avgRelevance = totalInterviews > 0
    ? Math.round(
        sessions.reduce((acc, s) => acc + (Number(s.relevanceScore) || 0), 0) / totalInterviews
      )
    : 0;

  const avgCommunication = totalInterviews > 0
    ? Math.round(
        sessions.reduce((acc, s) => acc + (Number(s.communicationScore) || 0), 0) / totalInterviews
      )
    : 0;

  // Readiness Tier
  const getReadinessLevel = () => {
    if (totalInterviews === 0) return { label: "New Candidate", badge: "badge-new", desc: "Complete practice interviews to build your profile rating." };
    if (averageOverallScore >= 80) return { label: "Interview Ready", badge: "badge-ready", desc: "Demonstrating high technical proficiency and clear communication." };
    if (averageOverallScore >= 60) return { label: "Competent Practitioner", badge: "badge-mid", desc: "Solid baseline knowledge with targeted areas for technical refinement." };
    return { label: "Foundational Learner", badge: "badge-dev", desc: "Building core skills. Consistent practice will rapidly increase your score." };
  };

  const readiness = getReadinessLevel();

  // Distinct roles for filter
  const distinctRoles = useMemo(() => {
    const set = new Set(sessions.map((s) => s.role).filter(Boolean));
    return ["ALL", ...Array.from(set)];
  }, [sessions]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesRole = roleFilter === "ALL" || s.role === roleFilter;
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        !term ||
        (s.role && s.role.toLowerCase().includes(term)) ||
        (s.difficulty && s.difficulty.toLowerCase().includes(term)) ||
        (s.performanceTitle && s.performanceTitle.toLowerCase().includes(term)) ||
        (s.completedAt && s.completedAt.toLowerCase().includes(term));
      return matchesRole && matchesSearch;
    });
  }, [sessions, roleFilter, searchTerm]);

  // User Initials
  const getInitials = (name) => {
    if (!name) return "CA";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // If candidate is not logged in
  if (!currentUser) {
    return (
      <div className="profile-page">
        <div className="profile-auth-prompt-card">
          <div className="auth-prompt-icon">
            <User size={38} />
          </div>
          <h2>Sign In to View Your Profile</h2>
          <p>
            Your profile, skill competencies, and previous interview records are safely saved
            in your account. Sign in to access your interview dashboard.
          </p>
          <div className="auth-prompt-actions">
            <Link to="/login" className="prompt-login-btn">
              <span>Sign In to Your Account</span>
              <ArrowRight size={17} />
            </Link>
            <Link to="/register" className="prompt-register-btn">
              Create New Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-glow profile-glow-one"></div>
      <div className="profile-glow profile-glow-two"></div>

      <div className="profile-container">

        {/* =====================================================
            TOP PROFILE HEADER CARD
        ===================================================== */}
        <section className="profile-hero-card">
          <div className="profile-hero-main">
            <div className="profile-avatar-wrapper">
              <div
                className="profile-avatar-circle"
                onClick={() => avatarInputRef.current?.click()}
                title="Click to upload or change profile photo"
              >
                <img
                  src={currentUser.avatar || localStorage.getItem(`user_avatar_${currentUser.email}`) || "/default-avatar.svg"}
                  alt={currentUser.name || "Candidate"}
                  className="profile-avatar-img"
                  onError={(e) => { e.currentTarget.src = "/default-avatar.svg"; }}
                />
                <div className="profile-avatar-upload-overlay">
                  <Camera size={18} />
                  <span>Change</span>
                </div>
              </div>
              <input
                type="file"
                ref={avatarInputRef}
                onChange={handleAvatarFileChange}
                accept="image/*"
                style={{ display: "none" }}
              />
              <span className="profile-avatar-badge" title="Active Candidate Account">
                ✓
              </span>
            </div>

            <div className="profile-hero-meta">
              <div className="profile-name-row">
                <h1>{currentUser.name || "Candidate"}</h1>
                <span className="profile-tier-chip">
                  <ShieldCheck size={14} />
                  Verified Candidate
                </span>
              </div>

              <div className="profile-sub-meta">
                <span className="profile-email-chip">
                  <Mail size={14} />
                  {currentUser.email}
                </span>

                <span className={`profile-readiness-chip ${readiness.badge}`}>
                  <Sparkles size={13} />
                  {readiness.label}
                </span>
              </div>

              <p className="profile-readiness-desc">
                {readiness.desc}
              </p>
            </div>
          </div>

          <div className="profile-hero-actions">
            <Link to="/setup" className="profile-start-interview-btn">
              <Zap size={16} />
              <span>Start Practice Interview</span>
            </Link>

            <button
              type="button"
              className="profile-logout-btn"
              onClick={handleLogout}
              title="Logout from this account"
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>
        </section>

        {/* =====================================================
            OVERVIEW STATS STRIP
        ===================================================== */}
        <section className="profile-stats-grid">
          <div className="profile-stat-box">
            <div className="stat-box-icon icon-blue">
              <BarChart3 size={20} />
            </div>
            <div>
              <span className="stat-box-label">TOTAL INTERVIEWS</span>
              <strong className="stat-box-val">{totalInterviews}</strong>
              <small className="stat-box-sub">Recorded sessions</small>
            </div>
          </div>

          <div className="profile-stat-box">
            <div className="stat-box-icon icon-emerald">
              <Award size={20} />
            </div>
            <div>
              <span className="stat-box-label">AVERAGE SCORE</span>
              <strong className="stat-box-val">{averageOverallScore}%</strong>
              <small className="stat-box-sub">Across all tracks</small>
            </div>
          </div>

          <div className="profile-stat-box">
            <div className="stat-box-icon icon-purple">
              <TrendingUp size={20} />
            </div>
            <div>
              <span className="stat-box-label">BEST PERFORMANCE</span>
              <strong className="stat-box-val">{highestScore}%</strong>
              <small className="stat-box-sub">Highest session mark</small>
            </div>
          </div>

          <div className="profile-stat-box">
            <div className="stat-box-icon icon-cyan">
              <Target size={20} />
            </div>
            <div>
              <span className="stat-box-label">TECHNICAL PROFICIENCY</span>
              <strong className="stat-box-val">{avgTechnical}%</strong>
              <small className="stat-box-sub">Accuracy average</small>
            </div>
          </div>
        </section>

        {/* =====================================================
            NAV TABS (Records / Competencies / Settings)
        ===================================================== */}
        <nav className="profile-tabs-nav">
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === "records" ? "active" : ""}`}
            onClick={() => handleTabChange("records")}
          >
            <FileText size={17} />
            <span>Previous Interview Records</span>
            {totalInterviews > 0 && <span className="tab-count-chip">{totalInterviews}</span>}
          </button>

          <button
            type="button"
            className={`profile-tab-btn ${activeTab === "competencies" ? "active" : ""}`}
            onClick={() => handleTabChange("competencies")}
          >
            <TrendingUp size={17} />
            <span>Skill & Performance Metrics</span>
          </button>

          <button
            type="button"
            className={`profile-tab-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => handleTabChange("settings")}
          >
            <Sliders size={17} />
            <span>Profile & Account Settings</span>
          </button>
        </nav>

        {/* =====================================================
            TAB 1: PREVIOUS INTERVIEW RECORDS
        ===================================================== */}
        {activeTab === "records" && (
          <div className="records-tab-container">
            {/* SEARCH AND FILTERS */}
            <div className="records-filter-toolbar">
              <div className="records-search-box">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search previous interviews by role, difficulty, or date..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setSearchTerm("")}
                  >
                    ×
                  </button>
                )}
              </div>

              {distinctRoles.length > 2 && (
                <div className="records-role-filter">
                  <Filter size={15} />
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    aria-label="Filter records by target role"
                  >
                    {distinctRoles.map((r) => (
                      <option key={r} value={r}>
                        {r === "ALL" ? "All Tracks" : r}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* LOADING STATE */}
            {loading && (
              <div className="records-loading-card">
                <div className="records-spinner"></div>
                <p>Loading your interview records...</p>
              </div>
            )}

            {/* EMPTY STATE */}
            {!loading && filteredSessions.length === 0 && (
              <div className="records-empty-card">
                <div className="empty-icon-wrap">
                  <FileText size={36} />
                </div>
                <h3>No Interview Records Found</h3>
                <p>
                  {searchTerm || roleFilter !== "ALL"
                    ? "No interview sessions matched your search filters. Try clearing filters."
                    : "You haven't completed any interview sessions yet. Start your first AI mock interview to generate honest technical feedback and scores."}
                </p>
                <Link to="/setup" className="empty-start-btn">
                  <Zap size={16} />
                  <span>Take Your First AI Interview</span>
                </Link>
              </div>
            )}

            {/* RECORDS LIST */}
            {!loading && filteredSessions.length > 0 && (
              <div className="records-grid">
                {filteredSessions.map((session, idx) => {
                  const score = Number(session.overallScore) || 0;
                  const scoreClass =
                    score >= 80 ? "score-high" : score >= 60 ? "score-medium" : "score-low";

                  const technical =
                    Number(session.technicalScore || session.technicalAccuracyScore) || 0;
                  const relevance = Number(session.relevanceScore) || 0;
                  const communication = Number(session.communicationScore) || 0;

                  const dateFormatted = session.completedAt
                    ? new Date(session.completedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                      })
                    : "Recent";

                  const timeFormatted = session.completedAt
                    ? new Date(session.completedAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    : "";

                  return (
                    <article key={session.sessionId || idx} className="record-card">
                      <div className="record-card-header">
                        <div className="record-role-info">
                          <span className="record-track-badge">
                            <Briefcase size={13} />
                            {session.role || "Software Developer"}
                          </span>
                          <span className="record-difficulty-badge">
                            {session.difficulty || "Intermediate"}
                          </span>
                        </div>

                        <div className={`record-score-badge ${scoreClass}`}>
                          <strong>{score}</strong>
                          <span>/ 100</span>
                        </div>
                      </div>

                      <div className="record-meta-row">
                        <span className="record-meta-item">
                          <Calendar size={13} />
                          {dateFormatted} {timeFormatted && `• ${timeFormatted}`}
                        </span>

                        <span className="record-meta-item">
                          <CheckCircle2 size={13} />
                          {session.completedQuestions || session.totalQuestions || 3} of{" "}
                          {session.totalQuestions || 3} Questions
                        </span>
                      </div>

                      {/* SUB-METRICS BAR */}
                      <div className="record-subscores-strip">
                        <div className="subscore-cell">
                          <small>TECHNICAL</small>
                          <strong>{technical}%</strong>
                          <div className="subscore-bar">
                            <div
                              className="subscore-bar-fill fill-blue"
                              style={{ width: `${technical}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="subscore-cell">
                          <small>RELEVANCE</small>
                          <strong>{relevance}%</strong>
                          <div className="subscore-bar">
                            <div
                              className="subscore-bar-fill fill-emerald"
                              style={{ width: `${relevance}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="subscore-cell">
                          <small>COMMUNICATION</small>
                          <strong>{communication}%</strong>
                          <div className="subscore-bar">
                            <div
                              className="subscore-bar-fill fill-purple"
                              style={{ width: `${communication}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* EXECUTIVE SUMMARY EXCERPT */}
                      {session.executiveSummary && (
                        <p className="record-summary-snippet">
                          "{session.executiveSummary.slice(0, 140)}
                          {session.executiveSummary.length > 140 ? "..." : ""}"
                        </p>
                      )}

                      {/* ACTIONS */}
                      <div className="record-card-actions">
                        <button
                          type="button"
                          className="record-inspect-btn"
                          onClick={() => handleInspectReport(session)}
                          title="View detailed AI analysis, answers, and feedback"
                        >
                          <FileText size={15} />
                          <span>View Detailed Report</span>
                        </button>

                        <button
                          type="button"
                          className="record-retake-btn"
                          onClick={() => handleRetake(session)}
                          title="Practice again with this track"
                        >
                          <RotateCcw size={15} />
                          <span>Retake</span>
                        </button>

                        <button
                          type="button"
                          className="record-delete-btn"
                          onClick={() => handleDeleteSession(session.sessionId)}
                          title="Delete this interview record"
                          aria-label="Delete this interview record"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =====================================================
            TAB 2: COMPETENCIES & PERFORMANCE METRICS
        ===================================================== */}
        {activeTab === "competencies" && (
          <div className="competencies-tab-container">
            <div className="competencies-card">
              <div className="competencies-card-header">
                <div>
                  <h3>Performance Dimension Breakdown</h3>
                  <p>Aggregate scoring across all your recorded practice interviews.</p>
                </div>
                <div className="overall-ring-badge">
                  <span>OVERALL</span>
                  <strong>{averageOverallScore}%</strong>
                </div>
              </div>

              <div className="metric-bars-stack">
                <div className="metric-row">
                  <div className="metric-row-header">
                    <span>Technical Accuracy & Depth</span>
                    <strong>{avgTechnical}%</strong>
                  </div>
                  <div className="metric-bar-bg">
                    <div
                      className="metric-bar-fill fill-blue"
                      style={{ width: `${avgTechnical}%` }}
                    ></div>
                  </div>
                  <small>Evaluates core concepts, architectural reasoning, and technical precision.</small>
                </div>

                <div className="metric-row">
                  <div className="metric-row-header">
                    <span>Relevance to Questions</span>
                    <strong>{avgRelevance}%</strong>
                  </div>
                  <div className="metric-bar-bg">
                    <div
                      className="metric-bar-fill fill-emerald"
                      style={{ width: `${avgRelevance}%` }}
                    ></div>
                  </div>
                  <small>Measures how directly and completely your answers address the interview prompt.</small>
                </div>

                <div className="metric-row">
                  <div className="metric-row-header">
                    <span>Communication Clarity</span>
                    <strong>{avgCommunication}%</strong>
                  </div>
                  <div className="metric-bar-bg">
                    <div
                      className="metric-bar-fill fill-purple"
                      style={{ width: `${avgCommunication}%` }}
                    ></div>
                  </div>
                  <small>Assesses structural organization, articulate delivery, and vocabulary quality.</small>
                </div>
              </div>
            </div>

            {/* HIGHLIGHTS & TIPS */}
            <div className="coaching-tips-grid">
              <div className="coaching-tip-card">
                <div className="tip-card-header">
                  <span className="tip-icon">✦</span>
                  <h4>How to Improve Your Technical Score</h4>
                </div>
                <ul>
                  <li>Provide concrete examples rather than abstract descriptions.</li>
                  <li>Mention trade-offs when discussing architectures and design decisions.</li>
                  <li>Define key terms clearly before diving into specialized implementations.</li>
                </ul>
              </div>

              <div className="coaching-tip-card">
                <div className="tip-card-header">
                  <span className="tip-icon">✦</span>
                  <h4>How to Improve Communication</h4>
                </div>
                <ul>
                  <li>Use the STAR format (Situation, Task, Action, Result) for behavioral answers.</li>
                  <li>Speak at a steady pace (120-150 words per minute) to ensure crisp articulation.</li>
                  <li>Structure technical answers: Definition → Mechanism → Use-case → Edge case.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            TAB 3: PROFILE & ACCOUNT SETTINGS
        ===================================================== */}
        {activeTab === "settings" && (
          <div className="settings-tab-container">
            <div className="settings-card">
              <div className="settings-card-header">
                <Edit3 size={20} />
                <div>
                  <h3>Edit Profile Details</h3>
                  <p>Update your display name or account credentials.</p>
                </div>
              </div>

              {profileSuccessMsg && (
                <div className="settings-alert success">
                  <CheckCircle2 size={16} />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              {/* PROFILE PHOTO CHANGER */}
              <div className="settings-photo-section">
                <div className="settings-photo-preview-wrap">
                  <img
                    src={currentUser.avatar || localStorage.getItem(`user_avatar_${currentUser.email}`) || "/default-avatar.svg"}
                    alt={currentUser.name || "Candidate"}
                    className="settings-photo-preview"
                    onError={(e) => { e.currentTarget.src = "/default-avatar.svg"; }}
                  />
                </div>
                <div className="settings-photo-controls">
                  <h4>Candidate Profile Picture</h4>
                  <p>Upload a personal photo or choose an interview avatar.</p>
                  <div className="settings-photo-btns">
                    <button
                      type="button"
                      className="settings-upload-photo-btn"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <Camera size={15} />
                      <span>Upload Photo</span>
                    </button>

                    <button
                      type="button"
                      className="settings-preset-btn"
                      onClick={() => saveNewAvatar("/default-avatar.svg")}
                      title="Set Headset Candidate Avatar"
                    >
                      Avatar 1
                    </button>

                    <button
                      type="button"
                      className="settings-preset-btn"
                      onClick={() => saveNewAvatar("/avatar-2.svg")}
                      title="Set Professional Candidate Avatar"
                    >
                      Avatar 2
                    </button>
                  </div>
                </div>
              </div>

              <hr className="settings-divider" />

              <form onSubmit={handleSaveProfile} className="settings-form">
                <div className="settings-field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={currentUser.email}
                    disabled
                    className="input-disabled"
                  />
                  <small>Email address is associated with your candidate record and cannot be altered.</small>
                </div>

                <div className="settings-field">
                  <label>Full Display Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. John Doe"
                    required
                  />
                </div>

                <hr className="settings-divider" />

                <div className="password-section-header">
                  <Lock size={16} />
                  <strong>Change Password (Optional)</strong>
                </div>

                <div className="settings-field">
                  <label>Current Password</label>
                  <input
                    type="password"
                    placeholder="Enter current password if changing"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>

                <div className="settings-field">
                  <label>New Password</label>
                  <input
                    type="password"
                    placeholder="Enter new secure password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="settings-form-actions">
                  <button
                    type="submit"
                    className="save-profile-btn"
                    disabled={isSavingProfile}
                  >
                    {isSavingProfile ? "Saving Updates..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default Profile;
