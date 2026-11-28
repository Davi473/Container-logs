package handler

import (
	"net/http"

	"container-log-monitor/internal/application/usecase"
)

type SystemHandler struct {
	uc *usecase.SystemUseCase
}

func NewSystemHandler(uc *usecase.SystemUseCase) *SystemHandler {
	return &SystemHandler{uc: uc}
}

func (h *SystemHandler) Info(w http.ResponseWriter, r *http.Request) {
	info, err := h.uc.GetInfo(r.Context())
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"ok":   true,
		"info": info,
	})
}

func (h *SystemHandler) Health(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "healthy"})
}
