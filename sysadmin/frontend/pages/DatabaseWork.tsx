import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LeftSideBar } from "../modules/SideBar";
import { MenuItems } from "../constants";
import * as DataAdminAPI from "../wailsjs/go/DataAdmin/DataAdmin";
import { DataAdmin } from "../wailsjs/go/models";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DatabaseRow = Record<string, unknown>;
type ResultView = "rows" | "output";

const emptyConnection = () => new DataAdmin.ConnectionSettings({
  Host: "localhost",
  Port: "5432",
  User: "postgres",
  Password: "",
  Dbname: "postgres",
  Sslmode: "disable",
  Database: "postgres",
});

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value) ?? String(value);
  return String(value);
}

export default function DatabaseWork() {
  const { index } = useParams<{ index: string }>();
  const navigate = useNavigate();
  const [connection, setConnection] = useState<DataAdmin.ConnectionSettings>(emptyConnection);
  const [connectionString, setConnectionString] = useState("");
  const [queryText, setQueryText] = useState("");
  const [rows, setRows] = useState<DatabaseRow[]>([]);
  const [output, setOutput] = useState("");
  const [resultView, setResultView] = useState<ResultView>("rows");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(index === "new");

  useEffect(() => {
    if (index === "new") {
      setCreateOpen(true);
      setConnection(emptyConnection());
      return;
    }
    try {
      const list = JSON.parse(localStorage.getItem("databases") || "[]") as unknown[];
      const item = list[Number(index)];
      if (item) setConnection(new DataAdmin.ConnectionSettings(item));
      else setError("Профиль подключения не найден. Вернитесь к списку баз и выберите профиль.");
    } catch {
      setError("Не удалось прочитать список профилей из локального хранилища.");
    }
  }, [index]);

  const columnsFromRows = (() => {
    const names = new Set<string>();
    rows.forEach((row) => Object.keys(row).forEach((key) => names.add(key)));
    return Array.from(names);
  })();

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const id = await DataAdminAPI.Connect(connection);
      setConnectionString(id);
      setOutput(`Подключено к ${connection.Dbname} на ${connection.Host}:${connection.Port}`);
      setResultView("output");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const runQuery = async () => {
    if (!connectionString || !queryText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const raw = await DataAdminAPI.JSONQuery(connectionString, queryText);
      const parsed = JSON.parse(raw) as DatabaseRow[] | null;
      const result = Array.isArray(parsed) ? parsed : [];
      setRows(result);
      setOutput("");
      setResultView("rows");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  const loadSchema = async () => {
    if (!connectionString) return;
    setBusy(true);
    setError("");
    try {
      const schema = await DataAdminAPI.GetJSONschema(connectionString);
      setOutput(JSON.stringify(JSON.parse(schema), null, 2) ?? schema);
      setRows([]);
      setResultView("output");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const executeSQL = async () => {
    if (!connectionString || !queryText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await DataAdminAPI.Execute(connectionString, queryText);
      setOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2) ?? String(result));
      setRows([]);
      setResultView("output");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!connectionString) return;
    try {
      await DataAdminAPI.Close(connectionString);
    } finally {
      setConnectionString("");
      setRows([]);
      setOutput("");
    }
  };

  const createProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const profile = Object.fromEntries(form.entries());
    const list = JSON.parse(localStorage.getItem("databases") || "[]") as unknown[];
    const next = [...list, profile];
    localStorage.setItem("databases", JSON.stringify(next));
    setCreateOpen(false);
    navigate(`/databaseWork/${next.length - 1}`, { replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground dark">
      <LeftSideBar menuItems={MenuItems} />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5 md:px-8">
          <div>
            <p className="text-sm text-muted-foreground">Database / Workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Database Work</h1>
            <p className="mt-1 text-sm text-muted-foreground">Подключение, запросы и просмотр результатов в одном месте.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/databaseProfiles")}>Все подключения</Button>
            <Button variant="outline" onClick={() => { setConnection(emptyConnection()); setCreateOpen(true); }}>Новое подключение</Button>
          </div>
        </header>

        <div className="grid min-w-0 flex-1 gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <section className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-border">
                <div>
                  <CardTitle>SQL запрос</CardTitle>
                  <CardDescription className="mt-1">Пишите запрос к выбранной базе и запускайте его.</CardDescription>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${connectionString ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                  <span className="mr-2 inline-block size-1.5 rounded-full bg-current" />
                  {connectionString ? "Подключено" : "Отключено"}
                </span>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{connection.Dbname || "База не выбрана"}</span>
                  <span>{connection.User}@{connection.Host}:{connection.Port}</span>
                </div>
                <textarea
                  value={queryText}
                  onChange={(event) => setQueryText(event.target.value)}
                  spellCheck={false}
                  aria-label="SQL query editor"
                  placeholder="SELECT * FROM table_name;"
                  className="min-h-52 w-full resize-y rounded-lg border border-input bg-slate-950/70 p-4 font-mono text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void connect()} disabled={busy || Boolean(connectionString)}>{busy && !connectionString ? "Подключение…" : "Подключиться"}</Button>
                  <Button variant="secondary" onClick={() => void runQuery()} disabled={busy || !connectionString}>Запустить запрос</Button>
                  <Button variant="outline" onClick={() => void loadSchema()} disabled={busy || !connectionString}>Схема</Button>
                  <Button variant="outline" onClick={() => void executeSQL()} disabled={busy || !connectionString}>Выполнить SQL</Button>
                  {connectionString && <Button variant="ghost" onClick={() => void disconnect()} disabled={busy}>Отключиться</Button>}
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 flex-1">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border">
                <div>
                  <CardTitle>Результат</CardTitle>
                  <CardDescription className="mt-1">{resultView === "rows" ? `${rows.length} строк` : "Текстовый вывод"}</CardDescription>
                </div>
                <div className="flex rounded-lg border border-border bg-muted/40 p-1">
                  <Button size="sm" variant={resultView === "rows" ? "secondary" : "ghost"} onClick={() => setResultView("rows")}>Таблица</Button>
                  <Button size="sm" variant={resultView === "output" ? "secondary" : "ghost"} onClick={() => setResultView("output")}>Вывод</Button>
                </div>
              </CardHeader>
              <CardContent className="min-w-0 p-0">
                {error ? (
                  <div role="alert" className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
                ) : resultView === "output" && output ? (
                  <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-sm leading-6 text-emerald-300">{output}</pre>
                ) : resultView === "rows" && rows.length > 0 ? (
                  <div className="max-h-[34rem] min-w-0 overflow-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>{columnsFromRows.map((column) => <th key={column} className="whitespace-nowrap border-b border-border px-4 py-3 font-medium">{column}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b border-border/70 hover:bg-muted/30">
                            {columnsFromRows.map((column) => {
                              const value = row[column];
                              return <td key={column} title={displayValue(value)} className={`max-w-[28rem] whitespace-pre-wrap break-words px-4 py-3 align-top ${value == null ? "italic text-muted-foreground" : "text-foreground"}`}>{displayValue(value)}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                    <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-lg text-muted-foreground">{connectionString ? "⌘" : "↗"}</div>
                    <p className="font-medium">{connectionString ? "Результат появится здесь" : "Подключитесь к базе данных"}</p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">{connectionString ? "Запустите SQL-запрос или откройте схему базы." : "Выберите сохранённый профиль или создайте новое подключение."}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <aside className="min-w-0">
            <Card>
              <CardHeader>
                <CardTitle>Подключение</CardTitle>
                <CardDescription>Текущий профиль базы данных</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="truncate font-medium">{connection.Dbname || "Новый профиль"}</p>
                  <p className="mt-1 break-all text-sm text-muted-foreground">{connection.Host || "host"}:{connection.Port || "port"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Пользователь: {connection.User || "—"}</p>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">SSL режим</span><span>{connection.Sslmode || "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Драйвер</span><span>{connection.Database || "—"}</span></div>
                </div>
                {!connectionString && <Button className="w-full" onClick={() => void connect()} disabled={busy}>{busy ? "Подключение…" : "Подключиться к базе"}</Button>}
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && index !== "new") setCreateOpen(false); }}>
          <Card role="dialog" aria-modal="true" aria-labelledby="database-create-title" className="my-auto w-full max-w-2xl shadow-2xl">
            <CardHeader className="border-b border-border">
              <CardTitle id="database-create-title" className="text-xl">Новое подключение</CardTitle>
              <CardDescription>Сохраните PostgreSQL профиль, чтобы использовать его в рабочей области.</CardDescription>
            </CardHeader>
            <form onSubmit={createProfile}>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="db-host">Хост</Label><Input id="db-host" name="Host" required defaultValue={connection.Host || "localhost"} placeholder="localhost" /></div>
                <div className="space-y-2"><Label htmlFor="db-port">Порт</Label><Input id="db-port" name="Port" required defaultValue={connection.Port || "5432"} placeholder="5432" /></div>
                <div className="space-y-2"><Label htmlFor="db-user">Пользователь</Label><Input id="db-user" name="User" required defaultValue={connection.User} placeholder="postgres" /></div>
                <div className="space-y-2"><Label htmlFor="db-password">Пароль</Label><Input id="db-password" name="Password" type="password" defaultValue={connection.Password} autoComplete="new-password" /></div>
                <div className="space-y-2"><Label htmlFor="db-name">Имя базы</Label><Input id="db-name" name="Dbname" required defaultValue={connection.Dbname} placeholder="postgres" /></div>
                <div className="space-y-2"><Label htmlFor="db-sslmode">SSL режим</Label><Input id="db-sslmode" name="Sslmode" required defaultValue={connection.Sslmode || "disable"} placeholder="disable" /></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="db-driver">Драйвер</Label><Input id="db-driver" name="Database" required defaultValue={connection.Database || "postgres"} placeholder="postgres" /><p className="text-xs text-muted-foreground">Для PostgreSQL оставьте значение `postgres`.</p></div>
              </CardContent>
              <div className="flex justify-end gap-2 border-t border-border bg-muted/30 p-4">
                <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); if (index === "new") navigate("/databaseProfiles", { replace: true }); }}>Отмена</Button>
                <Button type="submit">Сохранить профиль</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
