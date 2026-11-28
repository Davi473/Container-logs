package docker

import (
	"bytes"
	"encoding/binary"
	"testing"

	"container-log-monitor/internal/domain/entity"
)

func TestReadMultiplexedLogs(t *testing.T) {
	var buf bytes.Buffer

	writeFrame := func(stream byte, msg string) {
		var hdr [8]byte
		hdr[0] = stream
		binary.BigEndian.PutUint32(hdr[4:8], uint32(len(msg)))
		buf.Write(hdr[:])
		buf.WriteString(msg)
	}

	writeFrame(1, "2026-01-01T12:00:00.000Z hello stdout\n")
	writeFrame(2, "2026-01-01T12:00:01.000Z error stderr\n")

	var lines []entity.LogLine
	if err := readMultiplexedLogs(&buf, "c1", func(l entity.LogLine) {
		lines = append(lines, l)
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(lines) != 2 {
		t.Fatalf("expected 2 lines, got %d", len(lines))
	}
	if lines[0].Stream != entity.LogStreamStdout || lines[0].Text != "hello stdout" {
		t.Fatalf("unexpected stdout line: %+v", lines[0])
	}
	if lines[1].Stream != entity.LogStreamStderr || lines[1].Text != "error stderr" {
		t.Fatalf("unexpected stderr line: %+v", lines[1])
	}
}
