import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import ReactDOM from "react-dom";
import { HashRouter,BrowserRouter as Router, Route, useNavigate, Routes } from 'react-router-dom';


import InformationPage from "../pages/InformationPage"
import DatabasePage from "../pages/DatabasesPage"
import DatabaseCreate from "../pages/DatabaseCreate"
import DatabaseWork from "../pages/DatabaseWork"
import SysAgent from "../pages/SysAgent"

const container = document.getElementById('root')
const root = createRoot(container!)


root.render(
    <HashRouter>
        <Routes>
           
            <Route path="/" element={<InformationPage />} />
            <Route path="/databaseProfiles" element={<DatabasePage />} />              
            <Route path="/databaseCreate" element={<DatabaseCreate />} />     
            <Route path="/databaseWork/:index" element={<DatabaseWork />} />     
            <Route path="/SysAgent/" element={<SysAgent />} />       
        </Routes>
    </HashRouter>
)
