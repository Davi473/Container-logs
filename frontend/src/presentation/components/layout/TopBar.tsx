import React, { useMemo } from 'react';
import { useApp } from '../../../application/store/AppContext';
import { formatBytes } from '../../../domain/services/formatters';
import {
  IconBox,
  IconClose,
  IconCommand,
  IconGrid,
  IconKeyboard,
  IconMoon,
  IconSearch,
  IconShell,
  IconSidebar,
  IconSun,
} from '../common/Icons';

interface TopBarProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export const TopBar: React.FC<TopBarProps> = ({ searchInputRef }) => {
  const {
    theme,
    toggleTheme,
    toggleSidebar,
    activeView,
    setActiveView,
    systemInfo,
    containers,
    stats,
    panels,
    containerFilter,
    setContainerFilter,
    connectionMode,
    setCmdPaletteOpen,
    setShortcutsOpen,
  } = useApp();

  const { runningCount, totalCount, totalCpu, totalMem } = useMemo(() => {
    const all = [...containers.values()];
    const running = all.filter((c) => c.state === 'running').length;
    let cpu = 0;
    let mem = 0;
    stats.forEach((s) => {
      cpu += s.cpuPercent || 0;
      mem += s.memUsage || 0;
    });
    return { runningCount: running, totalCount: all.length, totalCpu: cpu, totalMem: mem };
  }, [containers, stats]);

  const connLabel =
    connectionMode === 'live'
      ? 'online'
      : connectionMode === 'down'
        ? 'offline'
        : 'conectando';

  return (
    <header className="tower-bar">
      <div className="tower-bar__left">
        <button
          className="icon-btn tower-bar__toggle"
          type="button"
          aria-label="Alternar barra lateral"
          title="Alternar barra lateral (Ctrl+B)"
          onClick={toggleSidebar}
        >
          <IconSidebar />
        </button>

        <div className="tower-bar__brand">
          <span className="tower-bar__mark" aria-hidden="true">
            <IconBox />
          </span>
          <span className="tower-bar__name">{systemInfo?.hostname || 'docker'}</span>
          {systemInfo && (
            <span className="host-badge">v{systemInfo.serverVersion}</span>
          )}
        </div>

        <nav className="view-switcher" aria-label="Modo de visualização">
          <button
            className={`view-switcher__btn${activeView === 'overview' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setActiveView('overview')}
          >
            <IconGrid />
            <span>Resumo</span>
          </button>
          <button
            className={`view-switcher__btn${activeView === 'workspace' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setActiveView('workspace')}
          >
            <IconShell />
            <span>Workspace</span>
            {panels.size > 0 && <span className="view-switcher__badge">{panels.size}</span>}
          </button>
        </nav>
      </div>

      <div className="tower-bar__center">
        <div className="tower-bar__search">
          <IconSearch className="tower-bar__search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            value={containerFilter}
            placeholder="Filtrar containers, imagens ou portas…"
            autoComplete="off"
            onChange={(e) => setContainerFilter(e.target.value)}
          />
          {!containerFilter ? (
            <kbd className="kbd-hint" title="Pressione / para buscar">/</kbd>
          ) : (
            <button
              className="tower-bar__search-clear"
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setContainerFilter('');
                searchInputRef.current?.focus();
              }}
            >
              <IconClose />
            </button>
          )}
        </div>

        <button
          className="cmd-trigger"
          type="button"
          title="Paleta de Comandos (Ctrl+K)"
          onClick={() => setCmdPaletteOpen(true)}
        >
          <IconCommand />
          <kbd className="kbd-hint">Ctrl K</kbd>
        </button>
      </div>

      <div className="tower-bar__right">
        <div className="tower-bar__stats">
          <span className="stat-pill" title="Containers ativos">
            <span className="stat-pill__dot" />
            <strong>{runningCount}</strong>/{totalCount}
          </span>
          <span className="stat-pill stat-pill--metric" title="CPU e Memória agregados">
            <span>CPU <strong>{totalCpu.toFixed(1)}%</strong></span>
            <span className="stat-pill__sep">·</span>
            <span>RAM <strong>{formatBytes(totalMem)}</strong></span>
          </span>
        </div>

        <div className="tower-bar__actions">
          <button
            className="icon-btn"
            type="button"
            aria-label="Alternar tema"
            title="Alternar tema claro/escuro"
            onClick={toggleTheme}
          >
            {theme === 'light' ? <IconMoon /> : <IconSun />}
          </button>

          <button
            className="icon-btn"
            type="button"
            aria-label="Atalhos"
            title="Atalhos de teclado (?)"
            onClick={() => setShortcutsOpen(true)}
          >
            <IconKeyboard />
          </button>

          <div className="tower-bar__status" title={`Conexão: ${connLabel}`}>
            <span className={`status-dot status-dot--${connectionMode}`} />
            <span>{connLabel}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
