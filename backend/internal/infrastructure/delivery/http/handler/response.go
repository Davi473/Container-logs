package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	domainerr "container-log-monitor/internal/domain/errors"
)

type ErrorResponse struct {
	OK    bool   `json:"ok"`
	Error string `json:"error"`
}

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func WriteError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	msg := err.Error()

	switch {
	case errors.Is(err, domainerr.ErrInvalidInput), errors.Is(err, domainerr.ErrInvalidAction):
		status = http.StatusBadRequest
	case errors.Is(err, domainerr.ErrContainerNotFound), errors.Is(err, domainerr.ErrProjectNotFound):
		status = http.StatusNotFound
	case errors.Is(err, domainerr.ErrDaemonUnavailable):
		status = http.StatusServiceUnavailable
		msg = "Não foi possível conectar ao Docker daemon (/var/run/docker.sock)."
	}

	WriteJSON(w, status, ErrorResponse{OK: false, Error: msg})
}
