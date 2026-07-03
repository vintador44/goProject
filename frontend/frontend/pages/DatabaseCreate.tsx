
import "../styles/main.css"
import "../styles/sidebar.css"
import "../styles/database_create.css"
import { MenuItem, LeftSideBar } from "../modules/SideBar";
import * as DataAdminAPI from "../wailsjs/go/DataAdmin/DataAdmin";
import { DataAdmin} from "../wailsjs/go/models";
import { useForm, SubmitHandler } from 'react-hook-form';


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
                <h1 className="page_title">Databases Create</h1>
                <form id="database_settings" onSubmit={handleSubmit(onSubmit)} className="database_settings">
    <div className="field">
        <label>Host</label>
        <input {...register("Host")} type="text" className="db_input" />
    </div>
    <div className="field">
        <label>Port</label>
        <input {...register("Port")} type="text" className="db_input" />
    </div>
    <div className="field">
        <label>User</label>
        <input {...register("User")} type="text" className="db_input" />
    </div>
    <div className="field">
        <label>Password</label>
        <input {...register("Password")} type="text" className="db_input" />
    </div>
    <div className="field">
        <label>Dbname</label>
        <input {...register("Dbname")} type="text" className="db_input" />
    </div>
    <div className="field">
        <label>Sslmode</label>
        <input {...register("Sslmode")} type="text" className="db_input" />
    </div>
    <div className="field">
        <label>Database</label>
        <input {...register("Database")} type="text" className="db_input" />
    </div>
    <button type="submit">Отправить</button>
</form>
            </div>
        </div>

    );
}





