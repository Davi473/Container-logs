import type { IRealtimePort, RealtimeEventMap } from '../../domain/ports/ports';

type Listener<T> = (payload: T) => void;

// Driven Adapter: Native WebSocket with automatic SSE + HTTP command fallback
// (ensures full real-time support even behind reverse proxies without WebSocket upgrade)
export class WebSocketRealtimeAdapter implements IRealtimePort {
  private ws: WebSocket | null = null;
  private sse: EventSource | null = null;
  private sseClientId: string | null = null;
  private useSSEFallback = false;

  private listeners = new Map<keyof RealtimeEventMap, Set<Listener<unknown>>>();
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private manualClose = false;
  private pendingQueue: Array<{ type: string; payload: unknown }> = [];

  private buildWsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  connect(): void {
    this.manualClose = false;
    if (this.useSSEFallback) {
      this.connectSSE();
      return;
    }
    this.connectWS();
  }

  private connectWS(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.emit('connection', 'pending');

    let opened = false;
    const socket = new WebSocket(this.buildWsUrl());
    this.ws = socket;

    socket.onopen = () => {
      opened = true;
      this.reconnectAttempt = 0;
      this.emit('connection', 'live');
      this.flushQueue();
    };

    socket.onmessage = (event) => {
      this.handleIncoming(event.data);
    };

    socket.onclose = () => {
      this.ws = null;
      if (this.manualClose) return;

      // If WebSocket never opened (e.g. proxy returned 400 without Upgrade), fall back to SSE immediately
      if (!opened) {
        this.useSSEFallback = true;
        this.connectSSE();
        return;
      }

      this.emit('connection', 'down');
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose handles fallback/reconnection
    };
  }

  private connectSSE(): void {
    if (this.sse && this.sse.readyState !== EventSource.CLOSED) {
      return;
    }
    this.emit('connection', 'pending');

    const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sseClientId = clientId;
    const es = new EventSource(`/api/v1/stream?clientId=${encodeURIComponent(clientId)}`);
    this.sse = es;

    es.onopen = () => {
      this.reconnectAttempt = 0;
      this.emit('connection', 'live');
      this.flushQueue();
    };

    es.onmessage = (event) => {
      this.handleIncoming(event.data);
    };

    es.onerror = () => {
      if (this.manualClose) return;
      es.close();
      this.sse = null;
      this.sseClientId = null;
      this.emit('connection', 'down');
      this.scheduleReconnect();
    };
  }

  private handleIncoming(raw: string): void {
    try {
      const parsed = JSON.parse(raw) as { type: keyof RealtimeEventMap; payload: unknown };
      if (parsed && parsed.type) {
        this.emit(parsed.type, parsed.payload as never);
      }
    } catch {
      // Ignore malformed frames
    }
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.sse) {
      this.sse.close();
      this.sse = null;
      this.sseClientId = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(8000, 1000 * Math.pow(1.5, this.reconnectAttempt));
    this.reconnectAttempt++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private flushQueue(): void {
    while (this.pendingQueue.length > 0) {
      const item = this.pendingQueue.shift();
      if (item) this.send(item.type, item.payload);
    }
  }

  private send(type: string, payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
      return;
    }
    if (this.sse && this.sse.readyState === EventSource.OPEN && this.sseClientId) {
      void fetch(`/api/v1/stream/${encodeURIComponent(this.sseClientId)}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload }),
      }).catch(() => {});
      return;
    }
    this.pendingQueue.push({ type, payload });
  }

  private emit<K extends keyof RealtimeEventMap>(event: K, payload: RealtimeEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((fn) => fn(payload));
  }

  on<K extends keyof RealtimeEventMap>(
    event: K,
    listener: (payload: RealtimeEventMap[K]) => void
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => {
      set?.delete(listener as Listener<unknown>);
    };
  }

  watchLogs(containerId: string, tail = 300): void {
    this.send('log:watch', { containerId, tail });
  }

  unwatchLogs(containerId: string): void {
    this.send('log:unwatch', { containerId });
  }

  openTerminal(containerId: string, sessionId: string): void {
    this.send('term:open', { containerId, sessionId });
  }

  sendTerminalInput(sessionId: string, data: string): void {
    this.send('term:input', { sessionId, data });
  }

  resizeTerminal(sessionId: string, cols: number, rows: number): void {
    this.send('term:resize', { sessionId, cols, rows });
  }

  closeTerminal(sessionId: string): void {
    this.send('term:close', { sessionId });
  }
}
