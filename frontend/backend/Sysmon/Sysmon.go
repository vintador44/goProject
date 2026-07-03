package sysmon

import (
	"os"
	"runtime"
)

type SystemMonitor struct {
	// при необходимости можно добавить кэш или настройки
}

func New() *SystemMonitor {
	return &SystemMonitor{}
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func getHostname() string {
	name, err := os.Hostname()
	if err != nil {
		return "Unknown"
	}
	return name
}

// HostInfo возвращает базовую информацию о системе
func (m *SystemMonitor) HostInfo() (hostname, osName string) {
	return getHostname(), runtime.GOOS
}
