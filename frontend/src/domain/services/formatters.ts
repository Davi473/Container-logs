const AVATAR_PALETTE = [
  'linear-gradient(135deg,#4f46e5,#6366f1)',
  'linear-gradient(135deg,#0d9488,#2dd4bf)',
  'linear-gradient(135deg,#059669,#34d399)',
  'linear-gradient(135deg,#d97706,#fbbf24)',
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#e11d48,#fb7185)',
];

export function avatarGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 || i === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

export function isSecretKey(key: string): boolean {
  return /(password|passwd|secret|token|api_key|apikey|private_key|auth|credentials|jwt)/i.test(key);
}

export function badgeClassForState(cstate: string): string {
  if (cstate === 'running') return 'crate__badge--running';
  if (cstate === 'restarting' || cstate === 'paused') return 'crate__badge--restarting';
  return 'crate__badge--off';
}

export const ACTION_LABELS: Record<string, string> = {
  start: 'Iniciar',
  stop: 'Parar',
  restart: 'Reiniciar',
  pause: 'Pausar',
  unpause: 'Retomar',
  kill: 'Encerrar',
  remove: 'Remover',
};
