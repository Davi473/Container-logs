import React from 'react';
import { useApp } from '../../../application/store/AppContext';
import { IconShell } from '../common/Icons';
import { SplitLayoutRenderer } from './SplitLayoutRenderer';

export const WorkspaceView: React.FC = () => {
  const { panels, layoutTree, setActiveView } = useApp();

  return (
    <div className="layout-root">
      {panels.size === 0 ? (
        <div className="empty-state">
          <div className="empty-state__card">
            <div className="empty-state__icon-ring">
              <IconShell />
            </div>
            <h2>Nenhuma aba aberta no Workspace</h2>
            <p className="empty-state__lead">
              Selecione um container na barra lateral ou volte para a Visão Geral para abrir logs, terminais interativos ou inspeção.
            </p>
            <div className="empty-state__cta">
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => setActiveView('overview')}
              >
                Ir para Visão Geral
              </button>
            </div>
          </div>
        </div>
      ) : (
        <SplitLayoutRenderer node={layoutTree} />
      )}
    </div>
  );
};
