package port

import (
	"context"

	"container-log-monitor/internal/domain/entity"
)

// DockerEnginePort is the primary driven port abstracting all Docker Engine interactions.
type DockerEnginePort interface {
	ListContainers(ctx context.Context, all bool) ([]entity.Container, error)
	ListContainersByComposeProject(ctx context.Context, project string) ([]entity.Container, error)
	InspectContainer(ctx context.Context, id string) (*entity.ContainerDetails, error)

	StartContainer(ctx context.Context, id string) error
	StopContainer(ctx context.Context, id string) error
	RestartContainer(ctx context.Context, id string) error
	PauseContainer(ctx context.Context, id string) error
	UnpauseContainer(ctx context.Context, id string) error
	KillContainer(ctx context.Context, id string) error
	RemoveContainer(ctx context.Context, id string, force bool) error

	GetContainerStats(ctx context.Context, id string) (*entity.ContainerStats, error)
	StreamLogs(ctx context.Context, id string, tail int, onLine func(entity.LogLine)) error
	FetchRecentLogs(ctx context.Context, id string, tail int) ([]entity.LogLine, error)
	StreamEvents(ctx context.Context, onEvent func(entity.DockerEvent)) error
	OpenTerminal(ctx context.Context, containerID string) (TerminalSession, error)
	GetSystemInfo(ctx context.Context) (*entity.SystemInfo, error)
}
