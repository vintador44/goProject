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
        <div className="flex min-h-screen w-full flex-col bg-background text-slate-200 md:flex-row">
            <LeftSideBar menuItems={MenuItems} />
            <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto bg-background dark">
                <h1 className="w-full px-4 py-3 text-3xl font-semibold text-slate-100 md:text-4xl">Databases Work</h1>
                <div className="flex w-full flex-wrap items-center gap-2 border-y border-slate-500 px-4 py-3">
                    <button className="h-[42px] rounded border border-border bg-accent px-3 py-2 text-sm text-slate-100 transition-colors hover:bg-cyan-950" onClick={Fconnect}>Подключиться</button>
                     <span className={connectionString ? "h-[42px] text-foreground border border-border p-2 rounded bg-chart-2" : "text-slate-400 border border-border p-2 rounded bg-accent"}>{connectionString ? "Подключено" : "Не подключено"}</span>
                     <button className="h-[42px] rounded border border-border bg-accent px-3 py-2 text-sm text-slate-100 transition-colors hover:bg-slate-800" onClick={FJSONquery}>Query</button>
                     <button className="h-[42px] rounded border border-border bg-accent px-3 py-2 text-sm text-slate-100 transition-colors hover:bg-slate-800" onClick={FGetJSONschema}>GetJSONschema</button>
                     <button className="h-[42px] rounded border border-border bg-accent px-3 py-2 text-sm text-slate-100 transition-colors hover:bg-slate-800" onClick={Execute}>Execute</button>
                     <button className="h-[42px] rounded border border-border bg-accent px-3 py-2 text-sm text-slate-100 transition-colors hover:bg-slate-800" onClick={Close}>Close</button>
                </div>
                <textarea
                value={queryText} 
                rows={5}
                onChange={(e)=> setQueryText(e.target.value)}
                placeholder="SQL запрос"
                className="m-3 w-[calc(100%-1.5rem)] resize-y rounded-md border border-slate-600 bg-[#071f24] p-3 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
                
                
                <div className="min-h-0 w-full flex-1 p-3">
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
            </main>
        </div>
    );
}
