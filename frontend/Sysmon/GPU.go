package sysmon

import (
	"os/exec"
	"strings"
)

type GPUInfo struct {
	Name string
}

func (m *SystemMonitor) GetGPUInfo() GPUInfo {
	cmd := exec.Command("wmic", "path", "win32_VideoController", "get", "name")
	out, err := cmd.Output()
	if err != nil {
		return GPUInfo{Name: "Unknown"}
	}
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.Contains(line, "Name") {
			return GPUInfo{Name: line}
		}
	}
	return GPUInfo{Name: "Unknown"}
}
