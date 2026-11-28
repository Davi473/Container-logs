import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  Container,
  ContainerAction,
  ContainerStats,
} from '../../domain/entities/container';
import type { DockerEvent, SystemInfo } from '../../domain/entities/telemetry';
import type {
  ActiveView,
  ConfirmRequest,
  ConnectionMode,
  DropZone,
  LayoutNode,
  Pane,
  PanelSession,
  SessionType,
  ThemeMode,
  ToastItem,
} from '../../domain/entities/workspace';
import type { IContainerGateway, IRealtimePort, IStoragePort } from '../../domain/ports/ports';
import {
  equalizeTreeSplits,
  firstLeafPaneId,
  removeLeafFromTree,
  splitLeafInTree,
  updateSplitSizesInTree,
} from '../../domain/services/layoutEngine';
import { ACTION_LABELS } from '../../domain/services/formatters';

export interface AppDependencies {
  gateway: IContainerGateway;
  realtime: IRealtimePort;
  storage: IStoragePort;
}

export interface AppContextValue {
  // Dependencies (ports)
  gateway: IContainerGateway;
  realtime: IRealtimePort;

  // UI & Preferences
  theme: ThemeMode;
  toggleTheme: () => void;
  sidebarWidth: number;
  setSidebarWidth: (w: number, persist?: boolean) => void;
  compactSidebar: boolean;
  toggleCompactSidebar: () => void;
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  toggleSidebar: () => void;
  closeMobileSidebar: () => void;
  activeView: ActiveView;
  setActiveView: (v: ActiveView) => void;

  // Connectivity & Data
  connectionMode: ConnectionMode;
  systemInfo: SystemInfo | null;
  recentEvents: DockerEvent[];
  containers: Map<string, Container>;
  stats: Map<string, ContainerStats>;
  statsHistory: Array<{ cpu: number; mem: number }>;
  busyContainers: Set<string>;
  firstLoad: boolean;
  refreshContainers: (notify?: boolean) => Promise<void>;

  // Filters & Groups
  containerFilter: string;
  setContainerFilter: (q: string) => void;
  stateFilter: 'all' | 'running' | 'stopped';
  setStateFilter: (f: 'all' | 'running' | 'stopped') => void;
  resetFilters: () => void;
  collapsedGroups: Set<string>;
  toggleGroup: (key: string) => void;
  toggleAllGroups: () => void;

  // Workspace Layout & Sessions
  panels: Map<string, PanelSession>;
  panes: Map<string, Pane>;
  layoutTree: LayoutNode;
  focusedPaneId: string;
  draggingSessionId: string | null;
  setDraggingSessionId: (id: string | null) => void;
  focusPane: (paneId: string) => void;
  findSession: (type: SessionType, containerId: string) => string | null;
  hasOpenPanel: (containerId: string) => boolean;
  openLogTab: (containerId: string, focusExisting?: boolean) => void;
  openTerminalTab: (containerId: string) => void;
  openInspectTab: (containerId: string, focusExisting?: boolean) => void;
  switchTab: (sessionId: string) => void;
  closeSessionTab: (sessionId: string) => void;
  closeAllTabs: () => void;
  quickSplitPane: (paneId: string, edge: 'right' | 'bottom') => void;
  handleTabDrop: (sessionId: string, targetPaneId: string, zone: DropZone) => void;
  resizeSplit: (splitId: string, sizes: [number, number]) => void;
  equalizeAllSplits: () => void;

  // Lifecycle Actions
  executeContainerAction: (id: string, action: ContainerAction) => Promise<void>;
  removeContainer: (id: string, name: string) => Promise<void>;
  executeComposeAction: (project: string, action: ContainerAction) => Promise<void>;
  removeComposeProject: (project: string) => Promise<void>;

  // Modals & Toasts
  toasts: ToastItem[];
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  confirmRequest: ConfirmRequest | null;
  resolveConfirm: (result: boolean) => void;
  cmdPaletteOpen: boolean;
  setCmdPaletteOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const STANDALONE_KEY = '__standalone__';

let sessionSeq = 0;
const nextSessionId = (prefix: SessionType) => `${prefix}-${Date.now()}-${++sessionSeq}`;

let paneSeq = 1;
const nextPaneId = () => `pane-${++paneSeq}`;

export const AppProvider: React.FC<{ deps: AppDependencies; children: React.ReactNode }> = ({
  deps,
  children,
}) => {
  const { gateway, realtime, storage } = deps;

  // Preferences
  const [theme, setTheme] = useState<ThemeMode>(() =>
    storage.getItem('ct_theme') === 'light' ? 'light' : 'dark'
  );
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    const saved = Number(storage.getItem('ct_sidebar_w'));
    return saved >= 240 && saved <= 520 ? saved : 330;
  });
  const [compactSidebar, setCompactSidebar] = useState<boolean>(
    () => storage.getItem('ct_compact') === '1'
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('overview');

  // Data
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('pending');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [recentEvents, setRecentEvents] = useState<DockerEvent[]>([]);
  const [containers, setContainers] = useState<Map<string, Container>>(() => new Map());
  const [stats, setStats] = useState<Map<string, ContainerStats>>(() => new Map());
  const [statsHistory, setStatsHistory] = useState<Array<{ cpu: number; mem: number }>>([]);
  const [busyContainers, setBusyContainers] = useState<Set<string>>(() => new Set());
  const [firstLoad, setFirstLoad] = useState(true);

  // Filters
  const [containerFilter, setContainerFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  // Workspace layout state
  const [panels, setPanels] = useState<Map<string, PanelSession>>(() => new Map());
  const [panes, setPanes] = useState<Map<string, Pane>>(() => {
    const m = new Map<string, Pane>();
    m.set('pane-1', { id: 'pane-1', sessionIds: [], activeSessionId: null });
    return m;
  });
  const [layoutTree, setLayoutTree] = useState<LayoutNode>({ type: 'leaf', paneId: 'pane-1' });
  const [focusedPaneId, setFocusedPaneId] = useState<string>('pane-1');
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);

  // UI overlays
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const confirmResolverRef = useRef<((val: boolean) => void) | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Refs for synchronous access in callbacks
  const watchRefs = useRef<Map<string, number>>(new Map());
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const layoutTreeRef = useRef(layoutTree);
  layoutTreeRef.current = layoutTree;
  const focusedPaneRef = useRef(focusedPaneId);
  focusedPaneRef.current = focusedPaneId;
  const containersRef = useRef(containers);
  containersRef.current = containers;

  // Apply theme & sidebar width CSS variables
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage.setItem('ct_theme', theme);
  }, [theme, storage]);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${sidebarWidth}px`);
  }, [sidebarWidth]);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const askConfirm = useCallback((req: ConfirmRequest): Promise<boolean> => {
    setConfirmRequest(req);
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
    });
  }, []);

  const resolveConfirm = useCallback((result: boolean) => {
    setConfirmRequest(null);
    if (confirmResolverRef.current) {
      const fn = confirmResolverRef.current;
      confirmResolverRef.current = null;
      fn(result);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setSidebarWidth = useCallback(
    (w: number, persist = false) => {
      const clamped = Math.min(520, Math.max(240, w));
      setSidebarWidthState(clamped);
      if (persist) storage.setItem('ct_sidebar_w', String(clamped));
    },
    [storage]
  );

  const toggleCompactSidebar = useCallback(() => {
    setCompactSidebar((prev) => {
      const next = !prev;
      storage.setItem('ct_compact', next ? '1' : '0');
      return next;
    });
  }, [storage]);

  const toggleSidebar = useCallback(() => {
    if (window.innerWidth <= 860) {
      setSidebarMobileOpen((p) => !p);
    } else {
      setSidebarCollapsed((p) => !p);
    }
  }, []);

  const closeMobileSidebar = useCallback(() => setSidebarMobileOpen(false), []);

  const refreshContainers = useCallback(
    async (notify = false) => {
      try {
        const list = await gateway.listContainers();
        setFirstLoad(false);
        setContainers(() => {
          const next = new Map<string, Container>();
          list.forEach((c) => next.set(c.id, c));
          return next;
        });
        if (notify) showToast('Lista de containers atualizada.', 'info');
      } catch (err) {
        setFirstLoad(false);
        showToast(err instanceof Error ? err.message : 'Falha ao carregar containers.', 'error');
      }
    },
    [gateway, showToast]
  );

  const loadSystemInfo = useCallback(async () => {
    try {
      const info = await gateway.getSystemInfo();
      setSystemInfo(info);
    } catch {
      // Daemon might be unavailable
    }
  }, [gateway]);

  // Connect WebSocket & subscribe to real-time domain events
  useEffect(() => {
    let wasEverLive = false;
    const unsubs = [
      realtime.on('connection', (mode) => {
        setConnectionMode(mode);
        if (mode === 'live') {
          if (wasEverLive) showToast('Reconectado ao servidor.', 'success');
          wasEverLive = true;
          void refreshContainers(false);
          void loadSystemInfo();
          // Re-subscribe active log streams after reconnect
          watchRefs.current.forEach((count, containerId) => {
            if (count > 0) realtime.watchLogs(containerId, 300);
          });
        } else if (mode === 'down' && wasEverLive) {
          showToast('Conexão perdida com o servidor.', 'error');
        }
      }),
      realtime.on('containers:update', (list) => {
        setFirstLoad(false);
        const liveIds = new Set(list.map((c) => c.id));
        setContainers(() => {
          const next = new Map<string, Container>();
          list.forEach((c) => next.set(c.id, c));
          return next;
        });
        setStats((prev) => {
          const next = new Map(prev);
          for (const id of next.keys()) {
            if (!liveIds.has(id)) next.delete(id);
          }
          return next;
        });
      }),
      realtime.on('containers:stats', (snapshot) => {
        let totalCpu = 0;
        let totalMem = 0;
        setStats((prev) => {
          const next = new Map(prev);
          Object.entries(snapshot).forEach(([id, s]) => next.set(id, s));
          next.forEach((s) => {
            totalCpu += s.cpuPercent || 0;
            totalMem += s.memUsage || 0;
          });
          return next;
        });
        setStatsHistory((prev) => [...prev, { cpu: totalCpu, mem: totalMem }].slice(-30));
      }),
      realtime.on('docker:event', (ev) => {
        setRecentEvents((prev) => [ev, ...prev].slice(0, 12));
      }),
    ];

    // Load initial data immediately via REST even while realtime transport connects
    void refreshContainers(false);
    void loadSystemInfo();

    realtime.connect();
    return () => {
      unsubs.forEach((u) => u());
      realtime.disconnect();
    };
  }, [realtime, refreshContainers, loadSystemInfo, showToast]);

  // Watch refcounting
  const incWatch = useCallback(
    (containerId: string) => {
      const next = (watchRefs.current.get(containerId) || 0) + 1;
      watchRefs.current.set(containerId, next);
      if (next === 1) realtime.watchLogs(containerId, 300);
    },
    [realtime]
  );

  const decWatch = useCallback(
    (containerId: string) => {
      const next = (watchRefs.current.get(containerId) || 0) - 1;
      if (next <= 0) {
        watchRefs.current.delete(containerId);
        realtime.unwatchLogs(containerId);
      } else {
        watchRefs.current.set(containerId, next);
      }
    },
    [realtime]
  );

  // Filters & Groups
  const resetFilters = useCallback(() => {
    setContainerFilter('');
    setStateFilter('all');
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAllGroups = useCallback(() => {
    const allKeys = new Set<string>();
    containersRef.current.forEach((c) => allKeys.add(c.composeProject || STANDALONE_KEY));
    setCollapsedGroups((prev) => (prev.size < allKeys.size ? allKeys : new Set()));
  }, []);

  // Workspace Helpers
  const findSession = useCallback((type: SessionType, containerId: string): string | null => {
    for (const [id, p] of panelsRef.current) {
      if (p.type === type && p.containerId === containerId) return id;
    }
    return null;
  }, []);

  const hasOpenPanel = useCallback(
    (containerId: string) => {
      for (const p of panels.values()) {
        if (p.containerId === containerId) return true;
      }
      return false;
    },
    [panels]
  );

  const switchTab = useCallback((sessionId: string) => {
    const entry = panelsRef.current.get(sessionId);
    if (!entry) return;
    setPanes((prev) => {
      const pane = prev.get(entry.paneId);
      if (!pane) return prev;
      const next = new Map(prev);
      next.set(entry.paneId, { ...pane, activeSessionId: sessionId });
      return next;
    });
    setFocusedPaneId(entry.paneId);
    setActiveView('workspace');
  }, []);

  const openSessionInPane = useCallback(
    (type: SessionType, containerId: string, explicitPaneId?: string) => {
      const sessionId = nextSessionId(type);
      const curPanes = panesRef.current;
      const targetPaneId =
        explicitPaneId && curPanes.has(explicitPaneId)
          ? explicitPaneId
          : curPanes.has(focusedPaneRef.current)
            ? focusedPaneRef.current
            : firstLeafPaneId(layoutTreeRef.current);

      const newSession: PanelSession = { id: sessionId, type, containerId, paneId: targetPaneId };

      if (type === 'log') incWatch(containerId);

      setPanels((prev) => {
        const next = new Map(prev);
        next.set(sessionId, newSession);
        return next;
      });
      setPanes((prev) => {
        const next = new Map(prev);
        const pane = next.get(targetPaneId) || {
          id: targetPaneId,
          sessionIds: [],
          activeSessionId: null,
        };
        next.set(targetPaneId, {
          ...pane,
          sessionIds: [...pane.sessionIds, sessionId],
          activeSessionId: sessionId,
        });
        return next;
      });
      setFocusedPaneId(targetPaneId);
      setActiveView('workspace');
      return sessionId;
    },
    [incWatch]
  );

  const openLogTab = useCallback(
    (containerId: string, focusExisting = true) => {
      if (focusExisting) {
        const existing = findSession('log', containerId);
        if (existing) {
          switchTab(existing);
          return;
        }
      }
      openSessionInPane('log', containerId);
    },
    [findSession, switchTab, openSessionInPane]
  );

  const openTerminalTab = useCallback(
    (containerId: string) => {
      openSessionInPane('term', containerId);
    },
    [openSessionInPane]
  );

  const openInspectTab = useCallback(
    (containerId: string, focusExisting = true) => {
      if (focusExisting) {
        const existing = findSession('inspect', containerId);
        if (existing) {
          switchTab(existing);
          return;
        }
      }
      openSessionInPane('inspect', containerId);
    },
    [findSession, switchTab, openSessionInPane]
  );

  const closeSessionTab = useCallback(
    (sessionId: string) => {
      const entry = panelsRef.current.get(sessionId);
      if (!entry) return;

      if (entry.type === 'log') decWatch(entry.containerId);
      if (entry.type === 'term') realtime.closeTerminal(sessionId);

      const nextPanels = new Map(panelsRef.current);
      nextPanels.delete(sessionId);

      const nextPanes = new Map(panesRef.current);
      let nextTree = layoutTreeRef.current;
      let nextFocused = focusedPaneRef.current;

      const pane = nextPanes.get(entry.paneId);
      if (pane) {
        const remaining = pane.sessionIds.filter((id) => id !== sessionId);
        if (remaining.length === 0 && nextPanes.size > 1) {
          nextPanes.delete(pane.id);
          const pruned = removeLeafFromTree(nextTree, pane.id);
          if (pruned) {
            nextTree = pruned;
            if (nextFocused === pane.id) {
              nextFocused = firstLeafPaneId(pruned);
            }
          }
        } else {
          nextPanes.set(pane.id, {
            ...pane,
            sessionIds: remaining,
            activeSessionId:
              pane.activeSessionId === sessionId
                ? remaining[remaining.length - 1] || null
                : pane.activeSessionId,
          });
        }
      }

      setPanels(nextPanels);
      setPanes(nextPanes);
      setLayoutTree(nextTree);
      setFocusedPaneId(nextFocused);

      if (nextPanels.size === 0) {
        setActiveView('overview');
      }
    },
    [decWatch, realtime]
  );

  const closeAllTabs = useCallback(() => {
    panelsRef.current.forEach((entry, sessionId) => {
      if (entry.type === 'log') decWatch(entry.containerId);
      if (entry.type === 'term') realtime.closeTerminal(sessionId);
    });
    const freshPaneId = nextPaneId();
    setPanels(new Map());
    setPanes(new Map([[freshPaneId, { id: freshPaneId, sessionIds: [], activeSessionId: null }]]));
    setLayoutTree({ type: 'leaf', paneId: freshPaneId });
    setFocusedPaneId(freshPaneId);
    setActiveView('overview');
  }, [decWatch, realtime]);

  const closePanelsForContainer = useCallback(
    (containerId: string) => {
      const toClose: string[] = [];
      panelsRef.current.forEach((p, id) => {
        if (p.containerId === containerId) toClose.push(id);
      });
      toClose.forEach((id) => closeSessionTab(id));
    },
    [closeSessionTab]
  );

  const handleTabDrop = useCallback(
    (sessionId: string, targetPaneId: string, zone: DropZone) => {
      const entry = panelsRef.current.get(sessionId);
      if (!entry) return;
      const sourcePaneId = entry.paneId;

      if (zone === 'center') {
        if (sourcePaneId === targetPaneId) {
          switchTab(sessionId);
          return;
        }
        const nextPanes = new Map(panesRef.current);
        let nextTree = layoutTreeRef.current;

        const src = nextPanes.get(sourcePaneId);
        const dst = nextPanes.get(targetPaneId);
        if (!src || !dst) return;

        const srcRemaining = src.sessionIds.filter((id) => id !== sessionId);
        if (srcRemaining.length === 0 && nextPanes.size > 1) {
          nextPanes.delete(sourcePaneId);
          const pruned = removeLeafFromTree(nextTree, sourcePaneId);
          if (pruned) nextTree = pruned;
        } else {
          nextPanes.set(sourcePaneId, {
            ...src,
            sessionIds: srcRemaining,
            activeSessionId:
              src.activeSessionId === sessionId
                ? srcRemaining[srcRemaining.length - 1] || null
                : src.activeSessionId,
          });
        }

        nextPanes.set(targetPaneId, {
          ...dst,
          sessionIds: [...dst.sessionIds.filter((id) => id !== sessionId), sessionId],
          activeSessionId: sessionId,
        });

        setPanels((prev) => {
          const next = new Map(prev);
          next.set(sessionId, { ...entry, paneId: targetPaneId });
          return next;
        });
        setPanes(nextPanes);
        setLayoutTree(nextTree);
        setFocusedPaneId(targetPaneId);
        return;
      }

      const srcPane = panesRef.current.get(sourcePaneId);
      if (sourcePaneId === targetPaneId && srcPane && srcPane.sessionIds.length <= 1) return;

      const newPaneId = nextPaneId();
      const nextPanes = new Map(panesRef.current);
      let nextTree = layoutTreeRef.current;

      if (srcPane) {
        const srcRemaining = srcPane.sessionIds.filter((id) => id !== sessionId);
        if (srcRemaining.length === 0 && nextPanes.size > 1) {
          nextPanes.delete(sourcePaneId);
          const pruned = removeLeafFromTree(nextTree, sourcePaneId);
          if (pruned) nextTree = pruned;
        } else {
          nextPanes.set(sourcePaneId, {
            ...srcPane,
            sessionIds: srcRemaining,
            activeSessionId:
              srcPane.activeSessionId === sessionId
                ? srcRemaining[srcRemaining.length - 1] || null
                : srcPane.activeSessionId,
          });
        }
      }

      nextPanes.set(newPaneId, {
        id: newPaneId,
        sessionIds: [sessionId],
        activeSessionId: sessionId,
      });
      nextTree = splitLeafInTree(nextTree, targetPaneId, newPaneId, zone);

      setPanels((prev) => {
        const next = new Map(prev);
        next.set(sessionId, { ...entry, paneId: newPaneId });
        return next;
      });
      setPanes(nextPanes);
      setLayoutTree(nextTree);
      setFocusedPaneId(newPaneId);
    },
    [switchTab]
  );

  const quickSplitPane = useCallback(
    (paneId: string, edge: 'right' | 'bottom') => {
      const pane = panesRef.current.get(paneId);
      if (!pane || !pane.activeSessionId) return;

      if (pane.sessionIds.length > 1) {
        handleTabDrop(pane.activeSessionId, paneId, edge);
        return;
      }

      const currentEntry = panelsRef.current.get(pane.activeSessionId);
      if (!currentEntry) return;

      const newPaneId = nextPaneId();
      const c = containersRef.current.get(currentEntry.containerId);
      const nextType: SessionType =
        currentEntry.type === 'log' && c && c.state === 'running' ? 'term' : 'inspect';
      const newSessionId = nextSessionId(nextType);

      setPanes((prev) => {
        const next = new Map(prev);
        next.set(newPaneId, {
          id: newPaneId,
          sessionIds: [newSessionId],
          activeSessionId: newSessionId,
        });
        return next;
      });
      setPanels((prev) => {
        const next = new Map(prev);
        next.set(newSessionId, {
          id: newSessionId,
          type: nextType,
          containerId: currentEntry.containerId,
          paneId: newPaneId,
        });
        return next;
      });
      setLayoutTree((prev) => splitLeafInTree(prev, paneId, newPaneId, edge));
      setFocusedPaneId(newPaneId);
    },
    [handleTabDrop]
  );

  const resizeSplit = useCallback((splitId: string, sizes: [number, number]) => {
    setLayoutTree((prev) => updateSplitSizesInTree(prev, splitId, sizes));
  }, []);

  const equalizeAllSplits = useCallback(() => {
    setLayoutTree((prev) => equalizeTreeSplits(prev));
  }, []);

  // Container & Compose Lifecycle Actions
  const executeContainerAction = useCallback(
    async (id: string, action: ContainerAction) => {
      const name = containersRef.current.get(id)?.name || id.slice(0, 12);
      setBusyContainers((prev) => new Set(prev).add(id));
      try {
        await gateway.executeAction(id, action);
        showToast(`${ACTION_LABELS[action]} executado em "${name}".`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'falha na ação';
        showToast(`Erro ao ${ACTION_LABELS[action].toLowerCase()}: ${msg}`, 'error');
      } finally {
        setBusyContainers((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [gateway, showToast]
  );

  const removeContainer = useCallback(
    async (id: string, name: string) => {
      const ok = await askConfirm({
        title: `Remover "${name}"?`,
        message: `O container "${name}" será encerrado e removido permanentemente. Essa ação não pode ser desfeita.`,
        confirmLabel: 'Remover Container',
      });
      if (!ok) return;

      setBusyContainers((prev) => new Set(prev).add(id));
      try {
        await gateway.removeContainer(id, true);
        showToast(`Container "${name}" removido.`, 'success');
        closePanelsForContainer(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'falha ao remover';
        showToast(`Erro ao remover: ${msg}`, 'error');
      } finally {
        setBusyContainers((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [askConfirm, gateway, showToast, closePanelsForContainer]
  );

  const executeComposeAction = useCallback(
    async (project: string, action: ContainerAction) => {
      showToast(`${ACTION_LABELS[action]} solicitado para o stack "${project}"…`, 'info');
      try {
        const res = await gateway.executeComposeAction(project, action);
        if (res.ok) {
          showToast(
            `${ACTION_LABELS[action]} concluído para "${project}" (${res.count} container${res.count === 1 ? '' : 's'}).`,
            'success'
          );
        } else {
          showToast(`Erro em "${project}": ${res.error || 'falha em um ou mais containers'}`, 'error');
        }
      } catch (err) {
        showToast(`Erro em "${project}": ${err instanceof Error ? err.message : 'falha'}`, 'error');
      }
    },
    [gateway, showToast]
  );

  const removeComposeProject = useCallback(
    async (project: string) => {
      const ok = await askConfirm({
        title: `Remover stack "${project}"?`,
        message: `Todos os containers pertencentes ao stack "${project}" serão forçadamente removidos. Essa ação não pode ser desfeita.`,
        confirmLabel: 'Remover Stack Completo',
      });
      if (!ok) return;

      try {
        const res = await gateway.removeComposeProject(project, true);
        if (res.ok) {
          showToast(
            `Stack "${project}" removido (${res.count} container${res.count === 1 ? '' : 's'}).`,
            'success'
          );
          containersRef.current.forEach((c) => {
            if (c.composeProject === project) closePanelsForContainer(c.id);
          });
        } else {
          showToast(`Erro ao remover stack "${project}": ${res.error || 'falha ao remover'}`, 'error');
        }
      } catch (err) {
        showToast(`Erro ao remover stack "${project}": ${err instanceof Error ? err.message : 'falha'}`, 'error');
      }
    },
    [askConfirm, gateway, showToast, closePanelsForContainer]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      gateway,
      realtime,
      theme,
      toggleTheme,
      sidebarWidth,
      setSidebarWidth,
      compactSidebar,
      toggleCompactSidebar,
      sidebarCollapsed,
      sidebarMobileOpen,
      toggleSidebar,
      closeMobileSidebar,
      activeView,
      setActiveView,
      connectionMode,
      systemInfo,
      recentEvents,
      containers,
      stats,
      statsHistory,
      busyContainers,
      firstLoad,
      refreshContainers,
      containerFilter,
      setContainerFilter,
      stateFilter,
      setStateFilter,
      resetFilters,
      collapsedGroups,
      toggleGroup,
      toggleAllGroups,
      panels,
      panes,
      layoutTree,
      focusedPaneId,
      draggingSessionId,
      setDraggingSessionId,
      focusPane: setFocusedPaneId,
      findSession,
      hasOpenPanel,
      openLogTab,
      openTerminalTab,
      openInspectTab,
      switchTab,
      closeSessionTab,
      closeAllTabs,
      quickSplitPane,
      handleTabDrop,
      resizeSplit,
      equalizeAllSplits,
      executeContainerAction,
      removeContainer,
      executeComposeAction,
      removeComposeProject,
      toasts,
      showToast,
      confirmRequest,
      resolveConfirm,
      cmdPaletteOpen,
      setCmdPaletteOpen,
      shortcutsOpen,
      setShortcutsOpen,
    }),
    [
      gateway,
      realtime,
      theme,
      toggleTheme,
      sidebarWidth,
      setSidebarWidth,
      compactSidebar,
      toggleCompactSidebar,
      sidebarCollapsed,
      sidebarMobileOpen,
      toggleSidebar,
      closeMobileSidebar,
      activeView,
      connectionMode,
      systemInfo,
      recentEvents,
      containers,
      stats,
      statsHistory,
      busyContainers,
      firstLoad,
      refreshContainers,
      containerFilter,
      stateFilter,
      resetFilters,
      collapsedGroups,
      toggleGroup,
      toggleAllGroups,
      panels,
      panes,
      layoutTree,
      focusedPaneId,
      draggingSessionId,
      findSession,
      hasOpenPanel,
      openLogTab,
      openTerminalTab,
      openInspectTab,
      switchTab,
      closeSessionTab,
      closeAllTabs,
      quickSplitPane,
      handleTabDrop,
      resizeSplit,
      equalizeAllSplits,
      executeContainerAction,
      removeContainer,
      executeComposeAction,
      removeComposeProject,
      toasts,
      showToast,
      confirmRequest,
      resolveConfirm,
      cmdPaletteOpen,
      shortcutsOpen,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
