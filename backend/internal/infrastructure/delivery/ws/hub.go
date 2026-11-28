package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"container-log-monitor/internal/application/usecase"
	"container-log-monitor/internal/domain/port"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(_ *http.Request) bool { return true },
}

// Hub is the Mediator coordinating all connected WebSocket clients and bridging the Domain EventBus.
type Hub struct {
	bus     port.EventBus
	logUC   *usecase.LogStreamUseCase
	termUC  *usecase.TerminalUseCase
	mu      sync.RWMutex
	clients map[*Client]struct{}
	nextID  atomic.Uint64
	unsubs  []func()
}

func NewHub(bus port.EventBus, logUC *usecase.LogStreamUseCase, termUC *usecase.TerminalUseCase) *Hub {
	h := &Hub{
		bus:     bus,
		logUC:   logUC,
		termUC:  termUC,
		clients: make(map[*Client]struct{}),
	}
	h.subscribeToBus()
	return h
}

func (h *Hub) subscribeToBus() {
	broadcastTopics := []port.EventTopic{
		port.TopicContainersUpdate,
		port.TopicContainersStats,
		port.TopicDockerEvent,
	}
	for _, topic := range broadcastTopics {
		t := topic
		unsub := h.bus.Subscribe(t, func(ev port.DomainEvent) {
			h.Broadcast(OutgoingMessage{Type: string(t), Payload: ev.Payload})
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
			h.BroadcastToWatchers(ev.Scope, OutgoingMessage{Type: string(t), Payload: ev.Payload})
		})
		h.unsubs = append(h.unsubs, unsub)
	}
}

func (h *Hub) Close() {
	for _, unsub := range h.unsubs {
		unsub()
	}
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	clientID := fmt.Sprintf("ws-%d", h.nextID.Add(1))
	client := &Client{
		id:       clientID,
		hub:      h,
		conn:     conn,
		send:     make(chan []byte, 256),
		watching: make(map[string]struct{}),
	}

	h.mu.Lock()
	h.clients[client] = struct{}{}
	h.mu.Unlock()

	go client.writePump()
	go client.readPump()
}

func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	_, exists := h.clients[c]
	if exists {
		delete(h.clients, c)
		close(c.send)
	}
	h.mu.Unlock()

	if exists {
		h.logUC.UnwatchAll(c.id)
		h.termUC.CloseAllForOwner(c.id)
	}
}

func (h *Hub) Broadcast(msg OutgoingMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	for c := range h.clients {
		c.enqueue(data)
	}
	h.mu.RUnlock()
}

func (h *Hub) BroadcastToWatchers(containerID string, msg OutgoingMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	for c := range h.clients {
		if c.isWatching(containerID) {
			c.enqueue(data)
		}
	}
	h.mu.RUnlock()
}

// Client represents a single connected WebSocket peer.
type Client struct {
	id       string
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	watchMu  sync.RWMutex
	watching map[string]struct{}
}

func (c *Client) isWatching(containerID string) bool {
	c.watchMu.RLock()
	defer c.watchMu.RUnlock()
	_, ok := c.watching[containerID]
	return ok
}

func (c *Client) enqueue(data []byte) {
	select {
	case c.send <- data:
	default:
		// Slow consumer: drop frame rather than blocking the hub
	}
}

func (c *Client) sendJSON(msg OutgoingMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	c.enqueue(data)
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(512 * 1024)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		var env Envelope
		if err := json.Unmarshal(raw, &env); err != nil {
			continue
		}
		c.handleEnvelope(env)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleEnvelope(env Envelope) {
	switch env.Type {
	case "log:watch":
		var p WatchPayload
		if json.Unmarshal(env.Payload, &p) != nil || p.ContainerID == "" {
			return
		}
		c.watchMu.Lock()
		c.watching[p.ContainerID] = struct{}{}
		c.watchMu.Unlock()

		go func() {
			history, err := c.hub.logUC.Watch(context.Background(), c.id, p.ContainerID, p.Tail)
			if err != nil {
				c.sendJSON(OutgoingMessage{
					Type: "log:error",
					Payload: map[string]string{
						"containerId": p.ContainerID,
						"message":     err.Error(),
					},
				})
				return
			}
			for _, line := range history {
				c.sendJSON(OutgoingMessage{Type: "log:line", Payload: line})
			}
		}()

	case "log:unwatch":
		var p UnwatchPayload
		if json.Unmarshal(env.Payload, &p) != nil || p.ContainerID == "" {
			return
		}
		c.watchMu.Lock()
		delete(c.watching, p.ContainerID)
		c.watchMu.Unlock()
		c.hub.logUC.Unwatch(c.id, p.ContainerID)

	case "term:open":
		var p TermOpenPayload
		if json.Unmarshal(env.Payload, &p) != nil {
			return
		}
		go c.hub.termUC.Open(context.Background(), c.id, p.SessionID, p.ContainerID, usecase.TerminalCallbacks{
			OnReady: func(sessionID string) {
				c.sendJSON(OutgoingMessage{
					Type:    "term:ready",
					Payload: map[string]string{"sessionId": sessionID},
				})
			},
			OnData: func(sessionID, data string) {
				c.sendJSON(OutgoingMessage{
					Type:    "term:data",
					Payload: map[string]string{"sessionId": sessionID, "data": data},
				})
			},
			OnClosed: func(sessionID, errMsg string) {
				payload := map[string]string{"sessionId": sessionID}
				if errMsg != "" {
					payload["error"] = errMsg
				}
				c.sendJSON(OutgoingMessage{Type: "term:closed", Payload: payload})
			},
			OnError: func(sessionID, errMsg string) {
				c.sendJSON(OutgoingMessage{
					Type:    "term:error",
					Payload: map[string]string{"sessionId": sessionID, "message": errMsg},
				})
			},
		})

	case "term:input":
		var p TermInputPayload
		if json.Unmarshal(env.Payload, &p) == nil {
			_ = c.hub.termUC.Write(p.SessionID, p.Data)
		}

	case "term:resize":
		var p TermResizePayload
		if json.Unmarshal(env.Payload, &p) == nil {
			go func() {
				_ = c.hub.termUC.Resize(context.Background(), p.SessionID, p.Cols, p.Rows)
			}()
		}

	case "term:close":
		var p TermClosePayload
		if json.Unmarshal(env.Payload, &p) == nil {
			c.hub.termUC.Close(p.SessionID)
		}
	}
}
