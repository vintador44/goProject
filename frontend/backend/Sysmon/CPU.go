package sysmon

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type CPUInfo struct {
	Name    string
	Cores   int
	LoadPct float64
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
	file, err := os.Open("/proc/cpuinfo")
	if err != nil {
		return "Unknown"
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "model name") || strings.Contains(line, "Processor") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return "Unknown"
}

func (m *SystemMonitor) getCPULoad() float64 {
	readStats := func() (uint64, uint64, bool) {
		file, err := os.Open("/proc/stat")
		if err != nil {
			return 0, 0, false
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		if !scanner.Scan() {
			return 0, 0, false
		}
		fields := strings.Fields(scanner.Text())
		if len(fields) < 5 || fields[0] != "cpu" {
			return 0, 0, false
		}
		var user, nice, system, idle, iowait, irq, softirq, steal uint64
		user, _ = strconv.ParseUint(fields[1], 10, 64)
		nice, _ = strconv.ParseUint(fields[2], 10, 64)
		system, _ = strconv.ParseUint(fields[3], 10, 64)
		idle, _ = strconv.ParseUint(fields[4], 10, 64)
		if len(fields) > 5 {
			iowait, _ = strconv.ParseUint(fields[5], 10, 64)
		}
		if len(fields) > 6 {
			irq, _ = strconv.ParseUint(fields[6], 10, 64)
		}
		if len(fields) > 7 {
			softirq, _ = strconv.ParseUint(fields[7], 10, 64)
		}
		if len(fields) > 8 {
			steal, _ = strconv.ParseUint(fields[8], 10, 64)
		}
		total := user + nice + system + idle + iowait + irq + softirq + steal
		idleTotal := idle + iowait
		return total, idleTotal, true
	}

	total1, idle1, ok := readStats()
	if !ok {
		return 0.0
	}
	time.Sleep(1 * time.Second)
	total2, idle2, ok := readStats()
	if !ok {
		return 0.0
	}

	deltaTotal := total2 - total1
	deltaIdle := idle2 - idle1
	if deltaTotal == 0 {
		return 0.0
	}
	loadPct := (1.0 - float64(deltaIdle)/float64(deltaTotal)) * 100.0
	if loadPct < 0 {
		return 0.0
	}
	return loadPct
}
