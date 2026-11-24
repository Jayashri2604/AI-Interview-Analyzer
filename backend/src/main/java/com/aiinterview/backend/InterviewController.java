package com.aiinterview.backend;

import com.aiinterview.backend.entity.InterviewViolation;
import com.aiinterview.backend.repository.InterviewViolationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.aiinterview.backend.entity.InterviewSession;
import com.aiinterview.backend.repository.InterviewSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/interview")
@CrossOrigin(origins = {"http://localhost:5173", "http://localhost:5174"})
public class InterviewController {

    private final PythonAIService pythonAIService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired(required = false)
    private InterviewViolationRepository violationRepository;

    @Autowired(required = false)
    private InterviewSessionRepository sessionRepository;

    public InterviewController(PythonAIService pythonAIService) {
        this.pythonAIService = pythonAIService;
    }

    @GetMapping("/health")
    public String healthCheck() {
        return "AI Interview Analyzer Backend is running successfully!";
    }

    @PostMapping(
            value = "/analyze",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public Map<String, Object> analyzeAnswer(
            @RequestParam("file") MultipartFile file,
            @RequestParam("sessionId") String sessionId,
            @RequestParam("questionNumber") int questionNumber,
            @RequestParam("question") String question,
            @RequestParam("role") String role,
            @RequestParam("difficulty") String difficulty
    ) {

        Map<String, Object> response = new HashMap<>();

        if (file.isEmpty()) {
            response.put("success", false);
            response.put("message", "No video/audio file received.");
            return response;
        }

        try {

            Map<String, Object> pythonResponse =
                    pythonAIService.analyzeAnswer(
                            file,
                            sessionId,
                            questionNumber,
                            question,
                            role,
                            difficulty
                    );

            String analysisId = UUID.randomUUID().toString();

            response.put("success", true);
            response.put(
                    "message",
                    "Answer analyzed successfully by Python AI service."
            );

            response.put("analysisId", analysisId);
            response.put("sessionId", sessionId);
            response.put("questionNumber", questionNumber);
            response.put("question", question);
            response.put("role", role);
            response.put("difficulty", difficulty);
            response.put("fileName", file.getOriginalFilename());
            response.put("fileSize", file.getSize());

            response.put("aiAnalysis", pythonResponse);

            // Check and persist acoustic violation if detected
            if (pythonResponse != null && pythonResponse.containsKey("integrity")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> integrity = (Map<String, Object>) pythonResponse.get("integrity");
                if (integrity != null && Boolean.TRUE.equals(integrity.get("violationDetected"))) {
                    response.put("violationDetected", true);
                    response.put("violationType", integrity.get("violationType"));
                    response.put("warningMessage", integrity.get("warningMessage"));
                    response.put("terminateInterview", integrity.get("terminateInterview"));

                    if (violationRepository != null) {
                        try {
                            InterviewViolation v = new InterviewViolation(
                                    sessionId,
                                    questionNumber,
                                    (String) integrity.get("violationType"),
                                    (String) integrity.get("warningMessage"),
                                    Boolean.TRUE.equals(integrity.get("terminateInterview"))
                            );
                            if (integrity.containsKey("metrics")) {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> m = (Map<String, Object>) integrity.get("metrics");
                                if (m != null) {
                                    if (m.get("snrDb") instanceof Number) {
                                        v.setSnrDb(((Number) m.get("snrDb")).doubleValue());
                                    }
                                    if (m.get("backgroundNoiseLevel") instanceof Number) {
                                        v.setBackgroundNoiseLevel(((Number) m.get("backgroundNoiseLevel")).doubleValue());
                                    }
                                    if (m.get("estimatedSpeakers") instanceof Number) {
                                        v.setEstimatedSpeakers(((Number) m.get("estimatedSpeakers")).intValue());
                                    }
                                }
                            }
                            violationRepository.save(v);
                        } catch (Exception dbErr) {
                            System.err.println("Warning: Could not save violation to database: " + dbErr.getMessage());
                        }
                    }
                }
            }

            response.put("status", "ANALYZED");
            response.put("aiAnalysisReady", true);

            return response;

        } catch (IOException e) {

            response.put("success", false);
            response.put("message", "Failed to read uploaded file.");
            response.put("error", e.getMessage());

            return response;

        } catch (Exception e) {

            response.put("success", false);
            response.put(
                    "message",
                    "Python AI service connection failed."
            );
            response.put("error", e.getMessage());

            return response;
        }
    }

    @PostMapping(
            value = "/synthesize-session",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> synthesizeSession(@RequestBody Map<String, Object> sessionData) {
        try {
            return pythonAIService.synthesizeSession(sessionData);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Session synthesis failed: " + e.getMessage());
            return errorResponse;
        }
    }

    @PostMapping(
            value = "/record-violation",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> recordViolation(@RequestBody Map<String, Object> violationData) {
        Map<String, Object> res = new HashMap<>();
        try {
            String sessionId = (String) violationData.getOrDefault("sessionId", "unknown_session");
            int questionNumber = ((Number) violationData.getOrDefault("questionNumber", 1)).intValue();
            String violationType = (String) violationData.getOrDefault("violationType", "UNKNOWN");
            String warningMessage = (String) violationData.getOrDefault("warningMessage", "Acoustic integrity violation");
            boolean terminated = Boolean.TRUE.equals(violationData.getOrDefault("terminateInterview", true));

            if (violationRepository != null) {
                InterviewViolation v = new InterviewViolation(sessionId, questionNumber, violationType, warningMessage, terminated);
                violationRepository.save(v);
            }

            res.put("success", true);
            res.put("message", "Violation logged successfully.");
            return res;
        } catch (Exception e) {
            res.put("success", false);
            res.put("error", e.getMessage());
            return res;
        }
    }

    @GetMapping("/violations/{sessionId}")
    public Map<String, Object> getViolations(@PathVariable String sessionId) {
        Map<String, Object> res = new HashMap<>();
        if (violationRepository != null) {
            try {
                List<InterviewViolation> list = violationRepository.findBySessionId(sessionId);
                res.put("success", true);
                res.put("violations", list);
                return res;
            } catch (Exception e) {
                res.put("success", false);
                res.put("error", e.getMessage());
                return res;
            }
        }
        res.put("success", true);
        res.put("violations", List.of());
        return res;
    }

    @PostMapping(
            value = "/save-session",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> saveSession(@RequestBody Map<String, Object> sessionData) {
        Map<String, Object> res = new HashMap<>();
        try {
            String sessionId = (String) sessionData.getOrDefault("sessionId", "session_" + System.currentTimeMillis());
            String role = (String) sessionData.getOrDefault("role", "Software Developer");
            String interviewType = (String) sessionData.getOrDefault("type", "Mixed");
            String difficulty = (String) sessionData.getOrDefault("difficulty", "Intermediate");

            int totalQuestions = ((Number) sessionData.getOrDefault("totalQuestions", 0)).intValue();
            int completedQuestions = ((Number) sessionData.getOrDefault("completedQuestions", 0)).intValue();
            int overallScore = ((Number) sessionData.getOrDefault("overallScore", 0)).intValue();
            int relevanceScore = ((Number) sessionData.getOrDefault("relevanceScore", 0)).intValue();
            int technicalScore = ((Number) sessionData.getOrDefault("technicalAccuracyScore", 0)).intValue();
            int completenessScore = ((Number) sessionData.getOrDefault("completenessScore", 0)).intValue();
            int communicationScore = ((Number) sessionData.getOrDefault("communicationScore", 0)).intValue();
            int speakingSpeedWPM = ((Number) sessionData.getOrDefault("speakingSpeedWPM", 0)).intValue();
            double totalDuration = ((Number) sessionData.getOrDefault("totalDuration", 0.0)).doubleValue();

            String performanceTitle = (String) sessionData.getOrDefault("performanceTitle", "Interview Assessment");
            String executiveSummary = (String) sessionData.getOrDefault("executiveSummary", "");
            String userEmail = (String) sessionData.get("userEmail");
            Long userId = null;
            if (sessionData.get("userId") instanceof Number) {
                userId = ((Number) sessionData.get("userId")).longValue();
            }

            String resultJson = objectMapper.writeValueAsString(sessionData);

            if (sessionRepository != null) {
                InterviewSession session = sessionRepository.findBySessionId(sessionId).orElse(new InterviewSession());
                session.setSessionId(sessionId);
                session.setRole(role);
                session.setInterviewType(interviewType);
                session.setDifficulty(difficulty);
                session.setTotalQuestions(totalQuestions);
                session.setCompletedQuestions(completedQuestions);
                session.setOverallScore(overallScore);
                session.setRelevanceScore(relevanceScore);
                session.setTechnicalScore(technicalScore);
                session.setCompletenessScore(completenessScore);
                session.setCommunicationScore(communicationScore);
                session.setSpeakingSpeedWPM(speakingSpeedWPM);
                session.setTotalDurationSeconds(totalDuration);
                session.setPerformanceTitle(performanceTitle);
                session.setExecutiveSummary(executiveSummary);
                session.setUserEmail(userEmail);
                session.setUserId(userId);
                session.setResultJson(resultJson);

                sessionRepository.save(session);
            }

            res.put("success", true);
            res.put("sessionId", sessionId);
            res.put("message", "Interview session saved to database successfully.");
            return res;
        } catch (Exception e) {
            System.err.println("Error saving session: " + e.getMessage());
            res.put("success", false);
            res.put("error", e.getMessage());
            return res;
        }
    }

    @GetMapping("/session/{sessionId}")
    public Map<String, Object> getSession(@PathVariable String sessionId) {
        Map<String, Object> res = new HashMap<>();
        if (sessionRepository != null) {
            try {
                return sessionRepository.findBySessionId(sessionId)
                        .map(session -> {
                            try {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> data = objectMapper.readValue(session.getResultJson(), Map.class);
                                res.put("success", true);
                                res.put("session", data);
                                return res;
                            } catch (Exception jsonErr) {
                                res.put("success", true);
                                res.put("sessionId", session.getSessionId());
                                res.put("overallScore", session.getOverallScore());
                                res.put("executiveSummary", session.getExecutiveSummary());
                                return res;
                            }
                        })
                        .orElseGet(() -> {
                            res.put("success", false);
                            res.put("message", "Session not found.");
                            return res;
                        });
            } catch (Exception e) {
                res.put("success", false);
                res.put("error", e.getMessage());
                return res;
            }
        }
        res.put("success", false);
        res.put("message", "Database repository not available.");
        return res;
    }

    @GetMapping("/history")
    public Map<String, Object> getSessionHistory(
            @RequestParam(required = false) String email,
            @RequestParam(required = false) Long userId
    ) {
        Map<String, Object> res = new HashMap<>();
        if (sessionRepository != null) {
            try {
                List<InterviewSession> history;
                if (email != null && !email.trim().isEmpty()) {
                    history = sessionRepository.findByUserEmailOrderByCompletedAtDesc(email.trim());
                } else if (userId != null) {
                    history = sessionRepository.findByUserIdOrderByCompletedAtDesc(userId);
                } else {
                    history = sessionRepository.findAllByOrderByCompletedAtDesc();
                }
                res.put("success", true);
                res.put("history", history);
                return res;
            } catch (Exception e) {
                res.put("success", false);
                res.put("error", e.getMessage());
                return res;
            }
        }
        res.put("success", true);
        res.put("history", List.of());
        return res;
    }

    @DeleteMapping("/session/{sessionId}")
    public Map<String, Object> deleteSession(@PathVariable String sessionId) {
        Map<String, Object> res = new HashMap<>();
        if (sessionRepository != null) {
            try {
                sessionRepository.findBySessionId(sessionId).ifPresent(sessionRepository::delete);
                res.put("success", true);
                res.put("message", "Session record deleted successfully.");
                return res;
            } catch (Exception e) {
                res.put("success", false);
                res.put("error", e.getMessage());
                return res;
            }
        }
        res.put("success", false);
        res.put("message", "Database repository not available.");
        return res;
    }
}