package com.aiinterview.backend.repository;

import com.aiinterview.backend.entity.InterviewViolation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface InterviewViolationRepository extends JpaRepository<InterviewViolation, Long> {
    List<InterviewViolation> findBySessionId(String sessionId);
}
