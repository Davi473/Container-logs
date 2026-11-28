package usecase

import (
	"context"
	"io"
	"sync"

	domainerr "container-log-monitor/internal/domain/errors"
	"container-log-monitor/internal/domain/port"
)

type terminalEntry struct {
	session     port.TerminalSession
	ownerID     string
	containerID string
}

type TerminalCallbacks struct {
	OnReady  func(sessionID string)
	OnData   func(sessionID, data string)
	OnClosed func(sessionID, errMsg string)
	OnError  func(sessionID, errMsg string)
}

// TerminalUseCase manages interactive container shell sessions.
type TerminalUseCase struct {
	docker   port.DockerEnginePort
	mu       sync.Mutex
	sessions map[string]*terminalEntry
}

func NewTerminalUseCase(docker port.DockerEnginePort) *TerminalUseCase {
	return &TerminalUseCase{
		docker:   docker,
		sessions: make(map[string]*terminalEntry),
	}
}

func (uc *TerminalUseCase) Open(ctx context.Context, ownerID, sessionID, containerID string, cb TerminalCallbacks) {
	if sessionID == "" || containerID == "" {
		if cb.OnError != nil {
			cb.OnError(sessionID, domainerr.ErrInvalidInput.Error())
		}
		return
	}

	sess, err := uc.docker.OpenTerminal(ctx, containerID)
	if err != nil {
		if cb.OnError != nil {
			cb.OnError(sessionID, err.Error())
		}
		return
	}

	uc.mu.Lock()
	if old, exists := uc.sessions[sessionID]; exists {
		_ = old.session.Close()
	}
	entry := &terminalEntry{
		session:     sess,
		ownerID:     ownerID,
		containerID: containerID,
	}
	uc.sessions[sessionID] = entry
	uc.mu.Unlock()

	if cb.OnReady != nil {
		cb.OnReady(sessionID)
	}

	go func() {
		buf := make([]byte, 4096)
		var closeErr string
		for {
			n, err := sess.Read(buf)
			if n > 0 && cb.OnData != nil {
				cb.OnData(sessionID, string(buf[:n]))
			}
			if err != nil {
				if err != io.EOF {
					closeErr = err.Error()
				}
				break
			}
		}

		uc.mu.Lock()
		if cur, ok := uc.sessions[sessionID]; ok && cur == entry {
			delete(uc.sessions, sessionID)
		}
		uc.mu.Unlock()
		_ = sess.Close()

		if cb.OnClosed != nil {
			cb.OnClosed(sessionID, closeErr)
		}
	}()
}

func (uc *TerminalUseCase) Write(sessionID, data string) error {
	uc.mu.Lock()
	entry, ok := uc.sessions[sessionID]
	uc.mu.Unlock()
	if !ok {
		return domainerr.ErrSessionNotFound
	}
	_, err := entry.session.Write([]byte(data))
	return err
}

func (uc *TerminalUseCase) Resize(ctx context.Context, sessionID string, cols, rows int) error {
	if cols <= 0 || rows <= 0 {
		return nil
	}
	uc.mu.Lock()
	entry, ok := uc.sessions[sessionID]
	uc.mu.Unlock()
	if !ok {
		return domainerr.ErrSessionNotFound
	}
	return entry.session.Resize(ctx, cols, rows)
}

func (uc *TerminalUseCase) Close(sessionID string) {
	uc.mu.Lock()
	entry, ok := uc.sessions[sessionID]
	if ok {
		delete(uc.sessions, sessionID)
	}
	uc.mu.Unlock()
	if ok {
		_ = entry.session.Close()
	}
}

func (uc *TerminalUseCase) CloseAllForOwner(ownerID string) {
	uc.mu.Lock()
	var toClose []port.TerminalSession
	for id, entry := range uc.sessions {
		if entry.ownerID == ownerID {
			toClose = append(toClose, entry.session)
			delete(uc.sessions, id)
		}
	}
	uc.mu.Unlock()

	for _, s := range toClose {
		_ = s.Close()
	}
}
