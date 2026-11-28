package usecase

import (
	"context"

	"container-log-monitor/internal/domain/entity"
	"container-log-monitor/internal/domain/port"
)

type SystemUseCase struct {
	docker port.DockerEnginePort
}

func NewSystemUseCase(docker port.DockerEnginePort) *SystemUseCase {
	return &SystemUseCase{docker: docker}
}

func (uc *SystemUseCase) GetInfo(ctx context.Context) (*entity.SystemInfo, error) {
	return uc.docker.GetSystemInfo(ctx)
}
