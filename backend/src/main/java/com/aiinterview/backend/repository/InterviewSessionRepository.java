package com.aiinterview.backend.repository;

import com.aiinterview.backend.entity.InterviewSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InterviewSessionRepository extends JpaRepository<InterviewSession, Long> {

    Optional<InterviewSession> findBySessionId(String sessionId);

    List<InterviewSession> findAllByOrderByCompletedAtDesc();

    List<InterviewSession> findByUserEmailOrderByCompletedAtDesc(String userEmail);

    List<InterviewSession> findByUserIdOrderByCompletedAtDesc(Long userId);
}
