# AI Interview Analyzer

AI Interview Analyzer is a web-based application developed to help students and job seekers practice interviews. It allows users to attend mock interviews, submit answers through voice, and get feedback on their performance.

The main purpose of this project is to make interview preparation easier by using AI for answer evaluation and speech recognition.

## Technologies Used

- **Frontend:** React.js, HTML, CSS, JavaScript
- **Backend:** Java, Spring Boot
- **Database:** MySQL
- **AI Service:** Python, FastAPI
- **Speech Recognition:** Faster-Whisper
- **AI Model:** Ollama
- **Security:** Spring Security

## Features

- User registration and login
- Practice mock interviews
- Answer interview questions using voice
- Convert speech into text
- AI-based answer evaluation
- Get scores and feedback after interviews
- View previous interview results
- Monitor audio during interview sessions

## Project Structure

```text
AI-Interview-Analyzer/
│
├── ai-service/
│   ├── main.py
│   └── audio_integrity.py
│
├── backend/
│   ├── src/
│   └── pom.xml
│
├── frontend/
│   ├── public/
│   ├── src/
│   └── package.json
│
├── package.json
└── package-lock.json
```

## How to Run the Project

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: http://localhost:5173

### Backend

```bash
cd backend
.\mvnw.cmd spring-boot:run
```

Backend URL: http://localhost:8080

### AI Service

```bash
cd ai-service
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Make sure Python dependencies, Ollama and the required AI model are installed and configured.

## Database Setup

This project uses MySQL.

Create the database:

```sql
CREATE DATABASE ai_interview_analyzer;
```

Configure the database URL, username and password using environment variables in the backend.

## Developer

**Jayashri Phatangare**

MCA Student

GitHub: https://github.com/Jayashri2604

## Project

AI Interview Analyzer is developed as a project to explore full-stack development and AI-based interview evaluation.
