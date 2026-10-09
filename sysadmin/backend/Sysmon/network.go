package sysmon

import (
	"net"
)

type NetworkAdapter struct {
	Name   string
	MAC    string
	IP     string
	Status string // "UP" или "DOWN"
}

type NetworkInfo struct {
	Adapters   []NetworkAdapter
	TotalCount int // включая отфильтрованные (например, loopback)
}

func (m *SystemMonitor) GetNetworkInfo() NetworkInfo {
	var adapters []NetworkAdapter
	totalCount := 0
	interfaces, err := net.Interfaces()
	if err != nil {
		return NetworkInfo{Adapters: adapters, TotalCount: totalCount}
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		totalCount++
		status := "DOWN"
		if iface.Flags&net.FlagUp != 0 {
			status = "UP"
		}
		adapter := NetworkAdapter{
			Name:   iface.Name,
			MAC:    iface.HardwareAddr.String(),
			IP:     "N/A",
			Status: status,
		}
		addrs, err := iface.Addrs()
		if err == nil {
			var ipv4, ipv6 string
			for _, addr := range addrs {
				if ipNet, ok := addr.(*net.IPNet); ok {
					ip := ipNet.IP
					if ip.To4() != nil {
						ipv4 = ip.String()
					} else if ip.To16() != nil && ipv6 == "" {
						ipv6 = ip.String()
					}
				}
			}
			if ipv4 != "" {
				adapter.IP = ipv4
			} else if ipv6 != "" {
				adapter.IP = ipv6
			}
		}
		if adapter.MAC != "" && adapter.MAC != "00:00:00:00:00:00" {
			adapters = append(adapters, adapter)
		}
	}
	return NetworkInfo{
		Adapters:   adapters,
		TotalCount: totalCount,
	}
}
