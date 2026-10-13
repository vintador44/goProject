import { MenuItem, LeftSideBar } from "../modules/SideBar";
import { MenuItems } from "../constants";
import { SSHProfile, SSHProfilesProps } from "../modules/SSHProfile";
import AddButton from "../modules/AddButton";
import { useState} from "react";
import { SSHForm } from "../modules/SSHForm";
import { useLocalStorage } from "@uidotdev/usehooks";

type Profile = { hostusername: string;username:string ; ip: string };

function SSHProfiles() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useLocalStorage<Profile[]>("ssh-profiles", []);

  const handleSubmit = (profile: Profile) => {
    setProfiles((prev) => [...prev, profile]);
  };

  return (
    <div className="w-full h-full flex">
      <LeftSideBar menuItems={MenuItems} />
      <main className="bg-background w-full dark">
        <h1 className="w-full px-4 py-3 text-3xl font-semibold text-slate-100 border-b border-slate-600 md:text-4xl">
          SSH Profiles
        </h1>
        {profiles.map((p) => (
          <SSHProfile key={`${p.hostusername}@${p.ip}`} hostusername={p.hostusername} username={p.username} ip={p.ip} />
        ))}
      </main>
      {open && (
        <SSHForm
          onClose={() => setOpen(false)}
          onSubmit={(profile) => {
            handleSubmit(profile);
            setOpen(false);
          }}
        />
      )}
      <AddButton onClick={() => setOpen((flag) => !flag)} />
    </div>
  );
}

export default SSHProfiles