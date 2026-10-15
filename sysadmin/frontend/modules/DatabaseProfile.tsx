import { DataAdmin } from "../wailsjs/go/models";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const DatabaseProfile = (da: DataAdmin.ConnectionSettings & { index: number }) => {
    const navigate = useNavigate();


  return (
    <Card className="w-full max-w-sm transition-colors hover:border-primary/40">
      <CardHeader className="pb-3">
        <CardDescription>PostgreSQL · Профиль #{da.index + 1}</CardDescription>
        <CardTitle className="truncate">{da.Dbname || "Без имени"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <span className="text-muted-foreground">Адрес</span><span className="truncate text-right">{da.Host}:{da.Port}</span>
          <span className="text-muted-foreground">Пользователь</span><span className="truncate text-right">{da.User}</span>
          <span className="text-muted-foreground">SSL</span><span className="text-right">{da.Sslmode || "—"}</span>
        </div>
        <Button className="w-full" variant="outline" onClick={() => navigate(`/databaseWork/${da.index}`)}>
          Открыть рабочую область
        </Button>
      </CardContent>
    </Card>
  );
};
