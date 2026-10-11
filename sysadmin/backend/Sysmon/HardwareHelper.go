package sysmon

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

type hardwareReport struct {
	CPU []struct {
		Name        string   `json:"Name"`
		Temperature *float64 `json:"Temperature"`
		Load        *float64 `json:"Load"`
	} `json:"CPU"`
	GPU []struct {
		Name        string   `json:"Name"`
		Temperature *float64 `json:"Temperature"`
		Load        *float64 `json:"Load"`
	} `json:"GPU"`
}

type hardwareReportCache struct {
	sync.Mutex
	report    hardwareReport
	err       error
	fetchedAt time.Time
}

var windowsHardwareReportCache hardwareReportCache

func windowsCPUInfo() (CPUInfo, error) {
	report, err := getWindowsHardwareReport()
	if err != nil {
		return CPUInfo{}, err
	}
	if len(report.CPU) == 0 {
		return CPUInfo{}, fmt.Errorf("helper вернул пустой список CPU")
	}

	cpu := report.CPU[0]
	name := cpu.Name
	if name == "" {
		name = "Unknown"
	}

	info := CPUInfo{
		Name:    name,
		Cores:   runtime.NumCPU(),
		LoadPct: 0,
	}
	if cpu.Load != nil {
		info.LoadPct = float64(*cpu.Load)
	}
	info.Temperature = cpu.Temperature
	return info, nil
}

func windowsGPUInfo() (GPUInfo, error) {
	report, err := getWindowsHardwareReport()
	if err != nil {
		return GPUInfo{}, err
	}
	if len(report.GPU) == 0 {
		return GPUInfo{Name: "Unknown"}, nil
	}

	gpu := report.GPU[0]
	name := gpu.Name
	if name == "" {
		name = "Unknown"
	}
	return GPUInfo{
		Name: name,
		Temp: gpu.Temperature,
		Load: gpu.Load,
	}, nil
}

func getWindowsHardwareReport() (hardwareReport, error) {
	windowsHardwareReportCache.Lock()
	defer windowsHardwareReportCache.Unlock()

	if time.Since(windowsHardwareReportCache.fetchedAt) < time.Second {
		return windowsHardwareReportCache.report, windowsHardwareReportCache.err
	}

	helperPath, err := findHardwareHelper()
	if err != nil {
		windowsHardwareReportCache.report = hardwareReport{}
		windowsHardwareReportCache.err = err
		windowsHardwareReportCache.fetchedAt = time.Now()
		return hardwareReport{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	output, err := exec.CommandContext(ctx, helperPath).Output()
	if err != nil {
		windowsHardwareReportCache.report = hardwareReport{}
		windowsHardwareReportCache.err = fmt.Errorf("запуск %q: %w", helperPath, err)
		if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
			windowsHardwareReportCache.err = fmt.Errorf("%w: %s", windowsHardwareReportCache.err, exitErr.Stderr)
		}
		windowsHardwareReportCache.fetchedAt = time.Now()
		return hardwareReport{}, windowsHardwareReportCache.err
	}

	var report hardwareReport
	if err := json.Unmarshal(output, &report); err != nil {
		windowsHardwareReportCache.report = hardwareReport{}
		windowsHardwareReportCache.err = fmt.Errorf("разбор JSON от %q: %w", helperPath, err)
		windowsHardwareReportCache.fetchedAt = time.Now()
		return hardwareReport{}, windowsHardwareReportCache.err
	}

	windowsHardwareReportCache.report = report
	windowsHardwareReportCache.err = nil
	windowsHardwareReportCache.fetchedAt = time.Now()
	return report, nil
}

func findHardwareHelper() (string, error) {
	const helperName = "HardwareLibreHelper.exe"

	var roots []string
	if executable, err := os.Executable(); err == nil {
		root := filepath.Dir(executable)
		for range 4 {
			roots = append(roots, root)
			parent := filepath.Dir(root)
			if parent == root {
				break
			}
			root = parent
		}
	}
	if workingDir, err := os.Getwd(); err == nil {
		roots = append(roots, workingDir)
	}

	seen := make(map[string]struct{})
	for _, root := range roots {
		for _, candidate := range []string{
			filepath.Join(root, "backend", "publish", helperName),
			filepath.Join(root, "publish", helperName),
			filepath.Join(root, helperName),
		} {
			candidate = filepath.Clean(candidate)
			if _, ok := seen[candidate]; ok {
				continue
			}
			seen[candidate] = struct{}{}
			info, err := os.Stat(candidate)
			if err == nil && !info.IsDir() {
				return candidate, nil
			}
		}
	}

	return "", fmt.Errorf("%s не найден (ожидался в backend/publish рядом с приложением или в рабочей папке)", helperName)
}
