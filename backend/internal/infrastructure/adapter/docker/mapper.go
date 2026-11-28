package docker

import (
	"fmt"
	"regexp"
	"strings"

	"container-log-monitor/internal/domain/entity"
)

var healthRegex = regexp.MustCompile(`(?i)\((healthy|unhealthy|health:\s*starting)\)`)

func parseHealth(status string) *string {
	m := healthRegex.FindStringSubmatch(status)
	if len(m) < 2 {
		return nil
	}
	raw := strings.ToLower(m[1])
	if strings.Contains(raw, "starting") {
		res := "starting"
		return &res
	}
	return &raw
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func intPtr(v int) *int {
	if v == 0 {
		return nil
	}
	return &v
}

func shortID(id string) string {
	trimmed := strings.TrimPrefix(id, "sha256:")
	if len(trimmed) > 12 {
		return trimmed[:12]
	}
	return trimmed
}

// mapContainerSummary translates a Docker Engine API summary DTO into a Domain Container entity (Data Mapper Pattern).
func mapContainerSummary(c dockerContainerSummaryDTO) entity.Container {
	seenPorts := make(map[string]struct{})
	bindings := make([]entity.PortBinding, 0, len(c.Ports))
	ports := make([]string, 0, len(c.Ports))

	for _, p := range c.Ports {
		typ := p.Type
		if typ == "" {
			typ = "tcp"
		}
		key := fmt.Sprintf("%d:%d/%s", p.PublicPort, p.PrivatePort, typ)
		if _, exists := seenPorts[key]; exists {
			continue
		}
		seenPorts[key] = struct{}{}

		var label, simple string
		if p.PublicPort > 0 {
			label = fmt.Sprintf("%d->%d/%s", p.PublicPort, p.PrivatePort, typ)
			simple = fmt.Sprintf("%d->%d", p.PublicPort, p.PrivatePort)
		} else {
			label = fmt.Sprintf("%d/%s", p.PrivatePort, typ)
			simple = fmt.Sprintf("%d", p.PrivatePort)
		}

		bindings = append(bindings, entity.PortBinding{
			IP:          strPtr(p.IP),
			PrivatePort: p.PrivatePort,
			PublicPort:  intPtr(p.PublicPort),
			Type:        typ,
			Label:       label,
		})
		ports = append(ports, simple)
	}

	networks := make([]entity.NetworkSummary, 0, len(c.NetworkSettings.Networks))
	for name, net := range c.NetworkSettings.Networks {
		networks = append(networks, entity.NetworkSummary{
			Name:    name,
			IP:      strPtr(net.IPAddress),
			MAC:     strPtr(net.MacAddress),
			Gateway: strPtr(net.Gateway),
		})
	}

	mounts := make([]entity.MountSummary, 0, len(c.Mounts))
	for _, m := range c.Mounts {
		src := m.Source
		if src == "" {
			src = m.Name
		}
		rw := true
		if m.RW != nil {
			rw = *m.RW
		}
		mounts = append(mounts, entity.MountSummary{
			Type:        m.Type,
			Source:      src,
			Destination: m.Destination,
			RW:          rw,
		})
	}

	name := c.ID
	if len(c.Names) > 0 && c.Names[0] != "" {
		name = strings.TrimPrefix(c.Names[0], "/")
	}

	return entity.Container{
		ID:                c.ID,
		ShortID:           shortID(c.ID),
		Name:              name,
		Image:             c.Image,
		ImageID:           shortID(c.ImageID),
		Command:           c.Command,
		State:             c.State,
		Status:            c.Status,
		Health:            parseHealth(c.Status),
		Ports:             ports,
		PortBindings:      bindings,
		CreatedAt:         c.Created,
		ComposeProject:    strPtr(c.Labels["com.docker.compose.project"]),
		ComposeService:    strPtr(c.Labels["com.docker.compose.service"]),
		ComposeWorkingDir: strPtr(c.Labels["com.docker.compose.project.working_dir"]),
		Networks:          networks,
		Mounts:            mounts,
	}
}

func mapContainerDetails(info dockerInspectDTO) *entity.ContainerDetails {
	ports := make([]entity.PortDetail, 0)
	for containerPort, bindings := range info.NetworkSettings.Ports {
		if len(bindings) > 0 {
			for _, b := range bindings {
				hostIP := b.HostIP
				if hostIP == "" {
					hostIP = "0.0.0.0"
				}
				hp := b.HostPort
				ports = append(ports, entity.PortDetail{
					ContainerPort: containerPort,
					HostIP:        &hostIP,
					HostPort:      &hp,
				})
			}
		} else {
			ports = append(ports, entity.PortDetail{
				ContainerPort: containerPort,
				HostIP:        nil,
				HostPort:      nil,
			})
		}
	}

	networks := make([]entity.NetworkDetail, 0, len(info.NetworkSettings.Networks))
	for name, net := range info.NetworkSettings.Networks {
		ip := net.IPAddress
		if ip == "" {
			ip = "—"
		}
		gw := net.Gateway
		if gw == "" {
			gw = "—"
		}
		mac := net.MacAddress
		if mac == "" {
			mac = "—"
		}
		aliases := net.Aliases
		if aliases == nil {
			aliases = []string{}
		}
		networks = append(networks, entity.NetworkDetail{
			Name:       name,
			IPAddress:  ip,
			Gateway:    gw,
			MACAddress: mac,
			Aliases:    aliases,
		})
	}

	mounts := make([]entity.MountDetail, 0, len(info.Mounts))
	for _, m := range info.Mounts {
		typ := m.Type
		if typ == "" {
			typ = "volume"
		}
		src := m.Source
		if src == "" {
			src = "—"
		}
		dst := m.Destination
		if dst == "" {
			dst = "—"
		}
		rw := true
		if m.RW != nil {
			rw = *m.RW
		}
		mounts = append(mounts, entity.MountDetail{
			Type:        typ,
			Name:        strPtr(m.Name),
			Source:      src,
			Destination: dst,
			Mode:        m.Mode,
			RW:          rw,
		})
	}

	envList := make([]entity.EnvVar, 0, len(info.Config.Env))
	for _, entry := range info.Config.Env {
		if idx := strings.IndexByte(entry, '='); idx >= 0 {
			envList = append(envList, entity.EnvVar{Key: entry[:idx], Value: entry[idx+1:]})
		} else {
			envList = append(envList, entity.EnvVar{Key: entry, Value: ""})
		}
	}

	var health *entity.HealthDetails
	if info.State.Health != nil {
		logs := info.State.Health.Log
		if len(logs) > 5 {
			logs = logs[len(logs)-5:]
		}
		mappedLogs := make([]entity.HealthLogEntry, 0, len(logs))
		for _, l := range logs {
			mappedLogs = append(mappedLogs, entity.HealthLogEntry{
				Start:    l.Start,
				End:      l.End,
				ExitCode: l.ExitCode,
				Output:   l.Output,
			})
		}
		health = &entity.HealthDetails{
			Status:        info.State.Health.Status,
			FailingStreak: info.State.Health.FailingStreak,
			Log:           mappedLogs,
		}
	}

	platform := info.Platform
	if platform == "" {
		platform = "linux"
	}
	workingDir := info.Config.WorkingDir
	if workingDir == "" {
		workingDir = "/"
	}
	user := info.Config.User
	if user == "" {
		user = "root"
	}
	restartPolicy := info.HostConfig.RestartPolicy.Name
	if restartPolicy == "" {
		restartPolicy = "no"
	}
	status := info.State.Status
	if status == "" {
		status = "unknown"
	}
	cmd := info.Config.Cmd
	if cmd == nil {
		cmd = []string{}
	}
	entrypoint := info.Config.Entrypoint
	if entrypoint == nil {
		entrypoint = []string{}
	}
	labels := info.Config.Labels
	if labels == nil {
		labels = map[string]string{}
	}

	return &entity.ContainerDetails{
		ID:            info.ID,
		ShortID:       shortID(info.ID),
		Name:          strings.TrimPrefix(info.Name, "/"),
		Image:         info.Config.Image,
		ImageID:       shortID(info.Image),
		Created:       info.Created,
		Platform:      platform,
		Driver:        info.Driver,
		Hostname:      info.Config.Hostname,
		WorkingDir:    workingDir,
		User:          user,
		TTY:           info.Config.Tty,
		Cmd:           cmd,
		Entrypoint:    entrypoint,
		RestartPolicy: restartPolicy,
		RestartCount:  info.RestartCount,
		State: entity.ContainerStateDetails{
			Status:     status,
			Running:    info.State.Running,
			Paused:     info.State.Paused,
			Restarting: info.State.Restarting,
			OOMKilled:  info.State.OOMKilled,
			PID:        info.State.Pid,
			ExitCode:   info.State.ExitCode,
			Error:      info.State.Error,
			StartedAt:  strPtr(info.State.StartedAt),
			FinishedAt: strPtr(info.State.FinishedAt),
			Health:     health,
		},
		Compose: entity.ComposeDetails{
			Project:     strPtr(labels["com.docker.compose.project"]),
			Service:     strPtr(labels["com.docker.compose.service"]),
			WorkingDir:  strPtr(labels["com.docker.compose.project.working_dir"]),
			ConfigFiles: strPtr(labels["com.docker.compose.project.config_files"]),
		},
		Ports:    ports,
		Networks: networks,
		Mounts:   mounts,
		Env:      envList,
		Labels:   labels,
	}
}
