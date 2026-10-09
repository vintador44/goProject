import React from "react";
import * as DataAdminAPI from "../wailsjs/go/DataAdmin/DataAdmin";
import { DataAdmin } from "../wailsjs/go/models";
import { useNavigate } from 'react-router-dom';

export const DatabaseProfile = (da: DataAdmin.ConnectionSettings & { index: number }) => {
    const navigate = useNavigate();


  return (
    <div className="m-2 flex min-h-24 w-full items-center justify-between gap-4 rounded-md border border-border bg-card p-4 shadow-sm sm:w-80">
      <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-300">
        <div className="truncate font-medium text-slate-100">Name: {da.Dbname}</div>
        <div className="truncate">User: {da.User}</div>
        <div className="truncate">Host: {da.Host}</div>
        <div>Port: {da.Port}</div>
      </div>
      <button 
      onClick={() => {
        navigate(`/databaseWork/${da.index}`);
      }}
        className="shrink-0 rounded border border-border bg-foreground px-3 py-2 text-sm font-medium text-background transition-colors  focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Выбрать
      </button>
    </div>
  );
};
