package usecase

import (
	"context"
	"sync"

	"container-log-monitor/internal/application/strategy"
	"container-log-monitor/internal/domain/entity"
	domainerr "container-log-monitor/internal/domain/errors"
	"container-log-monitor/internal/domain/port"
)

type ComposeUseCase struct {
	docker      port.DockerEnginePort
	registry    *strategy.ActionRegistry
	containerUC *ContainerUseCase
}

func NewComposeUseCase(docker port.DockerEnginePort, registry *strategy.ActionRegistry, containerUC *ContainerUseCase) *ComposeUseCase {
	return &ComposeUseCase{
		docker:      docker,
		registry:    registry,
		containerUC: containerUC,
	}
}

func (uc *ComposeUseCase) ExecuteAction(ctx context.Context, project string, rawAction string) (*entity.BatchActionResult, error) {
	if project == "" {
		return nil, domainerr.ErrInvalidInput
	}
	action, ok := entity.ParseContainerAction(rawAction)
	if !ok {
		return nil, domainerr.ErrInvalidAction
	}

	containers, err := uc.docker.ListContainersByComposeProject(ctx, project)
	if err != nil {
		return nil, err
	}
	if len(containers) == 0 {
		return nil, domainerr.ErrProjectNotFound
	}

	var (
		wg     sync.WaitGroup
		mu     sync.Mutex
		errors []entity.ActionError
	)

	for _, c := range containers {
		wg.Add(1)
		go func(c entity.Container) {
			defer wg.Done()
			if err := uc.registry.Execute(ctx, uc.docker, c.ID, action); err != nil {
				mu.Lock()
				errors = append(errors, entity.ActionError{ID: c.ShortID, Message: err.Error()})
				mu.Unlock()
			}
		}(c)
	}
	wg.Wait()

	uc.containerUC.BroadcastContainers(ctx)
	return &entity.BatchActionResult{
		OK:     len(errors) == 0,
		Count:  len(containers),
		Errors: errors,
	}, nil
}

func (uc *ComposeUseCase) Remove(ctx context.Context, project string, force bool) (*entity.BatchActionResult, error) {
	if project == "" {
		return nil, domainerr.ErrInvalidInput
	}

	containers, err := uc.docker.ListContainersByComposeProject(ctx, project)
	if err != nil {
		return nil, err
	}
	if len(containers) == 0 {
		return nil, domainerr.ErrProjectNotFound
	}

	var (
		wg     sync.WaitGroup
		mu     sync.Mutex
		errors []entity.ActionError
	)

	for _, c := range containers {
		wg.Add(1)
		go func(c entity.Container) {
			defer wg.Done()
			if err := uc.docker.RemoveContainer(ctx, c.ID, force); err != nil {
				mu.Lock()
				errors = append(errors, entity.ActionError{ID: c.ShortID, Message: err.Error()})
				mu.Unlock()
			}
		}(c)
	}
	wg.Wait()

	uc.containerUC.BroadcastContainers(ctx)
	return &entity.BatchActionResult{
		OK:     len(errors) == 0,
		Count:  len(containers),
		Errors: errors,
	}, nil
}
