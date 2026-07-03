package sysmon

import (
	"bufio"
	"os"
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
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return RAMInfo{}
	}
	defer file.Close()
	var totalKB, freeKB, availableKB float64
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			totalKB, _ = strconv.ParseFloat(fields[1], 64)
		case "MemFree:":
			freeKB, _ = strconv.ParseFloat(fields[1], 64)

		case "MemAvailable:":
			availableKB, _ = strconv.ParseFloat(fields[1], 64)
		}
	}
	freeKB = freeKB + 0
	if totalKB <= 0 {
		return RAMInfo{}
	}
	usedKB := totalKB - availableKB
	if usedKB < 0 {
		usedKB = 0
	}
	totalGB := totalKB / 1024 / 1024
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
