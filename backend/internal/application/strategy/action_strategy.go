package strategy

import (
	"context"

	"container-log-monitor/internal/domain/entity"
	domainerr "container-log-monitor/internal/domain/errors"
	"container-log-monitor/internal/domain/port"
)

// ActionStrategy encapsulates a single container lifecycle command (Strategy + Command Pattern).
type ActionStrategy interface {
	Execute(ctx context.Context, docker port.DockerEnginePort, containerID string) error
}

type actionFunc func(ctx context.Context, docker port.DockerEnginePort, containerID string) error

func (f actionFunc) Execute(ctx context.Context, docker port.DockerEnginePort, containerID string) error {
	return f(ctx, docker, containerID)
}

// ActionRegistry resolves a ContainerAction to its concrete execution strategy.
type ActionRegistry struct {
	strategies map[entity.ContainerAction]ActionStrategy
}

func NewActionRegistry() *ActionRegistry {
	return &ActionRegistry{
		strategies: map[entity.ContainerAction]ActionStrategy{
			entity.ActionStart: actionFunc(func(ctx context.Context, d port.DockerEnginePort, id string) error {
				return d.StartContainer(ctx, id)
			}),
			entity.ActionStop: actionFunc(func(ctx context.Context, d port.DockerEnginePort, id string) error {
				return d.StopContainer(ctx, id)
			}),
			entity.ActionRestart: actionFunc(func(ctx context.Context, d port.DockerEnginePort, id string) error {
				return d.RestartContainer(ctx, id)
			}),
			entity.ActionPause: actionFunc(func(ctx context.Context, d port.DockerEnginePort, id string) error {
				return d.PauseContainer(ctx, id)
			}),
			entity.ActionUnpause: actionFunc(func(ctx context.Context, d port.DockerEnginePort, id string) error {
				return d.UnpauseContainer(ctx, id)
			}),
			entity.ActionKill: actionFunc(func(ctx context.Context, d port.DockerEnginePort, id string) error {
				return d.KillContainer(ctx, id)
			}),
		},
	}
}

func (r *ActionRegistry) Execute(ctx context.Context, docker port.DockerEnginePort, containerID string, action entity.ContainerAction) error {
	strat, ok := r.strategies[action]
	if !ok {
		return domainerr.ErrInvalidAction
	}
	return strat.Execute(ctx, docker, containerID)
}
