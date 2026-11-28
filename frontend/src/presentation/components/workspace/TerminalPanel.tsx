import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { ThemeMode } from '../../../domain/entities/workspace';
import { useApp } from '../../../application/store/AppContext';
import { IconRefresh, IconShell, IconTrash } from '../common/Icons';

function getXtermTheme(theme: ThemeMode) {
  if (theme === 'light') {
    return {
      background: '#ffffff',
      foreground: '#18181b',
      cursor: '#18181b',
      selectionBackground: 'rgba(59, 130, 246, 0.2)',
      black: '#18181b',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#ca8a04',
      blue: '#2563eb',
      magenta: '#9333ea',
      cyan: '#0891b2',
      white: '#f4f4f5',
    };
  }
  return {
    background: '#0b0b0c',
    foreground: '#e4e4e7',
    cursor: '#e4e4e7',
    selectionBackground: 'rgba(59, 130, 246, 0.3)',
    black: '#18181b',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#f4f4f5',
  };
}

interface TerminalPanelProps {
  sessionId: string;
  containerId: string;
  isActive: boolean;
  onStatusChange?: (dead: boolean) => void;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  sessionId,
  containerId,
  isActive,
  onStatusChange,
}) => {
  const { realtime, containers, theme, showToast } = useApp();
  const containerName = containers.get(containerId)?.name || containerId.slice(0, 12);

  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const closedRef = useRef(false);

  const [statusLabel, setStatusLabel] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [errorText, setErrorText] = useState('');
  const [dims, setDims] = useState('80×24');

  // Sync xterm theme
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getXtermTheme(theme);
    }
  }, [theme]);

  // Refit when panel becomes active
  useEffect(() => {
    if (isActive && fitRef.current) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
          termRef.current?.focus();
        } catch {
          // ignore
        }
      });
    }
  }, [isActive]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      theme: getXtermTheme(theme),
      cursorBlink: true,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(host);

    termRef.current = term;
    fitRef.current = fitAddon;
    closedRef.current = false;

    const dataDisp = term.onData((data) => {
      if (!closedRef.current) realtime.sendTerminalInput(sessionId, data);
    });

    const resizeDisp = term.onResize(({ cols, rows }) => {
      setDims(`${cols}×${rows}`);
      if (!closedRef.current) realtime.resizeTerminal(sessionId, cols, rows);
    });

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    });
    observer.observe(host);

    const unsubs = [
      realtime.on('term:ready', ({ sessionId: sid }) => {
        if (sid !== sessionId) return;
        setStatusLabel('ready');
        onStatusChange?.(false);
        try {
          fitAddon.fit();
        } catch {
          // ignore
        }
        term.focus();
      }),
      realtime.on('term:data', ({ sessionId: sid, data }) => {
        if (sid !== sessionId) return;
        term.write(data);
      }),
      realtime.on('term:closed', ({ sessionId: sid, error }) => {
        if (sid !== sessionId || closedRef.current) return;
        closedRef.current = true;
        onStatusChange?.(true);
        term.write(`\r\n\x1b[38;5;203m[sessão encerrada${error ? ': ' + error : ''}]\x1b[0m\r\n`);
      }),
      realtime.on('term:error', ({ sessionId: sid, message }) => {
        if (sid !== sessionId) return;
        setStatusLabel('error');
        setErrorText(message);
        onStatusChange?.(true);
        term.write(`\x1b[38;5;203mErro ao abrir shell: ${message}\x1b[0m\r\n`);
        showToast(`Erro ao abrir shell: ${message}`, 'error');
      }),
    ];

    realtime.openTerminal(containerId, sessionId);
    try {
      fitAddon.fit();
    } catch {
      // ignore
    }

    return () => {
      unsubs.forEach((u) => u());
      observer.disconnect();
      dataDisp.dispose();
      resizeDisp.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, containerId, realtime]);

  const handleRestart = () => {
    realtime.closeTerminal(sessionId);
    termRef.current?.reset();
    closedRef.current = false;
    setStatusLabel('connecting');
    setErrorText('');
    onStatusChange?.(false);
    realtime.openTerminal(containerId, sessionId);
    showToast('Sessão de terminal reiniciada.', 'info');
  };

  return (
    <div className={`panel${isActive ? ' is-active' : ''}`} data-session={sessionId} data-type="term">
      <div className="panel__bar">
        <span className="panel__title">
          <IconShell />{' '}
          {statusLabel === 'ready' ? (
            <>Shell ativo — <strong>{containerName}</strong></>
          ) : statusLabel === 'error' ? (
            <>Erro: {errorText}</>
          ) : (
            <>Conectando shell em <strong>{containerName}</strong>…</>
          )}
        </span>
        <div className="panel__controls">
          <span className="kbd-hint">{dims}</span>
          <button
            className="btn btn--sm"
            type="button"
            title="Limpar tela do terminal"
            onClick={() => termRef.current?.clear()}
          >
            <IconTrash /> Limpar
          </button>
          <button
            className="btn btn--sm"
            type="button"
            title="Reiniciar sessão do shell"
            onClick={handleRestart}
          >
            <IconRefresh /> Reconectar
          </button>
        </div>
      </div>
      <div ref={hostRef} className="panel__xterm" />
    </div>
  );
};
