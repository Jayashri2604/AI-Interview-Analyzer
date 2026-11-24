import {
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  VolumeX,
  Users,
  Smartphone,
  Info,
  ChevronRight,
  Clock,
  Sparkles,
  Ban,
  UserX
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./Terminated.css";

function Terminated() {
  const navigate = useNavigate();

  const terminationData = useMemo(() => {
    try {
      const saved = localStorage.getItem("interviewTerminated");
      if (!saved) return null;
      return JSON.parse(saved);
    } catch (error) {
      console.error("Unable to read termination data:", error);
      return null;
    }
  }, []);

  const data = terminationData || {
    violationType: "MULTIPLE_VOICES",
    warningMessage:
      "Warning: Multiple voices or excessive background noise detected. Please ensure you are alone and in a quiet environment.",
    questionNumber: 1,
    timestamp: new Date().toISOString(),
    metrics: {
      estimatedSpeakers: 2,
      snrDb: 18.0,
      backgroundNoiseLevel: 0.05
    },
    role: "Software Developer",
    isBlocked: false
  };

  const isMultipleSpeakers = data.violationType === "MULTIPLE_VOICES";
  const isMultiplePeopleCamera = data.violationType === "CAMERA_MULTIPLE_PEOPLE";
  const isNoPersonCamera = data.violationType === "CAMERA_NO_PERSON";
  const isMobileDeviceCamera = data.violationType === "CAMERA_MOBILE_DEVICE";
  const isNoise = data.violationType === "BACKGROUND_NOISE";
  const isBlocked = Boolean(data.isBlocked);

  const getViolationBadgeInfo = () => {
    if (isMultiplePeopleCamera) {
      return {
        icon: <Users size={15} />,
        label: "MULTIPLE PERSONS IN CAMERA FEED"
      };
    }
    if (isNoPersonCamera) {
      return {
        icon: <UserX size={15} />,
        label: "NO PERSON DETECTED IN CAMERA FEED"
      };
    }
    if (isMobileDeviceCamera) {
      return {
        icon: <Smartphone size={15} />,
        label: "UNAUTHORIZED MOBILE DEVICE DETECTED"
      };
    }
    if (isMultipleSpeakers) {
      return {
        icon: <Users size={15} />,
        label: "MULTIPLE VOICES DETECTED"
      };
    }
    return {
      icon: <VolumeX size={15} />,
      label: "EXCESSIVE BACKGROUND NOISE"
    };
  };

  const badgeInfo = getViolationBadgeInfo();

  const handleRetake = () => {
    localStorage.removeItem("interviewTerminated");
    localStorage.removeItem("interviewAnswers");
    localStorage.removeItem("interviewResult");
    localStorage.removeItem("interviewAIAnalyses");
    navigate("/setup");
  };

  const handleHome = () => {
    navigate("/");
  };

  return (
    <div className="terminated-page">
      {/* TOPBAR */}
      <header className="terminated-header">
        <div className="terminated-brand">
          <div className="terminated-brand-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <strong>AI Interview Analyzer</strong>
            <span>Proctoring & Integrity Enforcement</span>
          </div>
        </div>

        <div className="terminated-status-badge">
          <span className="red-pulse-dot"></span>
          {isBlocked ? "Candidate Blocked / Removed" : "Session Terminated"}
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="terminated-main">
        <div className="terminated-card">
          {/* HEADER ICON */}
          <div className="terminated-icon-wrapper">
            <div className={`terminated-icon-circle ${isBlocked ? "circle-blocked" : ""}`}>
              {isBlocked ? <Ban size={44} /> : <ShieldAlert size={44} />}
            </div>
          </div>

          <span className={`violation-tag ${isBlocked ? "tag-blocked" : ""}`}>
            {badgeInfo.icon}
            {badgeInfo.label}
          </span>

          <h1>{isBlocked ? "Candidate Disqualified & Removed" : "Interview Terminated"}</h1>

          {/* WARNING / BLOCKED BANNER */}
          <div className={`warning-banner ${isBlocked ? "banner-blocked" : ""}`}>
            <AlertTriangle size={22} className="warning-icon" />
            <div>
              <strong>
                {isBlocked
                  ? "Disqualification Due to Repeated Violations:"
                  : "Proctoring Integrity Violation:"}
              </strong>
              <p>
                {data.warningMessage ||
                  "A proctoring rule was violated repeatedly. The candidate has been removed from this interview session."}
              </p>
            </div>
          </div>

          {/* DETAILS GRID */}
          <div className="termination-details-grid">
            <div className="detail-item">
              <span className="detail-label">VIOLATION TYPE</span>
              <strong className="detail-val">
                {isMultiplePeopleCamera && "2+ Persons in Camera Frame (1 Allowed)"}
                {isNoPersonCamera && "No Person in Camera Frame (1 Required)"}
                {isMobileDeviceCamera && "Mobile Phone / Electronic Device"}
                {isMultipleSpeakers && "Multiple Speakers Identified"}
                {isNoise && "Excessive Background Noise"}
                {!isMultiplePeopleCamera && !isNoPersonCamera && !isMobileDeviceCamera && !isMultipleSpeakers && !isNoise && "Integrity Policy Violation"}
              </strong>
            </div>

            <div className="detail-item">
              <span className="detail-label">STRIKES ACCUMULATED</span>
              <strong className="detail-val text-danger">
                {data.strikes ? `${data.strikes} of 3 Strikes` : "Critical Strike"}
              </strong>
            </div>

            <div className="detail-item">
              <span className="detail-label">TIMESTAMP</span>
              <strong className="detail-val">
                {new Date(data.timestamp || Date.now()).toLocaleTimeString()}
              </strong>
            </div>

            <div className="detail-item">
              <span className="detail-label">ACTION TAKEN</span>
              <strong className="detail-val text-danger">
                {isBlocked ? "Candidate Removed & Disqualified" : "Immediate Session Stop"}
              </strong>
            </div>
          </div>

          {/* GUIDELINES BOX */}
          <div className="guidelines-box">
            <div className="guidelines-header">
              <Info size={18} />
              <h4>Interview Environment Rules</h4>
            </div>
            <ul>
              <li>
                <strong>Single Person in Camera Frame:</strong> You must be the only person visible in the camera frame at all times. Secondary individuals will be detected and flagged.
              </li>
              <li>
                <strong>No Mobile Phones or Devices:</strong> Mobile phones, earphones, notes, or smart handheld devices must be put away and kept out of camera view.
              </li>
              <li>
                <strong>Single Voice Policy:</strong> No other individuals may speak, prompt, or converse in the room during the interview.
              </li>
              <li>
                <strong>Eliminate Noise Sources:</strong> Turn off televisions, music, video streams, or loud fans before starting your interview.
              </li>
            </ul>
          </div>

          {/* ACTION BUTTONS */}
          <div className="terminated-actions">
            <button className="retry-session-btn" onClick={handleRetake}>
              <RotateCcw size={17} />
              Start New Practice Session
            </button>

            <button className="home-btn" onClick={handleHome}>
              Back to Home
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="terminated-footer">
        <span>
          <ShieldAlert size={14} />
          Interview Integrity & Quality Assurance
        </span>
        <span>AI Interview Analyzer Proctoring System</span>
      </footer>
    </div>
  );
}

export default Terminated;
