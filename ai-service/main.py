from fastapi import FastAPI, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import subprocess
import os
import wave
import requests
import json
import re
import time
from typing import List, Optional, Dict, Any, Tuple
from faster_whisper import WhisperModel
from audio_integrity import analyze_audio_integrity

# =========================================================
# FASTAPI APP CONFIGURATION
# =========================================================

app = FastAPI(
    title="AI Interview Performance Analyzer - AI Service",
    description="High-accuracy speech-to-text, audio metric analysis, and LLM-powered interview evaluation",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# INITIALIZE FASTER-WHISPER
# =========================================================

print("Loading Faster-Whisper model (base, cpu, int8)...")
try:
    whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
    print("Faster-Whisper initialized successfully!")
except Exception as e:
    print(f"Failed to load Faster-Whisper: {e}")
    whisper_model = None

# =========================================================
# OLLAMA CONFIGURATION
# =========================================================

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_MODEL = "llama3.2:3b"

# =========================================================
# FILLER WORDS & HESITATION PATTERNS
# =========================================================

FILLER_WORDS = [
    r"\bum\b", r"\buh\b", r"\bah\b", r"\ber\b", r"\blike\b",
    r"\byou know\b", r"\bbasically\b", r"\bactually\b", r"\bliterally\b",
    r"\bsort of\b", r"\bkind of\b", r"\bhmm+\b", r"\bso yeah\b"
]

HESITATION_PATTERNS = [
    r"\bi think\b", r"\bmaybe\b", r"\bprobably\b", r"\bnot sure\b",
    r"\bi guess\b", r"\bmight be\b", r"\bcould be\b", r"\bi don't know\b",
    r"\bi dont know\b", r"\bno idea\b", r"\bi cannot remember\b"
]

IDK_PHRASES = [
    "i don't know", "i dont know", "i'm not sure", "im not sure",
    "i have no idea", "no idea", "i do not know", "i cannot recall",
    "i don't remember", "i dont remember", "not really sure", "i have no answer"
]


def detect_speech_patterns(text: str) -> Dict[str, Any]:
    text_lower = text.lower()
    filler_count = 0
    detected_fillers = []
    
    for pattern in FILLER_WORDS:
        matches = re.findall(pattern, text_lower)
        if matches:
            filler_count += len(matches)
            cleaned_word = pattern.replace(r"\b", "").replace("+", "")
            detected_fillers.append(f"{cleaned_word} ({len(matches)})")

    hesitation_count = 0
    for pattern in HESITATION_PATTERNS:
        matches = re.findall(pattern, text_lower)
        hesitation_count += len(matches)

    return {
        "fillerWordsCount": filler_count,
        "detectedFillers": detected_fillers,
        "hesitationMarkersCount": hesitation_count
    }


def classify_question_category(question: str, role: str) -> str:
    q_lower = question.lower()
    if any(k in q_lower for k in [
        "code", "algorithm", "time complexity", "space complexity", "array",
        "binary search", "linked list", "recursion", "dynamic programming", "tree", "graph"
    ]):
        return "Coding"
    elif any(k in q_lower for k in [
        "tell me about yourself", "why should we hire you", "salary", "strengths",
        "weaknesses", "failure", "conflict", "disagreement", "pressure", "deadline",
        "5 years", "career goal", "relocate", "value can you bring"
    ]):
        return "HR / Behavioral"
    elif any(k in q_lower for k in [
        "how would you handle", "what would you do if", "situation", "scenario"
    ]):
        return "Situational"
    else:
        return "Technical"


# =========================================================
# SPEECH-TO-TEXT WITH FASTER-WHISPER
# =========================================================

def transcribe_audio_whisper(wav_path: str) -> Dict[str, Any]:
    print("\n--- FASTER-WHISPER SPEECH-TO-TEXT ---")
    
    if whisper_model is None:
        raise RuntimeError("Whisper model is not loaded.")

    try:
        segments, info = whisper_model.transcribe(
            wav_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=1000),
            language="en"
        )
        
        segment_list = list(segments)
        transcript = " ".join(seg.text.strip() for seg in segment_list).strip()
        
        # Suppress common Whisper hallucinations during silent or near-silent audio
        cleaned_lower = transcript.lower().strip().rstrip("!.,")
        hallucination_phrases = {
            "thank you", "thank you.", "thank you very much", "thank you very much.",
            "thanks for watching", "thanks for watching.", "subtitles by", "bye", "bye bye",
            "you", "the", "subscribe", "please subscribe", "music", "[music]",
            "[applause]", "[silence]"
        }
        if cleaned_lower in hallucination_phrases:
            transcript = ""

        avg_logprob = (
            sum(seg.avg_logprob for seg in segment_list) / len(segment_list)
            if segment_list else -10.0
        )
        
        max_no_speech_prob = (
            max((seg.no_speech_prob for seg in segment_list), default=0.0)
            if segment_list else 1.0
        )
        if max_no_speech_prob > 0.65 and len(transcript.split()) <= 3:
            transcript = ""
        
        # Calculate transcription confidence (0 to 100%)
        # avg_logprob typically ranges from -0.1 (high) to -1.5 (low)
        transcription_confidence = round(max(0.0, min(100.0, (1.0 + (avg_logprob / 2.0)) * 100)), 1)
        
        print(f"Detected language: {info.language} ({info.language_probability:.2f})")
        print(f"Transcript: {transcript if transcript else '[NO SPEECH DETECTED]'}")
        print(f"Segments: {len(segment_list)}, Confidence: {transcription_confidence}%")
        
        return {
            "transcript": transcript,
            "language": info.language,
            "languageProbability": round(info.language_probability, 2),
            "transcriptionConfidence": transcription_confidence,
            "noSpeechProb": round(max_no_speech_prob, 2),
            "hasSpeech": bool(transcript and len(transcript.split()) >= 1)
        }

    except Exception as e:
        print(f"Faster-Whisper transcription error: {e}")
        raise


# =========================================================
# QUESTION-AWARE REFERENCE ANSWERS & REVISION TOPICS
# =========================================================

def get_question_evaluation_context(question: str, role: str = "Software Developer", difficulty: str = "Intermediate") -> Dict[str, Any]:
    """
    Returns rich evaluation context for an interview question:
    - expectedKeyConcepts: Core ideas expected in a competent answer
    - benchmarkAnswer: Exemplary model answer
    - revisionTopics: Key study areas
    - idealAnswerKeyPoints: Structural points for an ideal response
    """
    q_lower = question.lower()

    if "polymorphism" in q_lower:
        return {
            "expectedKeyConcepts": [
                "Ability of an entity or object to take multiple forms",
                "Compile-time polymorphism via method overloading (same method name, different parameter signature)",
                "Runtime polymorphism via method overriding (subclass redefines superclass method)",
                "Dynamic method dispatch resolved at runtime based on the actual object instance"
            ],
            "conceptKeywords": [
                ["multiple", "forms", "many"],
                ["overload", "overloading", "compile"],
                ["override", "overriding", "runtime", "subclass"],
                ["dynamic", "dispatch", "jvm", "instance"]
            ],
            "benchmarkAnswer": (
                "Polymorphism is an object-oriented programming principle that allows an entity to take multiple forms. "
                "In languages like Java, it occurs in two forms: compile-time polymorphism (achieved via method overloading, "
                "where methods share the same name with different parameters) and runtime polymorphism (achieved via method "
                "overriding, where a subclass redefines a parent class method). At runtime, the JVM uses dynamic method dispatch "
                "to resolve the call based on the actual object instance, allowing extensible, decoupled code."
            ),
            "revisionTopics": ["Compile-time vs Runtime Polymorphism", "Method Overriding vs Overloading", "Dynamic Method Dispatch"],
            "idealAnswerKeyPoints": [
                "Definition: Ability of an object or method to take multiple forms",
                "Compile-time: Method overloading (same name, different arguments)",
                "Runtime: Method overriding (subclass overrides superclass method)",
                "Runtime resolution: Dynamic method dispatch in JVM"
            ]
        }
    elif "inheritance" in q_lower:
        return {
            "expectedKeyConcepts": [
                "Child class derives state and behavior from a parent class ('extends' keyword in Java)",
                "Establishes an 'IS-A' relationship between classes",
                "Promotes code reusability and hierarchical classification",
                "Method overriding and use of 'super' to invoke parent constructors or methods"
            ],
            "conceptKeywords": [
                ["child", "parent", "subclass", "superclass", "base", "derive"],
                ["is-a", "isa", "relationship"],
                ["reuse", "reusability", "reusable", "sharing"],
                ["extends", "super", "inherit"]
            ],
            "benchmarkAnswer": (
                "Inheritance is a fundamental OOP principle where a child class derives attributes and methods from a parent "
                "class using the 'extends' keyword. It facilitates code reusability and establishes an 'IS-A' relationship. "
                "For example, a 'SavingsAccount' class can inherit common fields like 'accountNumber' and 'balance' from an 'Account' class."
            ),
            "revisionTopics": ["Class Inheritance & Interfaces", "Super Keyword & Constructors", "Liskov Substitution Principle"],
            "idealAnswerKeyPoints": [
                "Core Definition: Child class inherits properties/methods from parent",
                "Code reusability and 'IS-A' relationship",
                "Keyword 'extends' and constructor chaining with 'super'"
            ]
        }
    elif "encapsulation" in q_lower:
        return {
            "expectedKeyConcepts": [
                "Bundling data fields and methods operating on that data into a single class unit",
                "Restricting direct external access to internal state using private access modifiers",
                "Providing public getter and setter methods for controlled read/write access",
                "Information hiding, data integrity, and validation"
            ],
            "conceptKeywords": [
                ["bundle", "bundling", "wrap", "wrapping", "single", "unit"],
                ["private", "hide", "hiding", "restrict", "access"],
                ["getter", "getters", "setter", "setters"],
                ["integrity", "validation", "protect", "protection"]
            ],
            "benchmarkAnswer": (
                "Encapsulation is the bundling of data and the methods that operate on that data into a single unit (class), "
                "while restricting direct access to the internal state using private access modifiers and providing public getters and setters. "
                "This ensures data integrity, validation, and information hiding."
            ),
            "revisionTopics": ["Access Modifiers (private/protected/public)", "Getters, Setters & Data Validation", "Information Hiding Principles"],
            "idealAnswerKeyPoints": [
                "Bundling variables and methods into a single class",
                "Private data members with public getters/setters",
                "Information hiding and data protection"
            ]
        }
    elif "abstraction" in q_lower:
        return {
            "expectedKeyConcepts": [
                "Hiding internal implementation details and showing only essential features to the user",
                "Implemented using abstract classes (can have partial implementation) and interfaces (full contract)",
                "Reduces complexity and allows loose coupling in system design"
            ],
            "conceptKeywords": [
                ["hide", "hiding", "internal", "complexity", "implementation", "essential"],
                ["abstract", "interface", "interfaces"],
                ["contract", "coupling", "design"]
            ],
            "benchmarkAnswer": (
                "Abstraction is an OOP principle that focuses on hiding internal implementation complexity while exposing only essential features. "
                "In Java, abstraction is achieved via abstract classes (which can contain both abstract and concrete methods) and interfaces "
                "(which define pure contracts). It enables developers to design scalable systems by programming to interfaces rather than concrete implementations."
            ),
            "revisionTopics": ["Abstract Classes vs Interfaces", "Programming to Interfaces", "Separation of Concerns"],
            "idealAnswerKeyPoints": [
                "Hiding implementation complexity, showing essential functionality",
                "Achieved via abstract classes and interfaces",
                "Reduces system coupling and enhances maintainability"
            ]
        }
    elif "rest" in q_lower or "api" in q_lower:
        return {
            "expectedKeyConcepts": [
                "Architectural style for web services communicating over HTTP protocol",
                "Standard HTTP methods: GET (retrieve), POST (create), PUT/PATCH (update), DELETE (remove)",
                "Statelessness: every request contains all context needed by the server; no session state stored between requests",
                "Exchanges data typically in JSON format with standard HTTP status codes (200 OK, 201 Created, 400 Bad Request, 404 Not Found, 500 Error)"
            ],
            "conceptKeywords": [
                ["http", "protocol", "architecture", "web", "service"],
                ["get", "post", "put", "delete", "patch", "method"],
                ["stateless", "statelessness", "session"],
                ["json", "jason", "xml", "status", "codes", "200", "404"]
            ],
            "benchmarkAnswer": (
                "A REST API (Representational State Transfer) is an architectural style for network-based web services. "
                "It operates over HTTP using standard methods: GET to retrieve data, POST to create resources, PUT/PATCH to update resources, "
                "and DELETE to remove them. It enforces statelessness—meaning every request contains all the information needed by the server—and "
                "exchanges data typically formatted in JSON with standardized HTTP status codes (such as 200 OK, 201 Created, 404 Not Found)."
            ),
            "revisionTopics": ["HTTP Methods (GET, POST, PUT, DELETE)", "Idempotency & Status Codes", "REST Statelessness & JSON Serialization"],
            "idealAnswerKeyPoints": [
                "Architectural style using HTTP protocols and standard methods",
                "Stateless communication between client and server",
                "JSON resource representation with standard HTTP status codes"
            ]
        }
    elif "dependency injection" in q_lower or "inversion of control" in q_lower or "ioc" in q_lower:
        return {
            "expectedKeyConcepts": [
                "Design pattern implementing Inversion of Control (IoC)",
                "Objects receive their dependencies from an external assembler rather than creating them directly with 'new'",
                "Spring IoC container manages bean creation, configuration, and lifecycles",
                "Injected via constructor injection (recommended), setter injection, or field injection (@Autowired)",
                "Benefits: loose coupling, easier unit testing with mock dependencies, modular architecture"
            ],
            "conceptKeywords": [
                ["inversion", "control", "ioc", "pattern"],
                ["external", "supply", "assembler", "provide", "inject", "new"],
                ["spring", "container", "lifecycle", "manage"],
                ["constructor", "setter", "autowired", "field"],
                ["loose", "coupling", "testing", "testability", "mock"]
            ],
            "benchmarkAnswer": (
                "Dependency Injection (DI) is a design pattern that implements Inversion of Control (IoC), where an object receives its dependencies "
                "from an external assembler rather than instantiating them itself. In Spring Boot, the Spring IoC container manages bean lifecycles "
                "and automatically injects dependencies via constructor, setter, or field injection (using @Autowired), significantly improving decoupling and testability."
            ),
            "revisionTopics": ["Spring Inversion of Control (IoC)", "Constructor vs Field Injection", "Spring Bean Scopes & Lifecycle"],
            "idealAnswerKeyPoints": [
                "IoC principle: external container supplies dependencies",
                "Injection types: Constructor, Setter, Field (@Autowired)",
                "Benefits: Loose coupling, enhanced testability, modularity"
            ]
        }
    elif "react" in q_lower and ("hook" in q_lower or "state" in q_lower or "usememo" in q_lower or "usecallback" in q_lower):
        return {
            "expectedKeyConcepts": [
                "State is dynamic/mutable component data that triggers re-rendering when updated",
                "useState declares state variables in functional components",
                "useEffect manages component side effects (API calls, subscriptions, DOM updates) with dependency arrays",
                "useMemo memoizes expensive computation results; useCallback memoizes callback function references to avoid child re-renders"
            ],
            "conceptKeywords": [
                ["dynamic", "mutable", "data", "render", "re-render", "rerender"],
                ["usestate", "state"],
                ["useeffect", "effect", "side", "lifecycle"],
                ["usememo", "usecallback", "memo", "memoize", "optimization"]
            ],
            "benchmarkAnswer": (
                "In React, state represents dynamic data that changes over time and triggers component re-renders when updated. "
                "Functional components use Hooks like `useState` to declare state variables and `useEffect` to manage side effects like API fetching. "
                "Performance optimization hooks include `useMemo` (memoizing expensive calculation values) and `useCallback` (memoizing function definitions between renders)."
            ),
            "revisionTopics": ["React Component Lifecycle & Hooks", "useMemo vs useCallback Optimization", "State Management & Re-render Triggers"],
            "idealAnswerKeyPoints": [
                "State definition and how updates trigger re-renders",
                "useState for local state and useEffect for lifecycle side-effects",
                "useMemo and useCallback for render optimization"
            ]
        }
    elif "virtual dom" in q_lower or "re-render" in q_lower:
        return {
            "expectedKeyConcepts": [
                "In-memory lightweight JavaScript representation of the actual DOM tree",
                "When state or props change, React generates a new Virtual DOM tree",
                "Diffing / reconciliation algorithm compares new Virtual DOM with previous snapshot",
                "Computes minimal set of changes and batches updates to the real browser DOM for performance"
            ],
            "conceptKeywords": [
                ["memory", "representation", "copy", "tree", "lightweight"],
                ["diff", "diffing", "reconciliation", "snapshot", "compare"],
                ["batch", "real", "update", "performance", "dom"]
            ],
            "benchmarkAnswer": (
                "The Virtual DOM is a lightweight, in-memory JavaScript representation of the real DOM. "
                "When component state or props change, React creates a new Virtual DOM tree and runs a diffing algorithm (reconciliation) "
                "to compare it with the previous snapshot. It calculates the minimal set of changes needed and batches updates to the real DOM, "
                "avoiding expensive layout recalculations and repaints."
            ),
            "revisionTopics": ["Virtual DOM & Reconciliation", "Diffing Algorithm Mechanics", "React Fiber & Batch Updates"],
            "idealAnswerKeyPoints": [
                "Lightweight in-memory copy of real DOM",
                "Diffing algorithm compares previous and current states",
                "Batch updates real DOM only where changes occurred"
            ]
        }
    elif "database" in q_lower or "sql" in q_lower or "nosql" in q_lower or "index" in q_lower:
        return {
            "expectedKeyConcepts": [
                "Relational databases (SQL) use structured schema, tables, ACID transactions, and foreign keys",
                "NoSQL databases provide schema flexibility, horizontal scalability, and document/key-value storage",
                "Indexing (e.g. B-Trees) accelerates search queries (WHERE clauses) at the cost of storage and write performance",
                "ACID properties: Atomicity, Consistency, Isolation, Durability"
            ],
            "conceptKeywords": [
                ["relational", "sql", "table", "tables", "schema", "nosql"],
                ["acid", "atomicity", "consistency", "isolation", "durability"],
                ["index", "indexing", "btree", "b-tree", "scan", "where", "search"]
            ],
            "benchmarkAnswer": (
                "Relational databases (SQL like PostgreSQL, MySQL) store data in structured tables with predefined schemas and enforce ACID transactions "
                "and foreign-key constraints. NoSQL databases (like MongoDB, Redis) are schema-flexible and optimized for horizontal scaling and document lookups. "
                "Indexes (such as B-Tree indexes) speed up SELECT queries by avoiding full table scans, with a slight trade-off in INSERT and UPDATE overhead."
            ),
            "revisionTopics": ["ACID Properties & Transactions", "Database Indexing & Query Execution Plans", "SQL vs NoSQL Architectural Trade-offs"],
            "idealAnswerKeyPoints": [
                "SQL structured tables vs NoSQL schema flexibility",
                "ACID guarantees for data integrity",
                "Indexing mechanism: trade-off between fast reads and write overhead"
            ]
        }
    elif "activity" in q_lower and "lifecycle" in q_lower:
        return {
            "expectedKeyConcepts": [
                "Activity lifecycle stages: onCreate, onStart, onResume, onPause, onStop, onDestroy, onRestart",
                "onCreate: activity initialized, layout set with setContentView",
                "onResume: activity visible in foreground and interactive with user",
                "onPause / onStop: activity partially or fully obscured, release transient resources or save state",
                "onDestroy: activity teardown"
            ],
            "conceptKeywords": [
                ["oncreate", "initialize", "layout"],
                ["onstart", "onresume", "visible", "foreground", "interact"],
                ["onpause", "onstop", "background", "pause", "release", "save"],
                ["ondestroy", "destroy", "teardown", "finish"]
            ],
            "benchmarkAnswer": (
                "The Android Activity Lifecycle manages how an activity transitions through different operational states. "
                "It starts with `onCreate` where UI components are initialized, followed by `onStart` when the activity becomes visible, "
                "and `onResume` when it enters the foreground for user interaction. When the user navigates away, `onPause` and `onStop` trigger "
                "to halt animations, pause hardware listeners, and persist state, concluding with `onDestroy` when the activity is finished or destroyed by the OS."
            ),
            "revisionTopics": ["Android Activity Lifecycle Stages", "State Restoration & Bundle Management", "Configuration Changes (Screen Rotation)"],
            "idealAnswerKeyPoints": [
                "Key lifecycle stages (onCreate, onResume, onPause, onStop, onDestroy)",
                "Foreground vs background state management",
                "Resource cleanup and state preservation"
            ]
        }
    elif "tell me about yourself" in q_lower:
        return {
            "expectedKeyConcepts": [
                f"Professional summary highlighting education, background, and specialization in {role}",
                "Key technical competencies, languages, and project accomplishments",
                "Problem-solving enthusiasm, teamwork experience, and motivation for the role"
            ],
            "conceptKeywords": [
                ["developer", "software", "engineer", "background", "specializ"],
                ["project", "projects", "built", "skills", "technolog"],
                ["learn", "team", "contribute", "problem", "solve"]
            ],
            "benchmarkAnswer": (
                f"I am a software developer specializing in {role}. In my academic and project work, "
                "I have designed and implemented full-stack applications with clean architecture, database integration, and responsive user interfaces. "
                "I enjoy solving algorithmic challenges and writing maintainable code, and I am excited to apply my skills, learn from senior engineers, "
                "and contribute to impactful features on your engineering team."
            ),
            "revisionTopics": ["STAR Method (Situation, Task, Action, Result)", "Elevator Pitch Structuring", "Highlighting Technical Impact"],
            "idealAnswerKeyPoints": [
                "Succinct background and technical specialization",
                "Key practical project highlights and technologies used",
                "Enthusiasm and alignment with the target engineering role"
            ]
        }
    elif "why should we hire you" in q_lower:
        return {
            "expectedKeyConcepts": [
                f"Alignment of technical skills with the {role} requirements",
                "Demonstrated learning agility, discipline, and practical project track record",
                "Strong work ethic, collaboration mindset, and commitment to quality"
            ],
            "conceptKeywords": [
                ["skills", "fit", "match", "qualifications", "role"],
                ["learn", "quickly", "adapt", "problem", "discipline"],
                ["contribute", "value", "team", "collaborate", "ownership"]
            ],
            "benchmarkAnswer": (
                f"You should hire me because I combine solid technical foundations in {role} with a proactive learning mindset and disciplined problem-solving. "
                "In my projects, I've proven that I can translate requirements into functional code, debug complex issues, and collaborate smoothly in teams. "
                "I am ready to ramp up quickly and contribute enthusiastically to your upcoming milestones."
            ),
            "revisionTopics": ["Value Proposition Alignment", "Technical Strengths Highlighting", "Professional Communication"],
            "idealAnswerKeyPoints": [
                "Strong technical alignment with role requirements",
                "Evidence of past problem-solving and rapid learning",
                "Collaborative mindset and proactive ownership"
            ]
        }
    else:
        words = [w.capitalize() for w in re.findall(r"\w+", question) if len(w) > 3 and w.lower() not in {"what", "how", "explain", "does", "your", "when", "which", "describe"}]
        topic_name = " ".join(words[:2]) if words else "Core Technical Concept"
        return {
            "expectedKeyConcepts": [
                f"Clear definition and primary purpose of '{question}'",
                f"Underlying technical mechanisms, workflow, or implementation in {role}",
                "Practical advantages, trade-offs, or real-world production use cases"
            ],
            "conceptKeywords": [
                [w.lower() for w in words[:3]] if words else ["definition", "purpose"],
                ["mechanism", "workflow", "implementation", "works", "process"],
                ["advantage", "benefit", "use", "example", "production", "tradeoff"]
            ],
            "benchmarkAnswer": (
                f"To answer this question effectively: Begin by clearly defining the core concept of '{question}'. "
                "Next, explain how it operates under the hood, how components interact, or the relevant workflow. "
                f"Finally, illustrate with a concrete, real-world example or use case relevant to a {role} at the {difficulty} level."
            ),
            "revisionTopics": [f"Foundations of {topic_name}", f"Advanced {topic_name} Architecture", "Production Best Practices"],
            "idealAnswerKeyPoints": [
                f"Direct definition of {topic_name}",
                "Core mechanics, structure, or implementation steps",
                "Practical real-world application or architectural benefit"
            ]
        }


def generate_reference_sample_answer(question: str, role: str, difficulty: str) -> str:
    ctx = get_question_evaluation_context(question, role, difficulty)
    return ctx["benchmarkAnswer"]


def extract_topics_to_revise(question: str) -> List[str]:
    ctx = get_question_evaluation_context(question)
    return ctx["revisionTopics"][:3]


def compute_concept_coverage(question: str, transcript: str, context: Dict[str, Any]) -> Tuple[List[str], List[str], float, bool, bool, int]:
    """
    Computes semantic coverage of expected key concepts against the candidate transcript.
    Returns: (covered_concepts, missing_concepts, coverage_ratio, is_off_topic, is_technically_incorrect, q_overlap)
    """
    text_lower = transcript.lower()
    words = text_lower.split()
    word_count = len(words)

    expected_concepts = context.get("expectedKeyConcepts", [])
    concept_keywords = context.get("conceptKeywords", [])

    stop_words = {
        "what", "is", "in", "the", "a", "an", "how", "why", "to", "for",
        "of", "and", "or", "do", "you", "tell", "me", "about", "your", "can", "explain", "basically", "there"
    }
    q_words = set(re.findall(r"\w+", question.lower())) - stop_words
    a_words = set(re.findall(r"\w+", text_lower)) - stop_words
    q_overlap = len(q_words.intersection(a_words))

    covered = []
    missing = []

    for idx, concept in enumerate(expected_concepts):
        if idx < len(concept_keywords):
            kw_list = concept_keywords[idx]
        else:
            kw_list = [w.lower() for w in re.findall(r"\w+", concept) if len(w) > 3 and w.lower() not in stop_words]
        
        matched = False
        for kw in kw_list:
            if re.search(r'\b' + re.escape(kw), text_lower):
                matched = True
                break
        
        if matched:
            covered.append(concept)
        else:
            missing.append(concept)

    coverage_ratio = len(covered) / max(1, len(expected_concepts))
    is_off_topic = (coverage_ratio == 0 and q_overlap == 0) or (coverage_ratio == 0 and word_count >= 8 and q_overlap <= 1 and not any(re.search(r'\b' + re.escape(w), text_lower) for kws in concept_keywords for w in kws))
    is_technically_incorrect = coverage_ratio == 0 and not is_off_topic

    return covered, missing, coverage_ratio, is_off_topic, is_technically_incorrect, q_overlap


# =========================================================
# QUESTION-AWARE AI EVALUATION
# =========================================================

def evaluate_answer_with_ai(
    question: str,
    transcript: str,
    role: str,
    difficulty: str,
    question_category: Optional[str] = None
) -> Dict[str, Any]:
    
    if not question_category:
        question_category = classify_question_category(question, role)

    pattern_data = detect_speech_patterns(transcript)
    text_clean = transcript.strip().lower()
    word_count = len(transcript.split())

    context = get_question_evaluation_context(question, role, difficulty)
    expected_concepts = context["expectedKeyConcepts"]
    sample_ans = context["benchmarkAnswer"]
    topics = context["revisionTopics"]
    ideal_points = context["idealAnswerKeyPoints"]

    # 1. Handle Empty Answer / Silence / Insufficient Speech
    if word_count < 3 or not text_clean:
        return {
            "available": True,
            "questionCategory": question_category,
            "understanding": "No Spoken Answer Recorded",
            "understandingExplanation": "No spoken response was detected for this question during the recording window.",
            "scoreOutOf10": 0.0,
            "overallScore": 0,
            "scoreExplanation": "Score: 0/10 (0%). The question was left unanswered because no audio speech was recorded.",
            "relevanceScore": 0,
            "technicalAccuracyScore": 0,
            "conceptualUnderstandingScore": 0,
            "completenessScore": 0,
            "communicationScore": 0,
            "isIDontKnow": False,
            "isOffTopic": False,
            "hasContent": False,
            "detailedEvaluation": "No spoken response was detected for this question.",
            "expectedKeyConcepts": expected_concepts,
            "coveredKeyConcepts": [],
            "missingOrIncorrectConcepts": expected_concepts,
            "whatYouDidWell": ["Completed recording setup and attempted the interview session."],
            "whatCanBeImproved": ["No spoken response was provided for this question."],
            "howToImprove": "Take a breath, collect your thoughts for 3 to 5 seconds, and begin with the core definition or primary purpose of the concept.",
            "betterApproach": "Take a breath, collect your thoughts for 3 to 5 seconds, and begin with the core definition or primary purpose of the concept.",
            "sampleStrongAnswer": sample_ans,
            "interviewTip": "In a live interview, if you need a moment to organize your thoughts, politely say: 'That's a great question, let me take a few seconds to organize my thoughts.'",
            "keyConceptsToRevise": topics,
            "strengths": ["Completed recording setup."],
            "areasForImprovement": ["Provide an answer explaining the core concept when prompted."],
            "suggestions": ["Take a moment to collect your thoughts before starting your answer."],
            "idealAnswerKeyPoints": ideal_points,
            "patternAnalysis": pattern_data
        }

    # 2. Handle "I Don't Know" / Explicit Knowledge Gaps
    is_idk = any(phrase in text_clean for phrase in IDK_PHRASES) and word_count <= 14
    if is_idk:
        return {
            "available": True,
            "questionCategory": question_category,
            "understanding": "Knowledge Gap Acknowledged",
            "understandingExplanation": "You acknowledged that you do not recall or know the answer to this question.",
            "scoreOutOf10": 0.5,
            "overallScore": 5,
            "scoreExplanation": "Score: 0.5/10 (5%). Acknowledging an unfamiliar concept honestly is professional, but the core technical question was not answered.",
            "relevanceScore": 0,
            "technicalAccuracyScore": 0,
            "conceptualUnderstandingScore": 0,
            "completenessScore": 0,
            "communicationScore": 50,
            "isIDontKnow": True,
            "isOffTopic": False,
            "hasContent": True,
            "detailedEvaluation": f"It is okay not to know every question. In a real interview, acknowledging a gap honestly is far better than guessing, but the technical question remained unanswered. Review core concepts for '{question}'.",
            "expectedKeyConcepts": expected_concepts,
            "coveredKeyConcepts": [],
            "missingOrIncorrectConcepts": expected_concepts,
            "whatYouDidWell": ["Demonstrated professional honesty and transparent communication instead of guessing or fabricating an answer."],
            "whatCanBeImproved": [f"Review foundational concepts and practical implementation details for '{question}'."],
            "howToImprove": "When encountering an unfamiliar topic in an interview, state what you know about related technologies, or explain the logical steps you would take to research and solve it.",
            "betterApproach": "When encountering an unfamiliar topic in an interview, state what you know about related technologies, or explain the logical steps you would take to research and solve it.",
            "sampleStrongAnswer": sample_ans,
            "interviewTip": "Acknowledging a knowledge gap with poise, and pivoting to how you would investigate the concept, shows strong engineering maturity.",
            "keyConceptsToRevise": topics,
            "strengths": ["Demonstrated professional honesty and transparent communication."],
            "areasForImprovement": [f"Study the core concepts and real-world usage of '{question}'."],
            "suggestions": [
                "When unsure, discuss related concepts you are familiar with and how they connect.",
                "Review foundational interview topics for this role."
            ],
            "idealAnswerKeyPoints": ideal_points,
            "patternAnalysis": pattern_data
        }

    # 3. Construct Semantic LLM Evaluation Prompt with Rubric
    expected_concepts_formatted = "\n".join(f"  - {c}" for c in expected_concepts)

    prompt = f"""You are an expert technical interviewer and encouraging interview coach evaluating a student's spoken interview response.

### INTERVIEW CONTEXT:
- Target Role: {role}
- Difficulty Level: {difficulty}
- Category: {question_category}
- Interview Question: "{question}"

### EXPECTED KEY CONCEPTS FOR A STRONG ANSWER:
{expected_concepts_formatted}

### CANDIDATE SPOKEN TRANSCRIPT (from speech-to-text):
\"\"\"{transcript}\"\"\"

### SEMANTIC EVALUATION GUIDELINES:
1. SEMANTIC MATCHING OVER KEYWORDS:
   - Evaluate the candidate's actual semantic meaning. Do NOT require exact words or phrases.
   - Accept correct explanations in candidate's own words, simple English, or equivalent technical terminology.
   - Reward relevant examples, alternative valid approaches, and practical explanations.
2. TOLERATE SPEECH-TO-TEXT ARTIFACTS AND NATURAL SPEECH:
   - Speech-to-text models introduce phonetic variations (e.g. 'Jason' for JSON, 'sequel' for SQL, 'rest' for REST, 'eye oh see' for IoC, 'use state' for useState).
   - Ignore natural filler words ('um', 'uh', 'like', 'basically', 'actually') and minor grammar or pronunciation slips without penalizing technical accuracy.
3. CRITICAL ACCURACY RULES (DO NOT HALLUCINATE):
   - Evaluate ONLY what is in the CANDIDATE SPOKEN TRANSCRIPT.
   - If the candidate discusses an unrelated subject (e.g. databases, SQL, primary keys, weather, or food when asked about an OOP concept like polymorphism):
     * Set isOffTopic = true
     * Set understanding = "Off-Topic / Irrelevant" or "Technically Incorrect"
     * Set relevanceScore = 0 to 20
     * Set technicalAccuracyScore = 0 to 20
     * Set conceptualUnderstandingScore = 0 to 20
     * Set scoreOutOf10 = 1.0 to 2.5
     * Set coveredKeyConcepts = []
   - If the candidate gives only a brief or high-level definition without explaining core mechanisms (e.g. only mentions "multiple forms" without explaining overloading or overriding):
     * Set understanding = "Partially Correct"
     * Set technicalAccuracyScore = 40 to 60
     * Set conceptualUnderstandingScore = 40 to 60
     * Set completenessScore = 30 to 50
     * Set scoreOutOf10 = 4.0 to 6.5
     * In coveredKeyConcepts, list ONLY what was actually spoken in the transcript.
   - If the candidate provides a complete explanation covering the core concepts:
     * Set understanding = "Fully Correct"
     * Set scoreOutOf10 = 8.5 to 10.0
4. SCORING RUBRIC & DIMENSIONS (0 to 100 each):
   - technicalAccuracyScore (40% weight): Technical correctness of mechanisms, rules, absence of misconceptions.
   - conceptualUnderstandingScore (25% weight): Depth of grasp of underlying principles and purpose.
   - relevanceScore (20% weight): Direct relevance to the question asked.
   - completenessScore (10% weight): Thoroughness covering key points for {difficulty} level.
   - communicationScore (5% weight): Clarity and structure of thought.
   (For HR/Behavioral questions, balance across relevance, communication, mindset, completeness, and professionalism).

5. SCORING TIERS GUIDELINES:
   - 85-100: Completely correct and well-explained answer covering the core concepts.
   - 70-84: Correct answer with a minor missing detail or brief explanation.
   - 40-69: Partially correct answer (understands part of the concept, but has notable gaps).
   - 1-39: Mostly incorrect or irrelevant answer.
   - 0: Score 0 ONLY when the answer is genuinely empty, unintelligible, or contains no meaningful response.

6. FEEDBACK TONE:
   - Be objective with scores, supportive and constructive with feedback.
   - Evaluate the ANSWER, not the PERSON.

### REQUIRED JSON OUTPUT FORMAT:
Return ONLY a valid JSON object with NO markdown code wrappers:
{{
  "understanding": "<One of: Fully Correct | Partially Correct | Technically Incorrect | Incomplete Concept | Off-Topic / Irrelevant>",
  "understandingExplanation": "<1-2 clear, supportive sentences explaining whether the answer was correct, partial, incorrect, or incomplete>",
  "scoreOutOf10": <float 0.0 to 10.0 representing the overall grade>,
  "scoreExplanation": "<1-2 sentences clearly explaining why the answer received this score based on rubric>",
  "technicalAccuracyScore": <integer 0-100>,
  "conceptualUnderstandingScore": <integer 0-100>,
  "relevanceScore": <integer 0-100>,
  "completenessScore": <integer 0-100>,
  "communicationScore": <integer 0-100>,
  "isOffTopic": <boolean>,
  "coveredKeyConcepts": [
    "<concept or point the candidate correctly explained>"
  ],
  "missingOrIncorrectConcepts": [
    "<concept that was omitted, incomplete, or technically incorrect>"
  ],
  "whatYouDidWell": [
    "<positive highlight from candidate's actual answer>"
  ],
  "whatCanBeImproved": [
    "<specific missing or incorrect part explained in clear, encouraging English>"
  ],
  "howToImprove": "<specific, actionable 2-3 sentence guide on how to structure a top-tier answer>",
  "sampleStrongAnswer": "<a complete, technically correct, interview-ready answer>",
  "interviewTip": "<one practical tip for answering similar questions in live interviews>",
  "keyConceptsToRevise": [
    "<topic/concept 1 to review>",
    "<topic/concept 2 to review>"
  ],
  "idealAnswerKeyPoints": [
    "<expected key point 1>",
    "<expected key point 2>",
    "<expected key point 3>"
  ]
}}"""

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "keep_alive": "30m",
        "options": {
            "temperature": 0.1,
            "num_predict": 550
        }
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=90)
        response.raise_for_status()
        raw_result = response.json().get("response", "").strip()

        if not raw_result:
            raise ValueError("Ollama returned empty response.")

        eval_data = json.loads(raw_result)

        # Sanitize and extract integer scores
        relevance = max(0, min(100, int(eval_data.get("relevanceScore", 0))))
        tech = max(0, min(100, int(eval_data.get("technicalAccuracyScore", 0))))
        concept = max(0, min(100, int(eval_data.get("conceptualUnderstandingScore", tech))))
        completeness = max(0, min(100, int(eval_data.get("completenessScore", 0))))
        communication = max(0, min(100, int(eval_data.get("communicationScore", 0))))
        is_off_topic = bool(eval_data.get("isOffTopic", False) or relevance <= 25)

        # Semantic concept coverage calculation using curated keywords & heuristics
        verified_covered, verified_missing, coverage_ratio, calc_off_topic, calc_incorrect, q_overlap = compute_concept_coverage(question, transcript, context)

        # Anti-hallucination & fair scoring calibration
        if calc_off_topic:
            is_off_topic = True
            relevance = min(15, relevance)
            tech = min(15, tech)
            concept = min(15, concept)
            completeness = min(15, completeness)
            communication = max(35, min(75, 75 - pattern_data.get("fillerWordsCount", 0) * 5))
        elif calc_incorrect:
            # Question keywords repeated or attempted, but zero expected technical concepts covered (Technically Incorrect: 1-39%)
            relevance = min(30, max(15, q_overlap * 12))
            tech = min(25, tech)
            concept = min(20, concept)
            completeness = min(20, completeness)
            communication = max(40, min(80, 80 - pattern_data.get("fillerWordsCount", 0) * 5))
        elif coverage_ratio >= 0.75:
            # Fully correct: 85-100%
            relevance = max(85, relevance)
            tech = max(85, tech)
            concept = max(85, concept)
            completeness = max(75, completeness)
        elif coverage_ratio >= 0.5:
            # Correct with minor missing details: 70-84%
            relevance = max(75, min(84, max(relevance, 75)))
            tech = max(70, min(84, max(tech, 70)))
            concept = max(70, min(84, max(concept, 70)))
            completeness = max(65, min(80, max(completeness, 65)))
        else:
            # Partially correct: 40-69%
            relevance = max(45, min(69, max(relevance, 45)))
            tech = max(42, min(65, max(tech, 42)))
            concept = max(42, min(65, max(concept, 42)))
            completeness = min(60, max(35, completeness))

        # Calculate weighted overall score according to rubric
        if is_off_topic:
            overall = min(18, round(0.40 * tech + 0.25 * concept + 0.20 * relevance + 0.10 * completeness + 0.05 * communication))
        elif calc_incorrect:
            overall = min(35, max(12, round(0.40 * tech + 0.25 * concept + 0.20 * relevance + 0.10 * completeness + 0.05 * communication)))
        elif question_category in ["HR / Behavioral", "Situational"]:
            overall = round(
                0.30 * relevance +
                0.25 * communication +
                0.25 * concept +
                0.15 * completeness +
                0.05 * tech
            )
        else:
            overall = round(
                0.40 * tech +
                0.25 * concept +
                0.20 * relevance +
                0.10 * completeness +
                0.05 * communication
            )

        overall = max(0, min(100, overall))

        # Calibrated score out of 10
        raw_score_10 = eval_data.get("scoreOutOf10")
        if raw_score_10 is not None and not (calc_off_topic or calc_incorrect):
            try:
                score_out_of_10 = max(0.0, min(10.0, round(float(raw_score_10), 1)))
                if coverage_ratio >= 0.75:
                    score_out_of_10 = max(8.5, min(10.0, score_out_of_10))
                elif coverage_ratio >= 0.5:
                    score_out_of_10 = max(7.0, min(8.4, score_out_of_10))
                else:
                    score_out_of_10 = max(4.0, min(6.9, score_out_of_10))
            except (ValueError, TypeError):
                score_out_of_10 = round(overall / 10.0, 1)
        else:
            score_out_of_10 = round(overall / 10.0, 1)

        # Align understanding tier with score
        if is_off_topic:
            understanding = "Off-Topic / Irrelevant"
        elif calc_incorrect or overall < 40:
            understanding = "Technically Incorrect"
        elif overall >= 70:
            understanding = "Fully Correct"
        else:
            understanding = "Partially Correct"

        score_explanation = eval_data.get("scoreExplanation") or f"Score: {score_out_of_10}/10 ({overall}%) based on technical correctness ({tech}%), conceptual understanding ({concept}%), and relevance ({relevance}%)."
        understanding_explanation = eval_data.get("understandingExplanation") or score_explanation

        if is_off_topic or calc_incorrect:
            covered_concepts = []
            missing_concepts = expected_concepts
        else:
            covered_concepts = verified_covered if verified_covered else eval_data.get("coveredKeyConcepts", [])
            if not isinstance(covered_concepts, list):
                covered_concepts = []
            missing_concepts = verified_missing if verified_missing else eval_data.get("missingOrIncorrectConcepts", [])
            if not isinstance(missing_concepts, list) or len(missing_concepts) == 0:
                missing_concepts = [c for c in expected_concepts if c not in covered_concepts]

        what_well = eval_data.get("whatYouDidWell") or eval_data.get("strengths", [])
        if not isinstance(what_well, list) or len(what_well) == 0:
            what_well = ["Explained the key principles in your own words."] if not is_off_topic else ["Spoke clearly during the recording."]

        what_improve = eval_data.get("whatCanBeImproved") or eval_data.get("areasForImprovement", [])
        if not isinstance(what_improve, list) or len(what_improve) == 0:
            what_improve = ["Your answer covers the basic idea. Elaborate on the underlying runtime mechanism and provide a practical example."]

        how_to_improve = eval_data.get("howToImprove") or eval_data.get("betterApproach") or "Start by clearly defining the core concept, explain how it operates internally, and conclude with a concrete production example."
        sample_answer = eval_data.get("sampleStrongAnswer") or sample_ans
        interview_tip = eval_data.get("interviewTip") or "For technical questions, use the 'Definition -> Mechanism -> Example' structure to keep your answers comprehensive and structured."

        topics_revise = eval_data.get("keyConceptsToRevise", [])
        if not isinstance(topics_revise, list) or len(topics_revise) == 0:
            topics_revise = topics

        ideal_points_resp = eval_data.get("idealAnswerKeyPoints", [])
        if not isinstance(ideal_points_resp, list) or len(ideal_points_resp) == 0:
            ideal_points_resp = ideal_points

        return {
            "available": True,
            "questionCategory": question_category,
            "understanding": understanding,
            "understandingExplanation": understanding_explanation,
            "scoreOutOf10": score_out_of_10,
            "scoreExplanation": score_explanation,
            "relevanceScore": relevance,
            "technicalAccuracyScore": tech,
            "conceptualUnderstandingScore": concept,
            "completenessScore": completeness,
            "communicationScore": communication,
            "overallScore": overall,
            "isIDontKnow": False,
            "isOffTopic": is_off_topic,
            "hasContent": True,
            "detailedEvaluation": score_explanation,
            "expectedKeyConcepts": expected_concepts,
            "coveredKeyConcepts": covered_concepts,
            "missingOrIncorrectConcepts": missing_concepts,
            "whatYouDidWell": what_well,
            "whatCanBeImproved": what_improve,
            "howToImprove": how_to_improve,
            "betterApproach": how_to_improve,
            "sampleStrongAnswer": sample_answer,
            "interviewTip": interview_tip,
            "keyConceptsToRevise": topics_revise,
            "strengths": what_well,
            "areasForImprovement": what_improve,
            "suggestions": [how_to_improve],
            "idealAnswerKeyPoints": ideal_points_resp,
            "patternAnalysis": pattern_data
        }

    except Exception as e:
        print(f"Ollama evaluation failed: {e}")
        # Fallback heuristic evaluation
        return fallback_heuristic_evaluation(
            question, transcript, role, difficulty, question_category, pattern_data
        )


def fallback_heuristic_evaluation(
    question: str,
    transcript: str,
    role: str,
    difficulty: str,
    question_category: str,
    pattern_data: Dict[str, Any]
) -> Dict[str, Any]:
    context = get_question_evaluation_context(question, role, difficulty)
    expected_concepts = context["expectedKeyConcepts"]
    sample_answer = context["benchmarkAnswer"]
    topics_revise = context["revisionTopics"]
    ideal_points = context["idealAnswerKeyPoints"]

    words = transcript.split()
    word_count = len(words)
    text_lower = transcript.lower()

    if word_count < 3:
        return {
            "available": True,
            "questionCategory": question_category,
            "understanding": "No Spoken Answer Recorded",
            "understandingExplanation": "The response was too short or unintelligible to evaluate.",
            "scoreOutOf10": 0.0,
            "overallScore": 0,
            "scoreExplanation": "Score: 0/10. No meaningful response was provided.",
            "relevanceScore": 0,
            "technicalAccuracyScore": 0,
            "conceptualUnderstandingScore": 0,
            "completenessScore": 0,
            "communicationScore": 0,
            "isIDontKnow": False,
            "isOffTopic": False,
            "hasContent": False,
            "detailedEvaluation": "Response was too brief to evaluate.",
            "expectedKeyConcepts": expected_concepts,
            "coveredKeyConcepts": [],
            "missingOrIncorrectConcepts": expected_concepts,
            "whatYouDidWell": ["Attempted response recording."],
            "whatCanBeImproved": ["Please provide a detailed spoken explanation of the concept."],
            "howToImprove": "Begin with a definition, explain the mechanics, and provide an example.",
            "betterApproach": "Begin with a definition, explain the mechanics, and provide an example.",
            "sampleStrongAnswer": sample_answer,
            "interviewTip": "Speak in complete sentences and structure your answer with clear definitions.",
            "keyConceptsToRevise": topics_revise,
            "strengths": ["Attempted response recording."],
            "areasForImprovement": ["Provide a detailed explanation of the concept."],
            "suggestions": ["Speak in complete sentences."],
            "idealAnswerKeyPoints": ideal_points,
            "patternAnalysis": pattern_data
        }

    # Evaluate concept coverage against expectedKeyConcepts
    covered, missing, coverage_ratio, is_off_topic, is_technically_incorrect, q_overlap = compute_concept_coverage(question, transcript, context)

    if is_off_topic:
        relevance = 12
        tech = 10
        concept = 10
        completeness = 10
        comm = max(35, min(75, 75 - pattern_data.get("fillerWordsCount", 0) * 5))
        overall = min(15, round(0.40 * tech + 0.25 * concept + 0.20 * relevance + 0.10 * completeness + 0.05 * comm))
    elif is_technically_incorrect:
        # Question repetition, but zero expected technical concepts covered (Technically Incorrect: 1-39%)
        relevance = min(30, max(15, q_overlap * 12))
        tech = 20
        concept = 15
        completeness = 15
        comm = max(40, min(80, 80 - pattern_data.get("fillerWordsCount", 0) * 5))
        overall = min(35, max(12, round(0.40 * tech + 0.25 * concept + 0.20 * relevance + 0.10 * completeness + 0.05 * comm)))
    elif coverage_ratio < 0.5:
        # Partially correct: 40-69%
        relevance = min(68, 50 + int(coverage_ratio * 30))
        tech = min(62, 45 + int(coverage_ratio * 30))
        concept = min(62, 45 + int(coverage_ratio * 30))
        completeness = min(55, 35 + int(coverage_ratio * 30))
        comm = max(40, min(85, 85 - pattern_data.get("fillerWordsCount", 0) * 5))
        overall = round(0.40 * tech + 0.25 * concept + 0.20 * relevance + 0.10 * completeness + 0.05 * comm)
    elif coverage_ratio >= 0.75:
        # Completely correct: 85-100%
        relevance = min(96, 88 + int(coverage_ratio * 10))
        tech = min(95, 86 + min(9, word_count // 5))
        concept = min(95, 86 + min(9, word_count // 5))
        completeness = min(90, 80 + min(10, word_count // 4))
        comm = max(60, min(95, 90 - pattern_data.get("fillerWordsCount", 0) * 5))
        overall = round(0.40 * tech + 0.25 * concept + 0.20 * relevance + 0.10 * completeness + 0.05 * comm)
    else:
        # Correct with minor detail missing: 70-84%
        relevance = min(84, 76 + int(coverage_ratio * 10))
        tech = min(82, 72 + min(10, word_count // 5))
        concept = min(82, 72 + min(10, word_count // 5))
        completeness = min(78, 68 + min(10, word_count // 4))
        comm = max(55, min(90, 85 - pattern_data.get("fillerWordsCount", 0) * 5))
        overall = round(0.40 * tech + 0.25 * concept + 0.20 * relevance + 0.10 * completeness + 0.05 * comm)

    overall = max(0, min(100, overall))
    score_out_of_10 = round(overall / 10.0, 1)

    if is_off_topic:
        understanding = "Off-Topic / Irrelevant"
    elif is_technically_incorrect or overall < 40:
        understanding = "Technically Incorrect"
    elif overall >= 70:
        understanding = "Fully Correct"
    else:
        understanding = "Partially Correct"

    score_explanation = (
        f"Score: {score_out_of_10}/10 ({overall}%) based on technical correctness ({tech}%), conceptual understanding ({concept}%), and relevance ({relevance}%)."
        if not is_off_topic
        else "Score: 1.5/10. The response did not directly address the expected concepts for this question."
    )

    understanding_explanation = (
        "Your response addresses the core concepts well. With additional implementation nuances and real-world examples, it can be even stronger."
        if overall >= 70
        else (
            "Your answer captures part of the concept, but omitting key mechanisms or details reduces completeness."
            if not is_off_topic
            else "The answer does not match the expected concept asked in this question."
        )
    )

    what_well = [
        f"Covered key points: {', '.join(covered[:2])}" if covered else "Spoke clearly and articulated your response."
    ]
    what_improve = [
        f"Include missing concepts: {', '.join(missing[:2])}" if missing else "Deepen the explanation with a concrete production example."
    ]
    how_to_improve = "Begin with a concise definition, explain the internal mechanism, and conclude with a concrete production example."

    return {
        "available": True,
        "questionCategory": question_category,
        "understanding": understanding,
        "understandingExplanation": understanding_explanation,
        "scoreOutOf10": score_out_of_10,
        "scoreExplanation": score_explanation,
        "relevanceScore": relevance,
        "technicalAccuracyScore": tech,
        "conceptualUnderstandingScore": concept,
        "completenessScore": completeness,
        "communicationScore": comm,
        "overallScore": overall,
        "isIDontKnow": False,
        "isOffTopic": is_off_topic,
        "hasContent": True,
        "detailedEvaluation": score_explanation,
        "expectedKeyConcepts": expected_concepts,
        "coveredKeyConcepts": covered,
        "missingOrIncorrectConcepts": missing,
        "whatYouDidWell": what_well,
        "whatCanBeImproved": what_improve,
        "howToImprove": how_to_improve,
        "betterApproach": how_to_improve,
        "sampleStrongAnswer": sample_answer,
        "interviewTip": "For technical questions, use the 'Definition -> Mechanism -> Example' structure to keep your answers comprehensive and structured.",
        "keyConceptsToRevise": topics_revise,
        "strengths": what_well,
        "areasForImprovement": what_improve,
        "suggestions": [how_to_improve],
        "idealAnswerKeyPoints": ideal_points,
        "patternAnalysis": pattern_data
    }


# =========================================================
# CROSS-ANSWER WHOLE-INTERVIEW SYNTHESIS
# =========================================================

@app.post("/synthesize-session")
def synthesize_session(payload: Dict[str, Any] = Body(...)):
    """
    Synthesizes the entire interview across all answered questions,
    finding repeated patterns, systemic strengths, and critical gaps.
    """
    answers = payload.get("answers", [])
    role = payload.get("role", "Software Developer")
    difficulty = payload.get("difficulty", "Intermediate")
    interview_type = payload.get("type", "Mixed")
    total_questions = payload.get("totalQuestions", len(answers))
    completed_questions = len(answers)

    has_any_score = any(item.get("aiEvaluation", {}).get("overallScore", 0) > 0 for item in answers)
    if not answers or not has_any_score:
        return {
            "success": True,
            "overallScore": 0,
            "performanceTitle": "No Answers Recorded",
            "ratingExplanation": "No spoken answers were detected during this interview session.",
            "completedQuestions": 0,
            "totalQuestions": total_questions,
            "skippedQuestions": total_questions,
            "isEndedEarly": True,
            "completionNote": "No interview answers were provided during this session.",
            "categoryScores": {
                "technicalAccuracy": 0,
                "conceptualUnderstanding": 0,
                "relevance": 0,
                "completeness": 0,
                "communication": 0,
                "pacing": 0
            },
            "speechMetrics": {
                "totalWords": 0,
                "totalDurationSeconds": 0,
                "speakingSpeedWPM": 0,
                "totalFillerWords": 0
            },
            "executiveSummary": "No interview answers were completed in this session. All questions were left unanswered.",
            "systemicStrengths": [],
            "systemicWeaknesses": ["No questions were answered during the interview."],
            "focusAreas": ["Practice answering questions aloud."],
            "actionPlan": ["Practice answering questions out loud to build confidence."],
            "strongestAnswers": [],
            "improvementAnswers": [],
            "recommendedRevisionTopics": [],
            "personalizedPracticePlan": [
                "Practice answering aloud using the 3-step structure: Definition -> Mechanism -> Example.",
                "Target a speaking pace of 120-150 words per minute with clear audio input."
            ]
        }

    # Aggregate metrics
    relevance_scores = []
    technical_scores = []
    conceptual_scores = []
    completeness_scores = []
    communication_scores = []
    overall_scores = []
    all_strengths = []
    all_weaknesses = []
    all_suggestions = []
    total_words = 0
    total_duration = 0
    total_fillers = 0

    for item in answers:
        eval_data = item.get("aiEvaluation", {})
        if eval_data.get("available", False):
            relevance_scores.append(eval_data.get("relevanceScore", 0))
            technical_scores.append(eval_data.get("technicalAccuracyScore", 0))
            conceptual_scores.append(eval_data.get("conceptualUnderstandingScore", eval_data.get("technicalAccuracyScore", 0)))
            completeness_scores.append(eval_data.get("completenessScore", 0))
            communication_scores.append(eval_data.get("communicationScore", 0))
            overall_scores.append(eval_data.get("overallScore", 0))

            all_strengths.extend(eval_data.get("strengths", []))
            all_weaknesses.extend(eval_data.get("areasForImprovement", []))
            all_suggestions.extend(eval_data.get("suggestions", []))

        total_words += item.get("wordCount", 0)
        total_duration += item.get("durationSeconds", 0)
        patterns = eval_data.get("patternAnalysis", {})
        total_fillers += patterns.get("fillerWordsCount", 0)

    # Calculate average across total scheduled questions so unanswered questions count as 0
    divisor = total_questions if total_questions > 0 else len(answers)
    avg_relevance = round(sum(relevance_scores) / divisor) if relevance_scores and divisor > 0 else 0
    avg_technical = round(sum(technical_scores) / divisor) if technical_scores and divisor > 0 else 0
    avg_conceptual = round(sum(conceptual_scores) / divisor) if conceptual_scores and divisor > 0 else avg_technical
    avg_completeness = round(sum(completeness_scores) / divisor) if completeness_scores and divisor > 0 else 0
    avg_communication = round(sum(communication_scores) / divisor) if communication_scores and divisor > 0 else 0
    
    # Calculate WPM
    wpm = round((total_words / total_duration) * 60) if total_duration > 0 else 0
    pacing_score = 90 if 120 <= wpm <= 160 else (75 if 90 <= wpm < 120 or 160 < wpm <= 185 else 60)
    if wpm == 0:
        pacing_score = 0

    # Overall score calculated across total scheduled questions
    final_overall_score = round(sum(overall_scores) / divisor) if overall_scores and divisor > 0 else 0

    # Cross-question synthesis with Ollama
    summary_prompt = f"""You are a senior interview coach preparing the final evaluation report for a candidate.

### CORE PRINCIPLE: STRICT EVALUATION ≠ HARSH COMMUNICATION
- Evaluate the ANSWERS critically and strictly based on the calculated scores and transcript evidence.
- BUT make the communication constructive, supportive, and motivating.
- NEVER attack or demean the candidate (never say "Candidate failed", "Candidate is weak", "Not suitable for the job").
- Instead use empowering framing such as:
  * "Your interview performance provides a clear baseline, and you have distinct areas to focus on for substantial improvement."
  * "Demonstrated good foundational awareness; deepening implementation specifics and structured examples will significantly boost interview readiness."

Role: {role}
Difficulty: {difficulty}
Questions Completed: {completed_questions}/{total_questions}
Calculated Scores:
- Overall Score: {final_overall_score}/100
- Technical Accuracy (40%): {avg_technical}/100
- Conceptual Understanding (25%): {avg_conceptual}/100
- Question Relevance (20%): {avg_relevance}/100
- Completeness (10%): {avg_completeness}/100
- Communication (5%): {avg_communication}/100
- Speaking Speed: {wpm} WPM (Pacing Score: {pacing_score}/100)
- Total Filler Words: {total_fillers}

Question Breakdowns:
"""
    for idx, item in enumerate(answers, 1):
        q_text = item.get("question", "")
        transcript_text = item.get("transcript", "")
        summary_prompt += f"\nQ{idx}: {q_text}\nAnswer Transcript: {transcript_text}\n"

    summary_prompt += """
Synthesize:
1. Executive Summary: 3-4 constructive sentences summarizing the candidate's interview performance, highlighting positive points and clear areas to build upon.
2. Systemic Strengths: 3 genuine positive highlights observed across the answers.
3. Focus Areas: 3 clear, constructive areas to focus on and improve.
4. Key Action Plan: 3 practical, actionable next steps for interview preparation.

Return JSON:
{
  "executiveSummary": "...",
  "systemicStrengths": ["...", "...", "..."],
  "systemicWeaknesses": ["...", "...", "..."],
  "focusAreas": ["...", "...", "..."],
  "actionPlan": ["...", "...", "..."]
}"""

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": summary_prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.2, "num_predict": 500}
            },
            timeout=90
        )
        resp.raise_for_status()
        synthesis_json = json.loads(resp.json().get("response", "{}"))
        executive_summary = synthesis_json.get("executiveSummary", "")
        systemic_strengths = synthesis_json.get("systemicStrengths", [])
        focus_areas = synthesis_json.get("focusAreas") or synthesis_json.get("systemicWeaknesses", [])
        systemic_weaknesses = focus_areas
        action_plan = synthesis_json.get("actionPlan", [])
    except Exception as e:
        print(f"Session synthesis with Ollama failed: {e}")
        executive_summary = (
            f"You completed {completed_questions} of {total_questions} questions for the {role} position ({difficulty} level). "
            f"Your performance provides a solid baseline with an overall score of {final_overall_score}%. "
            f"By focusing on core implementation mechanisms and structured response delivery, you can significantly elevate your interview readiness."
        )
        systemic_strengths = list(dict.fromkeys(all_strengths))[:3] if all_strengths else ["Clear spoken delivery and active participation."]
        systemic_weaknesses = list(dict.fromkeys(all_weaknesses))[:3] if all_weaknesses else ["Deepen practical implementation and code examples."]
        focus_areas = systemic_weaknesses
        action_plan = list(dict.fromkeys(all_suggestions))[:3] if all_suggestions else ["Practice answering core architectural questions using the 'Definition -> Mechanism -> Example' structure."]

    # Identify strongest answers and answers needing improvement
    evaluated_items = [
        {
            "questionNumber": item.get("questionNumber", idx + 1),
            "question": item.get("question", f"Question {idx + 1}"),
            "score": item.get("aiEvaluation", {}).get("overallScore", 0),
            "scoreOutOf10": item.get("aiEvaluation", {}).get("scoreOutOf10", 0.0),
            "understanding": item.get("aiEvaluation", {}).get("understanding", "Evaluated")
        }
        for idx, item in enumerate(answers)
        if item.get("aiEvaluation", {}).get("available", False)
    ]

    sorted_by_score = sorted(evaluated_items, key=lambda x: x["score"], reverse=True)
    strongest_answers = [f"Q{x['questionNumber']}: {x['question']} ({x['scoreOutOf10']}/10)" for x in sorted_by_score[:2] if x["score"] >= 60]
    improvement_answers = [f"Q{x['questionNumber']}: {x['question']} ({x['scoreOutOf10']}/10 - {x['understanding']})" for x in reversed(sorted_by_score) if x["score"] < 75][:2]

    # Aggregate revision topics
    all_revision_topics = []
    for item in answers:
        rev_topics = item.get("aiEvaluation", {}).get("keyConceptsToRevise", [])
        if isinstance(rev_topics, list):
            all_revision_topics.extend(rev_topics)
    unique_revision_topics = list(dict.fromkeys(all_revision_topics))[:6]

    # Performance Title & Explanation
    if final_overall_score >= 85:
        performance_title = "Exceptional Performance"
        rating_explanation = "Outstanding domain knowledge, strong relevance, and crisp articulation. You demonstrated thorough, interview-ready competency."
    elif final_overall_score >= 70:
        performance_title = "Strong Performance"
        rating_explanation = "Solid command of technical fundamentals and clear communication. With targeted polish on implementation mechanisms, you are well-positioned for placement interviews."
    elif final_overall_score >= 50:
        performance_title = "Developing Foundation"
        rating_explanation = "Good conceptual start with several relevant points covered. Strengthening implementation details and structured examples will significantly boost your interview scores."
    else:
        performance_title = "Foundational Knowledge Required"
        rating_explanation = "Your interview performance establishes a clear baseline. With focused review on the recommended revision topics and practicing the 'Definition -> Mechanism -> Example' structure, you can rapidly improve."

    is_ended_early = completed_questions < total_questions
    completion_note = (
        f"Interview concluded early: {completed_questions} of {total_questions} questions were answered. Scores and feedback reflect the completed responses."
        if is_ended_early
        else f"Full interview completed: All {total_questions} scheduled questions were answered and thoroughly evaluated."
    )

    personalized_practice_plan = [
        f"Master the {len(unique_revision_topics)} highlighted revision topics: {', '.join(unique_revision_topics[:3]) if unique_revision_topics else 'core architecture principles'}.",
        "Practice answering aloud using the 3-step structure: (1) Core Definition, (2) Internal Mechanism, (3) Concrete Example.",
        f"Target a speaking pace of 120-150 words per minute (currently {wpm} WPM) with minimal filler words."
    ]

    return {
        "success": True,
        "overallScore": final_overall_score,
        "performanceTitle": performance_title,
        "ratingExplanation": rating_explanation,
        "completedQuestions": completed_questions,
        "totalQuestions": total_questions,
        "skippedQuestions": max(0, total_questions - completed_questions),
        "isEndedEarly": is_ended_early,
        "completionNote": completion_note,
        "categoryScores": {
            "technicalAccuracy": avg_technical,
            "conceptualUnderstanding": avg_conceptual,
            "relevance": avg_relevance,
            "completeness": avg_completeness,
            "communication": avg_communication,
            "pacing": pacing_score
        },
        "speechMetrics": {
            "totalWords": total_words,
            "totalDurationSeconds": round(total_duration, 1),
            "speakingSpeedWPM": wpm,
            "totalFillerWords": total_fillers
        },
        "executiveSummary": executive_summary,
        "systemicStrengths": systemic_strengths if systemic_strengths else ["Answered the interview questions with good clarity."],
        "systemicWeaknesses": systemic_weaknesses if systemic_weaknesses else ["Deepen practical implementation and architectural details."],
        "focusAreas": systemic_weaknesses if systemic_weaknesses else ["Deepen practical implementation and architectural details."],
        "actionPlan": action_plan if action_plan else ["Review core concepts with hands-on coding and mock interviews."],
        "strongestAnswers": strongest_answers,
        "improvementAnswers": improvement_answers,
        "recommendedRevisionTopics": unique_revision_topics,
        "personalizedPracticePlan": personalized_practice_plan
    }


# =========================================================
# ANALYZE INDIVIDUAL INTERVIEW ANSWER
# =========================================================

@app.post("/analyze")
async def analyze_interview(
    file: UploadFile = File(...),
    sessionId: str = Form(...),
    questionNumber: int = Form(...),
    question: str = Form(...),
    role: str = Form(...),
    difficulty: str = Form(...),
    questionCategory: Optional[str] = Form(None)
):
    webm_path = None
    wav_path = None

    try:
        print(f"\n=== ANALYZING QUESTION {questionNumber} ===")
        print(f"Question: {question}")
        print(f"Role: {role}, Difficulty: {difficulty}")

        # Save uploaded WEBM file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            video_data = await file.read()
            temp_file.write(video_data)
            webm_path = temp_file.name

        wav_path = webm_path.rsplit(".", 1)[0] + "_enhanced.wav"

        # Convert WEBM to enhanced 16kHz mono WAV
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", webm_path, "-vn",
                "-af", "highpass=f=60,lowpass=f=7500,volume=1.5",
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                wav_path
            ],
            check=True, capture_output=True, text=True
        )

        # Transcribe with Faster-Whisper
        whisper_res = transcribe_audio_whisper(wav_path)
        transcript = whisper_res["transcript"]

        # Calculate exact duration
        with wave.open(wav_path, "rb") as audio_file:
            frames = audio_file.getnframes()
            frame_rate = audio_file.getframerate()
            duration_seconds = round(frames / float(frame_rate), 2)

        word_count = len(transcript.split())
        speaking_speed = (
            round((word_count / duration_seconds) * 60, 1)
            if duration_seconds > 0 else 0
        )

        # AI Evaluation
        ai_eval = evaluate_answer_with_ai(
            question=question,
            transcript=transcript,
            role=role,
            difficulty=difficulty,
            question_category=questionCategory
        )

        # Acoustic Integrity Analysis (Multi-speaker & Excessive Noise Detection)
        integrity_result = analyze_audio_integrity(wav_path)

        return {
            "success": True,
            "status": "ANALYZED",
            "message": "Interview answer analyzed successfully",
            "sessionId": sessionId,
            "questionNumber": questionNumber,
            "question": question,
            "role": role,
            "difficulty": difficulty,
            "fileName": file.filename,
            "transcript": transcript,
            "language": whisper_res["language"],
            "languageProbability": whisper_res["languageProbability"],
            "transcriptionConfidence": whisper_res["transcriptionConfidence"],
            "durationSeconds": duration_seconds,
            "wordCount": word_count,
            "speakingSpeedWPM": speaking_speed,
            "aiEvaluation": ai_eval,
            "integrity": integrity_result
        }

    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error: {e.stderr}")
        return {
            "success": False,
            "status": "FFMPEG_ERROR",
            "message": "Failed to convert audio recording",
            "error": e.stderr[-1000:] if e.stderr else "Unknown error"
        }
    except Exception as e:
        print(f"Analysis error: {e}")
        return {
            "success": False,
            "status": "AI_ANALYSIS_ERROR",
            "message": "Failed to analyze interview answer",
            "error": str(e)
        }
    finally:
        for path in [webm_path, wav_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass


@app.post("/check-audio-integrity")
async def check_audio_integrity_endpoint(file: UploadFile = File(...)):
    """
    Dedicated endpoint for fast live acoustic integrity checks.
    """
    webm_path = None
    wav_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            data = await file.read()
            temp_file.write(data)
            webm_path = temp_file.name

        wav_path = webm_path.rsplit(".", 1)[0] + "_integrity.wav"
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", webm_path, "-vn",
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                wav_path
            ],
            check=True, capture_output=True, text=True
        )

        integrity_result = analyze_audio_integrity(wav_path)
        return {
            "success": True,
            "integrity": integrity_result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "integrity": {
                "violationDetected": False,
                "violationType": None,
                "warningMessage": None,
                "terminateInterview": False
            }
        }
    finally:
        for p in [webm_path, wav_path]:
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


# =========================================================
# HEALTH CHECK ENDPOINTS
# =========================================================

@app.get("/")
def root():
    return {
        "success": True,
        "message": "AI Interview Analyzer Python Service v2.0 is running"
    }


@app.get("/health")
def health():
    return {
        "success": True,
        "status": "AI_SERVICE_RUNNING",
        "whisperLoaded": whisper_model is not None
    }


@app.get("/ollama-health")
def ollama_health():
    try:
        response = requests.get("http://127.0.0.1:11434/api/tags", timeout=10)
        response.raise_for_status()
        data = response.json()
        models = [model.get("name") for model in data.get("models", [])]
        return {
            "success": True,
            "ollamaRunning": True,
            "models": models
        }
    except Exception as e:
        return {
            "success": False,
            "ollamaRunning": False,
            "error": str(e)
        }