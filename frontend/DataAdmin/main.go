package main

import (
	DataAdmin "DataAdmin/database_admin"
	"fmt"
)

func main() {
	fmt.Println("Hello, World!")

	settings := DataAdmin.ConnectionSettings{
		Host:     "localhost",
		Port:     "5432",
		User:     "postgres",
		Password: "Kiillofs2",
		Dbname:   "dq",
		Sslmode:  "disable",
		Database: "postgres",
	}
	db, err := DataAdmin.Connect(settings)
	if err != nil {
		fmt.Printf("Error connecting to database: %s\n", err)
		return
	}
	result := DataAdmin.GetTableSchema(db)
	fmt.Println(result)
	DataAdmin.Close(db)
}
