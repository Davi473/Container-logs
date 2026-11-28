package docker

// Docker Engine API DTOs (isolated inside infrastructure adapter)

type dockerPortDTO struct {
	IP          string `json:"IP"`
	PrivatePort int    `json:"PrivatePort"`
	PublicPort  int    `json:"PublicPort"`
	Type        string `json:"Type"`
}

type dockerNetSummaryDTO struct {
	IPAddress  string   `json:"IPAddress"`
	MacAddress string   `json:"MacAddress"`
	Gateway    string   `json:"Gateway"`
	Aliases    []string `json:"Aliases"`
}

type dockerMountDTO struct {
	Type        string `json:"Type"`
	Name        string `json:"Name"`
	Source      string `json:"Source"`
	Destination string `json:"Destination"`
	Mode        string `json:"Mode"`
	RW          *bool  `json:"RW"`
}

type dockerContainerSummaryDTO struct {
	ID              string            `json:"Id"`
	Names           []string          `json:"Names"`
	Image           string            `json:"Image"`
	ImageID         string            `json:"ImageID"`
	Command         string            `json:"Command"`
	Created         int64             `json:"Created"`
	Ports           []dockerPortDTO   `json:"Ports"`
	Labels          map[string]string `json:"Labels"`
	State           string            `json:"State"`
	Status          string            `json:"Status"`
	NetworkSettings struct {
		Networks map[string]dockerNetSummaryDTO `json:"Networks"`
	} `json:"NetworkSettings"`
	Mounts []dockerMountDTO `json:"Mounts"`
}

type dockerHealthLogDTO struct {
	Start    string `json:"Start"`
	End      string `json:"End"`
	ExitCode int    `json:"ExitCode"`
	Output   string `json:"Output"`
}

type dockerInspectDTO struct {
	ID           string `json:"Id"`
	Created      string `json:"Created"`
	Name         string `json:"Name"`
	Image        string `json:"Image"`
	Platform     string `json:"Platform"`
	Driver       string `json:"Driver"`
	RestartCount int    `json:"RestartCount"`
	State        struct {
		Status     string `json:"Status"`
		Running    bool   `json:"Running"`
		Paused     bool   `json:"Paused"`
		Restarting bool   `json:"Restarting"`
		OOMKilled  bool   `json:"OOMKilled"`
		Pid        int    `json:"Pid"`
		ExitCode   int    `json:"ExitCode"`
		Error      string `json:"Error"`
		StartedAt  string `json:"StartedAt"`
		FinishedAt string `json:"FinishedAt"`
		Health     *struct {
			Status        string               `json:"Status"`
			FailingStreak int                  `json:"FailingStreak"`
			Log           []dockerHealthLogDTO `json:"Log"`
		} `json:"Health"`
	} `json:"State"`
	Config struct {
		Hostname   string            `json:"Hostname"`
		User       string            `json:"User"`
		Tty        bool              `json:"Tty"`
		Env        []string          `json:"Env"`
		Cmd        []string          `json:"Cmd"`
		Image      string            `json:"Image"`
		WorkingDir string            `json:"WorkingDir"`
		Entrypoint []string          `json:"Entrypoint"`
		Labels     map[string]string `json:"Labels"`
	} `json:"Config"`
	HostConfig struct {
		RestartPolicy struct {
			Name string `json:"Name"`
		} `json:"RestartPolicy"`
	} `json:"HostConfig"`
	NetworkSettings struct {
		Ports    map[string][]struct {
			HostIP   string `json:"HostIp"`
			HostPort string `json:"HostPort"`
		} `json:"Ports"`
		Networks map[string]dockerNetSummaryDTO `json:"Networks"`
	} `json:"NetworkSettings"`
	Mounts []dockerMountDTO `json:"Mounts"`
}

type dockerStatsDTO struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage  uint64   `json:"total_usage"`
			PercpuUsage []uint64 `json:"percpu_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     uint64 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
	PidsStats struct {
		Current uint64 `json:"current"`
	} `json:"pids_stats"`
}

type dockerInfoDTO struct {
	Name              string `json:"Name"`
	OperatingSystem   string `json:"OperatingSystem"`
	OSType            string `json:"OSType"`
	Architecture      string `json:"Architecture"`
	NCPU              int    `json:"NCPU"`
	MemTotal          int64  `json:"MemTotal"`
	Containers        int    `json:"Containers"`
	ContainersRunning int    `json:"ContainersRunning"`
	ContainersPaused  int    `json:"ContainersPaused"`
	ContainersStopped int    `json:"ContainersStopped"`
	Images            int    `json:"Images"`
	ServerVersion     string `json:"ServerVersion"`
}

type dockerVersionDTO struct {
	Version    string `json:"Version"`
	APIVersion string `json:"ApiVersion"`
}

type dockerEventDTO struct {
	Status   string `json:"status"`
	ID       string `json:"id"`
	Action   string `json:"Action"`
	TimeNano int64  `json:"timeNano"`
	Actor    struct {
		ID         string            `json:"ID"`
		Attributes map[string]string `json:"Attributes"`
	} `json:"Actor"`
}
