package DataAdmin

import (
	"database/sql"
	"fmt"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

type ColumnMeta struct {
	Name      string
	Type      string
	Nullable  string
	MaxLength sql.NullInt64
}

type ConnectionSettings struct {
	Host     string
	Port     string
	User     string
	Password string
	Dbname   string
	Sslmode  string
	Database string
}

func GetTableSchema(db *sql.DB) map[string][]ColumnMeta {
	query := `
		SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE' 
ORDER BY table_name, ordinal_position;
	`
	rows, err := db.Query(query)
	defer rows.Close()
	schemas := make(map[string]ColumnMeta)
	for rows.Next() {
		var tableName, colName, datatype, nullable string
		rows.Scan(&tableName, &colName, &datatype, &nullable)
		schemas[tableName] = append(schemas[tableName], ColumnMeta{
			Name: colName, Type: dataType, Nullable: nullable,
		})
	}
	return schemas
}

func Connect(conn_settings ConnectionSettings) (*sqlx.DB, error) {
	connection_string := fmt.Sprintf(
		"host=%s port =%s user=%s password=%s dbname=%s sslmode=%s",
		conn_settings.Host, conn_settings.Port,
		conn_settings.User, conn_settings.Password,
		conn_settings.Dbname, conn_settings.Sslmode,
	)

	db, err := sqlx.Connect(
		conn_settings.Database, connection_string,
	)
	return db, err
}

func Execute(database *sqlx.DB, request string) (result sql.Result, err error) {
	result, err = database.Exec(request)
	return result, err
}

func Query(database *sqlx.DB, request string)

func Close(db *sqlx.DB) {
	defer db.Close()
}
