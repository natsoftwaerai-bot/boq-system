import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Import Provider เข้ามา
import { ProjectProvider } from './context/ProjectContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ProjectProvider> {/* หุ้ม App ไว้ตรงนี้ */}
      <App />
    </ProjectProvider>
  </React.StrictMode>,
)