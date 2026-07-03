import "../styles/main.css";
import "../styles/sidebar.css";

import { MenuItem, LeftSideBar } from "../modules/SideBar";
import * as DataAdminAPI from "../wailsjs/go/DataAdmin/DataAdmin";
import { DataAdmin } from "../wailsjs/go/models";
import { useForm, SubmitHandler } from "react-hook-form";
import { useEffect, useState } from "react";
import "react-datasheet-grid/dist/style.css";

import {
    DataSheetGrid,
    textColumn,
    checkboxColumn,
    keyColumn,
} from "react-datasheet-grid";
import { useParams } from "react-router-dom";

export default function DatabaseWork() {
    const [connection, setConnection] = useState<DataAdmin.ConnectionSettings>(new DataAdmin.ConnectionSettings);
    const [connectionString,setConnectionString] = useState<string>("");
    const [queryText,setQueryText] = useState<string>("");
    const [sqlResult,setSQLResult] = useState<string>("");
    const [sqlTableResultData,setSqlTableResultData] = useState<any[] >([]);
    const [sqlTableColumns,setSqlTableColumns] = useState<any[]>([]);

    const MenuItems: MenuItem[] = [
        { label: "System Information", path: "/" },
        { label: "Database Profiles", path: "/databaseProfiles" },
        {
            label: "System Agent",
            path: "/SysAgent"
        }
    ];
    const { index } = useParams<{ index: string }>();

    const Fconnect = async() => {
        const result = await DataAdminAPI.Connect(connection);
        setConnectionString(result);
        

    }
    const FJSONquery = async() => {
        const SQLresult = await DataAdminAPI.JSONQuery(connectionString,queryText)
        const parsedData = JSON.parse(SQLresult)
        const columns = Object.keys(parsedData[0]).map((key)=> ({
            ...keyColumn(key,textColumn),
            title: key

        }));
        setSqlTableColumns(columns);
        
        setSqlTableResultData(parsedData);
        console.log(JSON.stringify(parsedData, null, 2));
        console.log('columns:', columns);
        setSQLResult(SQLresult)
        

    }
    const FGetJSONschema = async() => {
        const SQLresult = await DataAdminAPI.GetJSONschema(connectionString)
        setSQLResult(SQLresult)
    }
    const Execute = async() => {
        const SQLresult = await DataAdminAPI.Execute(connectionString,queryText)
        setSQLResult(SQLresult)
    }
    const Close = async() => {
        const SQLresult = await DataAdminAPI.Close(connectionString)
        setConnectionString("")
    }

    

    useEffect(() => {
        
           
          
            const stored = localStorage.getItem("databases");
            const list = stored ? JSON.parse(stored) : [];
            const mapped = new DataAdmin.ConnectionSettings(list[Number(index)]);
            setConnection(mapped);
           
            console.log(connection);
        
    }, []);

    

    return (
        <div className="main">
            <LeftSideBar menuItems={MenuItems} />
            <div className="main_content">
                <h1 className="page_title">Databases Work</h1>
                <div className="upper_menu">
                    <button className="menu_button" onClick={Fconnect}>Подлкючиться</button>
                     {connectionString? " connected" : " disconected"}
                     <button className="menu_button" onClick={FJSONquery}>Query</button>
                     <button className="menu_button" onClick={FGetJSONschema}>GetJSONschema</button>
                     <button className="menu_button" onClick={Execute}>Execute</button>
                     <button className="menu_button" onClick={Close}>Close</button>
                </div>
                <textarea
                value={queryText} 
                rows={5}
                onChange={(e)=> setQueryText(e.target.value)}
                placeholder="SQL запрос"
                style={{width:"98%",fontSize:"25px", backgroundColor:"rgb(0,47,57)", borderRadius:"20px",padding:"10px",margin:"10px"}}
                />
                
                
                <div style={{width:"100%",height:"70%"}}>
                {sqlTableResultData.length > 0  && 
                <DataSheetGrid 
                value={sqlTableResultData}
                columns={sqlTableColumns}
                style={{
                   '--dsg-cell-background-color': ' #002f39',
                   '--dsg-add-row-background-color': '#002f39',
                }as React.CSSProperties}
                
                />
                }
                </div>
            </div>
        </div>
    );
}
