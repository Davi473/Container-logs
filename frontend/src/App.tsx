import React, { useRef } from 'react';
import { AppProvider, useApp, type AppDependencies } from './application/store/AppContext';
import { TopBar } from './presentation/components/layout/TopBar';
import { Sidebar } from './presentation/components/layout/Sidebar';
import { StatusBar } from './presentation/components/layout/StatusBar';
import { OverviewView } from './presentation/components/overview/OverviewView';
import { WorkspaceView } from './presentation/components/workspace/WorkspaceView';
import { CommandPalette } from './presentation/components/common/CommandPalette';
import { ConfirmModal } from './presentation/components/common/ConfirmModal';
import { ShortcutsModal } from './presentation/components/common/ShortcutsModal';
import { ToastContainer } from './presentation/components/common/ToastContainer';
import { useGlobalShortcuts } from './presentation/hooks/useGlobalShortcuts';

const ControlTowerShell: React.FC = () => {
  const {
    activeView,
    sidebarCollapsed,
    sidebarMobileOpen,
    closeMobileSidebar,
    setSidebarWidth,
  } = useApp();

  const searchInputRef = useRef<HTMLInputElement>(null);
  useGlobalShortcuts(searchInputRef);

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.classList.add('is-resizing-sidebar');

    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(ev.clientX, false);
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing-sidebar');
      setSidebarWidth(ev.clientX, true);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <>
      <TopBar searchInputRef={searchInputRef} />

      <div
        className={`deck${sidebarCollapsed ? ' sidebar-collapsed' : ''}${sidebarMobileOpen ? ' sidebar-open' : ''}`}
      >
        <Sidebar />
        <div
          className="sidebar-resizer"
          title="Arraste para ajustar a largura da barra lateral"
          onMouseDown={handleSidebarResizeStart}
        />
        {sidebarMobileOpen && (
          <button
            className="sidebar-scrim"
            type="button"
            aria-hidden="true"
            onClick={closeMobileSidebar}
          />
        )}

        <main className="terminal">
          <div style={{ display: activeView === 'overview' ? 'contents' : 'none' }}>
            <OverviewView />
          </div>
          <div style={{ display: activeView === 'workspace' ? 'contents' : 'none' }}>
            <WorkspaceView />
          </div>
        </main>
      </div>

      <StatusBar />
      <CommandPalette />
      <ConfirmModal />
      <ShortcutsModal />
      <ToastContainer />
    </>
  );
};

export const App: React.FC<{ deps: AppDependencies }> = ({ deps }) => (
  <AppProvider deps={deps}>
    <ControlTowerShell />
  </AppProvider>
);
