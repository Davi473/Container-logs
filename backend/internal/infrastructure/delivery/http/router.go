package httpdelivery

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"container-log-monitor/internal/infrastructure/delivery/http/handler"
	"container-log-monitor/internal/infrastructure/delivery/ws"
)

type RouterDeps struct {
	ContainerHandler *handler.ContainerHandler
	ComposeHandler   *handler.ComposeHandler
	SystemHandler    *handler.SystemHandler
	SSEHandler       *handler.SSEHandler
	WSHub            *ws.Hub
	StaticDir        string
}

func NewRouter(deps RouterDeps) http.Handler {
	mux := http.NewServeMux()

	// Health & System
	mux.HandleFunc("GET /api/v1/health", deps.SystemHandler.Health)
	mux.HandleFunc("GET /api/v1/system/info", deps.SystemHandler.Info)

	// Containers
	mux.HandleFunc("GET /api/v1/containers", deps.ContainerHandler.List)
	mux.HandleFunc("GET /api/v1/containers/{id}/inspect", deps.ContainerHandler.Inspect)
	mux.HandleFunc("POST /api/v1/containers/{id}/actions/{action}", deps.ContainerHandler.Action)
	mux.HandleFunc("DELETE /api/v1/containers/{id}", deps.ContainerHandler.Remove)

	// Compose stacks
	mux.HandleFunc("POST /api/v1/compose/{project}/actions/{action}", deps.ComposeHandler.Action)
	mux.HandleFunc("DELETE /api/v1/compose/{project}", deps.ComposeHandler.Remove)

	// SSE + HTTP command fallback (works through proxies without WebSocket upgrade)
	if deps.SSEHandler != nil {
		mux.HandleFunc("GET /api/v1/stream", deps.SSEHandler.Stream)
		mux.HandleFunc("POST /api/v1/stream/{clientId}/command", deps.SSEHandler.Command)
	}

	// WebSocket endpoint
	mux.HandleFunc("GET /ws", deps.WSHub.ServeWS)

	// Static SPA frontend (for production container builds)
	if deps.StaticDir != "" {
		mux.Handle("/", spaHandler(deps.StaticDir))
	}

	return Chain(mux, RecoveryMiddleware, CORSMiddleware)
}

func spaHandler(staticDir string) http.Handler {
	fs := http.FileServer(http.Dir(staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws" {
			http.NotFound(w, r)
			return
		}
		cleanPath := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		fullPath := filepath.Join(staticDir, cleanPath)
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			fs.ServeHTTP(w, r)
			return
		}
		indexPath := filepath.Join(staticDir, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			http.ServeFile(w, r, indexPath)
			return
		}
		http.NotFound(w, r)
	})
}
