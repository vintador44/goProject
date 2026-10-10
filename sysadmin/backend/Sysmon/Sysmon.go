package sysmon

import (
	"log"
	"net"

	host "github.com/shirou/gopsutil/v4/host"
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
	info, err := host.Info()
	if err != nil {
		log.Fatalf("Не удалось получить инфо о хосте: %v", err)
	}
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		log.Fatalf("Ошибка определения IP: %v", err)
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	format_info := info.OS + " " + info.KernelArch + " " + info.Platform + " " + localAddr.IP.String() + " " + info.Hostname

	return format_info
}

// HostInfo возвращает базовую информацию о системе
func (m *SystemMonitor) HostInfo() (host string) {
	return getHostname()
}
