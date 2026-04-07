package sysmon

import (
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type CPUInfo struct {
	Name    string
	Cores   int
	LoadPct float64 // средняя загрузка за последние ~1 сек
}

func (m *SystemMonitor) GetCPUInfo() CPUInfo {
	name := m.getCPUName()
	cores := runtime.NumCPU()
	load := m.getCPULoad()
	return CPUInfo{
		Name:    name,
		Cores:   cores,
		LoadPct: load,
	}
}

func (m *SystemMonitor) getCPUName() string {
	cmd := exec.Command("wmic", "cpu", "get", "name")
	out, err := cmd.Output()
	if err != nil {
		return "Unknown"
	}
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.Contains(line, "Name") {
			return line
		}
	}
	return "Unknown"
}

func (m *SystemMonitor) getCPULoad() float64 {
	// Первый замер
	cmd1 := exec.Command("wmic", "cpu", "get", "loadpercentage", "/value")
	out1, err := cmd1.Output()
	if err != nil {
		return 0
	}
	load1 := parseWMICLoad(string(out1))
	time.Sleep(1 * time.Second)
	// Второй замер
	cmd2 := exec.Command("wmic", "cpu", "get", "loadpercentage", "/value")
	out2, err := cmd2.Output()
	if err != nil {
		return load1
	}
	load2 := parseWMICLoad(string(out2))
	return (load1 + load2) / 2
}

func parseWMICLoad(output string) float64 {
	for _, line := range strings.Split(output, "\n") {
		if strings.Contains(line, "LoadPercentage=") {
			parts := strings.Split(line, "=")
			if len(parts) == 2 {
				val, _ := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
				return val
			}
		}
	}
	return 0
}
