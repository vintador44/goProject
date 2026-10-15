package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"relayserver/internal/sysagent"
)

func main() {
	if os.Getenv("SYSADMIN_RELAY_TOKEN") == "" || os.Getenv("SYSADMIN_AGENT_TOKEN") == "" || os.Getenv("SYSADMIN_RELAY_TLS_CERT") == "" || os.Getenv("SYSADMIN_RELAY_TLS_KEY") == "" {
		log.Fatal("set SYSADMIN_RELAY_TOKEN, SYSADMIN_AGENT_TOKEN, SYSADMIN_RELAY_TLS_CERT and SYSADMIN_RELAY_TLS_KEY before starting the relay")
	}

	server := sysagent.New()
	server.Start()
	log.Println("SysAdmin relay server started; press Ctrl+C to stop")

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	<-signals
	server.Stop()
}
