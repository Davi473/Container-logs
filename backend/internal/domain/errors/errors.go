package errors

import "errors"

var (
	ErrInvalidAction     = errors.New("invalid container lifecycle action")
	ErrContainerNotFound = errors.New("container not found")
	ErrProjectNotFound   = errors.New("no containers found for compose project")
	ErrDaemonUnavailable = errors.New("unable to connect to Docker daemon")
	ErrInvalidInput      = errors.New("invalid input")
	ErrSessionNotFound   = errors.New("terminal session not found")
)
