import { useEffect } from 'react';
import { useApp } from '../../application/store/AppContext';

export function useGlobalShortcuts(searchInputRef: React.RefObject<HTMLInputElement | null>) {
  const {
    cmdPaletteOpen,
    setCmdPaletteOpen,
    shortcutsOpen,
    setShortcutsOpen,
    confirmRequest,
    resolveConfirm,
    toggleSidebar,
    panes,
    focusedPaneId,
    closeSessionTab,
  } = useApp();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(!cmdPaletteOpen);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const pane = panes.get(focusedPaneId);
        if (pane?.activeSessionId) closeSessionTab(pane.activeSessionId);
        return;
      }

      if (e.key === 'Escape') {
        if (confirmRequest) {
          resolveConfirm(false);
          return;
        }
        if (cmdPaletteOpen) {
          setCmdPaletteOpen(false);
          return;
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          return;
        }
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
          return;
        }
      }

      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      const typing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        active?.classList.contains('xterm-helper-textarea');
      if (typing) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(!shortcutsOpen);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    cmdPaletteOpen,
    setCmdPaletteOpen,
    shortcutsOpen,
    setShortcutsOpen,
    confirmRequest,
    resolveConfirm,
    toggleSidebar,
    panes,
    focusedPaneId,
    closeSessionTab,
    searchInputRef,
  ]);
}
