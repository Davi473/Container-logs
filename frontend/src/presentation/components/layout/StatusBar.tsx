import React from 'react';
import { useApp } from '../../../application/store/AppContext';
import { formatBytes } from '../../../domain/services/formatters';
import { IconEngine } from '../common/Icons';

export const StatusBar: React.FC = () => {
  const { systemInfo, recentEvents, panels, panes, equalizeAllSplits, closeAllTabs } = useApp();

  let logs = 0;
  let terms = 0;
  let inspects = 0;
  panels.forEach((p) => {
    if (p.type === 'log') logs++;
    else if (p.type === 'term') terms++;
    else if (p.type === 'inspect') inspects++;
  });

  const parts: string[] = [];
  if (logs) parts.push(`${logs} log${logs > 1 ? 's' : ''}`);
  if (terms) parts.push(`${terms} shell${terms > 1 ? 's' : ''}`);
  if (inspects) parts.push(`${inspects} info`);
  const sessionsText = panels.size === 0 ? '0 abas abertas' : parts.join(' · ');

  const latestEv = recentEvents[0];
  const lastEventText = latestEv
    ? `[${latestEv.ts ? latestEv.ts.slice(11, 19) : ''}] ${latestEv.name}: ${latestEv.action}`
    : 'Aguardando eventos…';

  return (
    <footer className="status-bar">
      <div className="status-bar__left">
        <span className="status-bar__item">
          <IconEngine />
          <span>
            {systemInfo
              ? `Docker ${systemInfo.serverVersion} · ${systemInfo.os} (${systemInfo.cpus} CPUs, ${formatBytes(systemInfo.memTotal)})`
              : 'Docker Engine'}
          </span>
        </span>
        <span className="status-bar__sep">·</span>
        <span className="status-bar__item status-bar__event">{lastEventText}</span>
      </div>

      <div className="status-bar__right">
        <span className="status-bar__item">{sessionsText}</span>
        {panes.size > 1 && (
          <button
            className="status-bar__btn"
            type="button"
            title="Igualar tamanho de todos os painéis divididos"
            onClick={equalizeAllSplits}
          >
            Igualar painéis
          </button>
        )}
        {panels.size > 0 && (
          <button
            className="status-bar__btn status-bar__btn--danger"
            type="button"
            title="Fechar todas as abas abertas"
            onClick={closeAllTabs}
          >
            Fechar todas
          </button>
        )}
      </div>
    </footer>
  );
};
