package sysmon

import (
	"os/exec"
	"strconv"
	"strings"
)

type RAMInfo struct {
	TotalGB float64
	UsedGB  float64
	Percent float64
}

func (m *SystemMonitor) GetRAMInfo() RAMInfo {
	totalKB := m.getWMICValue("TotalVisibleMemorySize")
	freeKB := m.getWMICValue("FreePhysicalMemory")
	if totalKB <= 0 {
		return RAMInfo{}
	}
	totalGB := totalKB / 1024 / 1024
	usedKB := totalKB - freeKB
	if usedKB < 0 {
		usedKB = 0
	}
	usedGB := usedKB / 1024 / 1024
	percent := (usedKB / totalKB) * 100
	if percent > 100 {
		percent = 100
	}
	if percent < 0 {
		percent = 0
	}
	return RAMInfo{
		TotalGB: totalGB,
		UsedGB:  usedGB,
		Percent: percent,
	}
}

func (m *SystemMonitor) getWMICValue(key string) float64 {
	cmd := exec.Command("wmic", "OS", "get", key, "/value")
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, key+"=") {
			parts := strings.Split(line, "=")
			if len(parts) == 2 {
				val, _ := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
				return val
			}
		}
	}
	return 0
}
