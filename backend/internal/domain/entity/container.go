package entity

type PortBinding struct {
	IP          *string `json:"ip"`
	PrivatePort int     `json:"privatePort"`
	PublicPort  *int    `json:"publicPort"`
	Type        string  `json:"type"`
	Label       string  `json:"label"`
}

type NetworkSummary struct {
	Name    string  `json:"name"`
	IP      *string `json:"ip"`
	MAC     *string `json:"mac"`
	Gateway *string `json:"gateway"`
}

type MountSummary struct {
	Type        string `json:"type"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	RW          bool   `json:"rw"`
}

type Container struct {
	ID                string           `json:"id"`
	ShortID           string           `json:"shortId"`
	Name              string           `json:"name"`
	Image             string           `json:"image"`
	ImageID           string           `json:"imageId"`
	Command           string           `json:"command"`
	State             string           `json:"state"`
	Status            string           `json:"status"`
	Health            *string          `json:"health"`
	Ports             []string         `json:"ports"`
	PortBindings      []PortBinding    `json:"portBindings"`
	CreatedAt         int64            `json:"createdAt"`
	ComposeProject    *string          `json:"composeProject"`
	ComposeService    *string          `json:"composeService"`
	ComposeWorkingDir *string          `json:"composeWorkingDir"`
	Networks          []NetworkSummary `json:"networks"`
	Mounts            []MountSummary   `json:"mounts"`
}

type HealthLogEntry struct {
	Start    string `json:"Start"`
	End      string `json:"End"`
	ExitCode int    `json:"ExitCode"`
	Output   string `json:"Output"`
}

type HealthDetails struct {
	Status        string           `json:"status"`
	FailingStreak int              `json:"failingStreak"`
	Log           []HealthLogEntry `json:"log"`
}

type ContainerStateDetails struct {
	Status     string         `json:"status"`
	Running    bool           `json:"running"`
	Paused     bool           `json:"paused"`
	Restarting bool           `json:"restarting"`
	OOMKilled  bool           `json:"oomKilled"`
	PID        int            `json:"pid"`
	ExitCode   int            `json:"exitCode"`
	Error      string         `json:"error"`
	StartedAt  *string        `json:"startedAt"`
	FinishedAt *string        `json:"finishedAt"`
	Health     *HealthDetails `json:"health"`
}

type ComposeDetails struct {
	Project     *string `json:"project"`
	Service     *string `json:"service"`
	WorkingDir  *string `json:"workingDir"`
	ConfigFiles *string `json:"configFiles"`
}

type PortDetail struct {
	ContainerPort string  `json:"containerPort"`
	HostIP        *string `json:"hostIp"`
	HostPort      *string `json:"hostPort"`
}

type NetworkDetail struct {
	Name       string   `json:"name"`
	IPAddress  string   `json:"ipAddress"`
	Gateway    string   `json:"gateway"`
	MACAddress string   `json:"macAddress"`
	Aliases    []string `json:"aliases"`
}

type MountDetail struct {
	Type        string  `json:"type"`
	Name        *string `json:"name"`
	Source      string  `json:"source"`
	Destination string  `json:"destination"`
	Mode        string  `json:"mode"`
	RW          bool    `json:"rw"`
}

type EnvVar struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type ContainerDetails struct {
	ID            string                `json:"id"`
	ShortID       string                `json:"shortId"`
	Name          string                `json:"name"`
	Image         string                `json:"image"`
	ImageID       string                `json:"imageId"`
	Created       string                `json:"created"`
	Platform      string                `json:"platform"`
	Driver        string                `json:"driver"`
	Hostname      string                `json:"hostname"`
	WorkingDir    string                `json:"workingDir"`
	User          string                `json:"user"`
	TTY           bool                  `json:"tty"`
	Cmd           []string              `json:"cmd"`
	Entrypoint    []string              `json:"entrypoint"`
	RestartPolicy string                `json:"restartPolicy"`
	RestartCount  int                   `json:"restartCount"`
	State         ContainerStateDetails `json:"state"`
	Compose       ComposeDetails        `json:"compose"`
	Ports         []PortDetail          `json:"ports"`
	Networks      []NetworkDetail       `json:"networks"`
	Mounts        []MountDetail         `json:"mounts"`
	Env           []EnvVar              `json:"env"`
	Labels        map[string]string     `json:"labels"`
}
