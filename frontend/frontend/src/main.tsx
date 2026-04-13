import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, useNavigate, Routes } from 'react-router-dom';
import App from './App'
import InformationPage from "../pages/InformationPage"

const container = document.getElementById('root')
const root = createRoot(container!)


root.render(
    <Router>
        <Routes>
           
            <Route path="/" element={<InformationPage />} />
        </Routes>
    </Router>
)
