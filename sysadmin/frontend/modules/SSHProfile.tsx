import SSHTerminal from "./SSHTerminal";
import { useState } from "react";

export type SSHProfilesProps = {
  
  username:string,
  ip: string
}

export const SSHProfile = ({username,ip} : SSHProfilesProps) => {
    const [sshTerminalOpen,setSshTerminalOpen] = useState<boolean>()

  return (
    <div className="m-2 flex min-h-24 w-full items-center justify-between gap-4 rounded-md border border-border bg-card p-4 shadow-sm sm:w-80">
      <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-300">
        <div className="truncate font-medium text-slate-100">
          Ip: {ip}
        </div>
        
        <div className="truncate">User: {username}</div>
        
      </div>
      <button
        onClick={() => {
          setSshTerminalOpen(true);
        }}
        className="shrink-0 rounded border border-border bg-foreground px-3 py-2 text-sm font-medium text-background transition-colors  focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Подключиться
      </button>
      {sshTerminalOpen  && (
              <SSHTerminal
              username={username}
                hostname={ip}
                onClose={() => setSshTerminalOpen(false)}
              />
            )}
    </div>
  );
}

export default SSHProfile;
