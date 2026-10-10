package sysmon

import (
	disk "github.com/shirou/gopsutil/v4/disk"
)

type DiskInfo struct {
	Name        string
	TotalGB     float64
	FreeGB      float64
	UsedPercent float64
}

func (m *SystemMonitor) GetDiskInfo(drive string) DiskInfo {
	if drive == "" {
		partitions, err := disk.Partitions(false)
		if err != nil || len(partitions) == 0 {
			return DiskInfo{}
		}
		drive = partitions[0].Mountpoint
	}
	usage, err := disk.Usage(drive)
	if err != nil {
		return DiskInfo{}
	}
	if usage.Total == 0 {
		return DiskInfo{}
	}
	return DiskInfo{
		Name:        drive,
		TotalGB:     float64(usage.Total) / (1 << 30),
		FreeGB:      float64(usage.Free) / (1 << 30),
		UsedPercent: usage.UsedPercent,
	}
}

func (m *SystemMonitor) GetDiskInfoCross() []DiskInfo {
	parts, err := disk.Partitions(false)
	if err != nil {
		return []DiskInfo{}

	}
	const gib = 1 << 30
	var diskInfos []DiskInfo
	for _, part := range parts {
		usage, err := disk.Usage(part.Mountpoint)
		if err != nil {
			continue
		}
		name := part.Device
		if name == "" {
			name = part.Mountpoint
		}
		diskInfos = append(diskInfos, DiskInfo{
			Name:        name,
			TotalGB:     float64(usage.Total) / gib,
			FreeGB:      float64(usage.Free) / gib,
			UsedPercent: usage.UsedPercent,
		})
	}
	return diskInfos
}
