package port

import "context"

// TerminalSession is a driven port representing an interactive TTY session inside a container.
type TerminalSession interface {
	Read(p []byte) (int, error)
	Write(p []byte) (int, error)
	Resize(ctx context.Context, cols, rows int) error
	Close() error
}
