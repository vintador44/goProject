
import { MenuItem, LeftSideBar } from "../modules/SideBar";
import * as DataAdminAPI from "../wailsjs/go/DataAdmin/DataAdmin";
import { DataAdmin} from "../wailsjs/go/models";
import { DatabaseProfile} from "../modules/DatabaseProfile"
import { BrowserRouter as Router, Route, useNavigate, Routes,Link } from 'react-router-dom';
import { useEffect, useState } from "react";
import "../styles/main.css"
import "../styles/sidebar.css"
import "../styles/databases.css"
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
  

  const MenuItems: MenuItem[] = [
    { label: "System Information", path: "/" },
    { label: "Database Profiles", path: "/databaseProfiles" },
    {
            label: "System Agent",
            path: "/SysAgent"
        }
  ];
  
  return (
    <div className="main">
            <LeftSideBar menuItems={MenuItems} />
            <div className="main_content">
                 <h1 className="page_title">Databases Profiles</h1>
                 <div className="upper_menu">
                 <Link to={"/databaseCreate"} className = "create_link">Создать</Link>
                 </div>
                 {connections.map((item,index) => {
                  return <DatabaseProfile {...item} index={index} key={index}/>
                 })}
                 
                 </div>
        </div>
    
  );
}

export default DatabasePage;