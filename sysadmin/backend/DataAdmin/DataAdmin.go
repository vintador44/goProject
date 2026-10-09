package DataAdmin

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

type DataAdmin struct {
	connections map[string]*sqlx.DB
	muBlock     sync.RWMutex
}

func NewDataAdmin() *DataAdmin {
	return &DataAdmin{
		connections: make(map[string]*sqlx.DB),
	}
}

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

func (d *DataAdmin) GetTableSchema(connection_id string) (map[string][]ColumnMeta, error) {
	query := `SELECT
	t.table_name,
	c.column_name,
	c.data_type,
	c.is_nullable
	FROM information_schema.tables t
	JOIN information_schema.columns c ON
	t.table_name = c.table_name
	AND t.table_schema = c.table_schema
	WHERE t.table_schema = 'public'
	AND t.table_type = 'BASE TABLE'
	ORDER BY t.table_name, c.ordinal_position;


	`
	d.muBlock.RLock()
	db, correct := d.connections[connection_id]
	d.muBlock.RUnlock()
	if !correct {
		return nil, fmt.Errorf("connection not found")
	}

	var dbName string
	err := db.QueryRow("SELECT current_database()").Scan(&dbName)
	if err != nil {
		log.Fatal(err)

	}
	log.Printf("Подключено к базе данных: %s", dbName)

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}

	defer rows.Close()
	count := 0
	schemas := make(map[string][]ColumnMeta)
	for rows.Next() {
		count += 1
		var tableName, colName, dataType, nullable string
		rows.Scan(&tableName, &colName, &dataType, &nullable)
		schemas[tableName] = append(schemas[tableName], ColumnMeta{
			Name: colName, Type: dataType, Nullable: nullable,
		})
	}
	log.Println("total rows:", count)
	return schemas, err
}

func (d *DataAdmin) Connect(conn_settings ConnectionSettings) (string, error) {

	log.Printf("DEBUG Connect settings: %+v", conn_settings)
	connection_string := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		conn_settings.Host, conn_settings.Port,
		conn_settings.User, conn_settings.Password,
		conn_settings.Dbname, conn_settings.Sslmode,
	)
	log.Printf("DEBUG connection string: %s", connection_string)
	db, err := sqlx.Connect(
		conn_settings.Database, connection_string,
	)
	connection_id := uuid.New().String()
	d.muBlock.RLock()
	d.connections[connection_id] = db
	d.muBlock.RUnlock()
	return connection_id, err
}
func (d *DataAdmin) GetJSONschema(connection_id string) (result string, err error) {

	raw_schema, err := d.GetTableSchema(connection_id)
	if err != nil {
		return "null", err
	}
	json_schema, err := json.MarshalIndent(raw_schema, "", "  ")
	if err != nil {
		return "null", err
	}
	return string(json_schema), err
}

func (d *DataAdmin) Execute(connection_id string, request string) (result sql.Result, err error) {
	d.muBlock.RLock()
	db, correct := d.connections[connection_id]
	d.muBlock.RUnlock()
	if !correct {
		return nil, fmt.Errorf("connection not found")
	}
	result, err = db.Exec(request)
	return result, err
}

func (d *DataAdmin) Query(connection_id string, request string) ([]map[string]interface{}, error) {
	d.muBlock.RLock()
	db, correct := d.connections[connection_id]
	d.muBlock.RUnlock()
	if !correct {
		return nil, fmt.Errorf("connection not found")
	}
	rows, err := db.Queryx(request)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []map[string]interface{}
	for rows.Next() {

		row_map := make(map[string]interface{})
		err = rows.MapScan(row_map)
		result = append(result, row_map)
	}
	return result, err
}

func (d *DataAdmin) JSONQuery(connection_id string, request string) (string, error) {

	raw_result, err := d.Query(connection_id, request)
	if err != nil {
		return "null", err
	}
	json_result, err := json.MarshalIndent(raw_result, "", "  ")
	return string(json_result), err

}

func (d *DataAdmin) Close(connection_id string) {
	d.muBlock.RLock()
	db, correct := d.connections[connection_id]
	d.muBlock.RUnlock()
	if !correct {
		db.Close()
	}

}
