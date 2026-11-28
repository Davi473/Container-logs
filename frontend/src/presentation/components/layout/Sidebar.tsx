import React, { useMemo } from 'react';
import type { Container } from '../../../domain/entities/container';
import { useApp } from '../../../application/store/AppContext';
import {
  IconBox,
  IconChevron,
  IconCollapseAll,
  IconDensity,
  IconPlay,
  IconRefresh,
  IconStack,
  IconStop,
  IconTrash,
} from '../common/Icons';
import { ContainerCard } from './ContainerCard';

const STANDALONE_KEY = '__standalone__';

export const Sidebar: React.FC = () => {
  const {
    containers,
    firstLoad,
    compactSidebar,
    toggleCompactSidebar,
    toggleAllGroups,
    refreshContainers,
    containerFilter,
    stateFilter,
    setStateFilter,
    resetFilters,
    collapsedGroups,
    toggleGroup,
    executeComposeAction,
    removeComposeProject,
  } = useApp();

  const { allCount, runningCount, stoppedCount, grouped } = useMemo(() => {
    const all = [...containers.values()];
    const running = all.filter((c) => c.state === 'running').length;
    const q = containerFilter.trim().toLowerCase();

    const filtered = all
      .filter((c) => {
        if (stateFilter === 'running' && c.state !== 'running') return false;
        if (stateFilter === 'stopped' && c.state === 'running') return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.image.toLowerCase().includes(q) ||
          c.shortId.toLowerCase().includes(q) ||
          (c.composeProject && c.composeProject.toLowerCase().includes(q)) ||
          (c.composeService && c.composeService.toLowerCase().includes(q)) ||
          c.ports.some((p) => p.toLowerCase().includes(q))
        );
      })
      .sort(
        (a, b) =>
          (a.state === 'running' ? -1 : 1) - (b.state === 'running' ? -1 : 1) ||
          a.name.localeCompare(b.name)
      );

    const groups = new Map<string, Container[]>();
    filtered.forEach((c) => {
      const key = c.composeProject || STANDALONE_KEY;
      const arr = groups.get(key);
      if (arr) arr.push(c);
      else groups.set(key, [c]);
    });

    const sortedKeys = [...groups.keys()].sort((a, b) => {
      if (a === STANDALONE_KEY) return 1;
      if (b === STANDALONE_KEY) return -1;
      return a.localeCompare(b);
    });

    return {
      allCount: all.length,
      runningCount: running,
      stoppedCount: all.length - running,
      grouped: sortedKeys.map((key) => ({ key, list: groups.get(key)! })),
    };
  }, [containers, containerFilter, stateFilter]);

  const hasActiveFilter = containerFilter.trim().length > 0 || stateFilter !== 'all';

  return (
    <aside className={`manifest${compactSidebar ? ' is-compact' : ''}`}>
      <div className="manifest__top">
        <div className="manifest__head">
          <div className="manifest__head-title">
            <span>Containers</span>
            <span className="manifest__count">{allCount}</span>
          </div>
          <div className="manifest__head-tools">
            <button
              className={`icon-btn icon-btn--xs${compactSidebar ? ' btn--active' : ''}`}
              type="button"
              title={
                compactSidebar
                  ? 'Modo compacto ativo (clique para detalhado)'
                  : 'Alternar para visualização compacta'
              }
              onClick={toggleCompactSidebar}
            >
              <IconDensity />
            </button>
            <button
              className="icon-btn icon-btn--xs"
              type="button"
              title="Recolher/expandir todos os grupos"
              onClick={toggleAllGroups}
            >
              <IconCollapseAll />
            </button>
            <button
              className="icon-btn icon-btn--xs"
              type="button"
              title="Atualizar lista de containers"
              onClick={() => void refreshContainers(true)}
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        <div className="manifest__filters" role="tablist" aria-label="Filtrar por estado">
          <button
            className={`filter-chip${stateFilter === 'all' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setStateFilter('all')}
          >
            Todos <span className="filter-chip__badge">{allCount}</span>
          </button>
          <button
            className={`filter-chip${stateFilter === 'running' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setStateFilter('running')}
          >
            <span className="filter-chip__dot filter-chip__dot--run" />
            Ativos <span className="filter-chip__badge">{runningCount}</span>
          </button>
          <button
            className={`filter-chip${stateFilter === 'stopped' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setStateFilter('stopped')}
          >
            <span className="filter-chip__dot filter-chip__dot--off" />
            Parados <span className="filter-chip__badge">{stoppedCount}</span>
          </button>
        </div>
      </div>

      <div className="manifest__scroll">
        {firstLoad ? (
          <div className="crate-skeleton">
            <div className="crate-skeleton__item" />
            <div className="crate-skeleton__item" />
            <div className="crate-skeleton__item" />
            <div className="crate-skeleton__item" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="manifest__empty">
            <IconBox />
            <p>
              {hasActiveFilter
                ? 'Nenhum container corresponde aos filtros aplicados.'
                : 'Nenhum container encontrado neste host Docker.'}
            </p>
            {hasActiveFilter && (
              <button className="btn btn--sm" type="button" onClick={resetFilters}>
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="crate-list">
            {grouped.map(({ key, list }) => {
              const isStandalone = key === STANDALONE_KEY;
              const label = isStandalone ? 'Containers Isolados' : key;
              const collapsed = collapsedGroups.has(key);

              return (
                <div key={key} className="group">
                  <div className="group__header">
                    <button
                      className="group__collapse"
                      type="button"
                      onClick={() => toggleGroup(key)}
                    >
                      <span className={`group__chevron${collapsed ? ' is-collapsed' : ''}`}>
                        <IconChevron />
                      </span>
                      {isStandalone ? <IconBox /> : <IconStack />}
                      <span className="group__title">{label}</span>
                      <span className="group__count">{list.length}</span>
                    </button>

                    {!isStandalone && (
                      <div className="group__actions">
                        <button
                          className="group__action"
                          type="button"
                          title="Iniciar todo o stack"
                          onClick={(e) => {
                            e.stopPropagation();
                            void executeComposeAction(key, 'start');
                          }}
                        >
                          <IconPlay />
                        </button>
                        <button
                          className="group__action"
                          type="button"
                          title="Parar todo o stack"
                          onClick={(e) => {
                            e.stopPropagation();
                            void executeComposeAction(key, 'stop');
                          }}
                        >
                          <IconStop />
                        </button>
                        <button
                          className="group__action"
                          type="button"
                          title="Reiniciar todo o stack"
                          onClick={(e) => {
                            e.stopPropagation();
                            void executeComposeAction(key, 'restart');
                          }}
                        >
                          <IconRefresh />
                        </button>
                        <button
                          className="group__action group__action--danger"
                          type="button"
                          title="Remover todo o stack"
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeComposeProject(key);
                          }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    )}
                  </div>

                  {!collapsed && (
                    <div className="group__body">
                      {list.map((c) => (
                        <ContainerCard key={c.id} container={c} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
