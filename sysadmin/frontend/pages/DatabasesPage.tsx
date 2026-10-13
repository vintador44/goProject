
import { MenuItem, LeftSideBar } from "../modules/SideBar";
import {MenuItems} from "../constants"
import * as DataAdminAPI from "../wailsjs/go/DataAdmin/DataAdmin";
import { DataAdmin} from "../wailsjs/go/models";
import { DatabaseProfile} from "../modules/DatabaseProfile"
import { BrowserRouter as Router, Route, useNavigate, Routes,Link } from 'react-router-dom';
import { useEffect, useState } from "react";
function DatabasePage() {
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [connId, setConnId] = useState<string | null>(null);
  const [connections,setConnections] = useState<DataAdmin.ConnectionSettings[]>([new DataAdmin.ConnectionSettings]);
  

  
 useEffect(() => {
  try {
    const stored = localStorage.getItem('databases');
    const list = stored ? JSON.parse(stored) : [];
    const mapped = list.map((item: any) => new DataAdmin.ConnectionSettings(item));
    setConnections(mapped);
    console.log('Загружено записей:', mapped.length);
  } catch (error) {
    console.error('Ошибка при загрузке из localStorage:', error);
    setConnections([]);
  }
}, []);
  

  
  
  const hasConnections = connections.length > 0;

  return (
        <div className="flex min-h-screen w-full flex-col bg-background dark text-slate-200 md:flex-row">
            <LeftSideBar menuItems={MenuItems} />
          <main className="flex min-h-screen min-w-0 flex-1 flex-wrap content-start overflow-y-auto bg-background dark">
         <h1 className="w-full px-4 py-3 text-3xl font-semibold text-slate-100 md:text-4xl">Databases Profiles</h1>
         <div className="flex w-full items-center border-y border-slate-500 px-4 py-3">
         <Link to={"/databaseCreate"} className="inline-flex items-center rounded border border-border bg-accent px-4 py-2 text-sm font-medium text-slate-100 no-underline transition-colors hover:bg-cyan-950 focus:outline-none focus:ring-2 focus:ring-cyan-400">Создать</Link>
                 </div>
         <div className="flex w-full flex-wrap p-2">
                 {hasConnections ? (
                    connections.map((item,index) => {
                      return <DatabaseProfile {...item} index={index} key={index}/>
                    })
                 ) : (
                    <div className="w-full rounded-md border border-dashed border-border bg-background p-6 text-slate-300">
                      <p className="text-lg font-medium text-slate-100">Профили баз данных ещё не созданы.</p>
                      <p className="mt-2 text-sm">Нажмите «Создать», чтобы добавить соединение.</p>
                    </div>
                 )}
         </div>
                 
         </main>
        </div>
    
  );
}

export default DatabasePage;