import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../../application/store/AppContext';
import {
  IconClose,
  IconEye,
  IconInspect,
  IconLogs,
  IconPlay,
  IconRefresh,
  IconSearch,
  IconShell,
  IconSplitRight,
  IconStop,
} from './Icons';

interface CommandItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  keywords: string;
  run: () => void;
}

export const CommandPalette: React.FC = () => {
  const {
    cmdPaletteOpen,
    setCmdPaletteOpen,
    containers,
    panels,
    theme,
    toggleTheme,
    openLogTab,
    openTerminalTab,
    openInspectTab,
    executeContainerAction,
    equalizeAllSplits,
    closeAllTabs,
  } = useApp();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cmdPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [cmdPaletteOpen]);

  const items = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();
    const list: CommandItem[] = [];

    const sorted = [...containers.values()].sort(
      (a, b) => (a.state === 'running' ? -1 : 1) - (b.state === 'running' ? -1 : 1) || a.name.localeCompare(b.name)
    );

    sorted.forEach((c) => {
      const stackInfo = c.composeProject ? `stack: ${c.composeProject}` : c.shortId;
      list.push({
        id: `log-${c.id}`,
        icon: <IconLogs />,
        label: `Abrir Logs: ${c.name}`,
        sub: `${c.state} · ${stackInfo}`,
        keywords: `logs log ${c.name} ${c.image} ${c.composeProject || ''}`,
        run: () => openLogTab(c.id, true),
      });
      if (c.state === 'running') {
        list.push({
          id: `shell-${c.id}`,
          icon: <IconShell />,
          label: `Abrir Terminal (Shell): ${c.name}`,
          sub: `bash/sh · ${stackInfo}`,
          keywords: `shell terminal bash exec ${c.name} ${c.composeProject || ''}`,
          run: () => openTerminalTab(c.id),
        });
      }
      list.push({
        id: `inspect-${c.id}`,
        icon: <IconInspect />,
        label: `Inspecionar Container: ${c.name}`,
        sub: `env, volumes, rede, telemetria · ${c.shortId}`,
        keywords: `inspect inspecionar env portas volumes ${c.name} ${c.image}`,
        run: () => openInspectTab(c.id, true),
      });
      if (c.state === 'running') {
        list.push({
          id: `restart-${c.id}`,
          icon: <IconRefresh />,
          label: `Reiniciar Container: ${c.name}`,
          sub: stackInfo,
          keywords: `restart reiniciar ${c.name}`,
          run: () => void executeContainerAction(c.id, 'restart'),
        });
        list.push({
          id: `stop-${c.id}`,
          icon: <IconStop />,
          label: `Parar Container: ${c.name}`,
          sub: stackInfo,
          keywords: `stop parar ${c.name}`,
          run: () => void executeContainerAction(c.id, 'stop'),
        });
      } else {
        list.push({
          id: `start-${c.id}`,
          icon: <IconPlay />,
          label: `Iniciar Container: ${c.name}`,
          sub: stackInfo,
          keywords: `start iniciar ${c.name}`,
          run: () => void executeContainerAction(c.id, 'start'),
        });
      }
    });

    list.push({
      id: 'global-theme',
      icon: <IconEye />,
      label: `Alternar Tema (${theme === 'dark' ? 'Mudar para Claro' : 'Mudar para Escuro'})`,
      sub: 'Interface',
      keywords: 'theme tema dark light claro escuro',
      run: toggleTheme,
    });
    list.push({
      id: 'global-equalize',
      icon: <IconSplitRight />,
      label: 'Igualar Tamanho dos Painéis Divididos',
      sub: 'Layout',
      keywords: 'split equalize igualar paineis',
      run: equalizeAllSplits,
    });
    if (panels.size > 0) {
      list.push({
        id: 'global-close-all',
        icon: <IconClose />,
        label: 'Fechar Todas as Abas Abertas',
        sub: `${panels.size} abas`,
        keywords: 'close all fechar todas abas',
        run: closeAllTabs,
      });
    }

    if (!q) return list.slice(0, 30);
    return list
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.keywords.toLowerCase().includes(q) ||
          item.sub.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [
    query,
    containers,
    panels.size,
    theme,
    toggleTheme,
    openLogTab,
    openTerminalTab,
    openInspectTab,
    executeContainerAction,
    equalizeAllSplits,
    closeAllTabs,
  ]);

  if (!cmdPaletteOpen) return null;

  const safeIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setCmdPaletteOpen(false);
      }}
    >
      <div className="cmd-palette" role="dialog" aria-modal="true" aria-label="Paleta de Comandos">
        <div className="cmd-palette__header">
          <IconSearch />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Digite um comando ou nome de container…"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => (i + 1) % Math.max(1, items.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) => (i - 1 + Math.max(1, items.length)) % Math.max(1, items.length));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const chosen = items[safeIndex];
                if (chosen) {
                  setCmdPaletteOpen(false);
                  chosen.run();
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setCmdPaletteOpen(false);
              }
            }}
          />
          <kbd className="kbd-hint">Esc</kbd>
        </div>
        <div className="cmd-palette__list">
          {items.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)' }}>
              Nenhum comando ou container correspondente.
            </div>
          ) : (
            items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`cmd-item${idx === safeIndex ? ' is-selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  setCmdPaletteOpen(false);
                  item.run();
                }}
              >
                <span className="cmd-item__left">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                <span className="cmd-item__sub">{item.sub}</span>
              </button>
            ))
          )}
        </div>
        <div className="cmd-palette__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> executar</span>
          <span><kbd>Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
};
