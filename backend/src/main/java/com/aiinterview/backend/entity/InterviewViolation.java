package com.aiinterview.backend.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "interview_violations")
public class InterviewViolation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String sessionId;

    @Column(nullable = false)
    private int questionNumber;

    @Column(nullable = false)
    private String violationType; // MULTIPLE_VOICES, EXCESSIVE_NOISE

    @Column(length = 1000)
    private String warningMessage;

    @Column(name = "is_terminated")
    private boolean terminated;

    private Double snrDb;

    private Double backgroundNoiseLevel;

    private Integer estimatedSpeakers;

    @Column(name = "violation_time", nullable = false)
    private LocalDateTime timestamp;

    public InterviewViolation() {
        this.timestamp = LocalDateTime.now();
    }

    public InterviewViolation(String sessionId, int questionNumber, String violationType, String warningMessage, boolean terminated) {
        this.sessionId = sessionId;
        this.questionNumber = questionNumber;
        this.violationType = violationType;
        this.warningMessage = warningMessage;
        this.terminated = terminated;
        this.timestamp = LocalDateTime.now();
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

    public int getQuestionNumber() {
        return questionNumber;
    }

    public void setQuestionNumber(int questionNumber) {
        this.questionNumber = questionNumber;
    }

    public String getViolationType() {
        return violationType;
    }

    public void setViolationType(String violationType) {
        this.violationType = violationType;
    }

    public String getWarningMessage() {
        return warningMessage;
    }

    public void setWarningMessage(String warningMessage) {
        this.warningMessage = warningMessage;
    }

    public boolean isTerminated() {
        return terminated;
    }

    public void setTerminated(boolean terminated) {
        this.terminated = terminated;
    }

    public Double getSnrDb() {
        return snrDb;
    }

    public void setSnrDb(Double snrDb) {
        this.snrDb = snrDb;
    }

    public Double getBackgroundNoiseLevel() {
        return backgroundNoiseLevel;
    }

    public void setBackgroundNoiseLevel(Double backgroundNoiseLevel) {
        this.backgroundNoiseLevel = backgroundNoiseLevel;
    }

    public Integer getEstimatedSpeakers() {
        return estimatedSpeakers;
    }

    public void setEstimatedSpeakers(Integer estimatedSpeakers) {
        this.estimatedSpeakers = estimatedSpeakers;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }
}
