package entity

type LogStreamType string

const (
	LogStreamStdout LogStreamType = "stdout"
	LogStreamStderr LogStreamType = "stderr"
)

type LogLine struct {
	ContainerID string        `json:"containerId"`
	Timestamp   string        `json:"ts"`
	Text        string        `json:"text"`
	Stream      LogStreamType `json:"stream"`
}

type DockerEvent struct {
	Action      string `json:"action"`
	ContainerID string `json:"containerId"`
	Name        string `json:"name"`
	Timestamp   string `json:"ts"`
}

type SystemInfo struct {
	Hostname      string `json:"hostname"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
	CPUs          int    `json:"cpus"`
	MemTotal      int64  `json:"memTotal"`
	Containers    int    `json:"containers"`
	Running       int    `json:"running"`
	Paused        int    `json:"paused"`
	Stopped       int    `json:"stopped"`
	Images        int    `json:"images"`
	ServerVersion string `json:"serverVersion"`
	APIVersion    string `json:"apiVersion"`
}

type ActionError struct {
	ID      string `json:"id"`
	Message string `json:"message"`
}

type BatchActionResult struct {
	OK     bool          `json:"ok"`
	Count  int           `json:"count"`
	Errors []ActionError `json:"errors"`
}
