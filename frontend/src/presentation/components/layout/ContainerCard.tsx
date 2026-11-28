import React from 'react';
import type { Container } from '../../../domain/entities/container';
import { useApp } from '../../../application/store/AppContext';
import { formatBytes } from '../../../domain/services/formatters';
import {
  IconExternal,
  IconInspect,
  IconLogs,
  IconPlay,
  IconRefresh,
  IconShell,
  IconStop,
  IconTrash,
} from '../common/Icons';

interface ContainerCardProps {
  container: Container;
}

export const ContainerCard: React.FC<ContainerCardProps> = ({ container: c }) => {
  const {
    stats,
    busyContainers,
    hasOpenPanel,
    findSession,
    openLogTab,
    openTerminalTab,
    openInspectTab,
    executeContainerAction,
    removeContainer,
  } = useApp();

  const running = c.state === 'running';
  const isBusy = busyContainers.has(c.id);
  const isLogOpen = !!findSession('log', c.id);
  const isShellOpen = !!findSession('term', c.id);
  const isInspectOpen = !!findSession('inspect', c.id);
  const st = stats.get(c.id);

  const dotClass =
    c.state === 'running'
      ? 'c-dot--run'
      : c.state === 'restarting' || c.state === 'paused'
        ? 'c-dot--warn'
        : 'c-dot--off';

  return (
    <div
      className={`c-row${hasOpenPanel(c.id) ? ' has-open' : ''}${isBusy ? ' is-busy' : ''}`}
      data-state={c.state}
      onClick={() => openLogTab(c.id, true)}
    >
      <div className="c-row__top">
        <span className={`c-dot ${dotClass}`} title={c.status} />
        <span className="c-row__name" title={c.name}>{c.name}</span>
        {c.health && (
          <span className={`c-row__health c-row__health--${c.health}`} title={`Health: ${c.health}`}>
            {c.health}
          </span>
        )}
        {running && st ? (
          <span className="c-row__metrics tabular">
            {st.cpuPercent.toFixed(1)}% · {formatBytes(st.memUsage)}
          </span>
        ) : (
          <span className="c-row__state">{c.state}</span>
        )}
      </div>

      <div className="c-row__sub">
        <span className="c-row__image" title={c.image}>{c.image}</span>

        <div className="c-row__ports" onClick={(e) => e.stopPropagation()}>
          {(c.portBindings || []).slice(0, 2).map((p, idx) =>
            p.publicPort ? (
              <a
                key={idx}
                className="c-row__port"
                href={`http://${window.location.hostname}:${p.publicPort}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`Abrir :${p.publicPort}`}
              >
                :{p.publicPort} <IconExternal />
              </a>
            ) : null
          )}
        </div>
      </div>

      <div className="c-row__actions" onClick={(e) => e.stopPropagation()}>
        <div className="c-row__actions-left">
          <button
            className={`c-row__btn${isLogOpen ? ' is-open' : ''}`}
            type="button"
            title="Logs"
            onClick={() => openLogTab(c.id, true)}
          >
            <IconLogs /> Logs
          </button>
          <button
            className={`c-row__btn${isShellOpen ? ' is-open' : ''}`}
            type="button"
            disabled={!running}
            title={running ? 'Terminal (Shell)' : 'Container parado'}
            onClick={() => running && openTerminalTab(c.id)}
          >
            <IconShell /> Shell
          </button>
          <button
            className={`c-row__btn${isInspectOpen ? ' is-open' : ''}`}
            type="button"
            title="Inspecionar"
            onClick={() => openInspectTab(c.id, true)}
          >
            <IconInspect /> Info
          </button>
        </div>

        <div className="c-row__actions-right">
          {running ? (
            <>
              <button
                className="c-row__icon-btn"
                type="button"
                title="Parar"
                onClick={() => void executeContainerAction(c.id, 'stop')}
              >
                <IconStop />
              </button>
              <button
                className="c-row__icon-btn"
                type="button"
                title="Reiniciar"
                onClick={() => void executeContainerAction(c.id, 'restart')}
              >
                <IconRefresh />
              </button>
            </>
          ) : (
            <button
              className="c-row__icon-btn"
              type="button"
              title="Iniciar"
              onClick={() => void executeContainerAction(c.id, 'start')}
            >
              <IconPlay />
            </button>
          )}
          <button
            className="c-row__icon-btn c-row__icon-btn--danger"
            type="button"
            title="Remover"
            onClick={() => void removeContainer(c.id, c.name)}
          >
            <IconTrash />
          </button>
        </div>
      </div>
    </div>
  );
};
