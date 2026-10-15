import { MenuItem } from "./modules/SideBar";

export const MenuItems: MenuItem[] = [
  { label: "System Information", path: "/" },
  { label: "Database Profiles", path: "/databaseProfiles" },
  {
    label: "System Agent",
    path: "/SysAgent",
  },
  {
    label: "Remote SysAgent",
    path: "/RemoteSysAgent",
  },
  { label: "SSH Profile", path: "/SSHProfiles"}
];
