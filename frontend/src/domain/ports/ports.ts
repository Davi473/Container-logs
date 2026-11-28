import type {
  BatchActionResult,
  Container,
  ContainerAction,
  ContainerDetails,
} from '../entities/container';
import type {
  DockerEvent,
  LogLine,
  SystemInfo,
} from '../entities/telemetry';
import type { StatsSnapshot } from '../entities/container';
import type { ConnectionMode } from '../entities/workspace';

// Driven Port: HTTP REST Gateway to Go backend
export interface IContainerGateway {
  listContainers(): Promise<Container[]>;
  inspectContainer(id: string): Promise<ContainerDetails>;
  executeAction(id: string, action: ContainerAction): Promise<void>;
  removeContainer(id: string, force: boolean): Promise<void>;
  executeComposeAction(project: string, action: ContainerAction): Promise<BatchActionResult>;
  removeComposeProject(project: string, force: boolean): Promise<BatchActionResult>;
  getSystemInfo(): Promise<SystemInfo>;
}

export type RealtimeEventMap = {
  'connection': ConnectionMode;
  'containers:update': Container[];
  'containers:stats': StatsSnapshot;
  'docker:event': DockerEvent;
  'log:line': LogLine;
  'log:error': { containerId: string; message: string };
  'term:ready': { sessionId: string };
  'term:data': { sessionId: string; data: string };
  'term:closed': { sessionId: string; error?: string };
  'term:error': { sessionId: string; message: string };
};

// Driven Port: Real-time Bidirectional WebSocket Port (Observer Pattern)
export interface IRealtimePort {
  connect(): void;
  disconnect(): void;
  on<K extends keyof RealtimeEventMap>(
    event: K,
    listener: (payload: RealtimeEventMap[K]) => void
  ): () => void;
  watchLogs(containerId: string, tail?: number): void;
  unwatchLogs(containerId: string): void;
  openTerminal(containerId: string, sessionId: string): void;
  sendTerminalInput(sessionId: string, data: string): void;
  resizeTerminal(sessionId: string, cols: number, rows: number): void;
  closeTerminal(sessionId: string): void;
}

// Driven Port: Client Persistence
export interface IStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
