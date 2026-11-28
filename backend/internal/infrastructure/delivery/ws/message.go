package ws

import "encoding/json"

type Envelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type OutgoingMessage struct {
	Type    string `json:"type"`
	Payload any    `json:"payload,omitempty"`
}

type WatchPayload struct {
	ContainerID string `json:"containerId"`
	Tail        int    `json:"tail"`
}

type UnwatchPayload struct {
	ContainerID string `json:"containerId"`
}

type TermOpenPayload struct {
	ContainerID string `json:"containerId"`
	SessionID   string `json:"sessionId"`
}

type TermInputPayload struct {
	SessionID string `json:"sessionId"`
	Data      string `json:"data"`
}

type TermResizePayload struct {
	SessionID string `json:"sessionId"`
	Cols      int    `json:"cols"`
	Rows      int    `json:"rows"`
}

type TermClosePayload struct {
	SessionID string `json:"sessionId"`
}
