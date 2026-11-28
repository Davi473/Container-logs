import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EnrichedLogLine, LogLevelFilter } from '../../../domain/entities/telemetry';
import { useApp } from '../../../application/store/AppContext';
import {
  detectLogLevel,
  matchesLogFilter,
  parseAnsiSegments,
  stripAnsi,
} from '../../../domain/services/logParser';
import {
  IconAutoscroll,
  IconClock,
  IconCopy,
  IconDownload,
  IconLogs,
  IconPause,
  IconPlay,
  IconSearch,
  IconTrash,
  IconWrap,
} from '../common/Icons';

const MAX_LINES = 3000;

interface LogPanelProps {
  sessionId: string;
  containerId: string;
  isActive: boolean;
}

export const LogPanel: React.FC<LogPanelProps> = ({ sessionId, containerId, isActive }) => {
  const { realtime, containers, showToast } = useApp();
  const containerName = containers.get(containerId)?.name || containerId.slice(0, 12);

  const [lines, setLines] = useState<EnrichedLogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [pausedMissed, setPausedMissed] = useState(0);
  const [autoscroll, setAutoscroll] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('all');
  const [filterText, setFilterText] = useState('');
  const [useRegex, setUseRegex] = useState(false);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const bufferRef = useRef<EnrichedLogLine[]>([]);
  const seqRef = useRef(0);
  const logViewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubLine = realtime.on('log:line', (line) => {
      if (line.containerId !== containerId) return;
      const enriched: EnrichedLogLine = {
        ...line,
        num: ++seqRef.current,
        cleanText: stripAnsi(line.text),
        level: detectLogLevel(line.text, line.stream),
      };
      bufferRef.current = [...bufferRef.current, enriched].slice(-MAX_LINES);
      if (pausedRef.current) {
        setPausedMissed((n) => n + 1);
      } else {
        setLines(bufferRef.current);
      }
    });

    const unsubErr = realtime.on('log:error', ({ containerId: cid, message }) => {
      if (cid !== containerId) return;
      const sysLine: EnrichedLogLine = {
        containerId,
        ts: '',
        text: `Erro ao ler logs: ${message}`,
        stream: 'stderr',
        num: 0,
        cleanText: `Erro ao ler logs: ${message}`,
        level: 'error',
        isSystem: true,
      };
      bufferRef.current = [...bufferRef.current, sysLine].slice(-MAX_LINES);
      setLines(bufferRef.current);
    });

    return () => {
      unsubLine();
      unsubErr();
    };
  }, [realtime, containerId]);

  const counts = useMemo(() => {
    let error = 0;
    let warn = 0;
    let stderr = 0;
    for (const l of lines) {
      if (l.isSystem) continue;
      if (l.level === 'error') error++;
      if (l.level === 'warn') warn++;
      if (l.stream === 'stderr') stderr++;
    }
    return { error, warn, stderr };
  }, [lines]);

  const visibleLines = useMemo(
    () => lines.filter((l) => matchesLogFilter(l, levelFilter, filterText, useRegex)),
    [lines, levelFilter, filterText, useRegex]
  );

  useEffect(() => {
    if (autoscroll && isActive && logViewRef.current) {
      logViewRef.current.scrollTop = logViewRef.current.scrollHeight;
    }
  }, [visibleLines, autoscroll, isActive]);

  const handleTogglePause = () => {
    setPaused((prev) => {
      const next = !prev;
      if (!next) {
        setPausedMissed(0);
        setLines(bufferRef.current);
      }
      return next;
    });
  };

  const handleSetAutoscroll = (val: boolean) => {
    setAutoscroll(val);
    if (val && logViewRef.current) {
      logViewRef.current.scrollTop = logViewRef.current.scrollHeight;
    }
  };

  const handleScroll = () => {
    const el = logViewRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist > 48 && autoscroll) {
      setAutoscroll(false);
    } else if (dist <= 12 && !autoscroll) {
      setAutoscroll(true);
    }
  };

  const handleClear = () => {
    bufferRef.current = [];
    seqRef.current = 0;
    setLines([]);
    setPausedMissed(0);
  };

  const handleCopyAll = async () => {
    const text = visibleLines
      .map((l) => `${l.ts} ${l.stream === 'stderr' ? '[ERR] ' : ''}${l.cleanText}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${visibleLines.length} linhas copiadas para a área de transferência.`, 'success');
    } catch {
      showToast('Não foi possível copiar (permissão do navegador).', 'error');
    }
  };

  const handleDownload = () => {
    const text = bufferRef.current
      .map((l) => `${l.ts} ${l.stream === 'stderr' ? 'ERR ' : ''}${l.cleanText}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${containerName}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Download do arquivo .log iniciado.', 'success');
  };

  return (
    <div className={`panel${isActive ? ' is-active' : ''}`} data-session={sessionId} data-type="log">
      <div className="panel__bar">
        <span className="panel__title">
          <IconLogs /> <strong>{containerName}</strong>
        </span>

        <div className="panel__levels" role="group" aria-label="Filtrar nível de log">
          <button
            className={`level-pill${levelFilter === 'all' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setLevelFilter('all')}
          >
            Todos
          </button>
          <button
            className={`level-pill${levelFilter === 'error' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setLevelFilter('error')}
          >
            Erros <span className="level-pill__count">{counts.error > 0 ? counts.error : ''}</span>
          </button>
          <button
            className={`level-pill${levelFilter === 'warn' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setLevelFilter('warn')}
          >
            Avisos <span className="level-pill__count">{counts.warn > 0 ? counts.warn : ''}</span>
          </button>
          <button
            className={`level-pill${levelFilter === 'stderr' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setLevelFilter('stderr')}
          >
            stderr <span className="level-pill__count">{counts.stderr > 0 ? counts.stderr : ''}</span>
          </button>
        </div>

        <div className="panel__controls">
          <div className="panel__filter-wrap">
            <IconSearch />
            <input
              className="panel__filter"
              type="text"
              value={filterText}
              placeholder="Buscar nos logs…"
              autoComplete="off"
              onChange={(e) => setFilterText(e.target.value)}
            />
            <div className="panel__filter-meta">
              <span className="panel__match-count">{filterText ? visibleLines.length : ''}</span>
              <button
                className={`regex-btn${useRegex ? ' is-active' : ''}`}
                type="button"
                title="Usar Expressão Regular (Regex)"
                onClick={() => setUseRegex((v) => !v)}
              >
                .*
              </button>
            </div>
          </div>

          <span className="panel__sep" aria-hidden="true" />
          <button
            className={`btn btn--sm${wrap ? ' btn--active' : ''}`}
            type="button"
            title="Alternar quebra de linha automática"
            onClick={() => setWrap((v) => !v)}
          >
            <IconWrap /> Wrap
          </button>
          <button
            className={`btn btn--sm${showTimestamps ? ' btn--active' : ''}`}
            type="button"
            title="Mostrar/ocultar timestamps"
            onClick={() => setShowTimestamps((v) => !v)}
          >
            <IconClock /> Hora
          </button>
          <span className="panel__sep" aria-hidden="true" />
          <button
            className={`btn btn--sm${paused ? ' btn--warn-active' : ''}`}
            type="button"
            title="Pausar/retomar recebimento"
            onClick={handleTogglePause}
          >
            {paused ? (
              <>
                <IconPlay /> Retomar{pausedMissed > 0 ? ` (${pausedMissed})` : ''}
              </>
            ) : (
              <>
                <IconPause /> Pausar
              </>
            )}
          </button>
          <button
            className={`btn btn--sm${autoscroll ? ' btn--active' : ''}`}
            type="button"
            title="Rolagem automática"
            onClick={() => handleSetAutoscroll(!autoscroll)}
          >
            <IconAutoscroll /> Auto
          </button>
          <button
            className="btn btn--sm"
            type="button"
            title="Copiar logs filtrados"
            onClick={() => void handleCopyAll()}
          >
            <IconCopy />
          </button>
          <button
            className="btn btn--sm"
            type="button"
            title="Baixar arquivo .log"
            onClick={handleDownload}
          >
            <IconDownload /> .log
          </button>
          <button
            className="btn btn--sm btn--danger"
            type="button"
            title="Limpar buffer de logs"
            onClick={handleClear}
          >
            <IconTrash />
          </button>
        </div>
      </div>

      <div
        ref={logViewRef}
        className={`panel__logview${wrap ? '' : ' is-nowrap'}${showTimestamps ? '' : ' hide-ts'}`}
        onScroll={handleScroll}
      >
        {visibleLines.map((line, idx) => {
          if (line.isSystem) {
            return (
              <div key={`sys-${idx}`} className="log-line log-line--system">
                <span className="log-line__num" />
                <span className="log-line__ts" />
                <span className="log-line__text">{line.text}</span>
              </div>
            );
          }

          const lvlClass = line.level === 'error' || line.level === 'warn' ? ` log-line--${line.level}` : '';
          const stderrClass = line.stream === 'stderr' ? ' log-line--stderr' : '';
          const time = line.ts ? line.ts.slice(11, 19) : '';
          const segments = parseAnsiSegments(line.text, filterText, useRegex);

          return (
            <div key={line.num} className={`log-line${stderrClass}${lvlClass}`}>
              <span className="log-line__num">{line.num}</span>
              <span className="log-line__ts">{time}</span>
              <span className="log-line__text">
                {segments.map((seg, si) => {
                  const content = seg.isMatch ? <mark>{seg.text}</mark> : seg.text;
                  return seg.classes ? (
                    <span key={si} className={seg.classes}>{content}</span>
                  ) : (
                    <React.Fragment key={si}>{content}</React.Fragment>
                  );
                })}
              </span>
              <button
                className="log-line__copy"
                type="button"
                title="Copiar linha"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(line.cleanText);
                    showToast('Linha copiada.', 'success');
                  } catch {
                    // ignore
                  }
                }}
              >
                <IconCopy />
              </button>
            </div>
          );
        })}
      </div>

      {!autoscroll && (
        <button
          className="log-jump-btn"
          type="button"
          onClick={() => handleSetAutoscroll(true)}
        >
          <IconAutoscroll /> <span>Ir para o fim</span>
        </button>
      )}
    </div>
  );
};
