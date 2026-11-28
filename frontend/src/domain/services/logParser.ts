import type { EnrichedLogLine, LogLevel, LogLevelFilter, LogStreamType } from '../entities/telemetry';

const ANSI_STRIP_RE = /\x1b\[[0-9;]*m/g;
const ANSI_SPLIT_RE = /(\x1b\[[0-9;]*m)/g;
const ANSI_CODE_RE = /^\x1b\[([0-9;]*)m$/;

const ANSI_CODE_MAP: Record<string, string> = {
  '1': 'ansi-bold',
  '2': 'ansi-dim',
  '31': 'ansi-fg-red',
  '91': 'ansi-fg-red',
  '32': 'ansi-fg-green',
  '92': 'ansi-fg-green',
  '33': 'ansi-fg-yellow',
  '93': 'ansi-fg-yellow',
  '34': 'ansi-fg-blue',
  '94': 'ansi-fg-blue',
  '35': 'ansi-fg-magenta',
  '95': 'ansi-fg-magenta',
  '36': 'ansi-fg-cyan',
  '96': 'ansi-fg-cyan',
  '90': 'ansi-fg-gray',
};

export function stripAnsi(str: string): string {
  return String(str).replace(ANSI_STRIP_RE, '');
}

export function detectLogLevel(text: string, stream: LogStreamType): LogLevel {
  const t = stripAnsi(text).toLowerCase();
  if (/\b(error|err|fatal|exception|panic|crit|critical)\b/.test(t)) return 'error';
  if (/\b(warn|warning)\b/.test(t)) return 'warn';
  if (stream === 'stderr') return 'stderr';
  return 'info';
}

// Strategy Pattern: Text matching strategies (Plain substring vs Regex)
export interface LogMatchStrategy {
  matches(target: string, query: string): boolean;
}

const plainMatchStrategy: LogMatchStrategy = {
  matches: (target, query) => target.toLowerCase().includes(query.toLowerCase()),
};

const regexMatchStrategy: LogMatchStrategy = {
  matches: (target, query) => {
    try {
      return new RegExp(query, 'i').test(target);
    } catch {
      return plainMatchStrategy.matches(target, query);
    }
  },
};

export function matchesLogFilter(
  line: EnrichedLogLine,
  levelFilter: LogLevelFilter,
  query: string,
  useRegex: boolean
): boolean {
  if (line.isSystem) return true;
  if (levelFilter === 'error' && line.level !== 'error') return false;
  if (levelFilter === 'warn' && line.level !== 'warn') return false;
  if (levelFilter === 'stderr' && line.stream !== 'stderr') return false;
  if (!query) return true;

  const strategy = useRegex ? regexMatchStrategy : plainMatchStrategy;
  return strategy.matches(line.cleanText, query);
}

export interface AnsiSegment {
  text: string;
  classes: string;
  isMatch?: boolean;
}

export function parseAnsiSegments(
  rawText: string,
  filterText: string,
  useRegex: boolean
): AnsiSegment[] {
  const parts = String(rawText).split(ANSI_SPLIT_RE);
  let activeClasses: string[] = [];
  const result: AnsiSegment[] = [];

  let highlightRe: RegExp | null = null;
  if (filterText) {
    try {
      const pattern = useRegex
        ? filterText
        : filterText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (pattern) highlightRe = new RegExp(`(${pattern})`, 'ig');
    } catch {
      highlightRe = null;
    }
  }

  for (const part of parts) {
    if (!part) continue;
    const m = part.match(ANSI_CODE_RE);
    if (m) {
      const codes = m[1] ? m[1].split(';') : ['0'];
      for (const c of codes) {
        if (c === '0' || c === '39' || c === '22') activeClasses = [];
        else if (ANSI_CODE_MAP[c]) activeClasses.push(ANSI_CODE_MAP[c]);
      }
      continue;
    }

    const classStr = activeClasses.join(' ');
    if (highlightRe) {
      const subParts = part.split(highlightRe);
      subParts.forEach((sp, idx) => {
        if (!sp) return;
        result.push({
          text: sp,
          classes: classStr,
          isMatch: idx % 2 === 1,
        });
      });
    } else {
      result.push({ text: part, classes: classStr });
    }
  }

  return result;
}
