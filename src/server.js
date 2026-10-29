const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Docker = require('dockerode');

// Connects to the Docker daemon. By default uses the local unix socket
// (mounted into this container as /var/run/docker.sock — see docker-compose.yml).
// Override with DOCKER_HOST for a remote daemon (e.g. tcp://1.2.3.4:2375).
const docker = process.env.DOCKER_HOST
  ? new Docker() // dockerode reads DOCKER_HOST from env automatically
  : new Docker({ socketPath: '/var/run/docker.sock' });

const app = express();
app.set('trust proxy', true);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const PORT = Number(process.env.PORT) || 80;

app.use(express.static(path.join(__dirname, '..', 'public')));

// Lifecycle actions supported on individual containers and compose stacks
const CONTAINER_ACTIONS = new Set(['start', 'stop', 'restart', 'pause', 'unpause', 'kill']);

// Parse health status from Docker's human-readable Status string (e.g. "Up 8 minutes (healthy)")
function parseHealth(status = '') {
  const m = status.match(/\((healthy|unhealthy|health:\s*starting)\)/i);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  if (raw.includes('starting')) return 'starting';
  return raw;
}

function shapeContainer(c) {
  const labels = c.Labels || {};
  const rawPorts = (c.Ports || []).map(p => ({
    ip: p.IP || null,
    privatePort: p.PrivatePort,
    publicPort: p.PublicPort || null,
    type: p.Type || 'tcp',
    label: p.PublicPort ? `${p.PublicPort}->${p.PrivatePort}/${p.Type || 'tcp'}` : `${p.PrivatePort}/${p.Type || 'tcp'}`,
  }));

  // Deduplicate IPv4 / IPv6 port bindings for cleaner UI display
  const seenPortKeys = new Set();
  const structuredPorts = [];
  for (const p of rawPorts) {
    const key = `${p.publicPort || ''}:${p.privatePort}/${p.type}`;
    if (!seenPortKeys.has(key)) {
      seenPortKeys.add(key);
      structuredPorts.push(p);
    }
  }

  const networks = c.NetworkSettings && c.NetworkSettings.Networks
    ? Object.entries(c.NetworkSettings.Networks).map(([name, net]) => ({
        name,
        ip: net.IPAddress || null,
        mac: net.MacAddress || null,
        gateway: net.Gateway || null,
      }))
    : [];

  const mounts = (c.Mounts || []).map(m => ({
    type: m.Type,
    source: m.Source || m.Name || '',
    destination: m.Destination || '',
    rw: m.RW !== false,
  }));

  return {
    id: c.Id,
    shortId: c.Id.slice(0, 12),
    name: (c.Names && c.Names[0] ? c.Names[0] : c.Id).replace(/^\//, ''),
    image: c.Image,
    imageId: c.ImageID ? c.ImageID.replace(/^sha256:/, '').slice(0, 12) : '',
    command: c.Command || '',
    state: c.State,       // running | exited | restarting | paused | created | dead
    status: c.Status,     // e.g. "Up 3 hours (healthy)"
    health: parseHealth(c.Status),
    ports: structuredPorts.map(p => p.PublicPort ? `${p.PublicPort}->${p.PrivatePort}` : `${p.PrivatePort}`),
    portBindings: structuredPorts,
    createdAt: c.Created,
    composeProject: labels['com.docker.compose.project'] || null,
    composeService: labels['com.docker.compose.service'] || null,
    composeWorkingDir: labels['com.docker.compose.project.working_dir'] || null,
    networks,
    mounts,
  };
}

// Re-broadcasts the current container list to every connected client.
let broadcastTimer = null;
async function broadcastContainers() {
  try {
    const containers = await docker.listContainers({ all: true });
    io.emit('containers:update', containers.map(shapeContainer));
  } catch (_) {
    // daemon momentarily unreachable — next poll will retry
  }
}

function scheduleBroadcastContainers(delayMs = 120) {
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    broadcastContainers();
  }, delayMs);
}

// Finds every container labeled with the given compose project
async function containersInProject(project) {
  return docker.listContainers({ all: true, filters: { label: [`com.docker.compose.project=${project}`] } });
}

// ---- Docker Events Stream (real-time state updates) -------------------------

let eventsStream = null;
async function attachDockerEvents() {
  if (eventsStream) return;
  try {
    const stream = await docker.getEvents({
      filters: {
        type: ['container'],
        event: ['start', 'stop', 'die', 'restart', 'pause', 'unpause', 'destroy', 'create', 'health_status'],
      },
    });
    eventsStream = stream;
    stream.on('data', (chunk) => {
      try {
        const lines = chunk.toString('utf8').trim().split('\n');
        for (const line of lines) {
          if (!line) continue;
          const ev = JSON.parse(line);
          const action = ev.Action || ev.status || '';
          const name = (ev.Actor && ev.Actor.Attributes && ev.Actor.Attributes.name) || (ev.id ? ev.id.slice(0, 12) : '');
          io.emit('docker:event', {
            action,
            containerId: ev.id || (ev.Actor && ev.Actor.ID) || '',
            name,
            ts: ev.timeNano ? new Date(Math.floor(ev.timeNano / 1e6)).toISOString() : new Date().toISOString(),
          });
        }
      } catch (_) {}
      scheduleBroadcastContainers(150);
    });
    stream.on('error', () => {
      eventsStream = null;
      setTimeout(attachDockerEvents, 5000);
    });
    stream.on('end', () => {
      eventsStream = null;
      setTimeout(attachDockerEvents, 5000);
    });
  } catch (_) {
    eventsStream = null;
    setTimeout(attachDockerEvents, 5000);
  }
}

attachDockerEvents();

// ---- Live Container Resource Stats (CPU / Memory / Net / PIDs) --------------

function calculateCpuPercent(stats) {
  if (!stats || !stats.cpu_stats || !stats.precpu_stats) return 0;
  const cpuDelta =
    (stats.cpu_stats.cpu_usage?.total_usage || 0) -
    (stats.precpu_stats.cpu_usage?.total_usage || 0);
  const systemDelta =
    (stats.cpu_stats.system_cpu_usage || 0) -
    (stats.precpu_stats.system_cpu_usage || 0);
  const onlineCpus =
    stats.cpu_stats.online_cpus ||
    (stats.cpu_stats.cpu_usage?.percpu_usage ? stats.cpu_stats.cpu_usage.percpu_usage.length : 1);

  if (systemDelta > 0 && cpuDelta > 0) {
    return Math.min(100 * onlineCpus, Math.max(0, (cpuDelta / systemDelta) * onlineCpus * 100));
  }
  return 0;
}

function calculateMemory(stats) {
  if (!stats || !stats.memory_stats) return { usage: 0, limit: 0, percent: 0 };
  const rawUsage = stats.memory_stats.usage || 0;
  const inactiveFile =
    stats.memory_stats.stats?.inactive_file ??
    stats.memory_stats.stats?.total_inactive_file ??
    stats.memory_stats.stats?.cache ??
    0;
  const usage = Math.max(0, rawUsage - inactiveFile);
  const limit = stats.memory_stats.limit || 0;
  const percent = limit > 0 ? Math.min(100, Math.max(0, (usage / limit) * 100)) : 0;
  return { usage, limit, percent };
}

function calculateNetwork(stats) {
  let rx = 0;
  let tx = 0;
  if (stats && stats.networks) {
    for (const net of Object.values(stats.networks)) {
      rx += net.rx_bytes || 0;
      tx += net.tx_bytes || 0;
    }
  }
  return { rx, tx };
}

let statsInFlight = false;
async function pollContainerStats() {
  if (statsInFlight || io.engine.clientsCount === 0) return;
  statsInFlight = true;
  try {
    const running = await docker.listContainers({ all: false });
    const results = {};
    await Promise.all(
      running.map(async (c) => {
        try {
          const s = await docker.getContainer(c.Id).stats({ stream: false });
          const mem = calculateMemory(s);
          const net = calculateNetwork(s);
          results[c.Id] = {
            cpuPercent: Number(calculateCpuPercent(s).toFixed(1)),
            memUsage: mem.usage,
            memLimit: mem.limit,
            memPercent: Number(mem.percent.toFixed(1)),
            netRx: net.rx,
            netTx: net.tx,
            pids: s?.pids_stats?.current || 0,
          };
        } catch (_) {}
      })
    );
    io.emit('containers:stats', results);
  } catch (_) {
    // ignore transient errors
  } finally {
    statsInFlight = false;
  }
}

// ---- Socket.IO: live log streaming -----------------------------------------

const activeStreams = new Map(); // containerId -> { stream, watchers:Set<socketId> }

async function startStream(containerId, tailCount = 250) {
  if (activeStreams.has(containerId)) return activeStreams.get(containerId);

  const container = docker.getContainer(containerId);
  let isTty = false;
  try {
    const info = await container.inspect();
    isTty = !!(info && info.Config && info.Config.Tty);
  } catch (_) {}

  const logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: tailCount,
    timestamps: true,
  });

  const entry = { stream: logStream, watchers: new Set() };
  activeStreams.set(containerId, entry);

  // Docker multiplexes stdout/stderr with an 8-byte header per frame when the
  // container was NOT started with a TTY. When Tty is true, the stream is raw
  // un-multiplexed bytes.
  if (isTty) {
    const stdoutSink = lineSink(containerId, 'stdout');
    logStream.on('data', (chunk) => stdoutSink.write(chunk));
  } else {
    container.modem.demuxStream(
      logStream,
      lineSink(containerId, 'stdout'),
      lineSink(containerId, 'stderr')
    );
  }

  logStream.on('error', (err) => {
    io.to(`logs:${containerId}`).emit('log:error', { containerId, message: err.message });
  });

  logStream.on('close', () => {
    activeStreams.delete(containerId);
  });

  return entry;
}

// Fetch recent historical lines for a newly opened log tab when a stream is
// already active on the server for another tab/client.
async function sendRecentHistory(socket, containerId, tailCount = 250) {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    const isTty = !!(info && info.Config && info.Config.Tty);
    const buf = await container.logs({
      follow: false,
      stdout: true,
      stderr: true,
      tail: tailCount,
      timestamps: true,
    });
    if (!Buffer.isBuffer(buf)) return;

    if (isTty) {
      const text = buf.toString('utf8');
      for (const raw of text.split('\n')) {
        if (!raw) continue;
        socket.emit('log:line', { containerId, ...parseRawLogLine('stdout', raw) });
      }
    } else {
      // Parse 8-byte Docker multiplexed frames
      let offset = 0;
      let stdoutBuf = '';
      let stderrBuf = '';
      while (offset + 8 <= buf.length) {
        const streamType = buf[offset];
        const frameSize = buf.readUInt32BE(offset + 4);
        offset += 8;
        if (offset + frameSize > buf.length) break;
        const payload = buf.slice(offset, offset + frameSize).toString('utf8');
        offset += frameSize;
        if (streamType === 2) {
          stderrBuf += payload;
          let idx;
          while ((idx = stderrBuf.indexOf('\n')) >= 0) {
            const raw = stderrBuf.slice(0, idx);
            stderrBuf = stderrBuf.slice(idx + 1);
            if (raw.length > 0) socket.emit('log:line', { containerId, ...parseRawLogLine('stderr', raw) });
          }
        } else {
          stdoutBuf += payload;
          let idx;
          while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
            const raw = stdoutBuf.slice(0, idx);
            stdoutBuf = stdoutBuf.slice(idx + 1);
            if (raw.length > 0) socket.emit('log:line', { containerId, ...parseRawLogLine('stdout', raw) });
          }
        }
      }
    }
  } catch (_) {}
}

function parseRawLogLine(stream, raw) {
  const cleaned = raw.replace(/\r$/, '');
  const match = cleaned.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s(.*)$/s);
  return match
    ? { ts: match[1], text: match[2], stream }
    : { ts: new Date().toISOString(), text: cleaned, stream };
}

function lineSink(containerId, stream) {
  let buffer = '';
  return {
    write(chunk) {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (raw.length === 0) continue;
        emitLine(containerId, stream, raw);
      }
    },
  };
}

function emitLine(containerId, stream, raw) {
  const payload = parseRawLogLine(stream, raw);
  io.to(`logs:${containerId}`).emit('log:line', { containerId, ...payload });
}

// ---- Socket.IO: interactive terminal (docker exec) ------------------------

const activeExecs = new Map(); // sessionId -> { stream, exec, containerId, socketId }

async function openTerminal(socket, { containerId, sessionId }) {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['/bin/sh', '-c', 'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi'],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: ['TERM=xterm-256color', 'COLORTERM=truecolor'],
  });

  const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
  activeExecs.set(sessionId, { stream, exec, containerId, socketId: socket.id });

  stream.on('data', (chunk) => {
    socket.emit('term:data', { sessionId, data: chunk.toString('utf8') });
  });
  stream.on('close', () => {
    socket.emit('term:closed', { sessionId });
    activeExecs.delete(sessionId);
  });
  stream.on('error', (err) => {
    socket.emit('term:closed', { sessionId, error: err.message });
    activeExecs.delete(sessionId);
  });

  socket.emit('term:ready', { sessionId });
}

// ---- Detailed Container Inspection ----------------------------------------

async function inspectContainerDetails(id) {
  const container = docker.getContainer(id);
  const info = await container.inspect();
  const labels = info.Config?.Labels || {};

  const ports = [];
  const portMap = info.NetworkSettings?.Ports || {};
  for (const [containerPort, bindings] of Object.entries(portMap)) {
    if (Array.isArray(bindings) && bindings.length > 0) {
      for (const b of bindings) {
        ports.push({
          containerPort,
          hostIp: b.HostIp || '0.0.0.0',
          hostPort: b.HostPort,
        });
      }
    } else {
      ports.push({ containerPort, hostIp: null, hostPort: null });
    }
  }

  const networks = Object.entries(info.NetworkSettings?.Networks || {}).map(([name, net]) => ({
    name,
    ipAddress: net.IPAddress || '—',
    gateway: net.Gateway || '—',
    macAddress: net.MacAddress || '—',
    aliases: net.Aliases || [],
  }));

  const mounts = (info.Mounts || []).map((m) => ({
    type: m.Type || 'volume',
    name: m.Name || null,
    source: m.Source || '—',
    destination: m.Destination || '—',
    mode: m.Mode || '',
    rw: m.RW !== false,
  }));

  const envList = (info.Config?.Env || []).map((entry) => {
    const idx = entry.indexOf('=');
    return idx >= 0
      ? { key: entry.slice(0, idx), value: entry.slice(idx + 1) }
      : { key: entry, value: '' };
  });

  return {
    id: info.Id,
    shortId: info.Id.slice(0, 12),
    name: (info.Name || '').replace(/^\//, ''),
    image: info.Config?.Image || '',
    imageId: (info.Image || '').replace(/^sha256:/, '').slice(0, 12),
    created: info.Created,
    platform: info.Platform || 'linux',
    driver: info.Driver || '',
    hostname: info.Config?.Hostname || '',
    workingDir: info.Config?.WorkingDir || '/',
    user: info.Config?.User || 'root',
    tty: !!info.Config?.Tty,
    cmd: info.Config?.Cmd || [],
    entrypoint: info.Config?.Entrypoint || [],
    restartPolicy: info.HostConfig?.RestartPolicy?.Name || 'no',
    restartCount: info.RestartCount || 0,
    state: {
      status: info.State?.Status || 'unknown',
      running: !!info.State?.Running,
      paused: !!info.State?.Paused,
      restarting: !!info.State?.Restarting,
      oomKilled: !!info.State?.OOMKilled,
      pid: info.State?.Pid || 0,
      exitCode: info.State?.ExitCode ?? 0,
      error: info.State?.Error || '',
      startedAt: info.State?.StartedAt || null,
      finishedAt: info.State?.FinishedAt || null,
      health: info.State?.Health
        ? {
            status: info.State.Health.Status,
            failingStreak: info.State.Health.FailingStreak || 0,
            log: (info.State.Health.Log || []).slice(-5),
          }
        : null,
    },
    compose: {
      project: labels['com.docker.compose.project'] || null,
      service: labels['com.docker.compose.service'] || null,
      workingDir: labels['com.docker.compose.project.working_dir'] || null,
      configFiles: labels['com.docker.compose.project.config_files'] || null,
    },
    ports,
    networks,
    mounts,
    env: envList,
    labels,
  };
}

io.on('connection', (socket) => {
  socket.on('watch', async (payload) => {
    const containerId = typeof payload === 'string' ? payload : payload?.containerId;
    const tailCount = (typeof payload === 'object' && payload?.tail) ? Number(payload.tail) : 250;
    if (!containerId) return;

    try {
      const alreadyStreaming = activeStreams.has(containerId);
      socket.join(`logs:${containerId}`);
      const entry = await startStream(containerId, tailCount);
      entry.watchers.add(socket.id);
      if (alreadyStreaming) {
        await sendRecentHistory(socket, containerId, tailCount);
      }
    } catch (err) {
      socket.emit('log:error', { containerId, message: err.message });
    }
  });

  socket.on('unwatch', (containerId) => {
    socket.leave(`logs:${containerId}`);
    const entry = activeStreams.get(containerId);
    if (!entry) return;
    entry.watchers.delete(socket.id);
    if (entry.watchers.size === 0) {
      try { entry.stream.destroy(); } catch (_) {}
      activeStreams.delete(containerId);
    }
  });

  socket.on('system:info', async (callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const [info, version] = await Promise.all([docker.info(), docker.version()]);
      ack({
        ok: true,
        info: {
          hostname: info.Name || 'docker-host',
          os: info.OperatingSystem || info.OSType || 'Linux',
          arch: info.Architecture || '',
          cpus: info.NCPU || 0,
          memTotal: info.MemTotal || 0,
          containers: info.Containers || 0,
          running: info.ContainersRunning || 0,
          paused: info.ContainersPaused || 0,
          stopped: info.ContainersStopped || 0,
          images: info.Images || 0,
          serverVersion: version.Version || info.ServerVersion || '',
          apiVersion: version.ApiVersion || '',
        },
      });
    } catch (err) {
      ack({ ok: false, error: err.message });
    }
  });

  socket.on('containers:list', async (callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const containers = await docker.listContainers({ all: true });
      ack({ ok: true, containers: containers.map(shapeContainer) });
      // Also trigger a quick stats poll so newly connected clients get metrics fast
      pollContainerStats();
    } catch (err) {
      ack({ ok: false, error: 'Não foi possível conectar ao Docker daemon (/var/run/docker.sock).' });
    }
  });

  socket.on('container:inspect', async ({ id } = {}, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    if (!id) return ack({ ok: false, error: 'ID do container não informado.' });
    try {
      const details = await inspectContainerDetails(id);
      ack({ ok: true, details });
    } catch (err) {
      ack({ ok: false, error: err.message });
    }
  });

  socket.on('container:action', async ({ id, action } = {}, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    if (!CONTAINER_ACTIONS.has(action)) return ack({ ok: false, error: `Ação inválida: ${action}` });
    try {
      await docker.getContainer(id)[action]();
      await broadcastContainers();
      ack({ ok: true });
    } catch (err) {
      ack({ ok: false, error: err.message });
    }
  });

  socket.on('container:remove', async ({ id, force } = {}, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      await docker.getContainer(id).remove({ force: !!force });
      await broadcastContainers();
      ack({ ok: true });
    } catch (err) {
      ack({ ok: false, error: err.message });
    }
  });

  socket.on('compose:action', async ({ project, action } = {}, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    if (!CONTAINER_ACTIONS.has(action)) return ack({ ok: false, error: `Ação inválida: ${action}` });
    try {
      const containers = await containersInProject(project);
      if (containers.length === 0) return ack({ ok: false, error: `Nenhum container encontrado para o stack "${project}".` });

      const errors = [];
      await Promise.all(
        containers.map(async (c) => {
          try { await docker.getContainer(c.Id)[action](); }
          catch (err) { errors.push({ id: c.Id.slice(0, 12), message: err.message }); }
        })
      );
      await broadcastContainers();
      ack({ ok: errors.length === 0, count: containers.length, errors });
    } catch (err) {
      ack({ ok: false, error: err.message });
    }
  });

  socket.on('compose:remove', async ({ project, force } = {}, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const containers = await containersInProject(project);
      if (containers.length === 0) return ack({ ok: false, error: `Nenhum container encontrado para o stack "${project}".` });

      const errors = [];
      await Promise.all(
        containers.map(async (c) => {
          try { await docker.getContainer(c.Id).remove({ force: !!force }); }
          catch (err) { errors.push({ id: c.Id.slice(0, 12), message: err.message }); }
        })
      );
      await broadcastContainers();
      ack({ ok: errors.length === 0, count: containers.length, errors });
    } catch (err) {
      ack({ ok: false, error: err.message });
    }
  });

  socket.on('term:open', (payload) => {
    openTerminal(socket, payload).catch((err) => {
      socket.emit('term:error', { sessionId: payload.sessionId, message: err.message });
    });
  });

  socket.on('term:input', ({ sessionId, data }) => {
    const entry = activeExecs.get(sessionId);
    if (entry) entry.stream.write(data);
  });

  socket.on('term:resize', ({ sessionId, cols, rows }) => {
    const entry = activeExecs.get(sessionId);
    if (entry && cols > 0 && rows > 0) {
      entry.exec.resize({ h: rows, w: cols }).catch(() => {});
    }
  });

  socket.on('term:close', (sessionId) => {
    const entry = activeExecs.get(sessionId);
    if (entry) {
      try { entry.stream.end(); } catch (_) {}
      activeExecs.delete(sessionId);
    }
  });

  socket.on('disconnect', () => {
    for (const [containerId, entry] of activeStreams) {
      if (entry.watchers.delete(socket.id) && entry.watchers.size === 0) {
        try { entry.stream.destroy(); } catch (_) {}
        activeStreams.delete(containerId);
      }
    }
    for (const [sessionId, entry] of activeExecs) {
      if (entry.socketId === socket.id) {
        try { entry.stream.end(); } catch (_) {}
        activeExecs.delete(sessionId);
      }
    }
  });
});

// Periodically push container state & live stats
setInterval(broadcastContainers, 5000);
setInterval(pollContainerStats, 4000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Container Log Monitor running on port ${PORT} (http://docker.local)`);
});
