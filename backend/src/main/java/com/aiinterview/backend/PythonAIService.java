package com.aiinterview.backend;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

@Service
public class PythonAIService {

    private final WebClient webClient;

    public PythonAIService() {
        this.webClient = WebClient.builder()
                .baseUrl("http://127.0.0.1:8000")
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }

    public Map<String, Object> analyzeAnswer(
            MultipartFile file,
            String sessionId,
            int questionNumber,
            String question,
            String role,
            String difficulty
    ) throws IOException {

        ByteArrayResource fileResource =
                new ByteArrayResource(file.getBytes()) {

                    @Override
                    public String getFilename() {
                        return file.getOriginalFilename();
                    }
                };

        MultiValueMap<String, Object> body =
                new LinkedMultiValueMap<>();

        body.add("file", fileResource);
        body.add("sessionId", sessionId);
        body.add("questionNumber",
                String.valueOf(questionNumber));
        body.add("question", question);
        body.add("role", role);
        body.add("difficulty", difficulty);

        return webClient.post()
                .uri("/analyze")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(BodyInserters.fromMultipartData(body))
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(120))
                .block();
    }

    public Map<String, Object> synthesizeSession(Map<String, Object> sessionData) {
        return webClient.post()
                .uri("/synthesize-session")
                .contentType(MediaType.APPLICATION_JSON)
                .body(BodyInserters.fromValue(sessionData))
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(120))
                .block();
    }
}