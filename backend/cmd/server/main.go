package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"container-log-monitor/internal/application/strategy"
	"container-log-monitor/internal/application/usecase"
	"container-log-monitor/internal/infrastructure/adapter/docker"
	"container-log-monitor/internal/infrastructure/adapter/eventbus"
	"container-log-monitor/internal/infrastructure/config"
	httpdelivery "container-log-monitor/internal/infrastructure/delivery/http"
	"container-log-monitor/internal/infrastructure/delivery/http/handler"
	"container-log-monitor/internal/infrastructure/delivery/ws"
)

func main() {
	cfg := config.Load()

	// 1. Driven Adapters (Infrastructure)
	dockerClient := docker.NewClient(cfg.DockerHost)
	bus := eventbus.NewMemoryEventBus()

	// 2. Domain Strategies & Application Use Cases
	actionRegistry := strategy.NewActionRegistry()
	containerUC := usecase.NewContainerUseCase(dockerClient, bus, actionRegistry)
	composeUC := usecase.NewComposeUseCase(dockerClient, actionRegistry, containerUC)
	systemUC := usecase.NewSystemUseCase(dockerClient)
	logStreamUC := usecase.NewLogStreamUseCase(dockerClient, bus)
	terminalUC := usecase.NewTerminalUseCase(dockerClient)

	// 3. Driving Adapters (WebSocket Hub, SSE Fallback & HTTP Router)
	wsHub := ws.NewHub(bus, logStreamUC, terminalUC)
	defer wsHub.Close()

	sseHandler := handler.NewSSEHandler(bus, logStreamUC, terminalUC)
	defer sseHandler.Close()

	monitorUC := usecase.NewMonitorUseCase(dockerClient, bus, containerUC, func() int {
		return wsHub.ClientCount() + sseHandler.ClientCount()
	})

	router := httpdelivery.NewRouter(httpdelivery.RouterDeps{
		ContainerHandler: handler.NewContainerHandler(containerUC, monitorUC),
		ComposeHandler:   handler.NewComposeHandler(composeUC),
		SystemHandler:    handler.NewSystemHandler(systemUC),
		SSEHandler:       sseHandler,
		WSHub:            wsHub,
		StaticDir:        cfg.StaticDir,
	})

	// 4. Start Background Monitors
	rootCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	monitorUC.Start(rootCtx)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("Control Tower Go backend listening on :%s (docker: %s)", cfg.Port, cfg.DockerHost)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// 5. Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	cancel()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("forced shutdown: %v", err)
	}
}
