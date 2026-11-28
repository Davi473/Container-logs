package handler

import (
	"net/http"

	"container-log-monitor/internal/application/usecase"
)

type ContainerHandler struct {
	uc        *usecase.ContainerUseCase
	monitorUC *usecase.MonitorUseCase
}

func NewContainerHandler(uc *usecase.ContainerUseCase, monitorUC *usecase.MonitorUseCase) *ContainerHandler {
	return &ContainerHandler{uc: uc, monitorUC: monitorUC}
}

func (h *ContainerHandler) List(w http.ResponseWriter, r *http.Request) {
	containers, err := h.uc.List(r.Context())
	if err != nil {
		WriteError(w, err)
		return
	}
	if h.monitorUC != nil {
		h.monitorUC.TriggerStatsPoll(r.Context())
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"containers": containers,
	})
}

func (h *ContainerHandler) Inspect(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	details, err := h.uc.Inspect(r.Context(), id)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"details": details,
	})
}

func (h *ContainerHandler) Action(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	action := r.PathValue("action")
	if err := h.uc.ExecuteAction(r.Context(), id, action); err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *ContainerHandler) Remove(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	force := r.URL.Query().Get("force") == "true" || r.URL.Query().Get("force") == "1"
	if err := h.uc.Remove(r.Context(), id, force); err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
