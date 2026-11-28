package docker

import (
	"bufio"
	"encoding/binary"
	"io"
	"regexp"
	"strings"
	"time"

	"container-log-monitor/internal/domain/entity"
)

var logTimestampRegex = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s(.*)$`)

func parseRawLogLine(containerID string, stream entity.LogStreamType, raw string) entity.LogLine {
	cleaned := strings.TrimSuffix(raw, "\r")
	if m := logTimestampRegex.FindStringSubmatch(cleaned); len(m) == 3 {
		return entity.LogLine{
			ContainerID: containerID,
			Timestamp:   m[1],
			Text:        m[2],
			Stream:      stream,
		}
	}
	return entity.LogLine{
		ContainerID: containerID,
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		Text:        cleaned,
		Stream:      stream,
	}
}

func readTTYLogs(r io.Reader, containerID string, onLine func(entity.LogLine)) error {
	br := bufio.NewReaderSize(r, 32*1024)
	for {
		line, err := br.ReadString('\n')
		if len(line) > 0 {
			trimmed := strings.TrimSuffix(line, "\n")
			if len(trimmed) > 0 {
				onLine(parseRawLogLine(containerID, entity.LogStreamStdout, trimmed))
			}
		}
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}

// readMultiplexedLogs decodes Docker's 8-byte framed stdout/stderr stream.
func readMultiplexedLogs(r io.Reader, containerID string, onLine func(entity.LogLine)) error {
	var (
		header    [8]byte
		stdoutBuf strings.Builder
		stderrBuf strings.Builder
	)

	flushLines := func(buf *strings.Builder, stream entity.LogStreamType) {
		s := buf.String()
		for {
			idx := strings.IndexByte(s, '\n')
			if idx < 0 {
				break
			}
			raw := s[:idx]
			s = s[idx+1:]
			if len(raw) > 0 {
				onLine(parseRawLogLine(containerID, stream, raw))
			}
		}
		buf.Reset()
		buf.WriteString(s)
	}

	for {
		if _, err := io.ReadFull(r, header[:]); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				return nil
			}
			return err
		}

		streamType := header[0]
		frameSize := binary.BigEndian.Uint32(header[4:8])
		if frameSize == 0 {
			continue
		}

		payload := make([]byte, frameSize)
		if _, err := io.ReadFull(r, payload); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				return nil
			}
			return err
		}

		if streamType == 2 {
			stderrBuf.Write(payload)
			flushLines(&stderrBuf, entity.LogStreamStderr)
		} else {
			stdoutBuf.Write(payload)
			flushLines(&stdoutBuf, entity.LogStreamStdout)
		}
	}
}
