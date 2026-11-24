import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Initialize saved theme immediately on startup
const savedTheme = localStorage.getItem("ai-interview-theme");
if (savedTheme === "dark") {
  document.body.classList.add("dark-theme");
  document.documentElement.setAttribute("data-theme", "dark");
} else {
  document.body.classList.remove("dark-theme");
  document.documentElement.setAttribute("data-theme", "light");
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
