import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
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
  Code,
  Target
} from "lucide-react";
import "./History.css";

function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentUser = useMemo(() => {
    try {
      const u = localStorage.getItem("user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const email = currentUser?.email || "";
        const url = email
          ? `http://localhost:8080/api/interview/history?email=${encodeURIComponent(email)}`
          : "http://localhost:8080/api/interview/history";

        const response = await fetch(url);
        const data = await response.json();

        if (data.success && Array.isArray(data.history)) {
          setSessions(data.history);
        } else {
          // Fallback to local storage if database has no records yet
          const localRes = localStorage.getItem("interviewResult");
          if (localRes) {
            try {
              const parsed = JSON.parse(localRes);
              setSessions([{
                id: 1,
                sessionId: parsed.sessionId || "local_session",
                role: parsed.role || "Software Developer",
                interviewType: parsed.type || "Mixed",
                difficulty: parsed.difficulty || "Intermediate",
                totalQuestions: parsed.totalQuestions || 3,
                completedQuestions: parsed.completedQuestions || 3,
                overallScore: parsed.overallScore || 0,
                technicalScore: parsed.technicalAccuracyScore || 0,
                relevanceScore: parsed.relevanceScore || 0,
                communicationScore: parsed.communicationScore || 0,
                completenessScore: parsed.completenessScore || 0,
                performanceTitle: parsed.performanceTitle || "Interview Assessment",
                executiveSummary: parsed.executiveSummary || "",
                completedAt: new Date().toISOString(),
                resultJson: localRes
              }]);
            } catch (e) {
              setSessions([]);
            }
          } else {
            setSessions([]);
          }
        }
      } catch (err) {
        console.warn("Could not reach backend history endpoint, falling back to local storage:", err);
        const localRes = localStorage.getItem("interviewResult");
        if (localRes) {
          try {
            const parsed = JSON.parse(localRes);
            setSessions([{
              id: 1,
              sessionId: parsed.sessionId || "local_session",
              role: parsed.role || "Software Developer",
              interviewType: parsed.type || "Mixed",
              difficulty: parsed.difficulty || "Intermediate",
              totalQuestions: parsed.totalQuestions || 3,
              completedQuestions: parsed.completedQuestions || 3,
              overallScore: parsed.overallScore || 0,
              technicalScore: parsed.technicalAccuracyScore || 0,
              relevanceScore: parsed.relevanceScore || 0,
              communicationScore: parsed.communicationScore || 0,
              completenessScore: parsed.completenessScore || 0,
              performanceTitle: parsed.performanceTitle || "Interview Assessment",
              executiveSummary: parsed.executiveSummary || "",
              completedAt: new Date().toISOString(),
              resultJson: localRes
            }]);
          } catch (e) {
            setSessions([]);
          }
        } else {
          setSessions([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [currentUser]);

  // Aggregate Stats
  const totalInterviews = sessions.length;
  const averageScore = totalInterviews > 0
    ? Math.round(sessions.reduce((acc, s) => acc + (s.overallScore || 0), 0) / totalInterviews)
    : 0;
  const bestScore = totalInterviews > 0
    ? Math.max(...sessions.map(s => s.overallScore || 0))
    : 0;

  const handleViewSession = (session) => {
    try {
      if (session.resultJson) {
        localStorage.setItem("interviewResult", session.resultJson);
      } else {
        localStorage.setItem("interviewResult", JSON.stringify({
          sessionId: session.sessionId,
          role: session.role,
          difficulty: session.difficulty,
          type: session.interviewType,
          overallScore: session.overallScore,
          relevanceScore: session.relevanceScore,
          technicalAccuracyScore: session.technicalScore,
          completenessScore: session.completenessScore,
          communicationScore: session.communicationScore,
          performanceTitle: session.performanceTitle,
          executiveSummary: session.executiveSummary,
          totalQuestions: session.totalQuestions,
          completedQuestions: session.completedQuestions
        }));
      }
      navigate("/results");
    } catch (e) {
      console.error("Unable to load session into results view:", e);
      navigate("/results");
    }
  };

  const getScoreBadgeClass = (score) => {
    if (score >= 85) return "badge-excellent";
    if (score >= 70) return "badge-proficient";
    if (score >= 50) return "badge-developing";
    return "badge-needs-work";
  };

  return (
    <div className="history-page">
      <main className="history-container">
        {/* HEADER */}
        <header className="history-header">
          <div className="history-title-col">
            <span className="history-badge">
              <Sparkles size={14} />
              CANDIDATE PORTFOLIO
            </span>
            <h1>Previous Performance History</h1>
            <p>
              {currentUser?.name ? `Logged in as ${currentUser.name}` : "Track all your completed AI interview sessions and progress over time."}
            </p>
          </div>

          <div className="history-header-actions">
            <Link to="/setup" className="history-new-interview-btn">
              <RotateCcw size={16} />
              Start New Interview
            </Link>
          </div>
        </header>

        {/* METRICS SUMMARY CARDS */}
        {totalInterviews > 0 && (
          <section className="history-stats-grid">
            <div className="history-stat-card">
              <div className="stat-card-icon blue">
                <FileText size={20} />
              </div>
              <div>
                <span>TOTAL SESSIONS</span>
                <strong>{totalInterviews}</strong>
                <small>Interviews Completed</small>
              </div>
            </div>

            <div className="history-stat-card">
              <div className="stat-card-icon green">
                <BarChart3 size={20} />
              </div>
              <div>
                <span>AVERAGE SCORE</span>
                <strong>{averageScore}%</strong>
                <small>Across all attempts</small>
              </div>
            </div>

            <div className="history-stat-card">
              <div className="stat-card-icon purple">
                <Award size={20} />
              </div>
              <div>
                <span>BEST PERFORMANCE</span>
                <strong>{bestScore}%</strong>
                <small>Peak score achieved</small>
              </div>
            </div>
          </section>
        )}

        {/* SESSIONS LIST */}
        <section className="history-list-section">
          <div className="history-list-header">
            <h2>Completed Interview Sessions</h2>
            <span>{totalInterviews} {totalInterviews === 1 ? "Session" : "Sessions"} Found</span>
          </div>

          {loading ? (
            <div className="history-loading-card">
              <div className="history-spinner"></div>
              <p>Loading your previous performance records...</p>
            </div>
          ) : totalInterviews === 0 ? (
            <div className="history-empty-card">
              <div className="empty-icon-wrap">
                <Sparkles size={36} />
              </div>
              <h3>No Previous Interviews Recorded</h3>
              <p>
                You haven't completed any interviews yet. Start your first AI-evaluated interview to generate accurate performance reports, identify strengths, and get model answers.
              </p>
              <Link to="/setup" className="empty-action-btn">
                <Zap size={16} />
                Start Your First Interview
              </Link>
            </div>
          ) : (
            <div className="history-cards-grid">
              {sessions.map((session, idx) => {
                const score = Math.round(session.overallScore || 0);
                const dateStr = session.completedAt
                  ? new Date(session.completedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })
                  : "Recently Completed";

                return (
                  <div key={session.sessionId || idx} className="history-session-card">
                    <div className="session-card-top">
                      <div className="session-role-info">
                        <h3>{session.role || "Software Developer"}</h3>
                        <div className="session-tags-row">
                          <span className="session-difficulty-tag">
                            {session.difficulty || "Intermediate"}
                          </span>
                          <span className="session-type-tag">
                            {session.interviewType || "Mixed"}
                          </span>
                          <span className="session-date-tag">
                            <Calendar size={12} />
                            {dateStr}
                          </span>
                        </div>
                      </div>

                      <div className={`session-score-pill ${getScoreBadgeClass(score)}`}>
                        <strong>{score}%</strong>
                        <span>Overall</span>
                      </div>
                    </div>

                    {session.performanceTitle && (
                      <div className="session-performance-title">
                        <TrendingUp size={15} />
                        <span>{session.performanceTitle}</span>
                      </div>
                    )}

                    {session.executiveSummary && (
                      <p className="session-summary-text">
                        "{session.executiveSummary.slice(0, 160)}..."
                      </p>
                    )}

                    {/* SUB-SCORES ROW */}
                    <div className="session-subscores-row">
                      <div className="session-subscore">
                        <span>Technical</span>
                        <strong>{session.technicalScore || 0}%</strong>
                      </div>
                      <div className="session-subscore">
                        <span>Relevance</span>
                        <strong>{session.relevanceScore || 0}%</strong>
                      </div>
                      <div className="session-subscore">
                        <span>Communication</span>
                        <strong>{session.communicationScore || 0}%</strong>
                      </div>
                      <div className="session-subscore">
                        <span>Questions</span>
                        <strong>{session.completedQuestions || 0}/{session.totalQuestions || 0}</strong>
                      </div>
                    </div>

                    {/* CARD ACTIONS */}
                    <div className="session-card-actions">
                      <button
                        type="button"
                        className="session-view-btn"
                        onClick={() => handleViewSession(session)}
                      >
                        <span>View Detailed Report</span>
                        <ChevronRight size={16} />
                      </button>

                      <Link
                        to={`/setup?role=${encodeURIComponent(session.role || "")}`}
                        className="session-retake-btn"
                      >
                        <RotateCcw size={14} />
                        <span>Retake</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default History;
