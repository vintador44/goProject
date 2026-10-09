package sysmon

import (
	"os/exec"
	"strings"
)

type GPUInfo struct {
	Name string
}

func (m *SystemMonitor) GetGPUInfo() GPUInfo {
	cmd := exec.Command("lspci", "-d", "::0300")
	out, err := cmd.Output()
	if err != nil {
		return GPUInfo{Name: "Unknown"}
	}
	line := strings.TrimSpace(string(out))
	if line == "" {
		return GPUInfo{Name: "Unknown"}
	}
	parts := strings.SplitN(line, ":", 3)
	if len(parts) >= 3 {
		name := strings.TrimSpace(parts[2])
		if idx := strings.Index(name, "(rev"); idx != -1 {
			name = strings.TrimSpace(name[:idx])
		}
		return GPUInfo{Name: name}
	}
	return GPUInfo{Name: strings.TrimSpace(line)}
}
