package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"container-log-monitor/internal/application/usecase"
	"container-log-monitor/internal/domain/port"
	"container-log-monitor/internal/infrastructure/delivery/ws"
)

type sseClient struct {
	id       string
	send     chan []byte
	watchMu  sync.RWMutex
	watching map[string]struct{}
}

func (c *sseClient) isWatching(containerID string) bool {
	c.watchMu.RLock()
	defer c.watchMu.RUnlock()
	_, ok := c.watching[containerID]
	return ok
}

func (c *sseClient) enqueue(data []byte) {
	select {
	case c.send <- data:
	default:
	}
}

func (c *sseClient) sendJSON(msg ws.OutgoingMessage) {
	if data, err := json.Marshal(msg); err == nil {
		c.enqueue(data)
	}
}

// SSEHandler is a Driving Adapter providing Server-Sent Events + HTTP command fallback
// when reverse proxies (such as Nginx Proxy Manager) do not have WebSocket upgrade enabled.
type SSEHandler struct {
	bus     port.EventBus
	logUC   *usecase.LogStreamUseCase
	termUC  *usecase.TerminalUseCase
	mu      sync.RWMutex
	clients map[string]*sseClient
	unsubs  []func()
}

func NewSSEHandler(bus port.EventBus, logUC *usecase.LogStreamUseCase, termUC *usecase.TerminalUseCase) *SSEHandler {
	h := &SSEHandler{
		bus:     bus,
		logUC:   logUC,
		termUC:  termUC,
		clients: make(map[string]*sseClient),
	}
	h.subscribeToBus()
	return h
}

func (h *SSEHandler) subscribeToBus() {
	broadcastTopics := []port.EventTopic{
		port.TopicContainersUpdate,
		port.TopicContainersStats,
		port.TopicDockerEvent,
	}
	for _, topic := range broadcastTopics {
		t := topic
		unsub := h.bus.Subscribe(t, func(ev port.DomainEvent) {
			h.broadcast(ws.OutgoingMessage{Type: string(t), Payload: ev.Payload})
		})
		h.unsubs = append(h.unsubs, unsub)
	}

	scopedTopics := []port.EventTopic{
		port.TopicLogLine,
		port.TopicLogError,
	}
	for _, topic := range scopedTopics {
		t := topic
		unsub := h.bus.Subscribe(t, func(ev port.DomainEvent) {
			h.broadcastToWatchers(ev.Scope, ws.OutgoingMessage{Type: string(t), Payload: ev.Payload})
		})
		h.unsubs = append(h.unsubs, unsub)
	}
}

func (h *SSEHandler) Close() {
	for _, u := range h.unsubs {
		u()
	}
}

func (h *SSEHandler) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *SSEHandler) broadcast(msg ws.OutgoingMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	for _, c := range h.clients {
		c.enqueue(data)
	}
	h.mu.RUnlock()
}

func (h *SSEHandler) broadcastToWatchers(containerID string, msg ws.OutgoingMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	for _, c := range h.clients {
		if c.isWatching(containerID) {
			c.enqueue(data)
		}
	}
	h.mu.RUnlock()
}

func (h *SSEHandler) Stream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		clientID = fmt.Sprintf("sse-%d", time.Now().UnixNano())
	}

	client := &sseClient{
		id:       clientID,
		send:     make(chan []byte, 256),
		watching: make(map[string]struct{}),
	}

	h.mu.Lock()
	h.clients[clientID] = client
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		if cur, exists := h.clients[clientID]; exists && cur == client {
			delete(h.clients, clientID)
		}
		h.mu.Unlock()
		h.logUC.UnwatchAll(clientID)
		h.termUC.CloseAllForOwner(clientID)
	}()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// Send initial comment so proxies flush headers immediately
	_, _ = fmt.Fprintf(w, ": connected %s\n\n", clientID)
	flusher.Flush()

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case data := <-client.send:
			_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-heartbeat.C:
			_, _ = fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func (h *SSEHandler) Command(w http.ResponseWriter, r *http.Request) {
	clientID := r.PathValue("clientId")
	h.mu.RLock()
	client, ok := h.clients[clientID]
	h.mu.RUnlock()
	if !ok {
		WriteJSON(w, http.StatusNotFound, ErrorResponse{OK: false, Error: "stream client not found"})
		return
	}

	var env ws.Envelope
	if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
		WriteJSON(w, http.StatusBadRequest, ErrorResponse{OK: false, Error: "invalid command payload"})
		return
	}

	switch env.Type {
	case "log:watch":
		var p ws.WatchPayload
		if json.Unmarshal(env.Payload, &p) == nil && p.ContainerID != "" {
			client.watchMu.Lock()
			client.watching[p.ContainerID] = struct{}{}
			client.watchMu.Unlock()
			go func() {
				history, err := h.logUC.Watch(context.Background(), client.id, p.ContainerID, p.Tail)
				if err != nil {
					client.sendJSON(ws.OutgoingMessage{
						Type:    "log:error",
						Payload: map[string]string{"containerId": p.ContainerID, "message": err.Error()},
					})
					return
				}
				for _, line := range history {
					client.sendJSON(ws.OutgoingMessage{Type: "log:line", Payload: line})
				}
			}()
		}

	case "log:unwatch":
		var p ws.UnwatchPayload
		if json.Unmarshal(env.Payload, &p) == nil && p.ContainerID != "" {
			client.watchMu.Lock()
			delete(client.watching, p.ContainerID)
			client.watchMu.Unlock()
			h.logUC.Unwatch(client.id, p.ContainerID)
		}

	case "term:open":
		var p ws.TermOpenPayload
		if json.Unmarshal(env.Payload, &p) == nil {
			go h.termUC.Open(context.Background(), client.id, p.SessionID, p.ContainerID, usecase.TerminalCallbacks{
				OnReady: func(sessionID string) {
					client.sendJSON(ws.OutgoingMessage{Type: "term:ready", Payload: map[string]string{"sessionId": sessionID}})
				},
				OnData: func(sessionID, data string) {
					client.sendJSON(ws.OutgoingMessage{Type: "term:data", Payload: map[string]string{"sessionId": sessionID, "data": data}})
				},
				OnClosed: func(sessionID, errMsg string) {
					payload := map[string]string{"sessionId": sessionID}
					if errMsg != "" {
						payload["error"] = errMsg
					}
					client.sendJSON(ws.OutgoingMessage{Type: "term:closed", Payload: payload})
				},
				OnError: func(sessionID, errMsg string) {
					client.sendJSON(ws.OutgoingMessage{Type: "term:error", Payload: map[string]string{"sessionId": sessionID, "message": errMsg}})
				},
			})
		}

	case "term:input":
		var p ws.TermInputPayload
		if json.Unmarshal(env.Payload, &p) == nil {
			_ = h.termUC.Write(p.SessionID, p.Data)
		}

	case "term:resize":
		var p ws.TermResizePayload
		if json.Unmarshal(env.Payload, &p) == nil {
			go func() {
				_ = h.termUC.Resize(context.Background(), p.SessionID, p.Cols, p.Rows)
			}()
		}

	case "term:close":
		var p ws.TermClosePayload
		if json.Unmarshal(env.Payload, &p) == nil {
			h.termUC.Close(p.SessionID)
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
