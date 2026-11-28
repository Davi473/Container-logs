package docker

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"container-log-monitor/internal/domain/entity"
	domainerr "container-log-monitor/internal/domain/errors"
	"container-log-monitor/internal/domain/port"
)

// Client is the Hexagonal Driven Adapter implementing port.DockerEnginePort via the Docker Engine HTTP API.
type Client struct {
	network      string // "unix" or "tcp"
	address      string // "/var/run/docker.sock" or "host:port"
	baseURL      string
	httpClient   *http.Client
	streamClient *http.Client
}

func NewClient(dockerHost string) *Client {
	network := "unix"
	address := "/var/run/docker.sock"
	baseURL := "http://docker"

	if strings.HasPrefix(dockerHost, "unix://") {
		address = strings.TrimPrefix(dockerHost, "unix://")
	} else if strings.HasPrefix(dockerHost, "tcp://") || strings.HasPrefix(dockerHost, "http://") {
		network = "tcp"
		u, err := url.Parse(dockerHost)
		if err == nil && u.Host != "" {
			address = u.Host
			baseURL = "http://" + u.Host
		}
	} else if dockerHost != "" && !strings.Contains(dockerHost, "://") {
		address = dockerHost
	}

	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	dialContext := func(ctx context.Context, _, _ string) (net.Conn, error) {
		return dialer.DialContext(ctx, network, address)
	}

	transport := &http.Transport{
		DialContext:         dialContext,
		MaxIdleConns:        64,
		MaxIdleConnsPerHost: 64,
		IdleConnTimeout:     90 * time.Second,
	}

	return &Client{
		network: network,
		address: address,
		baseURL: baseURL,
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   30 * time.Second,
		},
		streamClient: &http.Client{
			Transport: transport,
			Timeout:   0,
		},
	}
}

func (c *Client) doJSON(ctx context.Context, method, path string, body any, out any) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", domainerr.ErrDaemonUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return domainerr.ErrContainerNotFound
	}
	if resp.StatusCode >= 400 {
		return parseDockerError(resp.Body, resp.StatusCode)
	}

	if out != nil && resp.StatusCode != http.StatusNoContent {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

func (c *Client) doPostNoContent(ctx context.Context, path string) error {
	return c.doJSON(ctx, http.MethodPost, path, nil, nil)
}

func parseDockerError(r io.Reader, status int) error {
	var payload struct {
		Message string `json:"message"`
	}
	raw, _ := io.ReadAll(io.LimitReader(r, 4096))
	if json.Unmarshal(raw, &payload) == nil && payload.Message != "" {
		return fmt.Errorf("%s", payload.Message)
	}
	msg := strings.TrimSpace(string(raw))
	if msg != "" {
		return fmt.Errorf("docker API (%d): %s", status, msg)
	}
	return fmt.Errorf("docker API error: HTTP %d", status)
}

func (c *Client) ListContainers(ctx context.Context, all bool) ([]entity.Container, error) {
	path := "/containers/json"
	if all {
		path += "?all=1"
	}
	var raw []dockerContainerSummaryDTO
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &raw); err != nil {
		return nil, err
	}
	res := make([]entity.Container, 0, len(raw))
	for _, item := range raw {
		res = append(res, mapContainerSummary(item))
	}
	return res, nil
}

func (c *Client) ListContainersByComposeProject(ctx context.Context, project string) ([]entity.Container, error) {
	filters, _ := json.Marshal(map[string][]string{
		"label": {fmt.Sprintf("com.docker.compose.project=%s", project)},
	})
	path := "/containers/json?all=1&filters=" + url.QueryEscape(string(filters))
	var raw []dockerContainerSummaryDTO
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &raw); err != nil {
		return nil, err
	}
	res := make([]entity.Container, 0, len(raw))
	for _, item := range raw {
		res = append(res, mapContainerSummary(item))
	}
	return res, nil
}

func (c *Client) InspectContainer(ctx context.Context, id string) (*entity.ContainerDetails, error) {
	var raw dockerInspectDTO
	if err := c.doJSON(ctx, http.MethodGet, "/containers/"+url.PathEscape(id)+"/json", nil, &raw); err != nil {
		return nil, err
	}
	return mapContainerDetails(raw), nil
}

func (c *Client) StartContainer(ctx context.Context, id string) error {
	return c.doPostNoContent(ctx, "/containers/"+url.PathEscape(id)+"/start")
}

func (c *Client) StopContainer(ctx context.Context, id string) error {
	return c.doPostNoContent(ctx, "/containers/"+url.PathEscape(id)+"/stop")
}

func (c *Client) RestartContainer(ctx context.Context, id string) error {
	return c.doPostNoContent(ctx, "/containers/"+url.PathEscape(id)+"/restart")
}

func (c *Client) PauseContainer(ctx context.Context, id string) error {
	return c.doPostNoContent(ctx, "/containers/"+url.PathEscape(id)+"/pause")
}

func (c *Client) UnpauseContainer(ctx context.Context, id string) error {
	return c.doPostNoContent(ctx, "/containers/"+url.PathEscape(id)+"/unpause")
}

func (c *Client) KillContainer(ctx context.Context, id string) error {
	return c.doPostNoContent(ctx, "/containers/"+url.PathEscape(id)+"/kill")
}

func (c *Client) RemoveContainer(ctx context.Context, id string, force bool) error {
	path := "/containers/" + url.PathEscape(id)
	if force {
		path += "?force=1"
	}
	return c.doJSON(ctx, http.MethodDelete, path, nil, nil)
}

func (c *Client) GetContainerStats(ctx context.Context, id string) (*entity.ContainerStats, error) {
	var raw dockerStatsDTO
	path := "/containers/" + url.PathEscape(id) + "/stats?stream=0"
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &raw); err != nil {
		return nil, err
	}
	return calculateStats(raw), nil
}

func (c *Client) isContainerTTY(ctx context.Context, id string) bool {
	details, err := c.InspectContainer(ctx, id)
	if err != nil || details == nil {
		return false
	}
	return details.TTY
}

func (c *Client) StreamLogs(ctx context.Context, id string, tail int, onLine func(entity.LogLine)) error {
	isTTY := c.isContainerTTY(ctx, id)
	path := fmt.Sprintf("/containers/%s/logs?follow=1&stdout=1&stderr=1&timestamps=1&tail=%d", url.PathEscape(id), tail)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.streamClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return parseDockerError(resp.Body, resp.StatusCode)
	}

	if isTTY {
		return readTTYLogs(resp.Body, id, onLine)
	}
	return readMultiplexedLogs(resp.Body, id, onLine)
}

func (c *Client) FetchRecentLogs(ctx context.Context, id string, tail int) ([]entity.LogLine, error) {
	isTTY := c.isContainerTTY(ctx, id)
	path := fmt.Sprintf("/containers/%s/logs?follow=0&stdout=1&stderr=1&timestamps=1&tail=%d", url.PathEscape(id), tail)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, parseDockerError(resp.Body, resp.StatusCode)
	}

	var lines []entity.LogLine
	collect := func(l entity.LogLine) { lines = append(lines, l) }

	if isTTY {
		if err := readTTYLogs(resp.Body, id, collect); err != nil {
			return lines, err
		}
	} else {
		if err := readMultiplexedLogs(resp.Body, id, collect); err != nil {
			return lines, err
		}
	}
	return lines, nil
}

func (c *Client) StreamEvents(ctx context.Context, onEvent func(entity.DockerEvent)) error {
	filters, _ := json.Marshal(map[string][]string{
		"type":  {"container"},
		"event": {"start", "stop", "die", "restart", "pause", "unpause", "destroy", "create", "health_status"},
	})
	path := "/events?filters=" + url.QueryEscape(string(filters))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.streamClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return parseDockerError(resp.Body, resp.StatusCode)
	}

	dec := json.NewDecoder(resp.Body)
	for {
		var ev dockerEventDTO
		if err := dec.Decode(&ev); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}

		action := ev.Action
		if action == "" {
			action = ev.Status
		}
		containerID := ev.ID
		if containerID == "" {
			containerID = ev.Actor.ID
		}
		name := ev.Actor.Attributes["name"]
		if name == "" {
			name = shortID(containerID)
		}
		ts := time.Now().UTC().Format(time.RFC3339Nano)
		if ev.TimeNano > 0 {
			ts = time.Unix(0, ev.TimeNano).UTC().Format(time.RFC3339Nano)
		}

		onEvent(entity.DockerEvent{
			Action:      action,
			ContainerID: containerID,
			Name:        name,
			Timestamp:   ts,
		})
	}
}

func (c *Client) OpenTerminal(ctx context.Context, containerID string) (port.TerminalSession, error) {
	execReq := map[string]any{
		"Cmd":          []string{"/bin/sh", "-c", "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi"},
		"AttachStdin":  true,
		"AttachStdout": true,
		"AttachStderr": true,
		"Tty":          true,
		"Env":          []string{"TERM=xterm-256color", "COLORTERM=truecolor"},
	}
	var createResp struct {
		ID string `json:"Id"`
	}
	if err := c.doJSON(ctx, http.MethodPost, "/containers/"+url.PathEscape(containerID)+"/exec", execReq, &createResp); err != nil {
		return nil, err
	}
	if createResp.ID == "" {
		return nil, fmt.Errorf("docker did not return an exec ID")
	}

	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, c.network, c.address)
	if err != nil {
		return nil, err
	}

	body := `{"Detach":false,"Tty":true}`
	rawReq := fmt.Sprintf(
		"POST /exec/%s/start HTTP/1.1\r\nHost: docker\r\nContent-Type: application/json\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: %d\r\n\r\n%s",
		url.PathEscape(createResp.ID),
		len(body),
		body,
	)
	if _, err := conn.Write([]byte(rawReq)); err != nil {
		_ = conn.Close()
		return nil, err
	}

	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	if resp.StatusCode != http.StatusSwitchingProtocols && resp.StatusCode != http.StatusOK {
		err := parseDockerError(resp.Body, resp.StatusCode)
		_ = resp.Body.Close()
		_ = conn.Close()
		return nil, err
	}

	return &dockerTerminalSession{
		execID: createResp.ID,
		conn:   conn,
		reader: br,
		client: c,
	}, nil
}

func (c *Client) GetSystemInfo(ctx context.Context) (*entity.SystemInfo, error) {
	var info dockerInfoDTO
	if err := c.doJSON(ctx, http.MethodGet, "/info", nil, &info); err != nil {
		return nil, err
	}
	var version dockerVersionDTO
	_ = c.doJSON(ctx, http.MethodGet, "/version", nil, &version)

	hostname := info.Name
	if hostname == "" {
		hostname = "docker-host"
	}
	osName := info.OperatingSystem
	if osName == "" {
		osName = info.OSType
	}
	if osName == "" {
		osName = "Linux"
	}
	srvVersion := version.Version
	if srvVersion == "" {
		srvVersion = info.ServerVersion
	}

	return &entity.SystemInfo{
		Hostname:      hostname,
		OS:            osName,
		Arch:          info.Architecture,
		CPUs:          info.NCPU,
		MemTotal:      info.MemTotal,
		Containers:    info.Containers,
		Running:       info.ContainersRunning,
		Paused:        info.ContainersPaused,
		Stopped:       info.ContainersStopped,
		Images:        info.Images,
		ServerVersion: srvVersion,
		APIVersion:    version.APIVersion,
	}, nil
}
