package handler

import (
	"net/http"

	"container-log-monitor/internal/application/usecase"
)

type ComposeHandler struct {
	uc *usecase.ComposeUseCase
}

func NewComposeHandler(uc *usecase.ComposeUseCase) *ComposeHandler {
	return &ComposeHandler{uc: uc}
}

func (h *ComposeHandler) Action(w http.ResponseWriter, r *http.Request) {
	project := r.PathValue("project")
	action := r.PathValue("action")
	res, err := h.uc.ExecuteAction(r.Context(), project, action)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, res)
}

func (h *ComposeHandler) Remove(w http.ResponseWriter, r *http.Request) {
	project := r.PathValue("project")
	force := r.URL.Query().Get("force") == "true" || r.URL.Query().Get("force") == "1"
	res, err := h.uc.Remove(r.Context(), project, force)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, res)
}
