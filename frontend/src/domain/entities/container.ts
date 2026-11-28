export type ContainerAction = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill';

export interface PortBinding {
  ip: string | null;
  privatePort: number;
  publicPort: number | null;
  type: string;
  label: string;
}

export interface NetworkSummary {
  name: string;
  ip: string | null;
  mac: string | null;
  gateway: string | null;
}

export interface MountSummary {
  type: string;
  source: string;
  destination: string;
  rw: boolean;
}

export interface Container {
  id: string;
  shortId: string;
  name: string;
  image: string;
  imageId: string;
  command: string;
  state: string;
  status: string;
  health: string | null;
  ports: string[];
  portBindings: PortBinding[];
  createdAt: number;
  composeProject: string | null;
  composeService: string | null;
  composeWorkingDir: string | null;
  networks: NetworkSummary[];
  mounts: MountSummary[];
}

export interface ContainerStats {
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  netRx: number;
  netTx: number;
  pids: number;
}

export type StatsSnapshot = Record<string, ContainerStats>;

export interface HealthLogEntry {
  Start: string;
  End: string;
  ExitCode: number;
  Output: string;
}

export interface HealthDetails {
  status: string;
  failingStreak: number;
  log: HealthLogEntry[];
}

export interface ContainerStateDetails {
  status: string;
  running: boolean;
  paused: boolean;
  restarting: boolean;
  oomKilled: boolean;
  pid: number;
  exitCode: number;
  error: string;
  startedAt: string | null;
  finishedAt: string | null;
  health: HealthDetails | null;
}

export interface ComposeDetails {
  project: string | null;
  service: string | null;
  workingDir: string | null;
  configFiles: string | null;
}

export interface PortDetail {
  containerPort: string;
  hostIp: string | null;
  hostPort: string | null;
}

export interface NetworkDetail {
  name: string;
  ipAddress: string;
  gateway: string;
  macAddress: string;
  aliases: string[];
}

export interface MountDetail {
  type: string;
  name: string | null;
  source: string;
  destination: string;
  mode: string;
  rw: boolean;
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface ContainerDetails {
  id: string;
  shortId: string;
  name: string;
  image: string;
  imageId: string;
  created: string;
  platform: string;
  driver: string;
  hostname: string;
  workingDir: string;
  user: string;
  tty: boolean;
  cmd: string[];
  entrypoint: string[];
  restartPolicy: string;
  restartCount: number;
  state: ContainerStateDetails;
  compose: ComposeDetails;
  ports: PortDetail[];
  networks: NetworkDetail[];
  mounts: MountDetail[];
  env: EnvVar[];
  labels: Record<string, string>;
}

export interface ActionError {
  id: string;
  message: string;
}

export interface BatchActionResult {
  ok: boolean;
  count: number;
  errors?: ActionError[];
  error?: string;
}
