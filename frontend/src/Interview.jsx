import {
  useEffect,
  useRef,
  useState
} from "react";

import { useNavigate } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as blazeface from "@tensorflow-models/blazeface";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock3,
  Eye,
  Lightbulb,
  Mic,
  MicOff,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Square,
  Video,
  VolumeX,
  Users,
  AlertTriangle,
  Smartphone,
  UserX,
  AlertOctagon,
  Ban
} from "lucide-react";

import "./Interview.css";

// Module-level singleton cache for AI vision models (BlazeFace + COCO-SSD) to survive React 19 StrictMode remounts
let cachedCocoModel = null;
let cachedBlazeFaceModel = null;
let modelsLoadingPromise = null;

function Interview() {

  const navigate = useNavigate();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const recordedAnswersRef = useRef([]);

  const sessionIdRef = useRef(
    `session_${Date.now()}`
  );

  const [cameraError, setCameraError] = useState("");
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);

  const [recordedAnswers, setRecordedAnswers] = useState([]);
  const [responseSubmitted, setResponseSubmitted] = useState(false);

  const [isEndingInterview, setIsEndingInterview] = useState(false);
  const [violationAlert, setViolationAlert] = useState(null);
  const [isTerminated, setIsTerminated] = useState(false);
  const [liveAudioLevel, setLiveAudioLevel] = useState(0);

  /* Proctoring state and refs */
  const cocoModelRef = useRef(cachedCocoModel);
  const blazeFaceModelRef = useRef(cachedBlazeFaceModel);
  const isModelLoadingRef = useRef(false);
  const isScanningRef = useRef(false);
  const faceDetectorRef = useRef(null);
  const proctoringIntervalRef = useRef(null);
  const strikesRef = useRef(0);
  const lastViolationTimeRef = useRef(0);
  const consecutiveViolationsRef = useRef(0);
  const warningTimerRef = useRef(null);

  // Consecutive frame counters for multiple-people warning stabilization & debouncing
  const consecutiveMultiplePeopleRef = useRef(0);
  const consecutiveSinglePersonRef = useRef(0);

  // Dedicated multiple people alert state for instantaneous and stable warning
  const [multiplePeopleAlert, setMultiplePeopleAlert] = useState(null); // { count, message }
  const [cameraWarning, setCameraWarning] = useState(null); // { type, title, message, strike, maxStrikes: 3 }
  const [proctoringStats, setProctoringStats] = useState({
    active: false,
    personCount: 1,
    phoneDetected: false,
    modelReady: !!(cachedCocoModel || cachedBlazeFaceModel)
  });
  const [strikes, setStrikes] = useState(0);

  const answerHistoryRef = useRef([]);
  const aiAnalysesRef = useRef([]);
  const pendingAnalysisPromisesRef = useRef([]);
  const endingInterviewRef = useRef(false);

  const activeAudioCtxRef = useRef(null);
  const audioAnimFrameRef = useRef(null);

  /* =====================================================
     PROTECT AGAINST ACCIDENTAL PAGE UNLOAD
  ===================================================== */
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isAnswering || answerHistoryRef.current.length > 0) {
        e.preventDefault();
        e.returnValue = "You have an active interview session in progress. Leaving will cancel the current session.";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isAnswering]);

  /* =====================================================
     RESET STALE SESSION STORAGE ON MOUNT
  ===================================================== */
  useEffect(() => {
    try {
      localStorage.removeItem("interviewAnswers");
      localStorage.removeItem("interviewAIAnalyses");
      localStorage.removeItem("interviewResult");
      localStorage.removeItem("interviewTerminated");
    } catch (e) {
      console.warn("Could not clean old session storage:", e);
    }
  }, []);

  /* =====================================================
     HIDE RESPONSE MESSAGE AFTER 5 SECONDS
  ===================================================== */
  useEffect(() => {
    if (!responseSubmitted) return;

    const timer = setTimeout(() => {
      setResponseSubmitted(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [responseSubmitted]);


  /* =====================================================
     INTERVIEW CONFIGURATION
  ===================================================== */

  const [interviewConfig] = useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("interviewConfig")
        ) || {
          role: "Software Developer",
          type: "Mixed",
          difficulty: "Intermediate"
        }
      );
    } catch (error) {
      console.error(
        "Unable to read interview configuration:",
        error
      );

      return {
        role: "Software Developer",
        type: "Mixed",
        difficulty: "Intermediate"
      };
    }
  });


  /* =====================================================
     INTERVIEW QUESTIONS
  ===================================================== */

  const hrQuestionBank = {
    Beginner: [
      {
        question: "Tell me about yourself.",
        description:
          "Introduce yourself by talking about your education, technical skills, projects, and career goals."
      },
      {
        question: "Why should we hire you?",
        description:
          "Explain your skills, strengths, projects, willingness to learn, and why you would be a good fit for the role."
      },
      {
        question: "What are your salary expectations?",
        description:
          "Explain your expected salary professionally and show that you are open to discussing the compensation based on the role and company."
      },
      {
        question: "What are your strengths?",
        description:
          "Explain your strongest qualities and give a practical example."
      },
      {
        question: "What are your weaknesses?",
        description:
          "Mention a genuine weakness and explain what you are doing to improve it."
      },
      {
        question: "Why do you want to join our company?",
        description:
          "Explain why you are interested in the company and the role."
      },
      {
        question: "What was your role in your project?",
        description:
          "Explain what responsibilities and tasks you personally handled."
      },
      {
        question: "What did you learn from your project?",
        description:
          "Explain the technical and practical knowledge you gained from the project."
      },
      {
        question: "Where do you see yourself in 5 years?",
        description:
          "Explain your career goals and how you want to grow professionally."
      },
      {
        question: "Are you willing to relocate?",
        description:
          "Explain your flexibility regarding location and work requirements."
      }
    ],

    Intermediate: [
      {
        question: "Tell me about yourself.",
        description:
          "Give a professional introduction covering your education, technical skills, projects, achievements, and career goals."
      },
      {
        question: "Why should we hire you?",
        description:
          "Explain why your technical skills, projects, problem-solving ability, and willingness to learn make you suitable for the role."
      },
      {
        question: "What are your salary expectations?",
        description:
          "Explain your expected salary professionally while showing flexibility based on the role, responsibilities, and company standards."
      },
      {
        question: "Tell me about a challenging project you worked on.",
        description:
          "Explain the project, the challenge you faced, your approach, and the final result."
      },
      {
        question: "How do you handle pressure and tight deadlines?",
        description:
          "Explain how you prioritize tasks and maintain quality when working under pressure."
      },
      {
        question: "Tell me about a failure and what you learned from it.",
        description:
          "Explain a real challenge or failure and describe how it helped you improve."
      },
      {
        question: "How do you handle disagreement with a teammate?",
        description:
          "Explain how you communicate, understand different opinions, and reach a practical solution."
      },
      {
        question: "Why do you want to join our company?",
        description:
          "Explain your interest in the company, role, learning opportunities, and career growth."
      },
      {
        question: "What are your short-term and long-term goals?",
        description:
          "Explain your immediate career goals and your long-term professional direction."
      },
      {
        question: "What value can you bring to our organization?",
        description:
          "Explain how your technical skills, problem-solving ability, teamwork, and learning mindset can contribute."
      }
    ],

    Advanced: [
      {
        question: "Tell me about yourself.",
        description:
          "Give a concise professional introduction highlighting your strongest technical skills, projects, achievements, and career direction."
      },
      {
        question: "Why should we hire you?",
        description:
          "Explain the unique value you can bring through your technical expertise, project experience, problem-solving ability, and professional mindset."
      },
      {
        question: "What are your salary expectations?",
        description:
          "Explain your expected compensation based on your skills, market standards, role responsibilities, and career value."
      },
      {
        question: "Why should we choose you despite your limited experience?",
        description:
          "Explain how your projects, technical skills, learning ability, problem-solving skills, and consistency compensate for limited professional experience."
      },
      {
        question: "Explain your most important project in detail.",
        description:
          "Discuss the problem, architecture, technologies, your contribution, challenges, and final outcome."
      },
      {
        question: "How would you improve your project for a production environment?",
        description:
          "Discuss scalability, security, performance, reliability, monitoring, and maintainability."
      },
      {
        question: "What are the limitations of your project and how would you solve them?",
        description:
          "Identify realistic limitations and explain how you would improve the system."
      },
      {
        question: "Tell me about a difficult technical decision you made.",
        description:
          "Explain the situation, alternatives you considered, your decision, and the result."
      },
      {
        question: "How would you handle a disagreement with a teammate about a technical decision?",
        description:
          "Explain how you would communicate, compare alternatives, and reach a practical solution."
      },
      {
        question: "What value can you bring to our organization?",
        description:
          "Explain how your technical expertise, problem-solving skills, adaptability, and professional mindset can contribute to the organization."
      }
    ]
  };


  /* =====================================================
     TECHNICAL QUESTION BANK
  ===================================================== */

  const technicalQuestionBank = {

    /* ================================================
       JAVA DEVELOPER
    ================================================ */

    "Java Developer": {

      Beginner: [
        {
          question: "Tell me about your project.",
          description:
            "Explain the project, its purpose, technologies used, and your contribution."
        },
        {
          question: "What is Java?",
          description:
            "Explain Java and its main features."
        },
        {
          question: "What is the difference between JDK, JRE, and JVM?",
          description:
            "Explain the purpose of JDK, JRE, and JVM."
        },
        {
          question: "What is a class and object in Java?",
          description:
            "Explain classes and objects with a simple example."
        },
        {
          question: "What are the main OOP concepts in Java?",
          description:
            "Explain inheritance, encapsulation, polymorphism, and abstraction."
        },
        {
          question: "What is the difference between == and equals() in Java?",
          description:
            "Explain how == and equals() are used in Java."
        }
      ],

      Intermediate: [
        {
          question: "Tell me about your project and explain how Java was used in it.",
          description:
            "Explain your project architecture and the role of Java in the application."
        },
        {
          question: "Why did you choose Java for your project?",
          description:
            "Explain the advantages of Java for your project."
        },
        {
          question: "Explain exception handling in Java.",
          description:
            "Explain try, catch, finally, throw, and throws."
        },
        {
          question: "What is the difference between ArrayList and LinkedList?",
          description:
            "Compare ArrayList and LinkedList based on performance and use cases."
        },
        {
          question: "What is the difference between HashMap and HashSet?",
          description:
            "Explain their internal purpose and common use cases."
        },
        {
          question: "What is multithreading in Java?",
          description:
            "Explain threads and why multithreading is useful."
        }
      ],

      Advanced: [
        {
          question: "Explain the architecture of your Java project.",
          description:
            "Explain the complete flow from request to response and the role of each layer."
        },
        {
          question: "How would you improve your Java project for production?",
          description:
            "Discuss scalability, security, performance, logging, exception handling, and maintainability."
        },
        {
          question: "How does JVM memory management work?",
          description:
            "Explain stack, heap, garbage collection, and memory management."
        },
        {
          question: "What is the difference between synchronized and volatile?",
          description:
            "Explain how synchronized and volatile behave in concurrent applications."
        },
        {
          question: "How would you optimize a slow Java application?",
          description:
            "Discuss profiling, database optimization, memory usage, algorithms, and caching."
        },
        {
          question: "How would you design a scalable Java backend?",
          description:
            "Explain application architecture, database design, caching, load balancing, and scalability."
        }
      ]
    },


    /* ================================================
       REACT DEVELOPER
    ================================================ */

    "React Developer": {

      Beginner: [
        {
          question: "Tell me about your project.",
          description:
            "Explain your project and describe how React was used."
        },
        {
          question: "What is React?",
          description:
            "Explain React and why it is used."
        },
        {
          question: "What is a component in React?",
          description:
            "Explain React components with an example."
        },
        {
          question: "What are props in React?",
          description:
            "Explain props and how data is passed between components."
        },
        {
          question: "What is state in React?",
          description:
            "Explain state and how it changes a component."
        },
        {
          question: "What is JSX?",
          description:
            "Explain JSX and how it is used in React."
        }
      ],

      Intermediate: [
        {
          question: "Explain your React project architecture.",
          description:
            "Explain how your components, pages, routes, and services are organized."
        },
        {
          question: "Why did you choose React for your project?",
          description:
            "Explain the benefits of React for your application."
        },
        {
          question: "Explain useState and useEffect.",
          description:
            "Explain their purpose and common use cases."
        },
        {
          question: "What is React Router?",
          description:
            "Explain routing and navigation in React applications."
        },
        {
          question: "How do you call an API from React?",
          description:
            "Explain how frontend communicates with a backend API."
        },
        {
          question: "What is conditional rendering?",
          description:
            "Explain how React displays different UI based on conditions."
        }
      ],

      Advanced: [
        {
          question: "How would you optimize your React project?",
          description:
            "Discuss component optimization, rendering, lazy loading, memoization, and code splitting."
        },
        {
          question: "How would you design a scalable React application?",
          description:
            "Explain folder structure, reusable components, state management, routing, and API handling."
        },
        {
          question: "What causes unnecessary re-renders in React?",
          description:
            "Explain common causes and how you would prevent unnecessary rendering."
        },
        {
          question: "Explain useMemo and useCallback.",
          description:
            "Explain when and why these hooks are useful."
        },
        {
          question: "How would you improve the performance of a large React application?",
          description:
            "Discuss lazy loading, code splitting, memoization, virtualization, and API optimization."
        },
        {
          question: "How would you handle authentication in a React application?",
          description:
            "Explain login flow, token handling, protected routes, and logout."
        }
      ]
    },


    /* ================================================
       FULL STACK DEVELOPER
    ================================================ */

    "Full Stack Developer": {

      Beginner: [
        {
          question: "Tell me about your project.",
          description:
            "Explain your full-stack project and describe the frontend, backend, and database."
        },
        {
          question: "What technologies did you use in your project?",
          description:
            "Explain the frontend, backend, database, and development tools."
        },
        {
          question: "What is frontend development?",
          description:
            "Explain the role of frontend technologies."
        },
        {
          question: "What is backend development?",
          description:
            "Explain the role of backend technologies."
        },
        {
          question: "What is a database?",
          description:
            "Explain why databases are used in web applications."
        },
        {
          question: "What is an API?",
          description:
            "Explain APIs and how frontend and backend communicate."
        }
      ],

      Intermediate: [
        {
          question: "Explain the architecture of your full-stack project.",
          description:
            "Explain the complete flow between frontend, backend, API, and database."
        },
        {
          question: "How does your frontend communicate with the backend?",
          description:
            "Explain HTTP requests, APIs, responses, and data exchange."
        },
        {
          question: "Why did you choose your frontend and backend technologies?",
          description:
            "Explain the reasons behind your technology choices."
        },
        {
          question: "How did you handle authentication in your project?",
          description:
            "Explain login, registration, tokens, sessions, or JWT."
        },
        {
          question: "How do you handle errors in a full-stack application?",
          description:
            "Explain frontend and backend error handling."
        },
        {
          question: "What is REST API?",
          description:
            "Explain REST principles and common HTTP methods."
        }
      ],

      Advanced: [
        {
          question: "How would you scale your full-stack project for thousands of users?",
          description:
            "Discuss database optimization, caching, load balancing, scalability, and backend architecture."
        },
        {
          question: "How would you improve the security of your application?",
          description:
            "Discuss authentication, authorization, validation, encryption, and secure APIs."
        },
        {
          question: "How would you improve the performance of your application?",
          description:
            "Discuss frontend optimization, backend optimization, database indexing, and caching."
        },
        {
          question: "What changes would you make before deploying your project to production?",
          description:
            "Discuss testing, security, monitoring, deployment, logging, and scalability."
        },
        {
          question: "How would you design a scalable full-stack architecture?",
          description:
            "Explain frontend, backend services, database, caching, and deployment architecture."
        },
        {
          question: "What are the biggest limitations of your project?",
          description:
            "Identify limitations and explain how you would solve them."
        }
      ]
    },


    /* ================================================
       SOFTWARE DEVELOPER
    ================================================ */

    "Software Developer": {

      Beginner: [
        {
          question: "Tell me about yourself.",
          description:
            "Introduce yourself, your education, technical skills, projects, and career goals."
        },
        {
          question: "Tell me about your project.",
          description:
            "Explain your project, technologies used, and your contribution."
        },
        {
          question: "What programming languages do you know?",
          description:
            "Explain the programming languages you have learned and where you use them."
        },
        {
          question: "What is OOP?",
          description:
            "Explain object-oriented programming and its main concepts."
        },
        {
          question: "What is an algorithm?",
          description:
            "Explain algorithms and why they are important."
        },
        {
          question: "What is Git?",
          description:
            "Explain Git and why developers use version control."
        }
      ],

      Intermediate: [
        {
          question: "Explain your project architecture.",
          description:
            "Explain the major components and how they work together."
        },
        {
          question: "What was the most difficult part of your project?",
          description:
            "Explain the challenge and how you solved it."
        },
        {
          question: "How do you debug a software application?",
          description:
            "Explain your process for finding and fixing bugs."
        },
        {
          question: "What is the difference between process and thread?",
          description:
            "Explain processes, threads, and their differences."
        },
        {
          question: "What is database normalization?",
          description:
            "Explain normalization and why it is used."
        },
        {
          question: "How do you test your application?",
          description:
            "Explain different testing approaches and their purpose."
        }
      ],

      Advanced: [
        {
          question: "How would you design a scalable software application?",
          description:
            "Explain architecture, scalability, reliability, and maintainability."
        },
        {
          question: "How would you improve the architecture of your project?",
          description:
            "Discuss design patterns, modularity, scalability, and maintainability."
        },
        {
          question: "How would you handle a major production bug?",
          description:
            "Explain investigation, communication, rollback, fixing, and prevention."
        },
        {
          question: "How do you design software for maintainability?",
          description:
            "Discuss clean code, modularity, testing, documentation, and design principles."
        },
        {
          question: "How would you optimize a slow application?",
          description:
            "Discuss profiling, algorithms, database optimization, caching, and resource usage."
        },
        {
          question: "How do you make technical decisions when requirements are unclear?",
          description:
            "Explain how you gather information, evaluate alternatives, and make decisions."
        }
      ]
    },


    /* ================================================
       UI/UX DESIGNER
    ================================================ */

    "UI/UX Designer": {

      Beginner: [
        {
          question: "Tell me about yourself.",
          description:
            "Introduce yourself, your design skills, tools, projects, and career goals."
        },
        {
          question: "Tell me about your design project.",
          description:
            "Explain the project, target users, design process, and your contribution."
        },
        {
          question: "What is UI design?",
          description:
            "Explain user interface design."
        },
        {
          question: "What is UX design?",
          description:
            "Explain user experience design."
        },
        {
          question: "Which design tools do you use?",
          description:
            "Explain tools such as Figma or other design software."
        },
        {
          question: "What is a wireframe?",
          description:
            "Explain wireframes and their purpose."
        }
      ],

      Intermediate: [
        {
          question: "Explain your design project and the design process you followed.",
          description:
            "Explain research, wireframing, prototyping, testing, and final design."
        },
        {
          question: "How did you identify user requirements?",
          description:
            "Explain how you understand user needs before designing."
        },
        {
          question: "What is user research?",
          description:
            "Explain research methods used to understand users."
        },
        {
          question: "What is responsive design?",
          description:
            "Explain how interfaces adapt to different screen sizes."
        },
        {
          question: "How do you handle feedback on your design?",
          description:
            "Explain how you evaluate and apply useful feedback."
        },
        {
          question: "What makes a good user interface?",
          description:
            "Discuss usability, consistency, accessibility, hierarchy, and simplicity."
        }
      ],

      Advanced: [
        {
          question: "How would you improve the UX of an existing application?",
          description:
            "Explain research, usability testing, analytics, redesign, and validation."
        },
        {
          question: "How would you design an application for a large and diverse user base?",
          description:
            "Discuss accessibility, usability, responsive design, and personalization."
        },
        {
          question: "How do you measure whether a design is successful?",
          description:
            "Discuss usability metrics, conversion, engagement, and user feedback."
        },
        {
          question: "How do you balance business requirements with user needs?",
          description:
            "Explain how you find practical solutions that satisfy both."
        },
        {
          question: "How would you improve the accessibility of your design?",
          description:
            "Discuss contrast, typography, keyboard navigation, screen readers, and usability."
        },
        {
          question: "Explain how you would redesign a poorly designed application.",
          description:
            "Explain your research, analysis, redesign, prototyping, and testing approach."
        }
      ]
    },


    /* ================================================
       GAME DEVELOPER
    ================================================ */

    "Game Developer": {

      Beginner: [
        {
          question: "Tell me about your game project.",
          description:
            "Explain your game, gameplay concept, technologies, and your contribution."
        },
        {
          question: "What game engine have you used?",
          description:
            "Explain the game engine and why you used it."
        },
        {
          question: "What is a game loop?",
          description:
            "Explain the basic game loop."
        },
        {
          question: "What is collision detection?",
          description:
            "Explain how games detect collisions between objects."
        },
        {
          question: "What programming language do you use for game development?",
          description:
            "Explain the language and why it is useful for game development."
        },
        {
          question: "What is a game object?",
          description:
            "Explain game objects and their role in a game."
        }
      ],

      Intermediate: [
        {
          question: "Explain the architecture of your game project.",
          description:
            "Explain game objects, scenes, scripts, assets, and game logic."
        },
        {
          question: "What was the most challenging part of your game project?",
          description:
            "Explain a technical or design challenge and how you solved it."
        },
        {
          question: "How do you optimize game performance?",
          description:
            "Discuss rendering, memory, assets, physics, and CPU/GPU usage."
        },
        {
          question: "How does collision detection work?",
          description:
            "Explain collision systems and common approaches."
        },
        {
          question: "What is physics simulation?",
          description:
            "Explain physics systems used in games."
        },
        {
          question: "How do you manage game states?",
          description:
            "Explain menus, gameplay, pause, game over, and restart states."
        }
      ],

      Advanced: [
        {
          question: "How would you optimize a large game?",
          description:
            "Discuss rendering optimization, memory management, asset loading, and performance."
        },
        {
          question: "How would you design a scalable game architecture?",
          description:
            "Explain modular systems, game states, reusable components, and maintainability."
        },
        {
          question: "How would you handle multiplayer synchronization?",
          description:
            "Discuss networking, latency, state synchronization, and server authority."
        },
        {
          question: "How would you reduce memory usage in a large game?",
          description:
            "Discuss asset optimization, object pooling, streaming, and resource management."
        },
        {
          question: "How would you debug a game that suddenly drops FPS?",
          description:
            "Explain profiling and performance debugging."
        },
        {
          question: "How would you design a reliable save system?",
          description:
            "Explain save data, serialization, validation, and recovery."
        }
      ]
    },


    /* ================================================
       PYTHON DEVELOPER
    ================================================ */

    "Python Developer": {

      Beginner: [
        {
          question: "Tell me about your Python project.",
          description:
            "Explain your project, Python usage, libraries, and your contribution."
        },
        {
          question: "What is Python?",
          description:
            "Explain Python and its main features."
        },
        {
          question: "What are lists and tuples in Python?",
          description:
            "Explain their differences and common use cases."
        },
        {
          question: "What is a dictionary in Python?",
          description:
            "Explain key-value pairs and dictionary usage."
        },
        {
          question: "What is a function in Python?",
          description:
            "Explain functions and why they are useful."
        },
        {
          question: "What is exception handling in Python?",
          description:
            "Explain try, except, else, and finally."
        }
      ],

      Intermediate: [
        {
          question: "Explain the architecture of your Python project.",
          description:
            "Explain the major modules and how they communicate."
        },
        {
          question: "Why did you choose Python for your project?",
          description:
            "Explain Python's advantages for your use case."
        },
        {
          question: "What are decorators in Python?",
          description:
            "Explain decorators and common use cases."
        },
        {
          question: "What is list comprehension?",
          description:
            "Explain list comprehensions with examples."
        },
        {
          question: "How do you handle exceptions in a Python application?",
          description:
            "Explain structured exception handling and error management."
        },
        {
          question: "What is the difference between a list and a set?",
          description:
            "Compare lists and sets based on ordering, duplicates, and performance."
        }
      ],

      Advanced: [
        {
          question: "How would you optimize a slow Python application?",
          description:
            "Discuss profiling, algorithms, database optimization, caching, and concurrency."
        },
        {
          question: "How would you design a scalable Python backend?",
          description:
            "Discuss APIs, services, databases, caching, and deployment."
        },
        {
          question: "Explain Python memory management.",
          description:
            "Explain references, garbage collection, and memory allocation."
        },
        {
          question: "How would you handle concurrency in Python?",
          description:
            "Discuss threading, multiprocessing, and asynchronous programming."
        },
        {
          question: "How would you improve the security of a Python API?",
          description:
            "Discuss authentication, authorization, validation, and secure data handling."
        },
        {
          question: "How would you deploy a Python application to production?",
          description:
            "Discuss testing, environment configuration, deployment, monitoring, and logging."
        }
      ]
    },


    /* ================================================
       DATA ANALYST
    ================================================ */

    "Data Analyst": {

      Beginner: [
        {
          question: "Tell me about your data analysis project.",
          description:
            "Explain the dataset, objective, tools used, and your contribution."
        },
        {
          question: "What is data analysis?",
          description:
            "Explain data analysis and why it is important."
        },
        {
          question: "What is data cleaning?",
          description:
            "Explain how missing, duplicate, and incorrect data are handled."
        },
        {
          question: "What is SQL?",
          description:
            "Explain SQL and its role in data analysis."
        },
        {
          question: "What is the difference between mean and median?",
          description:
            "Explain mean and median and when they are useful."
        },
        {
          question: "What is data visualization?",
          description:
            "Explain why charts and graphs are used."
        }
      ],

      Intermediate: [
        {
          question: "Explain your data analysis project step by step.",
          description:
            "Explain data collection, cleaning, analysis, visualization, and conclusions."
        },
        {
          question: "How did you handle missing values in your project?",
          description:
            "Explain different methods for handling missing data."
        },
        {
          question: "What is the difference between WHERE and HAVING in SQL?",
          description:
            "Explain their purpose and differences."
        },
        {
          question: "What are joins in SQL?",
          description:
            "Explain INNER, LEFT, RIGHT, and FULL joins."
        },
        {
          question: "How do you identify outliers?",
          description:
            "Explain methods such as IQR and visualization."
        },
        {
          question: "How do you choose the right chart for data?",
          description:
            "Explain how the type of data and objective influence visualization choice."
        }
      ],

      Advanced: [
        {
          question: "How would you approach a large and messy dataset?",
          description:
            "Explain your complete data analysis workflow."
        },
        {
          question: "How would you ensure the accuracy of your analysis?",
          description:
            "Discuss data validation, cleaning, assumptions, and verification."
        },
        {
          question: "How would you optimize a slow SQL query?",
          description:
            "Discuss indexes, joins, execution plans, filtering, and query structure."
        },
        {
          question: "How would you explain complex analytical results to a non-technical manager?",
          description:
            "Explain how you simplify technical findings into business insights."
        },
        {
          question: "How would you handle conflicting data from different sources?",
          description:
            "Explain validation, reconciliation, and source verification."
        },
        {
          question: "How would you design a dashboard for business decision-making?",
          description:
            "Discuss KPIs, visualizations, filters, usability, and business goals."
        }
      ]
    },


    /* ================================================
       DATA SCIENTIST
    ================================================ */

    "Data Scientist": {

      Beginner: [
        {
          question: "Tell me about your machine learning project.",
          description:
            "Explain the problem, dataset, model, tools, and your contribution."
        },
        {
          question: "What is machine learning?",
          description:
            "Explain machine learning in simple terms."
        },
        {
          question: "What is supervised learning?",
          description:
            "Explain supervised learning with examples."
        },
        {
          question: "What is regression?",
          description:
            "Explain regression and where it is used."
        },
        {
          question: "What is classification?",
          description:
            "Explain classification and give examples."
        },
        {
          question: "What is a dataset?",
          description:
            "Explain datasets and features."
        }
      ],

      Intermediate: [
        {
          question: "Explain your machine learning project step by step.",
          description:
            "Explain data preprocessing, feature selection, model training, evaluation, and results."
        },
        {
          question: "Why did you choose the machine learning algorithm used in your project?",
          description:
            "Explain your model choice and its advantages."
        },
        {
          question: "What is overfitting?",
          description:
            "Explain overfitting and how it can be reduced."
        },
        {
          question: "What is train-test split?",
          description:
            "Explain why data is divided into training and testing sets."
        },
        {
          question: "What is confusion matrix?",
          description:
            "Explain true positives, true negatives, false positives, and false negatives."
        },
        {
          question: "What is feature scaling?",
          description:
            "Explain normalization and standardization."
        }
      ],

      Advanced: [
        {
          question: "How would you improve the performance of your machine learning model?",
          description:
            "Discuss feature engineering, hyperparameter tuning, validation, and model selection."
        },
        {
          question: "How would you deploy your machine learning model?",
          description:
            "Explain model serving, APIs, monitoring, and production deployment."
        },
        {
          question: "How would you handle an imbalanced dataset?",
          description:
            "Discuss resampling, class weights, and suitable evaluation metrics."
        },
        {
          question: "How would you detect data leakage?",
          description:
            "Explain data leakage and methods to prevent it."
        },
        {
          question: "How would you select the best model for a business problem?",
          description:
            "Discuss metrics, business requirements, interpretability, and performance."
        },
        {
          question: "How would you monitor a machine learning model in production?",
          description:
            "Discuss performance monitoring, data drift, model drift, and retraining."
        }
      ]
    },


    /* ================================================
       ANDROID DEVELOPER
    ================================================ */

    "Android Developer": {

      Beginner: [
        {
          question: "Tell me about your Android project.",
          description:
            "Explain your Android application, its purpose, technologies, and your contribution."
        },
        {
          question: "What is Android?",
          description:
            "Explain Android and its role in mobile application development."
        },
        {
          question: "What is an Activity?",
          description:
            "Explain Activities and their purpose."
        },
        {
          question: "What is an Intent?",
          description:
            "Explain explicit and implicit intents."
        },
        {
          question: "What is Android Studio?",
          description:
            "Explain Android Studio and its role in Android development."
        },
        {
          question: "What is a layout in Android?",
          description:
            "Explain layouts and how they are used to build UI."
        }
      ],

      Intermediate: [
        {
          question: "Explain the architecture of your Android project.",
          description:
            "Explain activities, fragments, services, data layers, and APIs used in your application."
        },
        {
          question: "What was the most challenging part of your Android project?",
          description:
            "Explain the challenge and how you solved it."
        },
        {
          question: "What is the Android activity lifecycle?",
          description:
            "Explain important lifecycle methods."
        },
        {
          question: "How does an Android application communicate with an API?",
          description:
            "Explain network requests, responses, and data handling."
        },
        {
          question: "What is RecyclerView?",
          description:
            "Explain RecyclerView and why it is used."
        },
        {
          question: "How do you handle permissions in Android?",
          description:
            "Explain runtime permissions and secure permission handling."
        }
      ],

      Advanced: [
        {
          question: "How would you improve the performance of your Android application?",
          description:
            "Discuss memory, network, UI rendering, database, and battery optimization."
        },
        {
          question: "How would you design a scalable Android application?",
          description:
            "Discuss architecture, separation of concerns, data management, and maintainability."
        },
        {
          question: "How would you handle offline functionality?",
          description:
            "Explain local storage, synchronization, caching, and conflict handling."
        },
        {
          question: "How would you secure sensitive data in an Android application?",
          description:
            "Discuss secure storage, authentication, encryption, and API security."
        },
        {
          question: "How would you debug an Android application that crashes frequently?",
          description:
            "Explain logs, stack traces, reproduction, debugging, and testing."
        },
        {
          question: "How would you reduce battery consumption?",
          description:
            "Discuss background tasks, network usage, location updates, and efficient processing."
        }
      ]
    },


    /* ================================================
       DEVOPS ENGINEER
    ================================================ */

    "DevOps Engineer": {

      Beginner: [
        {
          question: "Tell me about your DevOps project.",
          description:
            "Explain your project, deployment process, tools, and your contribution."
        },
        {
          question: "What is DevOps?",
          description:
            "Explain DevOps and its main objectives."
        },
        {
          question: "What is Git?",
          description:
            "Explain Git and version control."
        },
        {
          question: "What is CI/CD?",
          description:
            "Explain continuous integration and continuous deployment."
        },
        {
          question: "What is Docker?",
          description:
            "Explain containers and Docker."
        },
        {
          question: "What is cloud computing?",
          description:
            "Explain cloud computing and its benefits."
        }
      ],

      Intermediate: [
        {
          question: "Explain your DevOps project architecture.",
          description:
            "Explain source code, build, testing, deployment, containers, and infrastructure."
        },
        {
          question: "How did you automate deployment in your project?",
          description:
            "Explain CI/CD pipelines and deployment automation."
        },
        {
          question: "What is a Docker image and container?",
          description:
            "Explain their differences and relationship."
        },
        {
          question: "What is Kubernetes?",
          description:
            "Explain Kubernetes and container orchestration."
        },
        {
          question: "How do you monitor an application?",
          description:
            "Explain logs, metrics, monitoring tools, and alerts."
        },
        {
          question: "What is infrastructure as code?",
          description:
            "Explain infrastructure automation and tools used for it."
        }
      ],

      Advanced: [
        {
          question: "How would you design a scalable CI/CD pipeline?",
          description:
            "Discuss automated testing, builds, deployments, security, rollback, and monitoring."
        },
        {
          question: "How would you deploy a highly available application?",
          description:
            "Discuss load balancing, multiple instances, health checks, and failover."
        },
        {
          question: "How would you secure a CI/CD pipeline?",
          description:
            "Discuss secrets management, access control, dependency scanning, and secure deployments."
        },
        {
          question: "How would you troubleshoot a production deployment failure?",
          description:
            "Explain logs, monitoring, rollback, root cause analysis, and prevention."
        },
        {
          question: "How would you design infrastructure for thousands of users?",
          description:
            "Discuss scalability, load balancing, containers, databases, caching, and monitoring."
        },
        {
          question: "How would you reduce cloud infrastructure costs?",
          description:
            "Discuss resource optimization, autoscaling, monitoring, and efficient architecture."
        }
      ]
    }
  };


  /* =====================================================
     GET INTERVIEW QUESTIONS
  ===================================================== */

  const getInterviewQuestions = (config) => {
    const difficulty =
      config.difficulty || "Intermediate";

    const type =
      config.type || "Mixed";

    const role =
      config.role || "Software Developer";

    /* HR INTERVIEW */

    if (type === "HR") {
      return hrQuestionBank[difficulty];
    }

    /* TECHNICAL INTERVIEW */

    if (type === "Technical") {
      const roleQuestions =
        technicalQuestionBank[role];

      if (roleQuestions) {
        return roleQuestions[difficulty];
      }

      return technicalQuestionBank[
        "Software Developer"
      ][difficulty];
    }

    /* MIXED INTERVIEW */

    const hrQuestions =
      hrQuestionBank[difficulty] || [];

    const technicalQuestions =
      technicalQuestionBank[role]?.[difficulty] ||
      technicalQuestionBank[
        "Software Developer"
      ][difficulty];

    return [
      ...hrQuestions.slice(0, 3),
      ...technicalQuestions.slice(0, 3)
    ];
  };


  const questions =
    getInterviewQuestions(interviewConfig);

  const currentQuestionData =
    questions[currentQuestion];


  /* =====================================================
     CAMERA + MICROPHONE
  ===================================================== */

  const stopCamera = () => {
    console.log("Stopping camera and microphone...");

    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }

    if (proctoringIntervalRef.current) {
      clearInterval(proctoringIntervalRef.current);
      proctoringIntervalRef.current = null;
    }

    isScanningRef.current = false;
    setMultiplePeopleAlert(null);
    consecutiveMultiplePeopleRef.current = 0;
    consecutiveSinglePersonRef.current = 0;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraOn(false);
    setIsMicOn(false);
  };


  const startCamera = async () => {
    try {
      setCameraError("");

      console.log("Requesting camera + microphone...");

      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setCameraError(
          "Camera and microphone are not supported in this browser."
        );
        return;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });

        streamRef.current = null;
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user"
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

      console.log("MEDIA ACCESS GRANTED");

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        try {
          await videoRef.current.play();
        } catch (error) {
          console.log("Video play handled by browser.");
        }
      }

      const videoTrack =
        stream.getVideoTracks()[0];

      if (videoTrack) {
        videoTrack.enabled = true;
        setIsCameraOn(true);

        console.log(
          "CAMERA ENABLED:",
          videoTrack.label
        );
      } else {
        setIsCameraOn(false);
      }

      const audioTrack =
        stream.getAudioTracks()[0];

      if (audioTrack) {
        audioTrack.enabled = true;
        setIsMicOn(true);

        console.log(
          "MICROPHONE ENABLED:",
          audioTrack.label
        );
      } else {
        setIsMicOn(false);
      }

    } catch (error) {
      console.error(
        "CAMERA/MICROPHONE ERROR:",
        error
      );

      setIsCameraOn(false);
      setIsMicOn(false);

      if (error.name === "NotAllowedError") {
        setCameraError(
          "Permission blocked. Please allow Camera and Microphone in Chrome site settings."
        );
      } else if (error.name === "NotFoundError") {
        setCameraError(
          "Camera or microphone was not found. Please check your device."
        );
      } else if (error.name === "NotReadableError") {
        setCameraError(
          "Camera or microphone is being used by another application."
        );
      } else if (error.name === "SecurityError") {
        setCameraError(
          "Camera access requires localhost or HTTPS."
        );
      } else {
        setCameraError(
          `Unable to access camera/microphone: ${error.name}`
        );
      }
    }
  };


  /* =====================================================
     INITIALIZE CAMERA
  ===================================================== */

  useEffect(() => {
    let cancelled = false;

    const initializeMedia = async () => {
      try {
        setCameraError("");

        if (
          !navigator.mediaDevices ||
          !navigator.mediaDevices.getUserMedia
        ) {
          setCameraError(
            "Camera and microphone are not supported."
          );
          return;
        }

        console.log(
          "Initializing camera and microphone..."
        );

        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user"
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });

        if (cancelled) {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }

        streamRef.current = stream;

        console.log("CAMERA + MIC ACCESS GRANTED");

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          try {
            await videoRef.current.play();
          } catch (error) {
            console.log(
              "Video autoplay handled by browser."
            );
          }
        }

        const videoTrack =
          stream.getVideoTracks()[0];

        const audioTrack =
          stream.getAudioTracks()[0];

        if (videoTrack) {
          videoTrack.enabled = true;
          setIsCameraOn(true);

          console.log(
            "CAMERA ON:",
            videoTrack.label
          );
        }

        if (audioTrack) {
          audioTrack.enabled = true;
          setIsMicOn(true);

          console.log(
            "MIC ON:",
            audioTrack.label
          );
        }

      } catch (error) {
        console.error(
          "INITIAL MEDIA ERROR:",
          error
        );

        if (error.name === "NotAllowedError") {
          setCameraError(
            "Camera and microphone permission was blocked. Allow both permissions in Chrome."
          );
        } else if (error.name === "NotFoundError") {
          setCameraError(
            "Camera or microphone was not found."
          );
        } else if (error.name === "NotReadableError") {
          setCameraError(
            "Camera or microphone is already being used by another application."
          );
        } else {
          setCameraError(
            `Unable to access camera/microphone: ${error.name}`
          );
        }

        setIsCameraOn(false);
        setIsMicOn(false);
      }
    };

    initializeMedia();

    return () => {
      cancelled = true;

      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });

        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  /* =====================================================
     CAMERA PROCTORING: COCO-SSD OBJECT DETECTION
  ===================================================== */

  const triggerProctoringWarning = (violation, currentStrike) => {
    setCameraWarning({
      ...violation,
      strike: currentStrike,
      maxStrikes: 3
    });

    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
    }
    warningTimerRef.current = setTimeout(() => {
      setCameraWarning(null);
    }, 7000);
  };

  const handleProctoringDisqualification = (violation, finalStrike) => {
    endingInterviewRef.current = true;
    setIsTerminated(true);

    const termData = {
      sessionId: sessionIdRef.current,
      questionNumber: currentQuestion + 1,
      violationType: violation.type,
      warningMessage: `${violation.title}: ${violation.message} Repeated violations detected (Strike ${finalStrike}/3). The candidate has been disqualified and removed from this interview.`,
      timestamp: new Date().toISOString(),
      role: interviewConfig.role,
      difficulty: interviewConfig.difficulty,
      isBlocked: true,
      strikes: finalStrike,
      disqualificationReason: `Candidate removed and blocked from the test due to repeated proctoring violations (${violation.title}).`
    };

    localStorage.setItem("interviewTerminated", JSON.stringify(termData));

    // Record violation in backend database
    try {
      fetch("http://localhost:8080/api/interview/record-violation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          questionNumber: currentQuestion + 1,
          violationType: violation.type,
          warningMessage: termData.warningMessage,
          terminateInterview: true
        })
      }).catch((err) => console.warn("Could not log violation to backend:", err));
    } catch (e) {}

    stopCamera();
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }

    setViolationAlert(termData);

    setTimeout(() => {
      navigate("/terminated");
    }, 3500);
  };

  // 1. Load AI vision models once (BlazeFace + COCO-SSD cached module-wide across StrictMode remounts)
  useEffect(() => {
    let cancelled = false;

    const loadVisionModels = async () => {
      if (cachedCocoModel || cachedBlazeFaceModel) {
        if (cachedCocoModel) cocoModelRef.current = cachedCocoModel;
        if (cachedBlazeFaceModel) blazeFaceModelRef.current = cachedBlazeFaceModel;
        setProctoringStats((prev) => ({ ...prev, modelReady: true }));
        return;
      }

      if (modelsLoadingPromise) {
        try {
          await modelsLoadingPromise;
          if (!cancelled) {
            if (cachedCocoModel) cocoModelRef.current = cachedCocoModel;
            if (cachedBlazeFaceModel) blazeFaceModelRef.current = cachedBlazeFaceModel;
            setProctoringStats((prev) => ({ ...prev, modelReady: true }));
          }
        } catch (err) {
          console.warn("Error awaiting cached vision models:", err);
        }
        return;
      }

      isModelLoadingRef.current = true;
      modelsLoadingPromise = (async () => {
        try {
          console.log("Loading AI Vision models (BlazeFace + COCO-SSD) for camera proctoring...");
          const [blazeResult, cocoResult] = await Promise.allSettled([
            blazeface.load({ maxFaces: 5, scoreThreshold: 0.65 }),
            cocoSsd.load({ base: "lite_mobilenet_v2" })
          ]);

          if (blazeResult.status === "fulfilled") {
            cachedBlazeFaceModel = blazeResult.value;
            console.log("BlazeFace face detection model ready.");
          } else {
            console.warn("BlazeFace load failed:", blazeResult.reason);
          }

          if (cocoResult.status === "fulfilled") {
            cachedCocoModel = cocoResult.value;
            console.log("COCO-SSD object detection model ready.");
          } else {
            console.warn("COCO-SSD load failed:", cocoResult.reason);
          }

          if (cachedBlazeFaceModel || cachedCocoModel) {
            return true;
          }
          throw new Error("Both vision models failed to load");
        } finally {
          isModelLoadingRef.current = false;
        }
      })();

      try {
        await modelsLoadingPromise;
        if (!cancelled) {
          if (cachedCocoModel) cocoModelRef.current = cachedCocoModel;
          if (cachedBlazeFaceModel) blazeFaceModelRef.current = cachedBlazeFaceModel;
          setProctoringStats((prev) => ({ ...prev, modelReady: true }));
          console.log("Vision proctoring models active and ready.");
        }
      } catch (err) {
        console.warn("Could not initialize vision proctoring models:", err);
        modelsLoadingPromise = null;
      }
    };

    loadVisionModels();

    return () => {
      cancelled = true;
    };
  }, []);

  // Deduplicate overlapping bounding boxes for the same person (Non-Maximum Suppression)
  const filterUniquePersons = (personPredictions) => {
    if (!personPredictions || personPredictions.length <= 1) return personPredictions || [];

    const sorted = [...personPredictions].sort((a, b) => b.score - a.score);
    const kept = [];

    for (const item of sorted) {
      const [x1, y1, w1, h1] = item.bbox || [0, 0, 0, 0];
      const area1 = w1 * h1;
      let isDuplicate = false;

      for (const existing of kept) {
        const [x2, y2, w2, h2] = existing.bbox || [0, 0, 0, 0];
        const area2 = w2 * h2;

        const ix = Math.max(x1, x2);
        const iy = Math.max(y1, y2);
        const iw = Math.max(0, Math.min(x1 + w1, x2 + w2) - ix);
        const ih = Math.max(0, Math.min(y1 + h1, y2 + h2) - iy);
        const interArea = iw * ih;

        const unionArea = area1 + area2 - interArea;
        const iou = unionArea > 0 ? interArea / unionArea : 0;
        const minArea = Math.min(area1, area2);
        const containment = minArea > 0 ? interArea / minArea : 0;

        // Deduplicate only near-identical boxes (IoU > 0.70 or containment > 0.88)
        // Two people sitting or standing next to each other are preserved as separate individuals
        if (iou > 0.70 || containment > 0.88) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        kept.push(item);
      }
    }

    return kept;
  };

  // 2. Real-time Camera Proctoring loop with Dual Vision Fusion (BlazeFace + COCO-SSD)
  useEffect(() => {
    if (!isCameraOn || isTerminated || !proctoringStats.modelReady) {
      if (proctoringIntervalRef.current) {
        clearInterval(proctoringIntervalRef.current);
        proctoringIntervalRef.current = null;
      }
      return;
    }

    const runCameraProctoringScan = async () => {
      if (
        isScanningRef.current ||
        !videoRef.current ||
        (!cocoModelRef.current && !blazeFaceModelRef.current) ||
        endingInterviewRef.current ||
        isTerminated
      ) {
        return;
      }

      if (
        videoRef.current.readyState < 2 ||
        videoRef.current.videoWidth === 0 ||
        videoRef.current.videoHeight === 0
      ) {
        return;
      }

      isScanningRef.current = true;

      try {
        let detectedFaces = [];
        let detectedPersons = [];
        let detectedPhones = [];

        // 1. Precise Webcam Face Detection using BlazeFace
        if (blazeFaceModelRef.current) {
          try {
            const rawFaces = await blazeFaceModelRef.current.estimateFaces(videoRef.current, false);
            detectedFaces = (rawFaces || []).filter((face) => {
              const prob = Array.isArray(face.probability)
                ? face.probability[0]
                : typeof face.probability === "number"
                ? face.probability
                : 1;
              const [x1, y1] = face.topLeft || [0, 0];
              const [x2, y2] = face.bottomRight || [0, 0];
              const w = Math.abs(x2 - x1);
              const h = Math.abs(y2 - y1);
              // Face must have at least 65% probability and minimum 20x20 pixels
              return prob >= 0.65 && w >= 20 && h >= 20;
            });
          } catch (e) {
            // BlazeFace frame skip
          }
        }

        // 2. Full-body Person & Mobile Device Detection using COCO-SSD
        if (cocoModelRef.current) {
          try {
            const predictions = await cocoModelRef.current.detect(videoRef.current);

            // Filter detected people (confidence >= 0.35)
            const rawPersons = (predictions || []).filter(
              (p) => p.class === "person" && p.score >= 0.35
            );
            detectedPersons = filterUniquePersons(rawPersons);

            // Filter detected cell phones or handheld remote/devices (confidence >= 0.50)
            detectedPhones = (predictions || []).filter(
              (p) =>
                (p.class === "cell phone" || p.class === "remote") &&
                p.score >= 0.50
            );
          } catch (e) {
            // COCO-SSD frame skip
          }
        }

        // 3. Fallback: Browser Native FaceDetector API (Chromium experimental)
        if (detectedFaces.length === 0 && typeof window !== "undefined" && "FaceDetector" in window) {
          try {
            if (!faceDetectorRef.current) {
              faceDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
            }
            const nativeFaces = await faceDetectorRef.current.detect(videoRef.current);
            if (nativeFaces && nativeFaces.length > 0) {
              detectedFaces = nativeFaces;
            }
          } catch (e) {}
        }

        const faceCount = detectedFaces.length;
        const bodyCount = detectedPersons.length;

        // Accurate multi-person fusion:
        // - If >= 2 faces or >= 2 bodies are detected: 2+ people are present in frame
        // - If 0 faces and 0 bodies: 0 people in frame
        // - Otherwise: exactly 1 person is present (normal candidate)
        let effectivePersonCount = 1;
        if (faceCount >= 2 || bodyCount >= 2) {
          effectivePersonCount = Math.max(faceCount, bodyCount);
        } else if (faceCount === 0 && bodyCount === 0) {
          effectivePersonCount = 0;
        } else {
          effectivePersonCount = 1;
        }

        setProctoringStats((prev) => ({
          ...prev,
          active: true,
          personCount: effectivePersonCount,
          phoneDetected: detectedPhones.length > 0
        }));

        // Real-time Multiple Person Warning with stabilization & debouncing
        if (effectivePersonCount >= 2) {
          consecutiveMultiplePeopleRef.current += 1;
          consecutiveSinglePersonRef.current = 0;

          // Trigger warning immediately once multiple people are detected
          setMultiplePeopleAlert({
            count: effectivePersonCount,
            message: "⚠️ Multiple people detected! Please ensure that only you are visible in the camera frame."
          });
        } else if (effectivePersonCount === 1) {
          consecutiveSinglePersonRef.current += 1;
          consecutiveMultiplePeopleRef.current = 0;

          // Remove the warning after 2 consecutive stable scans of exactly one person
          if (consecutiveSinglePersonRef.current >= 2) {
            setMultiplePeopleAlert(null);
          }
        } else {
          // Zero people in frame
          consecutiveMultiplePeopleRef.current = 0;
          consecutiveSinglePersonRef.current = 0;
          setMultiplePeopleAlert(null);
        }

        let activeViolation = null;

        // STRICT POLICY: There should be ONE person in camera only
        if (effectivePersonCount >= 2) {
          activeViolation = {
            type: "CAMERA_MULTIPLE_PEOPLE",
            title: "Multiple People Detected",
            message: "⚠️ Multiple people detected! Please ensure that only you are visible in the camera frame.",
            personsDetected: effectivePersonCount
          };
        } else if (effectivePersonCount === 0) {
          activeViolation = {
            type: "CAMERA_NO_PERSON",
            title: "No Person in Camera Frame",
            message: "No candidate detected in camera view. The candidate must remain clearly visible in camera frame. There should be one person in camera only.",
            personsDetected: 0
          };
        } else if (detectedPhones.length > 0) {
          activeViolation = {
            type: "CAMERA_MOBILE_DEVICE",
            title: "Mobile Phone Detected",
            message: "A mobile phone or unauthorized electronic device was detected in camera view. External devices are strictly prohibited.",
            devicesDetected: detectedPhones.length
          };
        }

        if (activeViolation) {
          consecutiveViolationsRef.current += 1;
          const now = Date.now();
          const COOLDOWN_MS = 6000; // 6-second cooldown between strikes

          if (
            consecutiveViolationsRef.current >= 2 &&
            now - lastViolationTimeRef.current >= COOLDOWN_MS
          ) {
            lastViolationTimeRef.current = now;
            consecutiveViolationsRef.current = 0;

            const nextStrike = strikesRef.current + 1;
            strikesRef.current = nextStrike;
            setStrikes(nextStrike);

            if (nextStrike >= 3) {
              // 3rd strike: Candidate is blocked and removed from test
              handleProctoringDisqualification(activeViolation, nextStrike);
            } else {
              // Strike 1 or 2: issue clear warning banner
              triggerProctoringWarning(activeViolation, nextStrike);
            }
          }
        } else {
          consecutiveViolationsRef.current = Math.max(0, consecutiveViolationsRef.current - 1);
        }
      } catch (scanErr) {
        // Frame tick error ignored
      } finally {
        isScanningRef.current = false;
      }
    };

    // Fast, responsive scan interval (650ms)
    proctoringIntervalRef.current = setInterval(runCameraProctoringScan, 650);

    return () => {
      if (proctoringIntervalRef.current) {
        clearInterval(proctoringIntervalRef.current);
        proctoringIntervalRef.current = null;
      }
      isScanningRef.current = false;
    };
  }, [isCameraOn, isTerminated, proctoringStats.modelReady]);

  /* =====================================================
     TIMER
  ===================================================== */

  useEffect(() => {
    if (!isAnswering || timeLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAnswering, timeLeft]);


  /* =====================================================
     AUTO STOP WHEN TIMER FINISHES
  ===================================================== */

  useEffect(() => {
    if (timeLeft === 0 && isAnswering) {
      console.log(
        "Time finished. Automatically stopping answer."
      );

      stopAnswer();
    }
  }, [timeLeft, isAnswering]);


  /* =====================================================
     FORMAT TIMER
  ===================================================== */

  const formatTime = () => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };


  /* =====================================================
     MICROPHONE TOGGLE
  ===================================================== */

  const toggleMic = async () => {
    if (!streamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          try {
            await videoRef.current.play();
          } catch (error) {
            console.log("Video play handled by browser");
          }
        }

        setIsCameraOn(true);
        setIsMicOn(true);

        console.log("Camera + microphone restarted");

      } catch (error) {
        console.error("Microphone restart error:", error);

        setCameraError(
          "Please allow camera and microphone permission in Chrome."
        );
      }

      return;
    }

    const audioTrack = streamRef.current.getAudioTracks()[0];

    if (!audioTrack) {
      alert("Microphone is not available.");
      return;
    }

    audioTrack.enabled = !audioTrack.enabled;

    setIsMicOn(audioTrack.enabled);

    console.log(
      "Microphone:",
      audioTrack.enabled ? "ON" : "OFF"
    );
  };


  /* =====================================================
     START ANSWER RECORDING
  ===================================================== */

  const startAnswer = () => {
    setResponseSubmitted(false);

    if (!streamRef.current) {
      alert(
        "Please enable your camera and microphone first."
      );
      return;
    }

    if (!isMicOn) {
      alert(
        "Please turn on your microphone before starting your answer."
      );
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      alert("Recording is not supported in this browser.");
      return;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      console.warn("A recording is already running.");
      return;
    }

    try {
      recordedChunksRef.current = [];

      const stream = streamRef.current;

      /* =====================================================
         IMPROVE MICROPHONE AUDIO FOR AI ANALYSIS
      ===================================================== */

      let recordingStream = stream;

      try {
        const audioContext =
          new AudioContext();

        const source =
          audioContext.createMediaStreamSource(stream);

        const gainNode =
          audioContext.createGain();

        const compressor =
          audioContext.createDynamicsCompressor();

        /*
         * Increase microphone volume
         */
        gainNode.gain.value = 1.8;

        /*
         * Voice compression
         * Helps make quiet speech easier to detect
         */
        compressor.threshold.value = -50;
        compressor.knee.value = 20;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        const destination =
          audioContext.createMediaStreamDestination();

        source.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(destination);

        /*
         * Keep original camera/video track
         */
        const videoTrack =
          stream.getVideoTracks()[0];

        const processedAudioTrack =
          destination.stream.getAudioTracks()[0];

        recordingStream =
          new MediaStream([
            videoTrack,
            processedAudioTrack
          ]);

        console.log(
          "Enhanced microphone audio enabled."
        );

      } catch (error) {

        console.warn(
          "Audio enhancement unavailable. Using original stream.",
          error
        );

        recordingStream = stream;
      }

      let recorder;

      if (
        MediaRecorder.isTypeSupported(
          "video/webm;codecs=vp9,opus"
        )
      ) {
        recorder = new MediaRecorder(recordingStream, {
          mimeType: "video/webm;codecs=vp9,opus"
        });
      } else if (
        MediaRecorder.isTypeSupported(
          "video/webm;codecs=vp8,opus"
        )
      ) {
        recorder = new MediaRecorder(recordingStream, {
          mimeType: "video/webm;codecs=vp8,opus"
        });
      } else {
        recorder = new MediaRecorder(recordingStream);
      }

      mediaRecorderRef.current = recorder;

      /* -----------------------------------------
         CAPTURE CURRENT QUESTION
      ----------------------------------------- */

      const questionNumber = currentQuestion + 1;

      const questionText =
        currentQuestionData?.question ||
        "Interview Question";

      const startedAt = Date.now();

      /* -----------------------------------------
         RECORDING DATA
      ----------------------------------------- */

      recorder.ondataavailable = (event) => {
        if (
          event.data &&
          event.data.size > 0
        ) {
          recordedChunksRef.current.push(
            event.data
          );
        }
      };

      /* -----------------------------------------
         RECORDER ERROR
      ----------------------------------------- */

      recorder.onerror = (event) => {
        console.error(
          "MediaRecorder error:",
          event
        );
      };

      /* -----------------------------------------
         RECORDER ONSTOP WITH PROMISE TRACKING
      ----------------------------------------- */

      recorder.onstop = () => {

        const processingPromise = (async () => {

          try {

            const mimeType =
              recorder.mimeType ||
              "video/webm";

            const blob = new Blob(
              recordedChunksRef.current,
              {
                type: mimeType
              }
            );

            if (blob.size === 0) {

              console.warn(
                "No recording data available."
              );

              return;
            }

            /* -----------------------------------------
               CALCULATE RECORDING DURATION
            ----------------------------------------- */

            const duration = Math.max(
              1,
              Math.round(
                (Date.now() - startedAt) / 1000
              )
            );

            const recordedAt =
              new Date().toISOString();

            const answer = {
              questionNumber,
              question: questionText,
              blob,
              mimeType,
              duration,
              answered: true,
              recordedAt
            };

            /* -----------------------------------------
               SAVE TO REACT STATE
            ----------------------------------------- */

            setRecordedAnswers((previous) => {

              const filtered =
                previous.filter(
                  (item) =>
                    item.questionNumber !==
                    questionNumber
                );

              return [
                ...filtered,
                answer
              ];
            });

            /* -----------------------------------------
               SAVE TO REF
            ----------------------------------------- */

            recordedAnswersRef.current = [
              ...recordedAnswersRef.current.filter(
                (item) =>
                  item.questionNumber !==
                  questionNumber
              ),
              answer
            ];

            /* -----------------------------------------
               SAVE METADATA HISTORY
            ----------------------------------------- */

            answerHistoryRef.current = [
              ...answerHistoryRef.current.filter(
                (item) =>
                  item.questionNumber !==
                  questionNumber
              ),
              {
                questionNumber,
                question: questionText,
                duration,
                answered: true,
                recordedAt
              }
            ];

            localStorage.setItem(
              "interviewAnswers",
              JSON.stringify(
                answerHistoryRef.current
              )
            );

            console.log(
              "Answer recorded:",
              answer
            );

            /* -----------------------------------------
               UPLOAD ANSWER TO SPRING BOOT
            ----------------------------------------- */

            console.log(
              "Uploading answer to Spring Boot...",
              {
                questionNumber,
                fileSize: blob.size,
                duration
              }
            );

            const uploadResult =
              await uploadAnswerToBackend(answer);

            console.log(
              "Backend analysis response:",
              uploadResult
            );

            console.log(
              "FULL AI ANALYSIS:",
              JSON.stringify(
                uploadResult,
                null,
                2
              )
            );

            /* -----------------------------------------
               CHECK PROCTORING & ACOUSTIC INTEGRITY
            ----------------------------------------- */
            const integrity = uploadResult?.integrity || uploadResult?.aiAnalysis?.integrity;
            if (uploadResult?.violationDetected || integrity?.violationDetected) {
              const vType = uploadResult.violationType || integrity?.violationType || "MULTIPLE_VOICES";
              const warningMsg = uploadResult.warningMessage || integrity?.warningMessage ||
                "Warning: Multiple voices or excessive background noise detected. Please ensure you are alone and in a quiet environment.";

              console.warn("PROCTORING VIOLATION TRIGGERED:", { vType, warningMsg, integrity });

              const termData = {
                sessionId: sessionIdRef.current,
                questionNumber,
                violationType: vType,
                warningMessage: warningMsg,
                timestamp: new Date().toISOString(),
                metrics: integrity?.metrics || {},
                role: interviewConfig.role,
                difficulty: interviewConfig.difficulty
              };

              localStorage.setItem("interviewTerminated", JSON.stringify(termData));

              // Terminate interview immediately
              setIsTerminated(true);
              setViolationAlert(termData);
              stopCamera();
              if (mediaRecorderRef.current) {
                try { mediaRecorderRef.current.stop(); } catch (e) {}
              }

              // Give candidate 3 seconds to see the warning, then navigate to termination page
              setTimeout(() => {
                navigate("/terminated");
              }, 3200);

              return;
            }

            /* -----------------------------------------
               SAVE ACTUAL AI ANALYSIS
            ----------------------------------------- */

            if (
              uploadResult?.success &&
              uploadResult?.aiAnalysis
            ) {

              const aiAnalysis =
                uploadResult.aiAnalysis;

              const aiResult = {

                sessionId:
                  sessionIdRef.current,

                questionNumber,

                question:
                  questionText,

                ...aiAnalysis
              };

              aiAnalysesRef.current = [

                ...aiAnalysesRef.current.filter(
                  (item) =>
                    item.questionNumber !==
                    questionNumber
                ),

                aiResult
              ];

              localStorage.setItem(
                "interviewAIAnalyses",
                JSON.stringify(
                  aiAnalysesRef.current
                )
              );

              console.log(
                "AI Analysis Saved:",
                aiResult
              );

              setResponseSubmitted(true);

            } else {

              console.warn(
                "AI analysis was not immediately available, checking response content."
              );

              const rawTranscript = (uploadResult?.transcript || "").trim();
              const hasMeaningfulSpeech =
                rawTranscript.length > 5 &&
                rawTranscript.split(/\s+/).length >= 3 &&
                !rawTranscript.includes("captured - evaluation pending");

              const fallbackResult = {
                sessionId: sessionIdRef.current,
                questionNumber,
                question: questionText,
                durationSeconds: duration,
                transcript: rawTranscript || "(No spoken answer detected)",
                aiEvaluation: {
                  available: true,
                  evaluationOffline: true,
                  questionCategory: "Technical",
                  understanding: hasMeaningfulSpeech
                    ? "Pending Evaluation (AI Service Offline)"
                    : "No Spoken Answer Recorded",
                  understandingExplanation: hasMeaningfulSpeech
                    ? "Your spoken response was captured, but the AI evaluation service was unreachable."
                    : "No spoken response or answer was detected for this question.",
                  scoreOutOf10: 0.0,
                  overallScore: 0,
                  scoreExplanation: hasMeaningfulSpeech
                    ? "Score: 0/10. Evaluation service was offline during recording."
                    : "Score: 0/10 (0%). The question was left unanswered.",
                  relevanceScore: 0,
                  technicalAccuracyScore: 0,
                  conceptualUnderstandingScore: 0,
                  completenessScore: 0,
                  communicationScore: 0,
                  isIDontKnow: false,
                  isOffTopic: false,
                  hasContent: hasMeaningfulSpeech,
                  detailedEvaluation: hasMeaningfulSpeech
                    ? "Audio response was captured, but AI evaluation service was offline."
                    : "No spoken answer was detected for this question.",
                  whatYouDidWell: hasMeaningfulSpeech ? ["Attempted and recorded answer."] : [],
                  whatCanBeImproved: hasMeaningfulSpeech
                    ? ["Ensure AI service is running for automatic scoring."]
                    : ["Provide a clear spoken answer to this question."],
                  howToImprove: "Review core definitions and implementation examples.",
                  keyConceptsToRevise: [questionText.split(" ").slice(0, 3).join(" ")],
                  strengths: hasMeaningfulSpeech ? ["Attempted verbal response."] : [],
                  areasForImprovement: hasMeaningfulSpeech
                    ? ["Verify AI service connectivity."]
                    : ["Answer the question aloud."]
                }
              };

              aiAnalysesRef.current = [
                ...aiAnalysesRef.current.filter(
                  (item) => item.questionNumber !== questionNumber
                ),
                fallbackResult
              ];

              localStorage.setItem(
                "interviewAIAnalyses",
                JSON.stringify(aiAnalysesRef.current)
              );

              setResponseSubmitted(true);

            }

          } catch (error) {

            console.error(
              "Error while processing recording:",
              error
            );

            const errorFallbackResult = {
              sessionId: sessionIdRef.current,
              questionNumber,
              question: questionText,
              durationSeconds: typeof duration !== "undefined" ? duration : 0,
              transcript: "(No spoken answer detected)",
              aiEvaluation: {
                available: true,
                evaluationOffline: true,
                questionCategory: "Technical",
                understanding: "No Spoken Answer Recorded",
                understandingExplanation: "No response was captured or an error occurred during audio processing.",
                scoreOutOf10: 0.0,
                overallScore: 0,
                scoreExplanation: "Score: 0/10 (0%). No valid answer was recorded.",
                relevanceScore: 0,
                technicalAccuracyScore: 0,
                conceptualUnderstandingScore: 0,
                completenessScore: 0,
                communicationScore: 0,
                isIDontKnow: false,
                isOffTopic: false,
                hasContent: false,
                detailedEvaluation: "No answer was recorded or processing failed.",
                whatYouDidWell: [],
                whatCanBeImproved: ["Ensure microphone is enabled and provide a spoken answer."],
                howToImprove: "Continue through remaining questions and answer clearly.",
                keyConceptsToRevise: [],
                strengths: [],
                areasForImprovement: ["Provide a clear spoken answer to each question."]
              }
            };

            aiAnalysesRef.current = [
              ...aiAnalysesRef.current.filter(
                (item) => item.questionNumber !== questionNumber
              ),
              errorFallbackResult
            ];

            localStorage.setItem(
              "interviewAIAnalyses",
              JSON.stringify(aiAnalysesRef.current)
            );

            setResponseSubmitted(true);

          } finally {

            recordedChunksRef.current = [];

            mediaRecorderRef.current = null;

            setIsAnswering(false);

          }

        })();


        /* -----------------------------------------
           TRACK PENDING AI ANALYSIS
        ----------------------------------------- */

        pendingAnalysisPromisesRef.current.push(
          processingPromise
        );


        /* -----------------------------------------
           REMOVE PROMISE AFTER COMPLETION
        ----------------------------------------- */

        const cleanupPromise = () => {

          pendingAnalysisPromisesRef.current =
            pendingAnalysisPromisesRef.current.filter(
              (promise) =>
                promise !== processingPromise
            );

        };


        processingPromise.then(
          cleanupPromise,
          cleanupPromise
        );

      };

      /* -----------------------------------------
         START RECORDING
      ----------------------------------------- */

      recorder.start(1000);

      setTimeLeft(120);
      setIsAnswering(true);

      // Start live audio visualization
      if (streamRef.current) {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.5;
          const source = audioCtx.createMediaStreamSource(streamRef.current);
          source.connect(analyser);

          const dataArr = new Uint8Array(analyser.frequencyBinCount);
          activeAudioCtxRef.current = audioCtx;

          const updateVolume = () => {
            if (!activeAudioCtxRef.current) return;
            analyser.getByteFrequencyData(dataArr);
            let sum = 0;
            for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
            const avg = sum / dataArr.length;
            const norm = Math.min(100, Math.round((avg / 128) * 100));
            setLiveAudioLevel(norm);
            audioAnimFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        } catch (visErr) {
          console.warn("Could not start audio visualizer:", visErr);
        }
      }

      console.log(
        `Started recording answer for question ${questionNumber}`
      );

    } catch (error) {
      console.error(
        "Recording error:",
        error
      );

      mediaRecorderRef.current = null;
      setIsAnswering(false);

      alert(
        "Unable to start recording. Please check your browser permissions."
      );
    }
  };


  /* =====================================================
     STOP ANSWER RECORDING
  ===================================================== */

  const stopAnswer = () => {
    return new Promise((resolve) => {
      // Clean up audio visualizer
      if (audioAnimFrameRef.current) {
        cancelAnimationFrame(audioAnimFrameRef.current);
        audioAnimFrameRef.current = null;
      }
      if (activeAudioCtxRef.current) {
        try {
          activeAudioCtxRef.current.close();
        } catch (e) {}
        activeAudioCtxRef.current = null;
      }
      setLiveAudioLevel(0);

      const recorder = mediaRecorderRef.current;

      if (
        !recorder ||
        recorder.state === "inactive"
      ) {
        setIsAnswering(false);
        mediaRecorderRef.current = null;
        resolve();
        return;
      }

      console.log("Stopping answer recording...");

      const originalOnStop = recorder.onstop;

      recorder.onstop = async (event) => {
        try {
          if (originalOnStop) {
            await originalOnStop(event);
          }
        } catch (error) {
          console.error(
            "Error while finishing recording:",
            error
          );
        } finally {
          resolve();
        }
      };

      recorder.stop();
      setIsAnswering(false);
    });
  };


  /* =====================================================
     UPLOAD ANSWER TO SPRING BOOT
  ===================================================== */

  const uploadAnswerToBackend = async (answer) => {
    if (!answer || !answer.blob) {
      console.warn(
        "No recorded answer available for upload."
      );

      return {
        success: false,
        message: "No recorded answer available."
      };
    }

    try {
      const formData = new FormData();

      formData.append(
        "file",
        answer.blob,
        `answer-${answer.questionNumber}.webm`
      );

      formData.append(
        "sessionId",
        sessionIdRef.current
      );

      formData.append(
        "questionNumber",
        String(answer.questionNumber)
      );

      formData.append(
        "question",
        answer.question
      );

      formData.append(
        "role",
        interviewConfig.role
      );

      formData.append(
        "difficulty",
        interviewConfig.difficulty
      );

      console.log(
        "Uploading answer to Spring Boot...",
        {
          sessionId: sessionIdRef.current,
          questionNumber: answer.questionNumber,
          fileSize: answer.blob.size,
          duration: answer.duration
        }
      );

      const response = await fetch(
        "http://localhost:8080/api/interview/analyze",
        {
          method: "POST",
          body: formData
        }
      );

      if (!response.ok) {
        throw new Error(
          `Backend returned ${response.status}`
        );
      }

      const result = await response.json();

      console.log(
        "Answer uploaded successfully:",
        result
      );

      return result;

    } catch (error) {
      console.error(
        "Answer upload failed:",
        error
      );

      return {
        success: false,
        message: error.message
      };
    }
  };


  /* =====================================================
     START / STOP ANSWER
  ===================================================== */

  const toggleAnswer = () => {
    if (isTerminated) return;
    if (isAnswering) {
      stopAnswer();
    } else {
      startAnswer();
    }
  };


  /* =====================================================
     RESET TIMER
  ===================================================== */

  const resetQuestionTimer = () => {
    setTimeLeft(120);
  };


  /* =====================================================
     NEXT QUESTION
  ===================================================== */

  const goToNextQuestion = () => {
    if (isTerminated) return;
    if (isAnswering) {
      stopAnswer();
    }

    if (
      currentQuestion <
      questions.length - 1
    ) {
      setCurrentQuestion(
        (previous) => previous + 1
      );

      setTimeLeft(120);

      setResponseSubmitted(false);
    }
  };


  /* =====================================================
     PREVIOUS QUESTION
  ===================================================== */

  const goToPreviousQuestion = () => {
    if (isTerminated) return;
    if (isAnswering) {
      stopAnswer();
    }

    if (currentQuestion > 0) {
      setCurrentQuestion(
        (previous) => previous - 1
      );

      setTimeLeft(120);

      setResponseSubmitted(false);
    }
  };


  /* =====================================================
     GO DIRECTLY TO QUESTION
  ===================================================== */

  const goToQuestion = (index) => {
    if (isTerminated || index === currentQuestion) {
      return;
    }

    if (isAnswering) {
      stopAnswer();
    }

    setCurrentQuestion(index);

    setTimeLeft(120);

    setResponseSubmitted(false);
  };


  /* =====================================================
     END INTERVIEW
  ===================================================== */

  const endInterview = async () => {

    if (endingInterviewRef.current) {
      console.log(
        "End interview already in progress. Ignoring duplicate call."
      );
      return;
    }

    endingInterviewRef.current = true;
    setIsEndingInterview(true);

    console.log(
      "Ending interview..."
    );

    try {

      /* -----------------------------------------
         STOP CURRENT RECORDING IF NECESSARY
      ----------------------------------------- */

      if (mediaRecorderRef.current) {

        await stopAnswer();

      }


      /* -----------------------------------------
         WAIT FOR ALL PENDING AI ANALYSES
      ----------------------------------------- */

      const pendingPromises = [
        ...pendingAnalysisPromisesRef.current
      ];

      if (pendingPromises.length > 0) {

        console.log(
          "Waiting for pending AI analyses..."
        );

        await Promise.all(
          pendingPromises
        );

      }


      /* -----------------------------------------
         GET SAVED ANSWERS & AI ANALYSES
      ----------------------------------------- */

      const savedAnswers = (answerHistoryRef.current || []).filter(
        (ans) => !ans.sessionId || ans.sessionId === sessionIdRef.current
      );
      let aiAnalyses = (aiAnalysesRef.current || []).filter(
        (item) => item.sessionId === sessionIdRef.current
      );

      // Check localStorage only for CURRENT session if in-memory ref was empty
      if (aiAnalyses.length === 0) {
        try {
          const fromStorage = JSON.parse(localStorage.getItem("interviewAIAnalyses") || "[]");
          if (Array.isArray(fromStorage) && fromStorage.length > 0) {
            const currentSession = fromStorage.filter((item) => item.sessionId === sessionIdRef.current);
            if (currentSession.length > 0) {
              aiAnalyses = currentSession;
              aiAnalysesRef.current = currentSession;
            }
          }
        } catch (e) {}
      }

      // Populate complete analyses for all scheduled questions
      const totalQuestions = questions.length;
      const finalAiAnalyses = questions.map((q, idx) => {
        const qNum = idx + 1;
        const existing = aiAnalyses.find((item) => item.questionNumber === qNum);
        if (existing) {
          return existing;
        }

        const savedAns = savedAnswers.find((item) => item.questionNumber === qNum);
        return {
          sessionId: sessionIdRef.current,
          questionNumber: qNum,
          question: q.question,
          durationSeconds: savedAns?.duration || 0,
          wordCount: 0,
          transcript: savedAns?.transcript || "(Question left unanswered)",
          aiEvaluation: {
            available: true,
            overallScore: 0,
            scoreOutOf10: 0.0,
            relevanceScore: 0,
            technicalAccuracyScore: 0,
            conceptualUnderstandingScore: 0,
            completenessScore: 0,
            communicationScore: 0,
            understanding: "Not Answered",
            understandingExplanation: "This question was left unanswered during the interview session.",
            scoreExplanation: "Score: 0/10 (0%). Question was not answered.",
            isIDontKnow: false,
            isOffTopic: false,
            hasContent: false,
            detailedEvaluation: "This question was not attempted by the candidate.",
            whatYouDidWell: [],
            whatCanBeImproved: ["Attempt all questions to demonstrate your technical knowledge."],
            howToImprove: "Start with a direct definition, then discuss underlying mechanics and practical applications.",
            keyConceptsToRevise: [q.question.split(" ").slice(0, 3).join(" ")],
            strengths: [],
            areasForImprovement: ["Question was left unanswered."],
            suggestions: ["Practice answering similar questions aloud."]
          }
        };
      });

      aiAnalyses = finalAiAnalyses;
      aiAnalysesRef.current = finalAiAnalyses;
      localStorage.setItem("interviewAIAnalyses", JSON.stringify(finalAiAnalyses));

      // Determine how many questions were genuinely answered with speech/content
      const answeredQuestionsList = finalAiAnalyses.filter(
        (item) => item.aiEvaluation?.hasContent && (Number(item.aiEvaluation?.overallScore) || 0) > 0
      );
      const hasAnySpokenAnswer = answeredQuestionsList.length > 0;

      console.log("Final AI Analyses for session synthesis:", aiAnalyses);

      /* -----------------------------------------
         CALL SESSION SYNTHESIS API
      ----------------------------------------- */
      let sessionSynthesis = null;
      if (hasAnySpokenAnswer) {
        try {
          const synthesisPayload = {
            role: interviewConfig.role,
            type: interviewConfig.type,
            difficulty: interviewConfig.difficulty,
            totalQuestions: questions.length,
            answers: aiAnalyses
          };

          const synthResponse = await fetch("http://localhost:8080/api/interview/synthesize-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(synthesisPayload)
          });

          if (synthResponse.ok) {
            sessionSynthesis = await synthResponse.json();
            console.log("Session synthesis received:", sessionSynthesis);
          }
        } catch (synthErr) {
          console.warn("Session synthesis endpoint call failed, falling back to client aggregation:", synthErr);
        }
      }

      /* -----------------------------------------
         FALLBACK / VERIFIED CALCULATIONS
      ----------------------------------------- */
      const calculateAverage = (field) => {
        if (!hasAnySpokenAnswer || totalQuestions === 0) return 0;
        const total = finalAiAnalyses.reduce(
          (sum, item) => sum + (Number(item.aiEvaluation?.[field]) || 0),
          0
        );
        // Average across all scheduled interview questions so unanswered questions contribute 0
        return Math.round(total / totalQuestions);
      };

      const overallScore = !hasAnySpokenAnswer
        ? 0
        : (sessionSynthesis?.overallScore ?? calculateAverage("overallScore"));
      const relevanceScore = !hasAnySpokenAnswer
        ? 0
        : (sessionSynthesis?.categoryScores?.relevance ?? calculateAverage("relevanceScore"));
      const technicalAccuracyScore = !hasAnySpokenAnswer
        ? 0
        : (sessionSynthesis?.categoryScores?.technicalAccuracy ?? calculateAverage("technicalAccuracyScore"));
      const conceptualUnderstandingScore = !hasAnySpokenAnswer
        ? 0
        : (sessionSynthesis?.categoryScores?.conceptualUnderstanding ?? calculateAverage("conceptualUnderstandingScore") ?? technicalAccuracyScore);
      const completenessScore = !hasAnySpokenAnswer
        ? 0
        : (sessionSynthesis?.categoryScores?.completeness ?? calculateAverage("completenessScore"));
      const communicationScore = !hasAnySpokenAnswer
        ? 0
        : (sessionSynthesis?.categoryScores?.communication ?? calculateAverage("communicationScore"));

      const totalAiDuration = finalAiAnalyses.reduce(
        (sum, item) => sum + (Number(item.durationSeconds) || 0),
        0
      );

      const totalWordCount = finalAiAnalyses.reduce(
        (sum, item) => sum + (Number(item.wordCount) || 0),
        0
      );

      const speakingSpeedWPM = totalAiDuration > 0
        ? Math.round((totalWordCount / totalAiDuration) * 60)
        : 0;

      const pacingScore = !hasAnySpokenAnswer || speakingSpeedWPM === 0
        ? 0
        : (sessionSynthesis?.categoryScores?.pacing ?? (speakingSpeedWPM >= 110 && speakingSpeedWPM <= 165 ? 90 : 60));

      const strengths = hasAnySpokenAnswer && (sessionSynthesis?.systemicStrengths?.length > 0)
        ? sessionSynthesis.systemicStrengths
        : [
            ...new Set(
              finalAiAnalyses.flatMap((item) =>
                Array.isArray(item.aiEvaluation?.strengths) ? item.aiEvaluation.strengths : []
              )
            )
          ];

      const areasForImprovement = hasAnySpokenAnswer && (sessionSynthesis?.systemicWeaknesses?.length > 0)
        ? sessionSynthesis.systemicWeaknesses
        : !hasAnySpokenAnswer
        ? ["Attempt and speak responses to each interview question."]
        : [
            ...new Set(
              finalAiAnalyses.flatMap((item) =>
                Array.isArray(item.aiEvaluation?.areasForImprovement) ? item.aiEvaluation.areasForImprovement : []
              )
            )
          ];

      const actionPlan = hasAnySpokenAnswer && (sessionSynthesis?.actionPlan?.length > 0)
        ? sessionSynthesis.actionPlan
        : !hasAnySpokenAnswer
        ? ["Practice speaking answers out loud using a microphone before the next interview."]
        : [
            ...new Set(
              finalAiAnalyses.flatMap((item) =>
                Array.isArray(item.aiEvaluation?.suggestions) ? item.aiEvaluation.suggestions : []
              )
            )
          ];

      const performanceTitle = !hasAnySpokenAnswer || overallScore === 0
        ? "No Answers Recorded"
        : overallScore >= 85
        ? "Exceptional Performance"
        : overallScore >= 70
        ? "Strong Performance"
        : overallScore >= 50
        ? "Developing Foundation"
        : "Foundational Knowledge Required";

      const ratingExplanation = !hasAnySpokenAnswer || overallScore === 0
        ? "No spoken answers were detected or submitted for this interview. Please answer the interview questions to receive a performance assessment."
        : overallScore >= 85
        ? "Outstanding domain knowledge, strong relevance, and crisp articulation. You demonstrated thorough, interview-ready competency."
        : overallScore >= 70
        ? "Solid command of technical fundamentals and clear communication. With targeted polish on implementation mechanisms, you are well-positioned for placement interviews."
        : overallScore >= 50
        ? "Good conceptual start with several relevant points covered. Strengthening implementation details and structured examples will significantly boost your interview scores."
        : "Your interview performance establishes a clear baseline. With focused review on the recommended revision topics and practicing the 'Definition -> Mechanism -> Example' structure, you can rapidly improve.";

      const executiveSummary = !hasAnySpokenAnswer
        ? "No interview answers were submitted in this session. All questions were left unanswered."
        : (sessionSynthesis?.executiveSummary || 
           finalAiAnalyses.map((item) => item.aiEvaluation?.detailedEvaluation).filter(Boolean).join(" "));

      const completedQuestions = answeredQuestionsList.length;
      const averageAnswerDuration = completedQuestions > 0
        ? Number((totalAiDuration / completedQuestions).toFixed(1))
        : 0;

      let userEmail = null;
      let userId = null;
      try {
        const u = localStorage.getItem("user");
        if (u) {
          const parsed = JSON.parse(u);
          userEmail = parsed.email || null;
          userId = parsed.id || null;
        }
      } catch (e) {}

      /* -----------------------------------------
         FINAL INTERVIEW RESULT OBJECT
      ----------------------------------------- */
      const interviewResult = {
        sessionId: sessionIdRef.current,
        userEmail,
        userId,
        role: interviewConfig.role,
        type: interviewConfig.type,
        difficulty: interviewConfig.difficulty,
        totalQuestions,
        completedQuestions,
        skippedQuestions: Math.max(0, totalQuestions - completedQuestions),
        totalDuration: totalAiDuration,
        averageAnswerDuration,
        completedAt: new Date().toISOString(),

        /* SCORES */
        overallScore,
        relevanceScore,
        technicalAccuracyScore,
        conceptualUnderstandingScore,
        completenessScore,
        communicationScore,
        pacingScore,

        /* PERFORMANCE LABELS */
        performanceTitle,
        ratingExplanation,

        /* METRICS */
        wordCount: totalWordCount,
        speakingSpeedWPM,
        speechMetrics: sessionSynthesis?.speechMetrics || {
          totalWords: totalWordCount,
          totalDurationSeconds: totalAiDuration,
          speakingSpeedWPM,
          totalFillerWords: 0
        },

        /* SYNTHESIS & INSIGHTS */
        executiveSummary,
        strengths,
        areasForImprovement,
        actionPlan,
        sessionSynthesis,

        /* PER-QUESTION DATA */
        aiAnalyses: finalAiAnalyses,
        answers: savedAnswers
      };

      localStorage.setItem("interviewResult", JSON.stringify(interviewResult));

      try {
        const past = JSON.parse(localStorage.getItem("pastInterviewSessions") || "[]");
        const filteredPast = past.filter((p) => p.sessionId !== interviewResult.sessionId);
        filteredPast.unshift(interviewResult);
        localStorage.setItem("pastInterviewSessions", JSON.stringify(filteredPast.slice(0, 20)));
      } catch (e) {}

      // Persist full interview session to Spring Boot & MySQL database
      try {
        console.log("Persisting session to MySQL database via Spring Boot...");
        const saveResp = await fetch("http://localhost:8080/api/interview/save-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(interviewResult)
        });
        if (saveResp.ok) {
          console.log("Session successfully persisted to database!");
        } else {
          console.warn("Backend save-session returned non-200:", saveResp.status);
        }
      } catch (dbErr) {
        console.warn("Failed to reach Spring Boot to save session:", dbErr);
      }

      console.log(
        "FINAL INTERVIEW RESULT SAVED:",
        interviewResult
      );


      /* -----------------------------------------
         STOP CAMERA
      ----------------------------------------- */

      stopCamera();


      /* -----------------------------------------
         NAVIGATE TO RESULTS
      ----------------------------------------- */

      navigate("/results");

    } catch (error) {

      console.error(
        "Error while ending interview:",
        error
      );

      endingInterviewRef.current = false;
      setIsEndingInterview(false);

      alert(
        "Unable to finish the interview. Please try again."
      );

    }

  };


  /* =====================================================
     PROGRESS
  ===================================================== */

  const progress =
    ((currentQuestion + 1) /
      questions.length) *
    100;


  /* =====================================================
     TIMER PROGRESS
  ===================================================== */

  const timerProgress =
    (timeLeft / 120) * 100;


  return (

    <div className="interview-page">

      {/* PROCTORING VIOLATION MODAL */}
      {violationAlert && (
        <div className="proctoring-violation-overlay">
          <div className={`proctoring-violation-modal ${violationAlert.isBlocked ? "modal-blocked" : ""}`}>
            <div className="violation-modal-icon">
              {violationAlert.isBlocked ? <Ban size={48} /> : <ShieldAlert size={48} />}
            </div>
            <span className="violation-badge">
              {violationAlert.isBlocked ? "CANDIDATE DISQUALIFIED & BLOCKED" : "PROCTORING VIOLATION DETECTED"}
            </span>
            <h2>{violationAlert.isBlocked ? "Disqualified from Interview" : "Interview Warning"}</h2>
            <p className="violation-warning-text">
              {violationAlert.warningMessage ||
                "Warning: Multiple people or unauthorized devices detected repeatedly. You have been removed from the session."}
            </p>
            <div className="violation-termination-notice">
              <span className="violation-spinner-dot"></span>
              {violationAlert.isBlocked
                ? "Candidate removed from testing environment. Redirecting to disqualification report..."
                : "Interview is being terminated immediately to ensure assessment integrity..."}
            </div>
          </div>
        </div>
      )}

      {/* =================================================
          INTERVIEW TOPBAR
      ================================================= */}

      <header className="interview-topbar">

        <div className="interview-brand">

          <div className="interview-brand-icon">

            <Sparkles
              size={21}
              strokeWidth={2.4}
            />

          </div>


          <div>

            <strong>
              AI Interview Analyzer
            </strong>

            <span>
              {interviewConfig.role}
            </span>

          </div>

        </div>


        <div className="interview-progress">

          <div className="progress-info">

            <span>
              Interview Progress
            </span>

            <strong>
              {currentQuestion + 1} of{" "}
              {questions.length}
            </strong>

          </div>


          <div className="interview-progress-bar">

            <div
              style={{
                width: `${progress}%`
              }}
            ></div>

          </div>

        </div>


        <div
          className={
            `interview-status ${
              isCameraOn
                ? "active"
                : "inactive"
            }`
          }
        >

          <span
            className={
              isCameraOn
                ? "live-dot"
                : "live-dot off"
            }
          ></span>


          {isCameraOn
            ? "Session Active"
            : "Session Offline"}

        </div>

      </header>


      {/* =================================================
          MAIN CONTENT
      ================================================= */}

      <main className="interview-main">

        {/* CAMERA PANEL */}

        <section className="camera-card">

          <div className="camera-header">

            <div className="camera-title">

              <div className="camera-title-icon">

                <Video size={17} />

              </div>


              <div>

                <span>
                  LIVE INTERVIEW
                </span>

                <strong>
                  Your Camera
                </strong>

              </div>

            </div>


            {isAnswering && (
              <div className="recording-badge-with-waves" title={`Microphone input: ${liveAudioLevel}%`}>
                <span className="live-rec-dot"></span>
                <strong>Recording</strong>
                <div className="live-audio-waves">
                  <div className="live-wave-bar" style={{ height: `${Math.max(20, Math.min(100, liveAudioLevel * 0.9 + 15))}%` }}></div>
                  <div className="live-wave-bar" style={{ height: `${Math.max(25, Math.min(100, liveAudioLevel * 1.3 + 20))}%` }}></div>
                  <div className="live-wave-bar" style={{ height: `${Math.max(20, Math.min(100, liveAudioLevel * 0.8 + 15))}%` }}></div>
                  <div className="live-wave-bar" style={{ height: `${Math.max(30, Math.min(100, liveAudioLevel * 1.4 + 25))}%` }}></div>
                  <div className="live-wave-bar" style={{ height: `${Math.max(20, Math.min(100, liveAudioLevel * 0.7 + 15))}%` }}></div>
                </div>
              </div>
            )}

          </div>

          {/* REAL-TIME MULTIPLE PEOPLE WARNING BANNER */}
          {multiplePeopleAlert && (
            <div className="camera-warning-banner strike-warning">
              <div className="camera-warning-top">
                <div className="camera-warning-badge">
                  <AlertTriangle size={16} />
                  <span>PROCTORING ALERT • MULTIPLE PEOPLE DETECTED</span>
                </div>
                <span className="camera-warning-chip">
                  ⚠️ {multiplePeopleAlert.count} PEOPLE IN FRAME
                </span>
              </div>
              <div className="camera-warning-body">
                <strong>Multiple People in Camera View</strong>
                <p>{multiplePeopleAlert.message}</p>
              </div>
              <div className="camera-warning-footer">
                <span>Only one person is permitted during the interview session. Please ensure secondary individuals leave the camera frame.</span>
              </div>
            </div>
          )}

          {/* REAL-TIME CAMERA PROCTORING WARNING BANNER */}
          {cameraWarning && !multiplePeopleAlert && (
            <div className={`camera-warning-banner ${cameraWarning.strike >= 2 ? "strike-danger" : "strike-warning"}`}>
              <div className="camera-warning-top">
                <div className="camera-warning-badge">
                  <AlertTriangle size={16} />
                  <span>PROCTORING WARNING • STRIKE {cameraWarning.strike} / {cameraWarning.maxStrikes}</span>
                </div>
                <span className="camera-warning-chip">
                  {cameraWarning.strike === 1 ? "⚠️ FIRST WARNING" : "🚨 FINAL WARNING BEFORE BLOCKING"}
                </span>
              </div>
              <div className="camera-warning-body">
                <strong>{cameraWarning.title}</strong>
                <p>{cameraWarning.message}</p>
              </div>
              <div className="camera-warning-footer">
                {cameraWarning.strike === 1 ? (
                  <span>Ensure you are alone and remove any mobile phones or secondary individuals immediately. Continued violations will remove you from the test.</span>
                ) : (
                  <strong>FINAL NOTICE: Any further violation will immediately disqualify and block you from the test!</strong>
                )}
              </div>
            </div>
          )}

          <div className={`camera-wrapper ${multiplePeopleAlert || cameraWarning || (isCameraOn && proctoringStats.active && proctoringStats.personCount !== 1) ? "camera-wrapper-warning" : ""}`}>

            {cameraError ? (

              <div className="camera-error">

                <div className="camera-error-icon">
                  <CameraOff size={30} />
                </div>

                <h3>
                  Camera access required
                </h3>

                <p>
                  {cameraError}
                </p>

                <button
                  className="retry-camera-button"
                  onClick={startCamera}
                >
                  <Camera size={17} />
                  Enable Camera & Microphone
                </button>

              </div>

            ) : (

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera"
              />

            )}

            {/* LIVE PROCTORING HUD */}
            {isCameraOn && !cameraError && (
              <div className="camera-proctoring-hud">
                <div
                  className={`proctoring-hud-tag ${
                    multiplePeopleAlert ||
                    (proctoringStats.active && proctoringStats.personCount !== 1) ||
                    proctoringStats.phoneDetected
                      ? "hud-violating"
                      : "hud-normal"
                  }`}
                >
                  <span className="hud-dot"></span>
                  <span>
                    Proctoring {proctoringStats.modelReady ? "Active" : "Ready"} •{" "}
                    {multiplePeopleAlert
                      ? `⚠️ ${multiplePeopleAlert.count} People in Frame (1 Allowed)`
                      : proctoringStats.personCount === 1
                      ? "1 Person in Frame"
                      : proctoringStats.personCount === 0
                      ? "⚠️ No Person in Frame"
                      : `⚠️ ${proctoringStats.personCount} Persons (1 Allowed)`}
                    {proctoringStats.phoneDetected ? " • 📱 Device Detected" : ""}
                  </span>
                  {strikes > 0 && (
                    <span className="hud-strikes-chip">
                      Strikes: {strikes}/3
                    </span>
                  )}
                </div>
              </div>
            )}

            {isCameraOn && !cameraError && (

              <div className="camera-live">
                <span></span>
                LIVE
              </div>

            )}

            {isCameraOn && !cameraError && (

              <div className="camera-quality">

                <CheckCircle2 size={13} />

                HD

              </div>

            )}

          </div>

          <div className="camera-controls">

            <button
              className={
                `control-button ${
                  !isCameraOn
                    ? "disabled-control"
                    : ""
                }`
              }
              onClick={() => {

                if (isCameraOn) {
                  stopCamera();
                } else {
                  startCamera();
                }

              }}
              title={
                isCameraOn
                  ? "Turn camera off"
                  : "Turn camera on"
              }
            >

              {isCameraOn
                ? (<Camera size={18} />)
                : (<CameraOff size={18} />)
              }

            </button>


            <button
              className={
                `control-button ${
                  !isMicOn
                    ? "muted-control"
                    : ""
                }`
              }
              onClick={toggleMic}
              title={
                isMicOn
                  ? "Mute microphone"
                  : "Unmute microphone"
              }
            >

              {isMicOn
                ? (<Mic size={18} />)
                : (<MicOff size={18} />)
              }

            </button>


            <button
              className="control-button end"
              onClick={endInterview}
              disabled={isEndingInterview}
            >

              <Square size={15} />

              {isEndingInterview
                ? "Processing..."
                : "End Interview"}

            </button>

          </div>

        </section>


        {/* QUESTION PANEL */}

        <section className="question-card">

          <div className="question-top">

            <div className="question-label">

              <div className="question-number">

                {String(
                  currentQuestion + 1
                ).padStart(2, "0")}

              </div>


              <div>

                <span>
                  AI INTERVIEWER
                </span>


                <strong>

                  Question{" "}

                  {String(
                    currentQuestion + 1
                  ).padStart(2, "0")}

                </strong>

              </div>

            </div>


            <div className="difficulty-badge">

              <span></span>

              {interviewConfig.difficulty}

            </div>

          </div>


          <div className="ai-question-icon">

            <Sparkles size={25} />

          </div>


          <div className="question-content">

            <h1>
              {currentQuestionData.question}
            </h1>


            <p className="question-description">

              {currentQuestionData.description}

            </p>

          </div>


          <div className="answer-hint">

            <div className="hint-icon">

              <Lightbulb size={17} />

            </div>


            <div>

              <strong>
                AI Tip
              </strong>


              <p>
                Focus on your skills, projects, strengths, and career goals.
                Keep your answer clear, confident, and professional.
              </p>

            </div>

          </div>


          <div className="timer-section">

            <div
              className={
                `timer-circle ${
                  timeLeft <= 30
                    ? "timer-warning"
                    : ""
                }`
              }
            >

              <div className="timer-inner">

                <Clock3 size={14} />


                <strong>
                  {formatTime()}
                </strong>


                <small>
                  remaining
                </small>

              </div>

            </div>


            <div className="timer-text">

              <strong>
                {isAnswering
                  ? "Recording your answer"
                  : "Take your time"}
              </strong>


              <span>
                Speak clearly and confidently.
              </span>


              <div className="timer-progress">

                <div
                  style={{
                    width: `${timerProgress}%`
                  }}
                ></div>

              </div>

            </div>

          </div>


          <button
            className={
              isAnswering
                ? "answer-btn answering"
                : "answer-btn"
            }
            onClick={toggleAnswer}
          >

            <span className="answer-icon">

              {isAnswering
                ? (<Square size={17} />)
                : (<Mic size={19} />)
              }

            </span>


            <span>

              {isAnswering
                ? "Stop Answer"
                : "Start Answer"}

            </span>


            {!isAnswering && (

              <ArrowRight
                size={19}
                className="answer-arrow"
              />

            )}

          </button>


          <div className="question-navigation">

            <button
              className="question-nav-btn"
              onClick={goToPreviousQuestion}
              disabled={currentQuestion === 0}
            >
              <ArrowLeft size={16} />
              Previous
            </button>

            <div className="question-dots">
              {questions.map((_, index) => (
                <button
                  key={index}
                  className={
                    index === currentQuestion
                      ? "question-dot active"
                      : index < currentQuestion
                      ? "question-dot completed"
                      : "question-dot"
                  }
                  onClick={() => goToQuestion(index)}
                  aria-label={`Go to question ${index + 1}`}
                ></button>
              ))}
            </div>

            <button
              className="question-nav-btn next"
              onClick={goToNextQuestion}
              disabled={currentQuestion === questions.length - 1}
            >
              Next
              <ArrowRight size={16} />
            </button>

          </div>


          {/* RESPONSE MESSAGE — BELOW NAVIGATION */}

          {responseSubmitted && !isAnswering && (
            <div className="response-submitted">
              <CheckCircle2 size={18} />

              <div>
                <strong>Answer recorded successfully!</strong>
                <span>Your response has been submitted for analysis.</span>
              </div>
            </div>
          )}


          <div className="question-footer">

            <span>

              <span className="status-check">

                <CheckCircle2 size={13} />

              </span>

              AI interviewer is ready

            </span>


            <span>

              {interviewConfig.type}
              {" "}
              Interview

            </span>

          </div>

        </section>

      </main>


      {/* BOTTOM INFO */}

      <footer className="interview-bottom">

        <div>

          <ShieldCheck size={13} />

          Secure interview session

        </div>


        <div>

          <Sparkles size={13} />

          Powered by AI Interview Analyzer

        </div>


        <div>

          Question{" "}
          {currentQuestion + 1}
          {" "}
          of{" "}
          {questions.length}

        </div>

      </footer>

    </div>

  );
}


export default Interview;