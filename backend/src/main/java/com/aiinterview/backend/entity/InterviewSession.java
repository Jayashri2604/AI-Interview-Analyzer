package com.aiinterview.backend.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "interview_sessions")
public class InterviewSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String sessionId;

    @Column(nullable = false)
    private String role;

    @Column(name = "interview_type")
    private String interviewType;

    private String difficulty;

    private int totalQuestions;

    private int completedQuestions;

    private int overallScore;

    private int relevanceScore;

    private int technicalScore;

    private int completenessScore;

    private int communicationScore;

    private int speakingSpeedWPM;

    private double totalDurationSeconds;

    private String performanceTitle;

    @Column(columnDefinition = "TEXT")
    private String executiveSummary;

    @Column(name = "result_json", columnDefinition = "LONGTEXT")
    private String resultJson;

    @Column(name = "user_email")
    private String userEmail;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "completed_at", nullable = false)
    private LocalDateTime completedAt;

    public InterviewSession() {
        this.completedAt = LocalDateTime.now();
    }

    public InterviewSession(String sessionId, String role, String interviewType, String difficulty,
                            int totalQuestions, int completedQuestions, int overallScore,
                            int relevanceScore, int technicalScore, int completenessScore,
                            int communicationScore, int speakingSpeedWPM, double totalDurationSeconds,
                            String performanceTitle, String executiveSummary, String resultJson) {
        this.sessionId = sessionId;
        this.role = role;
        this.interviewType = interviewType;
        this.difficulty = difficulty;
        this.totalQuestions = totalQuestions;
        this.completedQuestions = completedQuestions;
        this.overallScore = overallScore;
        this.relevanceScore = relevanceScore;
        this.technicalScore = technicalScore;
        this.completenessScore = completenessScore;
        this.communicationScore = communicationScore;
        this.speakingSpeedWPM = speakingSpeedWPM;
        this.totalDurationSeconds = totalDurationSeconds;
        this.performanceTitle = performanceTitle;
        this.executiveSummary = executiveSummary;
        this.resultJson = resultJson;
        this.completedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getInterviewType() {
        return interviewType;
    }

    public void setInterviewType(String interviewType) {
        this.interviewType = interviewType;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }

    public int getTotalQuestions() {
        return totalQuestions;
    }

    public void setTotalQuestions(int totalQuestions) {
        this.totalQuestions = totalQuestions;
    }

    public int getCompletedQuestions() {
        return completedQuestions;
    }

    public void setCompletedQuestions(int completedQuestions) {
        this.completedQuestions = completedQuestions;
    }

    public int getOverallScore() {
        return overallScore;
    }

    public void setOverallScore(int overallScore) {
        this.overallScore = overallScore;
    }

    public int getRelevanceScore() {
        return relevanceScore;
    }

    public void setRelevanceScore(int relevanceScore) {
        this.relevanceScore = relevanceScore;
    }

    public int getTechnicalScore() {
        return technicalScore;
    }

    public void setTechnicalScore(int technicalScore) {
        this.technicalScore = technicalScore;
    }

    public int getCompletenessScore() {
        return completenessScore;
    }

    public void setCompletenessScore(int completenessScore) {
        this.completenessScore = completenessScore;
    }

    public int getCommunicationScore() {
        return communicationScore;
    }

    public void setCommunicationScore(int communicationScore) {
        this.communicationScore = communicationScore;
    }

    public int getSpeakingSpeedWPM() {
        return speakingSpeedWPM;
    }

    public void setSpeakingSpeedWPM(int speakingSpeedWPM) {
        this.speakingSpeedWPM = speakingSpeedWPM;
    }

    public double getTotalDurationSeconds() {
        return totalDurationSeconds;
    }

    public void setTotalDurationSeconds(double totalDurationSeconds) {
        this.totalDurationSeconds = totalDurationSeconds;
    }

    public String getPerformanceTitle() {
        return performanceTitle;
    }

    public void setPerformanceTitle(String performanceTitle) {
        this.performanceTitle = performanceTitle;
    }

    public String getExecutiveSummary() {
        return executiveSummary;
    }

    public void setExecutiveSummary(String executiveSummary) {
        this.executiveSummary = executiveSummary;
    }

    public String getResultJson() {
        return resultJson;
    }

    public void setResultJson(String resultJson) {
        this.resultJson = resultJson;
    }

    public LocalDateTime getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(LocalDateTime completedAt) {
        this.completedAt = completedAt;
    }

    public String getUserEmail() {
        return userEmail;
    }

    public void setUserEmail(String userEmail) {
        this.userEmail = userEmail;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }
}
