import React, { useCallback, useEffect, useState } from 'react';
import type { ContainerDetails } from '../../../domain/entities/container';
import { useApp } from '../../../application/store/AppContext';
import { formatBytes, isSecretKey } from '../../../domain/services/formatters';
import {
  IconCopy,
  IconExternal,
  IconEye,
  IconInspect,
  IconLogs,
  IconRefresh,
  IconShell,
} from '../common/Icons';

interface InspectPanelProps {
  sessionId: string;
  containerId: string;
  isActive: boolean;
}

export const InspectPanel: React.FC<InspectPanelProps> = ({ sessionId, containerId, isActive }) => {
  const { gateway, containers, stats, openLogTab, openTerminalTab, showToast } = useApp();
  const containerName = containers.get(containerId)?.name || containerId.slice(0, 12);

  const [details, setDetails] = useState<ContainerDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [envQuery, setEnvQuery] = useState('');
  const [allSecretsRevealed, setAllSecretsRevealed] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(() => new Set());

  const fetchDetails = useCallback(
    async (notify = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await gateway.inspectContainer(containerId);
        setDetails(res);
        if (notify) showToast('Dados de inspeção atualizados.', 'info');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'desconhecido');
      } finally {
        setLoading(false);
      }
    },
    [gateway, containerId, showToast]
  );

  useEffect(() => {
    void fetchDetails(false);
  }, [fetchDetails]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copiado para a área de transferência.', 'success');
    } catch {
      // ignore
    }
  };

  const st = stats.get(containerId);
  const cpuPct = st ? st.cpuPercent : 0;
  const memPct = st ? st.memPercent : 0;

  return (
    <div className={`panel${isActive ? ' is-active' : ''}`} data-session={sessionId} data-type="inspect">
      <div className="panel__bar">
        <span className="panel__title">
          <IconInspect /> Inspeção — <strong>{containerName}</strong>
        </span>
        <div className="panel__controls">
          <button className="btn btn--sm" type="button" onClick={() => openLogTab(containerId, true)}>
            <IconLogs /> Abrir Logs
          </button>
          <button
            className="btn btn--sm"
            type="button"
            onClick={() => {
              const c = containers.get(containerId);
              if (c && c.state === 'running') openTerminalTab(containerId);
              else showToast('O container precisa estar em execução para abrir um terminal.', 'error');
            }}
          >
            <IconShell /> Abrir Shell
          </button>
          <button
            className="btn btn--sm"
            type="button"
            onClick={() => void fetchDetails(true)}
          >
            <IconRefresh /> Atualizar
          </button>
        </div>
      </div>

      <div className="inspect-view">
        {loading && !details ? (
          <div style={{ color: 'var(--text-muted)', padding: 20 }}>Carregando detalhes do container…</div>
        ) : error ? (
          <div style={{ color: 'var(--state-error)', padding: 20 }}>
            Erro ao inspecionar container: {error}
          </div>
        ) : details ? (
          <>
            <div className="inspect-grid">
              <div className="metric-card">
                <span className="metric-card__label">Uso de CPU</span>
                <span className="metric-card__value">
                  {st ? `${cpuPct.toFixed(1)}%` : details.state.running ? '0.0%' : 'Parado'}
                </span>
                <div className="metric-card__bar">
                  <div
                    className={`metric-card__bar-fill ${cpuPct > 85 ? 'is-crit' : cpuPct > 60 ? 'is-high' : ''}`}
                    style={{ width: `${Math.min(100, cpuPct)}%` }}
                  />
                </div>
                <span className="metric-card__sub">Status: {details.state.status.toUpperCase()}</span>
              </div>

              <div className="metric-card">
                <span className="metric-card__label">Memória RAM</span>
                <span className="metric-card__value">
                  {st ? `${formatBytes(st.memUsage)} / ${formatBytes(st.memLimit)}` : '—'}
                </span>
                <div className="metric-card__bar">
                  <div
                    className={`metric-card__bar-fill metric-card__bar-fill--mem ${memPct > 85 ? 'is-crit' : memPct > 65 ? 'is-high' : ''}`}
                    style={{ width: `${Math.min(100, memPct)}%` }}
                  />
                </div>
                <span className="metric-card__sub">
                  {st ? `${memPct.toFixed(1)}% utilizado` : 'Container inativo'}
                </span>
              </div>

              <div className="metric-card">
                <span className="metric-card__label">Tráfego de Rede</span>
                <span className="metric-card__value">
                  {st ? `↓ ${formatBytes(st.netRx)} · ↑ ${formatBytes(st.netTx)}` : '—'}
                </span>
                <span className="metric-card__sub">Acumulado RX / TX</span>
              </div>

              <div className="metric-card">
                <span className="metric-card__label">Processos &amp; Reinícios</span>
                <span className="metric-card__value">
                  {st ? `${st.pids} processos` : `PID ${details.state.pid || '—'}`}
                </span>
                <span className="metric-card__sub">
                  Reinícios: {details.restartCount} ({details.restartPolicy})
                </span>
              </div>
            </div>

            <div className="inspect-section">
              <div className="inspect-section__head">
                <h4>Configuração Geral &amp; Estado</h4>
                <span className="kbd-hint">{details.shortId}</span>
              </div>
              <div className="inspect-section__body">
                <div className="kv-grid">
                  <div className="kv-key">ID Completo</div>
                  <div className="kv-val">
                    <span>{details.id}</span>
                    <button className="icon-btn icon-btn--xs" type="button" title="Copiar ID" onClick={() => void copyText(details.id)}>
                      <IconCopy />
                    </button>
                  </div>
                  <div className="kv-key">Imagem</div>
                  <div className="kv-val">
                    <span>{details.image} ({details.imageId})</span>
                    <button className="icon-btn icon-btn--xs" type="button" title="Copiar imagem" onClick={() => void copyText(details.image)}>
                      <IconCopy />
                    </button>
                  </div>
                  <div className="kv-key">Comando</div>
                  <div className="kv-val">
                    {(() => {
                      const fullCmd = [...(details.entrypoint || []), ...(details.cmd || [])].join(' ') || '—';
                      return (
                        <>
                          <span>{fullCmd}</span>
                          {fullCmd !== '—' && (
                            <button className="icon-btn icon-btn--xs" type="button" title="Copiar comando" onClick={() => void copyText(fullCmd)}>
                              <IconCopy />
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="kv-key">Diretório (Workdir)</div>
                  <div className="kv-val">{details.workingDir}</div>
                  <div className="kv-key">Iniciado em</div>
                  <div className="kv-val">{details.state.startedAt || '—'}</div>
                  {details.compose.project && (
                    <>
                      <div className="kv-key">Docker Compose</div>
                      <div className="kv-val">
                        Projeto: <strong>{details.compose.project}</strong> · Serviço:{' '}
                        <strong>{details.compose.service || '—'}</strong>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="inspect-section">
              <div className="inspect-section__head">
                <h4>Portas &amp; Conectividade de Rede</h4>
              </div>
              <div className="inspect-section__body">
                <div className="kv-grid">
                  {details.ports.length > 0 ? (
                    details.ports.map((p, idx) => (
                      <React.Fragment key={`port-${idx}`}>
                        <div className="kv-key">{p.containerPort}</div>
                        <div className="kv-val">
                          {p.hostPort ? (
                            <a
                              className="crate__tag crate__tag--port"
                              href={`http://${window.location.hostname}:${p.hostPort}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {p.hostIp}:{p.hostPort} → {p.containerPort} <IconExternal />
                            </a>
                          ) : (
                            'Interna (não publicada no host)'
                          )}
                        </div>
                      </React.Fragment>
                    ))
                  ) : (
                    <>
                      <div className="kv-key">Portas</div>
                      <div className="kv-val">Nenhuma porta exposta</div>
                    </>
                  )}

                  {details.networks.length > 0 ? (
                    details.networks.map((n) => (
                      <React.Fragment key={n.name}>
                        <div className="kv-key">{n.name}</div>
                        <div className="kv-val">
                          IP: <strong>{n.ipAddress}</strong> · Gateway: {n.gateway} · MAC: {n.macAddress}
                        </div>
                      </React.Fragment>
                    ))
                  ) : (
                    <>
                      <div className="kv-key">Rede</div>
                      <div className="kv-val">Sem rede anexada</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="inspect-section">
              <div className="inspect-section__head">
                <h4>Volumes &amp; Montagens ({details.mounts.length})</h4>
              </div>
              <div className="inspect-section__body">
                <div className="kv-grid">
                  {details.mounts.length > 0 ? (
                    details.mounts.map((m, idx) => (
                      <React.Fragment key={idx}>
                        <div className="kv-key">
                          {m.type.toUpperCase()}{' '}
                          <span className={`mount-badge${m.rw ? '' : ' mount-badge--ro'}`}>
                            {m.rw ? 'RW' : 'RO'}
                          </span>
                        </div>
                        <div className="kv-val">
                          {m.source} <span style={{ color: 'var(--accent-brand-hi)' }}>→</span> {m.destination}
                        </div>
                      </React.Fragment>
                    ))
                  ) : (
                    <>
                      <div className="kv-key">Volumes</div>
                      <div className="kv-val">Nenhum volume ou bind mount</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="inspect-section">
              <div className="inspect-section__head">
                <h4>Variáveis de Ambiente ({details.env.length})</h4>
                <div className="inspect-section__head-tools">
                  {details.env.some((e) => isSecretKey(e.key)) && (
                    <button
                      className={`btn btn--sm${allSecretsRevealed ? ' btn--active' : ''}`}
                      type="button"
                      onClick={() => {
                        setAllSecretsRevealed((v) => !v);
                        setRevealedKeys(new Set());
                      }}
                    >
                      <IconEye /> {allSecretsRevealed ? 'Ocultar segredos' : 'Revelar segredos'}
                    </button>
                  )}
                  <input
                    type="text"
                    className="panel__filter"
                    value={envQuery}
                    placeholder="Filtrar variáveis…"
                    style={{ width: 180, padding: '4px 10px' }}
                    onChange={(e) => setEnvQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="inspect-section__body">
                <div className="env-list">
                  {details.env.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)' }}>Nenhuma variável de ambiente definida.</div>
                  ) : (
                    details.env
                      .filter((e) => !envQuery.trim() || e.key.toLowerCase().includes(envQuery.trim().toLowerCase()))
                      .map((e, idx) => {
                        const secret = isSecretKey(e.key);
                        const isMasked = secret && (allSecretsRevealed ? revealedKeys.has(e.key) : !revealedKeys.has(e.key));
                        return (
                          <div key={`${e.key}-${idx}`} className="env-row">
                            <span className="env-row__key" title={e.key}>{e.key}</span>
                            <span
                              className={`env-row__val${isMasked ? ' is-secret' : ''}`}
                              title={secret ? 'Clique para revelar/ocultar valor sensível' : ''}
                              onClick={() => {
                                if (!secret) return;
                                setRevealedKeys((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(e.key)) next.delete(e.key);
                                  else next.add(e.key);
                                  return next;
                                });
                              }}
                            >
                              {e.value}
                            </span>
                            <button
                              className="icon-btn icon-btn--xs"
                              type="button"
                              title="Copiar variável"
                              onClick={() => void copyText(`${e.key}=${e.value}`)}
                            >
                              <IconCopy />
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
