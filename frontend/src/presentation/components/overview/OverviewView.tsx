import React, { useMemo } from 'react';
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
} from '../common/Icons';

const Sparkline: React.FC<{ values: number[]; max?: number; color: string }> = ({
  values,
  max,
  color,
}) => {
  const pts = values.length > 1 ? values : [0, values[0] || 0];
  const peak = Math.max(max || 1, ...pts, 0.01);
  const w = 96;
  const h = 24;
  const step = w / Math.max(1, pts.length - 1);

  const polyline = pts
    .map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (Math.min(v, peak) / peak) * (h - 4)).toFixed(1)}`)
    .join(' ');

  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polyline}
      />
    </svg>
  );
};

export const OverviewView: React.FC = () => {
  const {
    systemInfo,
    containers,
    stats,
    statsHistory,
    recentEvents,
    openLogTab,
    openTerminalTab,
    openInspectTab,
    executeContainerAction,
  } = useApp();

  const { sorted, runningCount, stoppedCount, stackCount, totalCpu, totalMem } = useMemo(() => {
    const all = [...containers.values()];
    const sortedList = [...all].sort(
      (a, b) => (a.state === 'running' ? -1 : 1) - (b.state === 'running' ? -1 : 1) || a.name.localeCompare(b.name)
    );
    const running = all.filter((c) => c.state === 'running').length;
    const stacks = new Set(all.map((c) => c.composeProject).filter(Boolean)).size;
    let cpu = 0;
    let mem = 0;
    stats.forEach((s) => {
      cpu += s.cpuPercent || 0;
      mem += s.memUsage || 0;
    });
    return {
      sorted: sortedList,
      runningCount: running,
      stoppedCount: all.length - running,
      stackCount: stacks,
      totalCpu: cpu,
      totalMem: mem,
    };
  }, [containers, stats]);

  const cpuSeries = useMemo(() => statsHistory.map((h) => h.cpu), [statsHistory]);
  const memSeries = useMemo(() => statsHistory.map((h) => h.mem), [statsHistory]);
  const memTotal = systemInfo?.memTotal || 0;
  const memPct = memTotal > 0 ? (totalMem / memTotal) * 100 : 0;

  return (
    <section className="overview">
      <div className="overview__strip">
        <div className="strip-cell">
          <span className="strip-cell__label">Containers</span>
          <div className="strip-cell__row">
            <span className="strip-cell__val tabular">{runningCount}</span>
            <span className="strip-cell__dim tabular">/ {sorted.length}</span>
          </div>
          <span className="strip-cell__meta">
            {stoppedCount === 0 ? 'todos em execução' : `${stoppedCount} parado${stoppedCount === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="strip-cell">
          <span className="strip-cell__label">CPU</span>
          <div className="strip-cell__row">
            <span className="strip-cell__val tabular">{totalCpu.toFixed(1)}%</span>
            <Sparkline values={cpuSeries} color="var(--text-secondary)" />
          </div>
          <span className="strip-cell__meta">
            {systemInfo?.cpus ? `${systemInfo.cpus} vCPUs no host` : '—'}
          </span>
        </div>

        <div className="strip-cell">
          <span className="strip-cell__label">Memória</span>
          <div className="strip-cell__row">
            <span className="strip-cell__val tabular">{formatBytes(totalMem)}</span>
            <Sparkline values={memSeries} max={memTotal || undefined} color="var(--accent-brand)" />
          </div>
          <span className="strip-cell__meta">
            {memTotal > 0 ? `${memPct.toFixed(1)}% de ${formatBytes(memTotal)}` : '—'}
          </span>
        </div>

        <div className="strip-cell">
          <span className="strip-cell__label">Ambiente</span>
          <div className="strip-cell__row">
            <span className="strip-cell__val tabular">{stackCount}</span>
            <span className="strip-cell__dim">stacks</span>
          </div>
          <span className="strip-cell__meta">
            {systemInfo ? `${systemInfo.images} imagens · ${systemInfo.os}` : '—'}
          </span>
        </div>
      </div>

      <div className="overview__body">
        <div className="overview__table-wrap">
          <div className="section-bar">
            <h2>Containers</h2>
            <span className="section-bar__count tabular">{sorted.length}</span>
          </div>

          {sorted.length === 0 ? (
            <div className="table-empty">Nenhum container encontrado neste host Docker.</div>
          ) : (
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Imagem</th>
                  <th>Estado</th>
                  <th>Portas</th>
                  <th className="num">CPU</th>
                  <th className="num">Memória</th>
                  <th className="actions-col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const running = c.state === 'running';
                  const st = stats.get(c.id);
                  const dotClass =
                    c.state === 'running'
                      ? 'c-dot--run'
                      : c.state === 'restarting' || c.state === 'paused'
                        ? 'c-dot--warn'
                        : 'c-dot--off';

                  return (
                    <tr key={c.id} onClick={() => openLogTab(c.id, true)}>
                      <td>
                        <div className="tbl-name">
                          <span className={`c-dot ${dotClass}`} />
                          <span className="tbl-name__text" title={c.name}>{c.name}</span>
                          {c.composeProject && (
                            <span className="tbl-stack">{c.composeProject}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="tbl-mono" title={c.image}>{c.image}</span>
                      </td>
                      <td>
                        <span className="tbl-status" title={c.status}>{c.status}</span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="tbl-ports">
                          {(c.portBindings || []).slice(0, 3).map((p, idx) =>
                            p.publicPort ? (
                              <a
                                key={idx}
                                className="c-row__port"
                                href={`http://${window.location.hostname}:${p.publicPort}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {p.publicPort}→{p.privatePort} <IconExternal />
                              </a>
                            ) : (
                              <span key={idx} className="tbl-port-int">
                                {p.privatePort}/{p.type}
                              </span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="num tabular">
                        {running && st ? `${st.cpuPercent.toFixed(1)}%` : '—'}
                      </td>
                      <td className="num tabular">
                        {running && st ? formatBytes(st.memUsage) : '—'}
                      </td>
                      <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                        <div className="tbl-actions">
                          <button
                            className="icon-btn icon-btn--xs"
                            type="button"
                            title="Abrir logs"
                            onClick={() => openLogTab(c.id, true)}
                          >
                            <IconLogs />
                          </button>
                          <button
                            className="icon-btn icon-btn--xs"
                            type="button"
                            disabled={!running}
                            title={running ? 'Abrir shell' : 'Container parado'}
                            onClick={() => running && openTerminalTab(c.id)}
                          >
                            <IconShell />
                          </button>
                          <button
                            className="icon-btn icon-btn--xs"
                            type="button"
                            title="Inspecionar"
                            onClick={() => openInspectTab(c.id, true)}
                          >
                            <IconInspect />
                          </button>
                          {running ? (
                            <>
                              <button
                                className="icon-btn icon-btn--xs"
                                type="button"
                                title="Reiniciar"
                                onClick={() => void executeContainerAction(c.id, 'restart')}
                              >
                                <IconRefresh />
                              </button>
                              <button
                                className="icon-btn icon-btn--xs"
                                type="button"
                                title="Parar"
                                onClick={() => void executeContainerAction(c.id, 'stop')}
                              >
                                <IconStop />
                              </button>
                            </>
                          ) : (
                            <button
                              className="icon-btn icon-btn--xs"
                              type="button"
                              title="Iniciar"
                              onClick={() => void executeContainerAction(c.id, 'start')}
                            >
                              <IconPlay />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="overview__events">
          <div className="section-bar">
            <h2>Eventos do Daemon</h2>
            <span className="section-bar__count tabular">{recentEvents.length}</span>
          </div>
          <div className="events-list">
            {recentEvents.length === 0 ? (
              <div className="events-list__empty">Nenhum evento recente.</div>
            ) : (
              recentEvents.map((ev, idx) => {
                const act = String(ev.action || '').toLowerCase();
                let mod = '';
                if (act === 'start' || act === 'unpause' || act.includes('healthy')) mod = ' is-run';
                else if (act === 'die' || act === 'kill' || act === 'destroy' || act.includes('unhealthy')) mod = ' is-err';
                else if (act === 'stop' || act === 'pause' || act === 'restart') mod = ' is-warn';

                return (
                  <div key={`${ev.ts}-${idx}`} className="ev-line">
                    <span className="ev-line__ts tabular">{ev.ts ? ev.ts.slice(11, 19) : ''}</span>
                    <span className={`ev-line__act${mod}`}>{ev.action}</span>
                    <span className="ev-line__name">{ev.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
