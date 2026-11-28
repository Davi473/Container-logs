package usecase

import (
	"context"

	"container-log-monitor/internal/application/strategy"
	"container-log-monitor/internal/domain/entity"
	domainerr "container-log-monitor/internal/domain/errors"
	"container-log-monitor/internal/domain/port"
)

type ContainerUseCase struct {
	docker   port.DockerEnginePort
	bus      port.EventBus
	registry *strategy.ActionRegistry
}

func NewContainerUseCase(docker port.DockerEnginePort, bus port.EventBus, registry *strategy.ActionRegistry) *ContainerUseCase {
	return &ContainerUseCase{
		docker:   docker,
		bus:      bus,
		registry: registry,
	}
}

func (uc *ContainerUseCase) List(ctx context.Context) ([]entity.Container, error) {
	containers, err := uc.docker.ListContainers(ctx, true)
	if err != nil {
		return nil, err
	}
	return containers, nil
}

func (uc *ContainerUseCase) Inspect(ctx context.Context, id string) (*entity.ContainerDetails, error) {
	if id == "" {
		return nil, domainerr.ErrInvalidInput
	}
	return uc.docker.InspectContainer(ctx, id)
}

func (uc *ContainerUseCase) ExecuteAction(ctx context.Context, id string, rawAction string) error {
	if id == "" {
		return domainerr.ErrInvalidInput
	}
	action, ok := entity.ParseContainerAction(rawAction)
	if !ok {
		return domainerr.ErrInvalidAction
	}
	if err := uc.registry.Execute(ctx, uc.docker, id, action); err != nil {
		return err
	}
	uc.BroadcastContainers(ctx)
	return nil
}

func (uc *ContainerUseCase) Remove(ctx context.Context, id string, force bool) error {
	if id == "" {
		return domainerr.ErrInvalidInput
	}
	if err := uc.docker.RemoveContainer(ctx, id, force); err != nil {
		return err
	}
	uc.BroadcastContainers(ctx)
	return nil
}

func (uc *ContainerUseCase) BroadcastContainers(ctx context.Context) {
	containers, err := uc.docker.ListContainers(ctx, true)
	if err != nil {
		return
	}
	uc.bus.Publish(port.DomainEvent{
		Topic:   port.TopicContainersUpdate,
		Payload: containers,
	})
}
