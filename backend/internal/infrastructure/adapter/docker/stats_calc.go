package docker

import (
	"math"

	"container-log-monitor/internal/domain/entity"
)

func calculateStats(s dockerStatsDTO) *entity.ContainerStats {
	cpuPct := calculateCPUPercent(s)
	memUsage, memLimit, memPct := calculateMemory(s)
	rx, tx := calculateNetwork(s)

	return &entity.ContainerStats{
		CPUPercent: math.Round(cpuPct*10) / 10,
		MemUsage:   memUsage,
		MemLimit:   memLimit,
		MemPercent: math.Round(memPct*10) / 10,
		NetRx:      rx,
		NetTx:      tx,
		PIDs:       s.PidsStats.Current,
	}
}

func calculateCPUPercent(s dockerStatsDTO) float64 {
	if s.CPUStats.CPUUsage.TotalUsage < s.PreCPUStats.CPUUsage.TotalUsage ||
		s.CPUStats.SystemCPUUsage < s.PreCPUStats.SystemCPUUsage {
		return 0
	}
	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage - s.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(s.CPUStats.SystemCPUUsage - s.PreCPUStats.SystemCPUUsage)

	onlineCPUs := float64(s.CPUStats.OnlineCPUs)
	if onlineCPUs == 0 {
		onlineCPUs = float64(len(s.CPUStats.CPUUsage.PercpuUsage))
	}
	if onlineCPUs == 0 {
		onlineCPUs = 1
	}

	if systemDelta > 0 && cpuDelta > 0 {
		pct := (cpuDelta / systemDelta) * onlineCPUs * 100.0
		maxPct := 100.0 * onlineCPUs
		if pct > maxPct {
			return maxPct
		}
		return pct
	}
	return 0
}

func calculateMemory(s dockerStatsDTO) (usage uint64, limit uint64, percent float64) {
	rawUsage := s.MemoryStats.Usage
	var inactiveFile uint64
	if v, ok := s.MemoryStats.Stats["inactive_file"]; ok {
		inactiveFile = v
	} else if v, ok := s.MemoryStats.Stats["total_inactive_file"]; ok {
		inactiveFile = v
	} else if v, ok := s.MemoryStats.Stats["cache"]; ok {
		inactiveFile = v
	}

	if rawUsage > inactiveFile {
		usage = rawUsage - inactiveFile
	}
	limit = s.MemoryStats.Limit
	if limit > 0 {
		percent = (float64(usage) / float64(limit)) * 100.0
		if percent > 100 {
			percent = 100
		}
	}
	return usage, limit, percent
}

func calculateNetwork(s dockerStatsDTO) (rx uint64, tx uint64) {
	for _, n := range s.Networks {
		rx += n.RxBytes
		tx += n.TxBytes
	}
	return rx, tx
}
