package sysmon

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type GPUInfo struct {
	Name string
	Temp *float64
	Load *float64
}

func (m *SystemMonitor) GetGPUInfo() GPUInfo {
	if gpu, found := readNvidiaGPU(); found {
		return gpu
	}
	return m.readSysfsGPU()
}

func (m *SystemMonitor) readSysfsGPU() GPUInfo {
	devices, err := filepath.Glob("/sys/bus/pci/devices/*")
	if err != nil {
		return GPUInfo{Name: "Unknown"}
	}

	for _, devicePath := range devices {
		class, err := os.ReadFile(filepath.Join(devicePath, "class"))
		if err != nil || !strings.HasPrefix(strings.TrimSpace(string(class)), "0x03") {
			continue
		}

		vendor, err := os.ReadFile(filepath.Join(devicePath, "vendor"))
		if err != nil {
			continue
		}

		gpuMetrics := GPUInfo{Name: gpuNameForVendor(string(vendor))}
		gpuMetrics.Load = readNumberFromFile(filepath.Join(devicePath, "gpu_busy_percent"))
		if hw, _ := filepath.Glob(filepath.Join(devicePath, "hwmon/hwmon*/temp1_input")); len(hw) > 0 {
			if v := readNumberFromFile(hw[0]); v != nil {
				t := *v / 1000
				gpuMetrics.Temp = &t
			}
		}
		return gpuMetrics
	}
	return GPUInfo{Name: "Unknown"}
}

func gpuNameForVendor(vendor string) string {
	switch strings.TrimSpace(strings.ToLower(vendor)) {
	case "0x1002":
		return "AMD GPU"
	case "0x10de":
		return "NVIDIA GPU"
	case "0x8086":
		return "Intel GPU"
	default:
		return "GPU (vendor " + strings.TrimSpace(vendor) + ")"
	}
}

func readNumberFromFile(path string) *float64 {
	fileContent, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	number, err := strconv.ParseFloat(strings.TrimSpace(string(fileContent)), 64)
	if err != nil {
		return nil
	}

	return &number
}

func (m *SystemMonitor) GetGPUInfoCross() GPUInfo {

	return GPUInfo{}
}

func readNvidiaGPU() (GPUInfo, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "nvidia-smi",
		"--query-gpu=name,temperature.gpu,utilization.gpu",
		"--format=csv,noheader,nounits")

	output, err := cmd.Output()
	if err != nil {
		return GPUInfo{}, false
	}

	firstLine := strings.TrimSpace(strings.SplitN(string(output), "\n", 2)[0])
	fields := strings.Split(firstLine, ",")
	if len(fields) < 3 {
		return GPUInfo{}, false
	}

	return GPUInfo{
		Name: strings.TrimSpace(fields[0]),
		Temp: parseNumber(fields[1]),
		Load: parseNumber(fields[2]),
	}, true
}

func parseNumber(text string) *float64 {
	number, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
	if err != nil {
		return nil
	}
	return &number
}
