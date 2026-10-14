import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SSHFormProps = {
  onSubmit: (data: { username: string; ip: string }) => void;
  onClose?: () => void;
};



export const SSHForm = ({ onSubmit, onClose }: SSHFormProps) => {
  
  const [username, setUsername] = useState("");
  const [ip, setIp] = useState("");


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ username, ip });
  };

  return (
    <Card className="p-4 fixed left-[57%] top-1/2 w-96 -translate-x-1/2 -translate-y-1/2 shadow-lg dark">
      <form onSubmit={handleSubmit}>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Новое подключение</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ssh-user" className="text-base">
              User
            </Label>
            <Input
              id="ssh-user"
              className="h-11 text-base"
              placeholder="root"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <div className="space-y-2 pb-2">
            <Label htmlFor="ssh-ip" className="text-base">
              IP
            </Label>
            <Input
              id="ssh-ip"
              className="h-11 text-base"
              placeholder="192.168.1.10"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-3 pt-2 bg-card">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="text-base"
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button
            className="rounded-full px-6 text-base"
            type="submit"
            size="lg"
            disabled={!username || !ip }
            onClick={() => {
              localStorage.setItem("ssh-profile", JSON.stringify({ username, ip }));
            }}
          >
            Подключить
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};
