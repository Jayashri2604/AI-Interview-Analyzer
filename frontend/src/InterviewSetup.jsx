import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Layers,
  Zap,
  Mic,
  MicOff,
  Volume2,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  HelpCircle,
  BarChart2
} from "lucide-react";
import "./InterviewSetup.css";

function InterviewSetup() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const u = localStorage.getItem("user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleUserUpdate = () => {
      try {
        const u = localStorage.getItem("user");
        setCurrentUser(u ? JSON.parse(u) : null);
      } catch {
        setCurrentUser(null);
      }
    };
    window.addEventListener("user-updated", handleUserUpdate);
    window.addEventListener("storage", handleUserUpdate);
    return () => {
      window.removeEventListener("user-updated", handleUserUpdate);
      window.removeEventListener("storage", handleUserUpdate);
    };
  }, []);

  const [role, setRole] = useState("Software Developer");
  const [type, setType] = useState("Mixed");
  const [difficulty, setDifficulty] = useState("Intermediate");
  const [formError, setFormError] = useState("");

  // Microphone test state
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micStatus, setMicStatus] = useState("idle"); // idle, testing, success, error
  const [micErrorMessage, setMicErrorMessage] = useState("");

  const audioStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Clean up audio test on unmount
  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  const stopMicTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    setIsTestingMic(false);
    setMicLevel(0);
  };

  const startMicTest = async () => {
    stopMicTest();
    setMicStatus("testing");
    setMicErrorMessage("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      setIsTestingMic(true);
      setMicStatus("success");

      const updateVolume = () => {
        if (!audioStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setMicLevel(normalized);
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.error("Microphone check error:", err);
      setMicStatus("error");
      setMicErrorMessage(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Microphone access was denied. Please allow microphone permissions in your browser address bar."
          : "No microphone detected. Please plug in or enable a microphone."
      );
      setIsTestingMic(false);
    }
  };

  const startInterview = () => {
    if (!role || !type || !difficulty) {
      setFormError("Please select your job role, interview type, and difficulty level.");
      return;
    }

    setFormError("");
    stopMicTest();

    // Store interview configuration
    localStorage.setItem(
      "interviewConfig",
      JSON.stringify({
        role,
        type,
        difficulty
      })
    );

    // Clean past temporary answer session cache
    localStorage.removeItem("interviewAnswers");
    localStorage.removeItem("interviewResult");
    localStorage.removeItem("interviewAIAnalyses");
    localStorage.removeItem("interviewTerminated");

    navigate("/interview");
  };

  return (
    <div className="setup-page">
      {/* BACKGROUND GLOWS */}
      <div className="setup-glow setup-glow-one"></div>
      <div className="setup-glow setup-glow-two"></div>

      <div className="setup-wrapper">
        {/* TOP HEADER */}
        <div className="setup-heading">
          <div className="setup-ai-badge">
            <Sparkles size={15} />
            <span>AI INTERVIEW CONFIGURATION</span>
          </div>

          <h1>
            Prepare Your <span>Interview</span>
          </h1>

          <p>
            Choose your target role and customize the session. Our AI evaluator provides honest,
            strict technical evaluation with encouraging, student-friendly feedback.
          </p>
        </div>

        {currentUser && (
          <div className="setup-welcome-strip">
            <div className="setup-welcome-user">
              <div
                className="setup-welcome-avatar"
                onClick={() => navigate("/profile")}
                title="Go to My Profile"
              >
                <img
                  src={currentUser.avatar || localStorage.getItem(`user_avatar_${currentUser.email}`) || "/default-avatar.svg"}
                  alt={currentUser.name || "Candidate"}
                  className="setup-welcome-avatar-img"
                  onError={(e) => { e.currentTarget.src = "/default-avatar.svg"; }}
                />
              </div>
              <div>
                <strong>Welcome back, {currentUser.name ? currentUser.name.split(" ")[0] : "Candidate"}!</strong>
                <span>Review your previous interviews and see your growth over time.</span>
              </div>
            </div>
            <div className="setup-welcome-buttons">
              <button
                type="button"
                className="setup-history-btn"
                onClick={() => navigate("/profile?tab=records")}
              >
                <BarChart2 size={16} />
                <span>Interview Records</span>
              </button>

              <button
                type="button"
                className="setup-profile-link-btn"
                onClick={() => navigate("/profile")}
              >
                <span>My Profile</span>
              </button>
            </div>
          </div>
        )}

        {/* STEPS BREADCRUMB */}
        <div className="setup-progress">
          <div className="setup-progress-item active">
            <div>1</div>
            <span>Preferences & Hardware</span>
          </div>
          <span className="setup-line"></span>
          <div className="setup-progress-item">
            <div>2</div>
            <span>Live AI Interview</span>
          </div>
          <span className="setup-line"></span>
          <div className="setup-progress-item">
            <div>3</div>
            <span>Evaluation & Coaching</span>
          </div>
        </div>

        {/* MAIN CARD */}
        <div className="setup-card">
          <div className="setup-card-header">
            <div className="setup-icon">
              <Briefcase size={22} />
            </div>
            <div>
              <h2>Interview Parameters</h2>
              <p>Configure your target role and practice format.</p>
            </div>
          </div>

          {formError && (
            <div className="setup-error-banner">
              <AlertCircle size={18} />
              <span>{formError}</span>
            </div>
          )}

          {/* JOB ROLE */}
          <div className="setup-field">
            <label htmlFor="role-select">
              <Briefcase size={16} />
              Job Role
            </label>

            <div className="select-wrapper">
              <select
                id="role-select"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setFormError("");
                }}
              >
                <option value="Java Developer">Java Developer</option>
                <option value="Spring Boot Developer">Spring Boot Developer</option>
                <option value="React Developer">React Developer</option>
                <option value="Frontend Developer">Frontend Developer</option>
                <option value="Backend Developer">Backend Developer</option>
                <option value="Full Stack Developer">Full Stack Developer</option>
                <option value="Software Developer">Software Developer</option>
                <option value="Software Engineer">Software Engineer</option>
                <option value="Python Developer">Python Developer</option>
                <option value="Data Analyst">Data Analyst</option>
                <option value="QA / Software Tester">QA / Software Tester</option>
                <option value="DevOps Engineer">DevOps Engineer</option>
              </select>
              <span className="select-arrow">⌄</span>
            </div>
          </div>

          {/* INTERVIEW TYPE */}
          <div className="setup-field">
            <label>
              <Layers size={16} />
              Interview Type
            </label>

            <div className="option-grid">
              <button
                type="button"
                className={type === "Technical" ? "option-card selected" : "option-card"}
                onClick={() => {
                  setType("Technical");
                  setFormError("");
                }}
              >
                <span className="option-icon">💻</span>
                <div>
                  <strong>Technical</strong>
                  <small>Algorithms, OOP & Frameworks</small>
                </div>
                {type === "Technical" && <span className="check">✓</span>}
              </button>

              <button
                type="button"
                className={type === "Mixed" ? "option-card selected" : "option-card"}
                onClick={() => {
                  setType("Mixed");
                  setFormError("");
                }}
              >
                <span className="option-icon">🧠</span>
                <div>
                  <strong>Technical + HR</strong>
                  <small>Realistic Comprehensive Mix</small>
                </div>
                {type === "Mixed" && <span className="check">✓</span>}
              </button>

              <button
                type="button"
                className={type === "HR" ? "option-card selected" : "option-card"}
                onClick={() => {
                  setType("HR");
                  setFormError("");
                }}
              >
                <span className="option-icon">👥</span>
                <div>
                  <strong>HR & Behavioral</strong>
                  <small>STAR Situations & Culture</small>
                </div>
                {type === "HR" && <span className="check">✓</span>}
              </button>
            </div>
          </div>

          {/* DIFFICULTY */}
          <div className="setup-field">
            <label>
              <Zap size={16} />
              Difficulty Level
            </label>

            <div className="difficulty-grid">
              <button
                type="button"
                className={difficulty === "Beginner" ? "difficulty-card selected" : "difficulty-card"}
                onClick={() => {
                  setDifficulty("Beginner");
                  setFormError("");
                }}
              >
                <span className="diff-icon">🌱</span>
                <strong>Beginner</strong>
                <small>Freshers & campus placements</small>
              </button>

              <button
                type="button"
                className={difficulty === "Intermediate" ? "difficulty-card selected" : "difficulty-card"}
                onClick={() => {
                  setDifficulty("Intermediate");
                  setFormError("");
                }}
              >
                <span className="diff-icon">🚀</span>
                <strong>Intermediate</strong>
                <small>Core concepts & real projects</small>
              </button>

              <button
                type="button"
                className={difficulty === "Advanced" ? "difficulty-card selected" : "difficulty-card"}
                onClick={() => {
                  setDifficulty("Advanced");
                  setFormError("");
                }}
              >
                <span className="diff-icon">🔥</span>
                <strong>Advanced</strong>
                <small>System design & edge cases</small>
              </button>
            </div>
          </div>

          {/* HARDWARE PRE-CHECK: MICROPHONE TEST */}
          <div className="setup-mic-card">
            <div className="mic-check-header">
              <div className="mic-check-title">
                <Mic size={18} className="mic-icon-blue" />
                <div>
                  <strong>Microphone & Audio Check</strong>
                  <span>Ensure your voice is clear and audible before starting</span>
                </div>
              </div>

              {!isTestingMic ? (
                <button type="button" className="test-mic-btn" onClick={startMicTest}>
                  <Volume2 size={16} />
                  Test Microphone
                </button>
              ) : (
                <button type="button" className="stop-mic-btn" onClick={stopMicTest}>
                  <MicOff size={16} />
                  Stop Test
                </button>
              )}
            </div>

            {isTestingMic && (
              <div className="mic-live-meter-container">
                <div className="mic-meter-bar-track">
                  <div
                    className="mic-meter-bar-fill"
                    style={{
                      width: `${Math.max(8, micLevel)}%`,
                      backgroundColor: micLevel > 20 ? "#10b981" : "#3b82f6"
                    }}
                  ></div>
                </div>
                <div className="mic-meter-meta">
                  <span className="mic-live-badge">
                    <span className="pulse-green-dot"></span> Listening to your microphone
                  </span>
                  <span className="mic-percent">Volume: {micLevel}%</span>
                </div>
              </div>
            )}

            {micStatus === "success" && (
              <div className="mic-success-message">
                <CheckCircle2 size={15} />
                <span>Microphone access verified! Speak naturally during your answers.</span>
              </div>
            )}

            {micStatus === "error" && (
              <div className="mic-error-message">
                <AlertCircle size={15} />
                <span>{micErrorMessage}</span>
              </div>
            )}
          </div>

          {/* INSTRUCTIONS & STUDENT TIPS */}
          <div className="setup-guidance-box">
            <h4>
              <HelpCircle size={16} />
              Tips for a Successful Practice Session
            </h4>
            <ul>
              <li>
                <strong>Quiet Room:</strong> Please practice in a quiet environment without background voices or continuous noise.
              </li>
              <li>
                <strong>Structure Your Answers:</strong> Follow the <em>Definition → Mechanism → Example</em> pattern for technical questions.
              </li>
              <li>
                <strong>Time Limits:</strong> You have up to 2 minutes per question. Click <em>Stop Answer</em> as soon as you finish speaking.
              </li>
              <li>
                <strong>Honest Answers:</strong> If you do not recall a topic, saying "I don't know" is scored honestly, and you will receive a full model answer and revision guide.
              </li>
            </ul>
          </div>

          {/* START BUTTON */}
          <button className="setup-start-btn" onClick={startInterview}>
            <span>Start AI Interview</span>
            <ArrowRight size={18} />
          </button>

          <div className="setup-security">
            <ShieldCheck size={14} />
            <span>Your interview session is completely private, local, and proctored securely.</span>
          </div>
        </div>

        {/* VALUE PILLARS BELOW */}
        <div className="setup-features">
          <div>
            <span>🤖</span>
            <strong>Evidence-Based Evaluation</strong>
            <small>Transcribed via Faster-Whisper & evaluated strictly on facts.</small>
          </div>

          <div>
            <span>💡</span>
            <strong>Constructive Mentorship</strong>
            <small>Encouraging feedback, actionable next steps, and complete model answers.</small>
          </div>

          <div>
            <span>📈</span>
            <strong>Campus Placement Ready</strong>
            <small>Pinpoint knowledge gaps and prepare with confidence.</small>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InterviewSetup;