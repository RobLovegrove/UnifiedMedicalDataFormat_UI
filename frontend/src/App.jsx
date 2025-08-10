import React from 'react'
import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import UMDFViewer from './pages/UMDFViewer'
import './App.css'

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/umdf-viewer" element={<UMDFViewer />} />
      </Routes>
    </div>
  )
}

export default App 