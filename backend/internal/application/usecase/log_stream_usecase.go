package usecase

import (
	"context"
	"sync"

	"container-log-monitor/internal/domain/entity"
	"container-log-monitor/internal/domain/port"
)

type activeLogStream struct {
	cancel   context.CancelFunc
	watchers map[string]struct{}
}

// LogStreamUseCase coordinates shared, ref-counted log streams per container (Flyweight + Observer).
type LogStreamUseCase struct {
	docker  port.DockerEnginePort
	bus     port.EventBus
	mu      sync.Mutex
	streams map[string]*activeLogStream
}

func NewLogStreamUseCase(docker port.DockerEnginePort, bus port.EventBus) *LogStreamUseCase {
	return &LogStreamUseCase{
		docker:  docker,
		bus:     bus,
		streams: make(map[string]*activeLogStream),
	}
}

// Watch subscribes a watcherID (e.g. client ID) to a container's log stream.
// If the stream is already active for other watchers, it returns recent historical lines for the late joiner.
func (uc *LogStreamUseCase) Watch(ctx context.Context, watcherID, containerID string, tail int) ([]entity.LogLine, error) {
	if tail <= 0 {
		tail = 250
	}

	uc.mu.Lock()
	existing, alreadyActive := uc.streams[containerID]
	if alreadyActive {
		existing.watchers[watcherID] = struct{}{}
		uc.mu.Unlock()
		return uc.docker.FetchRecentLogs(ctx, containerID, tail)
	}

	streamCtx, cancel := context.WithCancel(context.Background())
	entry := &activeLogStream{
		cancel:   cancel,
		watchers: map[string]struct{}{watcherID: {}},
	}
	uc.streams[containerID] = entry
	uc.mu.Unlock()

	go func() {
		defer func() {
			uc.mu.Lock()
			if cur, ok := uc.streams[containerID]; ok && cur == entry {
				delete(uc.streams, containerID)
			}
			uc.mu.Unlock()
		}()

		err := uc.docker.StreamLogs(streamCtx, containerID, tail, func(line entity.LogLine) {
			uc.bus.Publish(port.DomainEvent{
				Topic:   port.TopicLogLine,
				Scope:   containerID,
				Payload: line,
			})
		})
		if err != nil && streamCtx.Err() == nil {
			uc.bus.Publish(port.DomainEvent{
				Topic: port.TopicLogError,
				Scope: containerID,
				Payload: map[string]string{
					"containerId": containerID,
					"message":     err.Error(),
				},
			})
		}
	}()

	return nil, nil
}

func (uc *LogStreamUseCase) Unwatch(watcherID, containerID string) {
	uc.mu.Lock()
	defer uc.mu.Unlock()

	entry, ok := uc.streams[containerID]
	if !ok {
		return
	}
	delete(entry.watchers, watcherID)
	if len(entry.watchers) == 0 {
		entry.cancel()
		delete(uc.streams, containerID)
	}
}

func (uc *LogStreamUseCase) UnwatchAll(watcherID string) {
	uc.mu.Lock()
	defer uc.mu.Unlock()

	for containerID, entry := range uc.streams {
		delete(entry.watchers, watcherID)
		if len(entry.watchers) == 0 {
			entry.cancel()
			delete(uc.streams, containerID)
		}
	}
}
