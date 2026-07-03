package sysmon

import (
	"syscall"
)

type DiskInfo struct {
	TotalGB     float64
	FreeGB      float64
	UsedPercent float64
}

func (m *SystemMonitor) GetDiskInfo(drive string) DiskInfo {
	if drive == "" {
		drive = "/"
	}
	var stat syscall.Statfs_t
	err := syscall.Statfs(drive, &stat)
	if err != nil {
		return DiskInfo{}
	}
	totalB := stat.Blocks * uint64(stat.Bsize)
	freeB := stat.Bfree * uint64(stat.Bsize)
	if totalB == 0 {
		return DiskInfo{}
	}
	totalGB := float64(totalB) / 1024 / 1024 / 1024
	freeGB := float64(freeB) / 1024 / 1024 / 1024
	usedPercent := (1.0 - float64(freeB)/float64(totalB)) * 100
	if usedPercent < 0 {
		usedPercent = 0
	}
	if usedPercent > 100 {
		usedPercent = 100
	}
	return DiskInfo{
		TotalGB:     totalGB,
		FreeGB:      freeGB,
		UsedPercent: usedPercent,
	}
}
