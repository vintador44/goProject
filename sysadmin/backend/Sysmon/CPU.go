package sysmon

import (
	"bufio"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	cpu "github.com/shirou/gopsutil/v4/cpu"
)

type CPUInfo struct {
	Name        string
	Cores       int
	LoadPct     float64
	Temperature *float64
}

func (m *SystemMonitor) GetCPUInfo() CPUInfo {
	if runtime.GOOS == "windows" {
		info, err := windowsCPUInfo()
		if err == nil {
			return info
		}
		log.Printf("Не удалось получить данные CPU из HardwareLibreHelper: %v", err)
	}

	info, err := cpu.Info()
	name := "Unknown"
	if err == nil && len(info) > 0 {
		name = strings.TrimSpace(info[0].ModelName)
		if name == "" {
			name = info[0].Model
		}
	}
	load := 0.0
	if percentages, err := cpu.Percent(time.Second, false); err == nil && len(percentages) > 0 {
		load = percentages[0]
	}

	temperature := m.GetCPUTemperature()
	var temperatureCelsius *float64
	if temperature.Available {
		temperatureCelsius = &temperature.Celsius
	}

	return CPUInfo{
		Name:        name,
		Cores:       runtime.NumCPU(),
		LoadPct:     load,
		Temperature: temperatureCelsius,
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

func (m *SystemMonitor) readCPUStats() (uint64, uint64, bool) {
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

func (m *SystemMonitor) getCPULoad() float64 {
	total1, idle1, ok := m.readCPUStats()
	if !ok {
		return 0.0
	}
	time.Sleep(1 * time.Second)
	total2, idle2, ok := m.readCPUStats()
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

type CPUTemperature struct {
	Celsius   float64
	Sensor    string
	Available bool
}

type tempCandidate struct {
	value    float64
	driver   string
	label    string
	priority int
}

func (m *SystemMonitor) GetCPUTemperature() CPUTemperature {
	hwmonPaths, _ := filepath.Glob("/sys/class/hwmon/hwmon*")

	var candidates []tempCandidate

	for _, path := range hwmonPaths {
		nameBytes, err := os.ReadFile(filepath.Join(path, "name"))
		if err != nil {
			continue
		}

		driver := strings.ToLower(strings.TrimSpace(string(nameBytes)))

		inputs, _ := filepath.Glob(filepath.Join(path, "temp*_input"))

		for _, input := range inputs {
			raw, err := os.ReadFile(input)
			if err != nil {
				continue
			}

			milliCelsius, err := strconv.ParseFloat(
				strings.TrimSpace(string(raw)), 64,
			)
			if err != nil {
				continue
			}

			celsius := milliCelsius / 1000
			if celsius < -50 || celsius > 250 {
				continue
			}

			base := strings.TrimSuffix(input, "_input")
			labelBytes, _ := os.ReadFile(base + "_label")
			label := strings.TrimSpace(string(labelBytes))

			priority := cpuTempPriority(driver, label)
			if priority == 0 {
				continue
			}

			candidates = append(candidates, tempCandidate{
				value:    celsius,
				driver:   driver,
				label:    label,
				priority: priority,
			})
		}
	}

	if len(candidates) == 0 {
		return CPUTemperature{Available: false}
	}

	best := candidates[0]
	for _, candidate := range candidates[1:] {
		if candidate.priority > best.priority {
			best = candidate
		} else if candidate.priority == best.priority &&
			candidate.value > best.value {
			best = candidate
		}
	}

	label := best.label
	if label == "" {
		label = "temperature"
	}

	return CPUTemperature{
		Celsius:   best.value,
		Sensor:    best.driver + ":" + label,
		Available: true,
	}
}

func cpuTempPriority(driver, label string) int {
	d := strings.ToLower(driver)
	l := strings.ToLower(strings.TrimSpace(label))

	switch d {
	case "coretemp":
		if strings.HasPrefix(l, "package id") {
			return 100
		}
		if strings.HasPrefix(l, "core ") {
			return 90
		}

		if l == "" {
			return 80
		}

	case "k10temp", "zenpower":
		switch l {
		case "tdie":
			return 100
		case "tctl":
			return 90
		}

		if l == "" && d == "k10temp" {
			return 70
		}

	case "peci_cputemp":
		if l == "" || l == "die" {
			return 95
		}
	}

	if strings.Contains(d, "cpu") ||
		strings.Contains(d, "cputemp") {
		if l == "" ||
			strings.Contains(l, "cpu") ||
			strings.Contains(l, "package") ||
			strings.Contains(l, "tdie") ||
			l == "die" {
			return 60
		}
	}

	return 0
}
