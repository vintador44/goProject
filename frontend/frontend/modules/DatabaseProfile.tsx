import React from "react";
import "../styles/database_profile.css";
import * as DataAdminAPI from "../wailsjs/go/DataAdmin/DataAdmin";
import { DataAdmin } from "../wailsjs/go/models";
import { useNavigate } from 'react-router-dom';

export const DatabaseProfile = (da: DataAdmin.ConnectionSettings & { index: number }) => {
    const navigate = useNavigate();


  return (
    <div className="database_profile">
      <div className="labels_container">
        <div>Name: {da.Dbname} </div>
        <div>User: {da.User} </div>
        <div>Host: {da.Host} </div>
        <div>Port: {da.Port} </div>
      </div>
      <button 
      onClick={() => {
        navigate(`/databaseWork/${da.index}`);
      }}
        style={{
          display: "flex",
          alignItems: "center",
          marginLeft: "30px",
          height: "40px",
          padding: "10px",
          marginTop: "30px",
          borderStyle: "solid",
          borderWidth: "2px",
          borderRadius: "20px",
          backgroundColor: "rgb(0,47,57)"
        }}
      >
        Выбрать
      </button>
    </div>
  );
};
