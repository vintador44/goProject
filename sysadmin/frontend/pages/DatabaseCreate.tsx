
import { MenuItem, LeftSideBar } from "../modules/SideBar";
import * as DataAdminAPI from "../wailsjs/go/DataAdmin/DataAdmin";
import { DataAdmin} from "../wailsjs/go/models";
import { useForm, SubmitHandler } from 'react-hook-form';
import {MenuItems} from "../constants"


interface DatabaseFormValues extends DataAdmin.ConnectionSettings {

}

export default function DatabaseCreate() {
    const { register, handleSubmit } = useForm();
    const onSubmit = (data: any) => {
        const local_db= localStorage.getItem("databases")
        var storage = local_db? JSON.parse(local_db) : []
        console.log(data)
        storage.push(data);
        localStorage.setItem("databases",JSON.stringify(storage))
        console.log(storage)
    }


   
    
    
    return (
        <div className="flex min-h-screen w-full flex-col bg-background text-slate-200 md:flex-row">
            <LeftSideBar menuItems={MenuItems} />
            <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto bg-background dark">
                <h1 className="w-full px-4 py-3 text-3xl font-semibold text-slate-100 md:text-4xl">Databases Create</h1>
                <form id="database_settings" onSubmit={handleSubmit(onSubmit)} className="flex w-full max-w-lg flex-col gap-3 p-4">
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
        <label className="text-sm text-slate-300">Host</label>
        <input {...register("Host")} type="text" className="min-w-0 rounded border border-slate-600 bg-[#071f24] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
    </div>
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
        <label className="text-sm text-slate-300">Port</label>
        <input {...register("Port")} type="text" className="min-w-0 rounded border border-slate-600 bg-[#071f24] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
    </div>
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
        <label className="text-sm text-slate-300">User</label>
        <input {...register("User")} type="text" className="min-w-0 rounded border border-slate-600 bg-[#071f24] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
    </div>
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
        <label className="text-sm text-slate-300">Password</label>
        <input {...register("Password")} type="password" className="min-w-0 rounded border border-slate-600 bg-[#071f24] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
    </div>
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
        <label className="text-sm text-slate-300">Dbname</label>
        <input {...register("Dbname")} type="text" className="min-w-0 rounded border border-slate-600 bg-[#071f24] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
    </div>
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
        <label className="text-sm text-slate-300">Sslmode</label>
        <input {...register("Sslmode")} type="text" className="min-w-0 rounded border border-slate-600 bg-[#071f24] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
    </div>
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
        <label className="text-sm text-slate-300">Database</label>
        <input {...register("Database")} type="text" className="min-w-0 rounded border border-slate-600 bg-[#071f24] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
    </div>
    <button type="submit" className="mt-2 w-full rounded border border-border bg-chart-5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-400">Отправить</button>
</form>
            </main>
        </div>

    );
}





