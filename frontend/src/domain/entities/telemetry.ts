export type LogStreamType = 'stdout' | 'stderr';
export type LogLevel = 'info' | 'warn' | 'error' | 'stderr';
export type LogLevelFilter = 'all' | 'error' | 'warn' | 'stderr';

export interface LogLine {
  containerId: string;
  ts: string;
  text: string;
  stream: LogStreamType;
}

export interface EnrichedLogLine extends LogLine {
  num: number;
  cleanText: string;
  level: LogLevel;
  isSystem?: boolean;
}

export interface DockerEvent {
  action: string;
  containerId: string;
  name: string;
  ts: string;
}

export interface SystemInfo {
  hostname: string;
  os: string;
  arch: string;
  cpus: number;
  memTotal: number;
  containers: number;
  running: number;
  paused: number;
  stopped: number;
  images: number;
  serverVersion: string;
  apiVersion: string;
}
