
import { LeftSideBar } from "../modules/SideBar";
import { MenuItems } from "../constants";
import { DataAdmin } from "../wailsjs/go/models";
import { DatabaseProfile } from "../modules/DatabaseProfile";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function DatabasePage() {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<DataAdmin.ConnectionSettings[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("databases");
      const list = stored ? JSON.parse(stored) : [];
      setConnections(list.map((item: unknown) => new DataAdmin.ConnectionSettings(item)));
    } catch (error) {
      console.error("Ошибка при загрузке профилей БД:", error);
      setConnections([]);
    }
  }, []);

  const hasConnections = connections.length > 0;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground dark">
      <LeftSideBar menuItems={MenuItems} />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5 md:px-8">
          <div>
            <p className="text-sm text-muted-foreground">Database</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Профили подключений</h1>
            <p className="mt-1 text-sm text-muted-foreground">Сохранённые подключения к базам данных.</p>
          </div>
          <Button onClick={() => navigate("/databaseWork/new")}>Добавить подключение</Button>
        </header>

        <section className="flex flex-wrap content-start gap-3 p-4 md:p-6">
          {hasConnections ? connections.map((item, index) => (
            <DatabaseProfile {...item} index={index} key={`${item.User}@${item.Host}/${item.Dbname}-${index}`} />
          )) : (
            <Card className="w-full border-dashed">
              <CardHeader>
                <CardTitle>Пока нет подключений</CardTitle>
                <CardDescription>Добавьте профиль базы данных. Форма откроется в Database Work.</CardDescription>
                <Button className="mt-3 w-fit" onClick={() => navigate("/databaseWork/new")}>Создать профиль</Button>
              </CardHeader>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}

export default DatabasePage;
