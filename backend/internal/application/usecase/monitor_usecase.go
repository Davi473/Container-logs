package usecase

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"container-log-monitor/internal/domain/entity"
	"container-log-monitor/internal/domain/port"
)

// MonitorUseCase runs background loops for Docker daemon events, container state broadcasts, and live stats polling.
type MonitorUseCase struct {
	docker        port.DockerEnginePort
	bus           port.EventBus
	containerUC   *ContainerUseCase
	activeClients func() int

	statsInFlight atomic.Bool
	debounceMu    sync.Mutex
	debounceTimer *time.Timer
}

func NewMonitorUseCase(
	docker port.DockerEnginePort,
	bus port.EventBus,
	containerUC *ContainerUseCase,
	activeClients func() int,
) *MonitorUseCase {
	return &MonitorUseCase{
		docker:        docker,
		bus:           bus,
		containerUC:   containerUC,
		activeClients: activeClients,
	}
}

func (uc *MonitorUseCase) Start(ctx context.Context) {
	go uc.watchEventsLoop(ctx)
	go uc.broadcastContainersLoop(ctx)
	go uc.pollStatsLoop(ctx)
}

func (uc *MonitorUseCase) TriggerStatsPoll(ctx context.Context) {
	go uc.pollStatsOnce(ctx)
}

func (uc *MonitorUseCase) watchEventsLoop(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		_ = uc.docker.StreamEvents(ctx, func(ev entity.DockerEvent) {
			uc.bus.Publish(port.DomainEvent{
				Topic:   port.TopicDockerEvent,
				Payload: ev,
			})
			uc.scheduleDebouncedBroadcast(ctx, 150*time.Millisecond)
		})

		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func (uc *MonitorUseCase) scheduleDebouncedBroadcast(ctx context.Context, delay time.Duration) {
	uc.debounceMu.Lock()
	defer uc.debounceMu.Unlock()

	if uc.debounceTimer != nil {
		uc.debounceTimer.Stop()
	}
	uc.debounceTimer = time.AfterFunc(delay, func() {
		uc.containerUC.BroadcastContainers(ctx)
	})
}

func (uc *MonitorUseCase) broadcastContainersLoop(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if uc.activeClients != nil && uc.activeClients() == 0 {
				continue
			}
			uc.containerUC.BroadcastContainers(ctx)
		}
	}
}

func (uc *MonitorUseCase) pollStatsLoop(ctx context.Context) {
	ticker := time.NewTicker(4 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			uc.pollStatsOnce(ctx)
		}
	}
}

func (uc *MonitorUseCase) pollStatsOnce(ctx context.Context) {
	if uc.activeClients != nil && uc.activeClients() == 0 {
		return
	}
	if !uc.statsInFlight.CompareAndSwap(false, true) {
		return
	}
	defer uc.statsInFlight.Store(false)

	running, err := uc.docker.ListContainers(ctx, false)
	if err != nil {
		return
	}

	snapshot := make(entity.StatsSnapshot, len(running))
	var (
		wg sync.WaitGroup
		mu sync.Mutex
	)
	for _, c := range running {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			stats, err := uc.docker.GetContainerStats(ctx, id)
			if err != nil || stats == nil {
				return
			}
			mu.Lock()
			snapshot[id] = *stats
			mu.Unlock()
		}(c.ID)
	}
	wg.Wait()

	uc.bus.Publish(port.DomainEvent{
		Topic:   port.TopicContainersStats,
		Payload: snapshot,
	})
}
