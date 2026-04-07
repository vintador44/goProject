package sysmon

import (
	"os/exec"
	"strconv"
	"strings"
)

type DiskInfo struct {
	TotalGB     float64
	FreeGB      float64
	UsedPercent float64
}

func (m *SystemMonitor) GetDiskInfo(drive string) DiskInfo {
	if drive == "" {
		drive = "C:"
	}
	cmd := exec.Command("wmic", "logicaldisk", "where", "DeviceID='"+drive+"'", "get", "Size,FreeSpace")
	out, err := cmd.Output()
	if err != nil {
		return DiskInfo{}
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 {
		return DiskInfo{}
	}
	header := strings.Fields(lines[0])
	var sizeIdx, freeIdx int = -1, -1
	for i, col := range header {
		if col == "Size" {
			sizeIdx = i
		}
		if col == "FreeSpace" {
			freeIdx = i
		}
	}
	if sizeIdx == -1 || freeIdx == -1 {
		return DiskInfo{}
	}
	for _, line := range lines[1:] {
		fields := strings.Fields(line)
		if len(fields) > sizeIdx && len(fields) > freeIdx {
			totalB, _ := strconv.ParseFloat(fields[sizeIdx], 64)
			freeB, _ := strconv.ParseFloat(fields[freeIdx], 64)
			if totalB > 0 {
				totalGB := totalB / 1024 / 1024 / 1024
				freeGB := freeB / 1024 / 1024 / 1024
				usedPercent := ((totalB - freeB) / totalB) * 100
				if freeGB > totalGB {
					freeGB = totalGB
				}
				if usedPercent > 100 {
					usedPercent = 100
				}
				if usedPercent < 0 {
					usedPercent = 0
				}
				return DiskInfo{
					TotalGB:     totalGB,
					FreeGB:      freeGB,
					UsedPercent: usedPercent,
				}
			}
		}
	}
	return DiskInfo{}
}
