import {
  Award,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Mic,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  Volume2,
  AlertTriangle,
  Code,
  Layers,
  FileText,
  ShieldCheck,
  Zap,
  Info,
  Printer,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Split,
  Eye,
  Check,
  Compass,
  User
} from "lucide-react";

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Results.css";

function Results() {
  const navigate = useNavigate();
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState(0);
  const [answerViewMode, setAnswerViewMode] = useState("split"); // "candidate", "sample", "split"
  const [selectedTopic, setSelectedTopic] = useState(null);

  /* =====================================================
     READ CURRENT INTERVIEW RESULT FROM LOCAL STORAGE
  ===================================================== */
  const result = useMemo(() => {
    try {
      const saved = localStorage.getItem("interviewResult");
      if (!saved) return null;
      return JSON.parse(saved);
    } catch (error) {
      console.error("Unable to read interview result:", error);
      return null;
    }
  }, []);

  /* =====================================================
     FALLBACK SAFEGUARDS & NORMALIZATION
  ===================================================== */
  const interviewData = result || {
    role: "Software Developer",
    type: "Mixed",
    difficulty: "Intermediate",
    totalQuestions: 0,
    completedQuestions: 0,
    skippedQuestions: 0,
    totalDuration: 0,
    overallScore: 0,
    relevanceScore: 0,
    technicalAccuracyScore: 0,
    completenessScore: 0,
    communicationScore: 0,
    speakingSpeedWPM: 0,
    strengths: ["No interview answers recorded."],
    areasForImprovement: ["Complete an interview session to receive tailored evaluation."],
    actionPlan: ["Practice answering technical and behavioral questions aloud."],
    executiveSummary: "No session data was found.",
    aiAnalyses: []
  };

  const aiAnalyses = interviewData.aiAnalyses || [];
  const completed = interviewData.completedQuestions || aiAnalyses.length;
  const total = interviewData.totalQuestions || Math.max(1, completed);
  const completionRate = Math.round((completed / total) * 100);
  const isEndedEarly = completed < total;

  const overallScore = Math.min(100, Math.max(0, Math.round(interviewData.overallScore || 0)));
  const relevanceScore = Math.min(100, Math.max(0, Math.round(interviewData.relevanceScore || 0)));
  const technicalScore = Math.min(100, Math.max(0, Math.round(interviewData.technicalAccuracyScore || 0)));
  const conceptualScore = Math.min(100, Math.max(0, Math.round(interviewData.conceptualUnderstandingScore || interviewData.technicalAccuracyScore || 0)));
  const completenessScore = Math.min(100, Math.max(0, Math.round(interviewData.completenessScore || 0)));
  const communicationScore = Math.min(100, Math.max(0, Math.round(interviewData.communicationScore || 0)));

  const speechMetrics = interviewData.speechMetrics || {};
  const wpm = interviewData.speakingSpeedWPM || speechMetrics.speakingSpeedWPM || 0;
  const totalDuration = interviewData.totalDuration || speechMetrics.totalDurationSeconds || 0;
  const fillerCount = speechMetrics.totalFillerWords || 0;

  const sessionSynthesis = interviewData.sessionSynthesis || {};

  /* =====================================================
     STUDENT-FRIENDLY RATING & TIER
  ===================================================== */
  let performanceTitle = interviewData.performanceTitle || sessionSynthesis.performanceTitle || "Developing Foundation";
  let performanceBadgeColor = "score-developing";
  let ratingExplanation = interviewData.ratingExplanation || sessionSynthesis.ratingExplanation || "";

  if (overallScore >= 85) {
    performanceTitle = "Exceptional Performance";
    performanceBadgeColor = "score-excellent";
    if (!ratingExplanation) {
      ratingExplanation = "Outstanding domain knowledge, strong relevance, and crisp articulation. You demonstrate interview-ready competency!";
    }
  } else if (overallScore >= 70) {
    performanceTitle = "Strong Performance";
    performanceBadgeColor = "score-proficient";
    if (!ratingExplanation) {
      ratingExplanation = "Solid command of technical fundamentals and clear communication. With targeted polish on implementation mechanisms, you are well-prepared for interviews.";
    }
  } else if (overallScore >= 50) {
    performanceTitle = "Developing Foundation";
    performanceBadgeColor = "score-developing";
    if (!ratingExplanation) {
      ratingExplanation = "Good conceptual start with several relevant points covered. Strengthening implementation details and structured examples will significantly boost your interview scores.";
    }
  } else if (overallScore > 0) {
    performanceTitle = "Foundational Knowledge Required";
    performanceBadgeColor = "score-needs-work";
    if (!ratingExplanation) {
      ratingExplanation = "Your interview performance establishes a clear baseline. With focused review on the recommended revision topics and practicing structured explanations, you can rapidly improve.";
    }
  } else {
    performanceTitle = "No Answers Recorded";
    performanceBadgeColor = "score-needs-work";
    if (!ratingExplanation) {
      ratingExplanation = "No spoken answers were recorded for this interview session. Please attempt the questions aloud to receive a performance assessment.";
    }
  }

  /* =====================================================
     METRICS BREAKDOWN
  ===================================================== */
  const metrics = [
    {
      icon: <Code size={20} />,
      title: "Technical Accuracy (40%)",
      score: technicalScore,
      description:
        technicalScore >= 80
          ? "Accurate concepts, correct mechanisms, and solid terminology."
          : technicalScore >= 50
          ? "Partially correct; review core definitions and runtime nuances."
          : "Significant technical gaps or misconceptions detected."
    },
    {
      icon: <Brain size={20} />,
      title: "Conceptual Understanding (25%)",
      score: conceptualScore,
      description:
        conceptualScore >= 80
          ? "Deep grasp of foundational principles, architecture, and purpose."
          : conceptualScore >= 50
          ? "Solid basic idea with some gaps in underlying mechanics."
          : "Needs review of core conceptual foundations."
    },
    {
      icon: <Target size={20} />,
      title: "Question Relevance (20%)",
      score: relevanceScore,
      description:
        relevanceScore >= 80
          ? "Directly addressed the question asked without off-topic drift."
          : relevanceScore >= 50
          ? "Addressed question in part, but wandered or missed key focus."
          : "Largely off-topic or did not answer the specific question."
    },
    {
      icon: <Layers size={20} />,
      title: "Completeness & Depth (10%)",
      score: completenessScore,
      description:
        completenessScore >= 80
          ? "Thorough coverage of expected points and implementation details."
          : completenessScore >= 50
          ? "Covered basic points but omitted important mechanisms/examples."
          : "Very brief, superficial, or incomplete explanation."
    },
    {
      icon: <MessageSquare size={20} />,
      title: "Clarity & Communication (5%)",
      score: communicationScore,
      description:
        communicationScore >= 80
          ? "Structured, coherent, and articulated with clear reasoning."
          : communicationScore >= 50
          ? "Understood, but structure and conciseness could be polished."
          : "Hesitant delivery, disjointed logic, or high filler word usage."
    }
  ];

  /* =====================================================
     ACTIONS
  ===================================================== */
  const retakeInterview = () => {
    localStorage.removeItem("interviewAnswers");
    localStorage.removeItem("interviewResult");
    localStorage.removeItem("interviewAIAnalyses");
    localStorage.removeItem("interviewTerminated");
    navigate("/setup");
  };

  const practiceSimilarQuestions = () => {
    navigate("/setup");
  };

  const handlePrint = () => {
    window.print();
  };

  const goHome = () => {
    navigate("/");
  };

  const selectedQuestion = aiAnalyses[selectedQuestionIdx] || aiAnalyses[0] || null;

  // Extract all recommended revision topics across questions
  const allRevisionTopics = useMemo(() => {
    const fromSynthesis = sessionSynthesis.recommendedRevisionTopics || interviewData.recommendedRevisionTopics || [];
    if (fromSynthesis.length > 0) return fromSynthesis;

    const collected = [];
    aiAnalyses.forEach((q) => {
      const topics = q.aiEvaluation?.keyConceptsToRevise || [];
      collected.push(...topics);
    });
    return [...new Set(collected)].slice(0, 8);
  }, [sessionSynthesis, interviewData, aiAnalyses]);

  return (
    <div className="results-page">
      {/* HEADER */}
      <header className="results-header">
        <div className="results-brand">
          <div className="results-brand-icon">
            <Sparkles size={21} />
          </div>
          <div>
            <strong>AI Interview Performance Analyzer</strong>
            <span>Student Evaluation & Mentorship Report</span>
          </div>
        </div>

        <div className="results-header-actions">
          <button
            type="button"
            className="header-action-btn profile-nav-btn"
            onClick={() => navigate("/profile")}
            title="View My Profile & Records"
          >
            <User size={15} />
            <span>My Profile</span>
          </button>

          <button type="button" className="header-action-btn print-btn" onClick={handlePrint} title="Print or Save as PDF">
            <Printer size={15} />
            <span>Print Report</span>
          </button>

          <button type="button" className="header-action-btn home-nav-btn" onClick={goHome}>
            <span>Dashboard</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="results-main">
        {/* INTRO HERO */}
        <section className="results-intro">
          <div className="completed-badge">
            <CheckCircle2 size={15} />
            {isEndedEarly ? "INTERVIEW SESSION CONCLUDED" : "FULL INTERVIEW SESSION COMPLETED"}
          </div>

          <h1>
            Your Performance <span>Evaluation</span>
          </h1>

          <p>
            Detailed, evidence-based technical assessment for your{" "}
            <strong>{interviewData.role}</strong> interview session ({interviewData.difficulty} Level).
          </p>

          <div className="result-session-info">
            <span>💼 {interviewData.role}</span>
            <span>🎯 {interviewData.type}</span>
            <span>⚡ {interviewData.difficulty}</span>
            <span>📅 {new Date(interviewData.completedAt || Date.now()).toLocaleDateString()}</span>
          </div>
        </section>

        {/* OVERALL SCORE HERO CARD */}
        <section className="score-card">
          <div className="score-left">
            <div
              className="score-circle"
              style={{
                "--score": `${overallScore}%`
              }}
            >
              <div className="score-circle-inner">
                <strong>{overallScore}</strong>
                <span>/100</span>
                <small>Overall Score</small>
              </div>
            </div>
          </div>

          <div className="score-middle">
            <div className="score-badge-row">
              <span className={`score-tier-badge ${performanceBadgeColor}`}>{performanceTitle}</span>
              {isEndedEarly && <span className="partial-session-tag">Partial Session ({completed}/{total} Questions)</span>}
            </div>

            <h2>{performanceTitle}</h2>
            <p className="rating-explanation-text">{ratingExplanation}</p>

            <div className="score-stats-row">
              <div className="score-stat-item">
                <TrendingUp size={16} />
                <span>{completed} of {total} Questions Answered</span>
              </div>
              <div className="score-stat-item">
                <Mic size={16} />
                <span>{wpm} WPM Pacing ({wpm >= 115 && wpm <= 165 ? "Ideal" : "Needs Pacing Polish"})</span>
              </div>
              <div className="score-stat-item">
                <Clock size={16} />
                <span>{Math.round(totalDuration)}s Total Spoken Time</span>
              </div>
            </div>
          </div>

          <div className="score-award">
            <Award size={34} />
            <strong>{overallScore >= 70 ? "Placement Ready" : overallScore > 0 ? "Targeted Practice" : "Not Attempted"}</strong>
            <span>{interviewData.difficulty} Level</span>
          </div>
        </section>

        {/* COMPLETION NOTICE IF ENDED EARLY OR UNANSWERED */}
        {isEndedEarly && (
          <div className="early-termination-banner">
            <Info size={17} />
            <div>
              <strong>Transparent Evaluation Note</strong>
              <p>
                {completed === 0
                  ? "No scheduled questions were answered during this interview session. All questions were scored as 0. Please record spoken answers for each question to receive a performance assessment."
                  : `You completed ${completed} of ${total} scheduled questions. To ensure fair evaluation, unanswered questions were factored in as 0. Practice answering all questions in full for maximum interview readiness.`}
              </p>
            </div>
          </div>
        )}

        {/* DIMENSION BREAKDOWN */}
        <section className="metrics-section">
          <div className="results-section-title">
            <div>
              <span>EVALUATION DIMENSIONS</span>
              <h2>Performance Breakdown</h2>
            </div>
            <BarChart3 size={22} />
          </div>

          <div className="results-metrics-grid">
            {metrics.map((metric) => (
              <div className="results-metric-card" key={metric.title}>
                <div className="results-metric-top">
                  <div className="results-metric-icon">{metric.icon}</div>
                  <strong>{metric.score}%</strong>
                </div>
                <h3>{metric.title}</h3>
                <p>{metric.description}</p>
                <div className="results-progress">
                  <div
                    style={{
                      width: `${metric.score}%`,
                      backgroundColor:
                        metric.score >= 75
                          ? "#10b981"
                          : metric.score >= 50
                          ? "#f59e0b"
                          : "#ef4444"
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* EXECUTIVE SUMMARY & COACH REPORT */}
        <section className="ai-summary">
          <div className="summary-icon">
            <Sparkles size={24} />
          </div>
          <div className="summary-content">
            <span>AI INTERVIEW MENTOR</span>
            <h2>Executive Performance Summary</h2>
            <p className="summary-text">
              {interviewData.executiveSummary ||
                "Based on the concepts evaluated across your answers, your interview establishes a clear foundation. Focus on core implementation mechanisms and concrete examples to elevate your interview readiness."}
            </p>
          </div>
        </section>

        {/* SYSTEMIC HIGHLIGHTS & PRACTICE PLAN */}
        <section className="feedback-grid">
          {/* SYSTEMIC STRENGTHS */}
          <div className="feedback-card strengths">
            <div className="feedback-card-header">
              <div className="feedback-card-icon">
                <CheckCircle2 size={19} />
              </div>
              <div>
                <span>EVIDENCE-BASED HIGHLIGHTS</span>
                <h2>What You Did Well</h2>
              </div>
            </div>
            <div className="feedback-list">
              {(interviewData.strengths || []).map((item, index) => (
                <div key={index} className="feedback-item">
                  <CheckCircle2 size={16} className="feedback-icon green" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* FOCUS AREAS / WHAT CAN BE IMPROVED */}
          <div className="feedback-card improvement">
            <div className="feedback-card-header">
              <div className="feedback-card-icon">
                <Lightbulb size={19} />
              </div>
              <div>
                <span>STUDENT GROWTH AREAS</span>
                <h2>What Can Be Improved</h2>
              </div>
            </div>
            <div className="feedback-list">
              {(interviewData.areasForImprovement || []).map((item, index) => (
                <div key={index} className="feedback-item">
                  <Lightbulb size={16} className="feedback-icon amber" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PERSONALIZED PRACTICE PLAN */}
        {(sessionSynthesis.personalizedPracticePlan || interviewData.actionPlan)?.length > 0 && (
          <section className="action-plan-section">
            <div className="results-section-title">
              <div>
                <span>PERSONALIZED ROADMAP</span>
                <h2>Actionable Next Steps for Your Next Interview</h2>
              </div>
              <Compass size={22} />
            </div>

            <div className="action-plan-grid">
              {(sessionSynthesis.personalizedPracticePlan || interviewData.actionPlan || []).map((step, idx) => (
                <div key={idx} className="action-plan-card">
                  <div className="action-step-num">{idx + 1}</div>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RECOMMENDED REVISION TOPICS */}
        {allRevisionTopics.length > 0 && (
          <section className="revision-topics-section">
            <div className="results-section-title">
              <div>
                <span>TARGETED STUDY LIST</span>
                <h2>Key Concepts to Revise Before Your Real Interview</h2>
              </div>
              <BookOpen size={22} />
            </div>

            <div className="revision-chips-container">
              {allRevisionTopics.map((topic, idx) => (
                <button
                  type="button"
                  key={idx}
                  className={`revision-topic-chip ${selectedTopic === topic ? "active" : ""}`}
                  onClick={() => setSelectedTopic(selectedTopic === topic ? null : topic)}
                >
                  <Zap size={14} />
                  <span>{topic}</span>
                </button>
              ))}
            </div>

            {selectedTopic && (
              <div className="topic-advice-box">
                <Sparkles size={16} />
                <div>
                  <strong>Study Focus: {selectedTopic}</strong>
                  <p>
                    Review the official documentation and practice writing a 3-sentence summary of this concept:
                    (1) Definition, (2) How it works internally, and (3) A real-world production use case.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* QUESTION-BY-QUESTION DEEP DIVE */}
        {aiAnalyses.length > 0 && (
          <section className="question-deep-dive-section">
            <div className="results-section-title">
              <div>
                <span>QUESTION AUDIT & MODEL ANSWERS</span>
                <h2>Question-by-Question Deep Dive</h2>
              </div>
              <FileText size={22} />
            </div>

            {/* QUESTION SELECTOR TABS */}
            <div className="question-tabs">
              {aiAnalyses.map((q, idx) => {
                const qScore10 = q.aiEvaluation?.scoreOutOf10 ?? (q.aiEvaluation?.overallScore ? (q.aiEvaluation.overallScore / 10).toFixed(1) : 0);
                return (
                  <button
                    key={idx}
                    className={`question-tab-btn ${selectedQuestionIdx === idx ? "active" : ""}`}
                    onClick={() => setSelectedQuestionIdx(idx)}
                  >
                    <span>Q{q.questionNumber || idx + 1}</span>
                    <strong>{qScore10}/10</strong>
                  </button>
                );
              })}
            </div>

            {/* ACTIVE QUESTION CARD */}
            {selectedQuestion && (
              <div className="question-detail-card">
                <div className="question-detail-header">
                  <div className="question-badge-row">
                    <span className="q-category-tag">
                      {selectedQuestion.aiEvaluation?.questionCategory || "Technical"}
                    </span>
                    <span className="q-difficulty-tag">
                      {selectedQuestion.difficulty || interviewData.difficulty}
                    </span>

                    {/* UNDERSTANDING PILL */}
                    {selectedQuestion.aiEvaluation?.understanding && (
                      <span className={`q-understanding-tag ${
                        selectedQuestion.aiEvaluation.understanding.includes("Fully")
                          ? "correct"
                          : selectedQuestion.aiEvaluation.understanding.includes("Partially")
                          ? "partial"
                          : "incorrect"
                      }`}>
                        {selectedQuestion.aiEvaluation.understanding}
                      </span>
                    )}

                    {selectedQuestion.aiEvaluation?.isIDontKnow && (
                      <span className="q-idk-tag">Knowledge Gap Acknowledged</span>
                    )}
                    {selectedQuestion.aiEvaluation?.isOffTopic && (
                      <span className="q-offtopic-tag">Off-Topic Response</span>
                    )}
                  </div>

                  <div className="question-score-pill">
                    <strong>
                      {selectedQuestion.aiEvaluation?.scoreOutOf10 !== undefined
                        ? selectedQuestion.aiEvaluation.scoreOutOf10
                        : (selectedQuestion.aiEvaluation?.overallScore / 10).toFixed(1)}
                    </strong>
                    <span>/10</span>
                  </div>
                </div>

                <h3 className="question-heading">{selectedQuestion.question}</h3>

                {/* SCORE EXPLANATION / UNDERSTANDING STATEMENT */}
                <div className="understanding-card">
                  <div className="understanding-icon">
                    <Zap size={18} />
                  </div>
                  <div>
                    <strong>Assessment & Score Breakdown:</strong>
                    <p>
                      {selectedQuestion.aiEvaluation?.understandingExplanation ||
                       selectedQuestion.aiEvaluation?.scoreExplanation ||
                       selectedQuestion.aiEvaluation?.detailedEvaluation ||
                       "Response evaluated against technical accuracy and core criteria."}
                    </p>
                  </div>
                </div>

                {/* VIEW MODE TOGGLE FOR ANSWERS */}
                <div className="answer-view-toggle-bar">
                  <span>Compare Answers:</span>
                  <div className="toggle-buttons-group">
                    <button
                      type="button"
                      className={`toggle-btn ${answerViewMode === "candidate" ? "active" : ""}`}
                      onClick={() => setAnswerViewMode("candidate")}
                    >
                      <Mic size={14} />
                      Your Spoken Answer
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${answerViewMode === "sample" ? "active" : ""}`}
                      onClick={() => setAnswerViewMode("sample")}
                    >
                      <Sparkles size={14} />
                      Model Strong Answer
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${answerViewMode === "split" ? "active" : ""}`}
                      onClick={() => setAnswerViewMode("split")}
                    >
                      <Split size={14} />
                      Compare Side-by-Side
                    </button>
                  </div>
                </div>

                {/* ANSWER PANELS (CANDIDATE VS SAMPLE) */}
                <div className={`answer-comparison-container ${answerViewMode}`}>
                  {/* CANDIDATE TRANSCRIPT PANEL */}
                  {(answerViewMode === "candidate" || answerViewMode === "split") && (
                    <div className="transcript-box">
                      <div className="transcript-header">
                        <div className="transcript-title-col">
                          <Mic size={15} />
                          <strong>Your Spoken Response</strong>
                        </div>
                        {selectedQuestion.durationSeconds > 0 && (
                          <span className="transcript-meta">
                            {selectedQuestion.durationSeconds}s • {selectedQuestion.wordCount || 0} words • {selectedQuestion.speakingSpeedWPM || 0} WPM
                          </span>
                        )}
                      </div>
                      <p className="transcript-content">
                        {selectedQuestion.transcript ? (
                          `"${selectedQuestion.transcript}"`
                        ) : (
                          <em className="no-speech-warning">No spoken answer was detected for this question.</em>
                        )}
                      </p>
                    </div>
                  )}

                  {/* MODEL STRONG ANSWER PANEL */}
                  {(answerViewMode === "sample" || answerViewMode === "split") && (
                    <div className="sample-answer-box">
                      <div className="sample-header">
                        <Sparkles size={15} />
                        <strong>Example of a Strong Interview Answer</strong>
                        <span className="sample-badge">Benchmark</span>
                      </div>
                      <p className="sample-content">
                        {selectedQuestion.aiEvaluation?.sampleStrongAnswer ||
                          "A top-tier answer starts with a clear definition, explains the underlying runtime mechanism, and gives a short concrete example from a real project."}
                      </p>
                    </div>
                  )}
                </div>

                {/* QUESTION SUB-SCORES (5-DIMENSION RUBRIC) */}
                <div className="question-subscores">
                  <div className="subscore-item">
                    <span>Technical Accuracy (40%)</span>
                    <strong>{selectedQuestion.aiEvaluation?.technicalAccuracyScore ?? 0}%</strong>
                  </div>
                  <div className="subscore-item">
                    <span>Conceptual Grasp (25%)</span>
                    <strong>{selectedQuestion.aiEvaluation?.conceptualUnderstandingScore ?? selectedQuestion.aiEvaluation?.technicalAccuracyScore ?? 0}%</strong>
                  </div>
                  <div className="subscore-item">
                    <span>Relevance (20%)</span>
                    <strong>{selectedQuestion.aiEvaluation?.relevanceScore ?? 0}%</strong>
                  </div>
                  <div className="subscore-item">
                    <span>Completeness (10%)</span>
                    <strong>{selectedQuestion.aiEvaluation?.completenessScore ?? 0}%</strong>
                  </div>
                  <div className="subscore-item">
                    <span>Communication (5%)</span>
                    <strong>{selectedQuestion.aiEvaluation?.communicationScore ?? 0}%</strong>
                  </div>
                </div>

                {/* EXPECTED KEY CONCEPTS FOR A STRONG ANSWER */}
                {((selectedQuestion.aiEvaluation?.expectedKeyConcepts?.length > 0) ||
                  (selectedQuestion.aiEvaluation?.idealAnswerKeyPoints?.length > 0)) && (
                  <div className="expected-concepts-card">
                    <h5>
                      <Target size={16} /> Expected Key Concepts:
                    </h5>
                    <ul>
                      {(selectedQuestion.aiEvaluation?.expectedKeyConcepts ||
                        selectedQuestion.aiEvaluation?.idealAnswerKeyPoints || []).map((concept, i) => (
                        <li key={i}>{concept}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* WHAT YOU DID WELL & WHAT CAN BE IMPROVED */}
                <div className="question-feedback-grid">
                  {/* WHAT YOU DID WELL */}
                  <div className="q-feedback-col green-border">
                    <h5>
                      <CheckCircle2 size={16} /> What You Answered Well
                    </h5>
                    <ul>
                      {/* Covered key concepts */}
                      {(selectedQuestion.aiEvaluation?.coveredKeyConcepts || []).map((c, i) => (
                        <li key={`covered-${i}`}><strong>Covered:</strong> {c}</li>
                      ))}
                      {/* General strengths */}
                      {(selectedQuestion.aiEvaluation?.whatYouDidWell ||
                        selectedQuestion.aiEvaluation?.strengths || []).map((s, i) => (
                        <li key={`well-${i}`}>{s}</li>
                      ))}
                    </ul>
                  </div>

                  {/* WHAT CAN BE IMPROVED */}
                  <div className="q-feedback-col red-border">
                    <h5>
                      <AlertTriangle size={16} /> Missing or Incomplete Concepts
                    </h5>
                    <ul>
                      {/* Missing or incorrect concepts */}
                      {(selectedQuestion.aiEvaluation?.missingOrIncorrectConcepts || []).map((m, i) => (
                        <li key={`missing-${i}`}><strong>Focus Area:</strong> {m}</li>
                      ))}
                      {/* General areas for improvement if not overlapping */}
                      {(selectedQuestion.aiEvaluation?.whatCanBeImproved ||
                        selectedQuestion.aiEvaluation?.areasForImprovement || []).map((w, i) => (
                        <li key={`imp-${i}`}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* HOW TO IMPROVE YOUR ANSWER */}
                {selectedQuestion.aiEvaluation?.howToImprove && (
                  <div className="how-to-improve-card">
                    <h5>
                      <Zap size={16} /> How to Improve Your Answer
                    </h5>
                    <p>{selectedQuestion.aiEvaluation.howToImprove}</p>
                  </div>
                )}

                {/* INTERVIEW TIP */}
                {selectedQuestion.aiEvaluation?.interviewTip && (
                  <div className="interview-tip-card">
                    <div className="tip-icon-col">
                      <Lightbulb size={18} />
                    </div>
                    <div>
                      <strong>Interview Tip for Similar Questions:</strong>
                      <p>{selectedQuestion.aiEvaluation.interviewTip}</p>
                    </div>
                  </div>
                )}

                {/* KEY CONCEPTS TO REVISE */}
                {selectedQuestion.aiEvaluation?.keyConceptsToRevise?.length > 0 && (
                  <div className="q-revision-topics">
                    <h5>
                      <BookOpen size={15} /> Key Concepts to Revise for This Question
                    </h5>
                    <div className="q-topics-chips">
                      {selectedQuestion.aiEvaluation.keyConceptsToRevise.map((top, i) => (
                        <span key={i} className="q-topic-pill">
                          {top}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* TRANSPARENCY NOTICE */}
        <section className="transparency-notice">
          <div className="notice-icon">
            <Info size={18} />
          </div>
          <div className="notice-text">
            <strong>Grounded Audio & Transcript Evaluation</strong>
            <p>
              Scores and insights are computed directly from your spoken transcript (via Faster-Whisper STT)
              and benchmarked against genuine engineering interview rubrics. No synthetic facial or eye-tracking
              data is fabricated.
            </p>
          </div>
        </section>

        {/* BOTTOM ACTION BUTTONS */}
        <section className="results-actions">
          <button
            className="view-records-btn"
            onClick={() => navigate("/profile?tab=records")}
          >
            <FileText size={17} />
            View in My Records
          </button>

          <button className="practice-similar-btn" onClick={practiceSimilarQuestions}>
            <Sparkles size={17} />
            Practice Similar Questions
          </button>

          <button className="retake-btn" onClick={retakeInterview}>
            <RotateCcw size={17} />
            Retake Interview
          </button>

          <button className="home-results-btn" onClick={goHome}>
            Back to Dashboard
            <ChevronRight size={17} />
          </button>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="results-footer">
        <span>
          <ShieldCheck size={14} />
          Verified AI Evaluation Session
        </span>
        <span>
          <Sparkles size={14} />
          Powered by Faster-Whisper & Ollama LLM
        </span>
        <span>
          {completed} of {total} Questions Analyzed
        </span>
      </footer>
    </div>
  );
}

export default Results;