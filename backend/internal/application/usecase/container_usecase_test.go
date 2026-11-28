package usecase

import (
	"context"
	"errors"
	"testing"

	"container-log-monitor/internal/application/strategy"
	"container-log-monitor/internal/domain/entity"
	domainerr "container-log-monitor/internal/domain/errors"
	"container-log-monitor/internal/domain/port"
	"container-log-monitor/internal/infrastructure/adapter/eventbus"
)

type mockDockerGateway struct {
	containers []entity.Container
	started    []string
	stopped    []string
	removed    []string
}

func (m *mockDockerGateway) ListContainers(_ context.Context, _ bool) ([]entity.Container, error) {
	return m.containers, nil
}
func (m *mockDockerGateway) ListContainersByComposeProject(_ context.Context, _ string) ([]entity.Container, error) {
	return m.containers, nil
}
func (m *mockDockerGateway) InspectContainer(_ context.Context, id string) (*entity.ContainerDetails, error) {
	return &entity.ContainerDetails{ID: id, ShortID: id}, nil
}
func (m *mockDockerGateway) StartContainer(_ context.Context, id string) error {
	m.started = append(m.started, id)
	return nil
}
func (m *mockDockerGateway) StopContainer(_ context.Context, id string) error {
	m.stopped = append(m.stopped, id)
	return nil
}
func (m *mockDockerGateway) RestartContainer(_ context.Context, _ string) error { return nil }
func (m *mockDockerGateway) PauseContainer(_ context.Context, _ string) error   { return nil }
func (m *mockDockerGateway) UnpauseContainer(_ context.Context, _ string) error { return nil }
func (m *mockDockerGateway) KillContainer(_ context.Context, _ string) error    { return nil }
func (m *mockDockerGateway) RemoveContainer(_ context.Context, id string, _ bool) error {
	m.removed = append(m.removed, id)
	return nil
}
func (m *mockDockerGateway) GetContainerStats(_ context.Context, _ string) (*entity.ContainerStats, error) {
	return &entity.ContainerStats{}, nil
}
func (m *mockDockerGateway) StreamLogs(_ context.Context, _ string, _ int, _ func(entity.LogLine)) error {
	return nil
}
func (m *mockDockerGateway) FetchRecentLogs(_ context.Context, _ string, _ int) ([]entity.LogLine, error) {
	return nil, nil
}
func (m *mockDockerGateway) StreamEvents(_ context.Context, _ func(entity.DockerEvent)) error {
	return nil
}
func (m *mockDockerGateway) OpenTerminal(_ context.Context, _ string) (port.TerminalSession, error) {
	return nil, nil
}
func (m *mockDockerGateway) GetSystemInfo(_ context.Context) (*entity.SystemInfo, error) {
	return &entity.SystemInfo{Hostname: "test"}, nil
}

func TestContainerUseCase_ExecuteAction_StrategyAndBroadcast(t *testing.T) {
	mock := &mockDockerGateway{
		containers: []entity.Container{{ID: "abc123456789", ShortID: "abc123456789", Name: "api"}},
	}
	bus := eventbus.NewMemoryEventBus()
	broadcasted := false
	unsub := bus.Subscribe(port.TopicContainersUpdate, func(_ port.DomainEvent) {
		broadcasted = true
	})
	defer unsub()

	uc := NewContainerUseCase(mock, bus, strategy.NewActionRegistry())

	if err := uc.ExecuteAction(context.Background(), "abc123456789", "start"); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if len(mock.started) != 1 || mock.started[0] != "abc123456789" {
		t.Fatalf("expected container to be started, got %v", mock.started)
	}
	if !broadcasted {
		t.Fatalf("expected containers:update event to be published")
	}

	err := uc.ExecuteAction(context.Background(), "abc123456789", "invalid_action")
	if !errors.Is(err, domainerr.ErrInvalidAction) {
		t.Fatalf("expected ErrInvalidAction, got %v", err)
	}
}
