import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom';
import "../styles/main.css";
import { TooltipProvider } from "@/components/ui/tooltip";

import InformationPage from "../pages/InformationPage"
import DatabasePage from "../pages/DatabasesPage"
import DatabaseWork from "../pages/DatabaseWork"
import SysAgent from "../pages/SysAgent"
import RemoteSysAgent from "../pages/RemoteSysAgent"
import SSHProfiles from "../pages/SSHProfiles"

const container = document.getElementById('root')
const root = createRoot(container!)

root.render(
    <TooltipProvider>
        <HashRouter>
            <Routes>
                <Route path="/" element={<InformationPage />} />
                <Route path="/databaseProfiles" element={<DatabasePage />} />
                <Route path="/databaseWork/:index" element={<DatabaseWork />} />
                <Route path="/SysAgent" element={<SysAgent />} />
                <Route path="/RemoteSysAgent" element={<RemoteSysAgent />} />
                <Route path="/SSHProfiles" element={<SSHProfiles />} />
                <Route path="*" element={<InformationPage />} />
            </Routes>
        </HashRouter>
    </TooltipProvider>
)
