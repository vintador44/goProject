import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router, Route, Navigate,useNavigate } from 'react-router-dom';
import InformationPage from "../pages/InformationPage"
import { useEffect, useState } from "react";






function App() {
    const navigate = useNavigate();


    // useEffect(
    //     () => {
    //         navigate("/dq")
    //     }, []
    // );

    return (
       
       
        <InformationPage></InformationPage>
    
    )
}

export default App
