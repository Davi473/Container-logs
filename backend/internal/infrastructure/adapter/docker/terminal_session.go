package docker

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"sync"
)

// dockerTerminalSession implements port.TerminalSession over a hijacked Docker exec TCP/Unix stream.
type dockerTerminalSession struct {
	execID string
	conn   net.Conn
	reader *bufio.Reader
	client *Client
	once   sync.Once
}

func (s *dockerTerminalSession) Read(p []byte) (int, error) {
	return s.reader.Read(p)
}

func (s *dockerTerminalSession) Write(p []byte) (int, error) {
	return s.conn.Write(p)
}

func (s *dockerTerminalSession) Resize(ctx context.Context, cols, rows int) error {
	path := fmt.Sprintf("/exec/%s/resize?h=%d&w=%d", s.execID, rows, cols)
	return s.client.doPostNoContent(ctx, path)
}

func (s *dockerTerminalSession) Close() error {
	var err error
	s.once.Do(func() {
		err = s.conn.Close()
	})
	return err
}
