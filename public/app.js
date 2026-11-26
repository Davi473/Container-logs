(() => {
  const socket = io();

  const MAX_LINES = 3000;
  const STANDALONE_KEY = '__standalone__';

  const state = {
    theme: localStorage.getItem('ct_theme') || 'dark',
    sidebarWidth: Number(localStorage.getItem('ct_sidebar_w')) || 330,
    compactSidebar: localStorage.getItem('ct_compact') === '1',
    activeView: 'overview',     // 'overview' | 'workspace'
    systemInfo: null,
    recentEvents: [],
    containers: new Map(),      // id -> shaped container
    stats: new Map(),           // id -> { cpuPercent, memUsage, memLimit, memPercent, netRx, netTx, pids }
    busyContainers: new Set(),  // containerIds with lifecycle action in flight
    containerFilter: '',
    stateFilter: 'all',         // 'all' | 'running' | 'stopped'
    panels: new Map(),          // sessionId -> panel entry
    watchRefs: new Map(),       // containerId -> open log-tab count
    firstLoad: true,
    collapsedGroups: new Set(),
    panes: new Map(),           // paneId -> { id, sessionIds: [], activeSessionId, el }
    layoutTree: null,
    focusedPaneId: null,
    draggingSessionId: null,
  };

  let sessionCounter = 0;
  const newSessionId = (prefix) => `${prefix}-${Date.now()}-${++sessionCounter}`;

  let paneCounter = 0;
  function createPane() {
    const id = `pane-${++paneCounter}`;
    state.panes.set(id, { id, sessionIds: [], activeSessionId: null, el: null });
    return id;
  }

  const rootPaneId = createPane();
  state.layoutTree = { type: 'leaf', paneId: rootPaneId };
  state.focusedPaneId = rootPaneId;

  const AVATAR_PALETTE = [
    'linear-gradient(135deg,#4f46e5,#6366f1)',
    'linear-gradient(135deg,#0d9488,#2dd4bf)',
    'linear-gradient(135deg,#059669,#34d399)',
    'linear-gradient(135deg,#d97706,#fbbf24)',
    'linear-gradient(135deg,#7c3aed,#a78bfa)',
    'linear-gradient(135deg,#e11d48,#fb7185)',
  ];
  function avatarGradient(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  }

  // ---- Icons --------------------------------------------------------------
  const ICON = {
    logs: '<svg viewBox="0 0 24 24"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M8 12h8M8 16h5"/></svg>',
    shell: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l4 3-4 3M13 15h4"/></svg>',
    inspect: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z"/></svg>',
    autoscroll: '<svg viewBox="0 0 24 24"><path d="M12 4v14M6 13l6 6 6-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="1.5"/><path d="M5 15V4a1 1 0 0 1 1-1h11"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 3.9L2.7 18a1.5 1.5 0 0 0 1.3 2.2h16a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/></svg>',
    stack: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5M3 8l9 5 9-5"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    external: '<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>',
    splitRight: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></svg>',
    splitDown: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/></svg>',
    wrap: '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4"/><path d="M16 16l-2 2 2 2"/><path d="M3 18h7"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  };

  // ---- DOM references -----------------------------------------------------
  const crateList = document.getElementById('crateList');
  const crateSkeleton = document.getElementById('crateSkeleton');
  const manifestCount = document.getElementById('manifestCount');
  const manifestEmpty = document.getElementById('manifestEmpty');
  const manifestEmptyText = document.getElementById('manifestEmptyText');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const chipCountAll = document.getElementById('chipCountAll');
  const chipCountRun = document.getElementById('chipCountRun');
  const chipCountStop = document.getElementById('chipCountStop');
  const connDot = document.getElementById('connDot');
  const connLabel = document.getElementById('connLabel');
  const hostBadge = document.getElementById('hostBadge');
  const layoutRoot = document.getElementById('layoutRoot');
  const emptyState = document.getElementById('emptyState');
  const statRunning = document.getElementById('statRunning');
  const statTotalTop = document.getElementById('statTotalTop');
  const statStopped = document.getElementById('statStopped');
  const statCpu = document.getElementById('statCpu');
  const statMem = document.getElementById('statMem');
  const manifestEl = document.getElementById('manifest');
  const densityToggleBtn = document.getElementById('densityToggleBtn');
  const navOverviewBtn = document.getElementById('navOverviewBtn');
  const navWorkspaceBtn = document.getElementById('navWorkspaceBtn');
  const workspaceTabBadge = document.getElementById('workspaceTabBadge');
  const backToOverviewBtn = document.getElementById('backToOverviewBtn');
  const overviewView = document.getElementById('overviewView');
  const overviewHostSub = document.getElementById('overviewHostSub');
  const overviewFleetGrid = document.getElementById('overviewFleetGrid');
  const overviewEventsList = document.getElementById('overviewEventsList');
  const kpiRunning = document.getElementById('kpiRunning');
  const kpiTotal = document.getElementById('kpiTotal');
  const kpiRunningBar = document.getElementById('kpiRunningBar');
  const kpiRunningSub = document.getElementById('kpiRunningSub');
  const kpiCpu = document.getElementById('kpiCpu');
  const kpiCpuBar = document.getElementById('kpiCpuBar');
  const kpiCpuSub = document.getElementById('kpiCpuSub');
  const kpiMem = document.getElementById('kpiMem');
  const kpiMemBar = document.getElementById('kpiMemBar');
  const kpiMemSub = document.getElementById('kpiMemSub');
  const kpiStacks = document.getElementById('kpiStacks');
  const kpiImagesSub = document.getElementById('kpiImagesSub');
  const searchInput = document.getElementById('containerSearch');
  const searchClear = document.getElementById('searchClear');
  const searchKbdHint = document.getElementById('searchKbdHint');
  const deck = document.getElementById('deck');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarResizer = document.getElementById('sidebarResizer');
  const sidebarScrim = document.getElementById('sidebarScrim');
  const themeToggle = document.getElementById('themeToggle');
  const themeIconSun = document.getElementById('themeIconSun');
  const themeIconMoon = document.getElementById('themeIconMoon');
  const toggleAllGroupsBtn = document.getElementById('toggleAllGroupsBtn');
  const refreshContainersBtn = document.getElementById('refreshContainersBtn');
  const quickStartLogsBtn = document.getElementById('quickStartLogsBtn');
  const emptyOpenCmdBtn = document.getElementById('emptyOpenCmdBtn');
  const statusEngine = document.getElementById('statusEngine');
  const statusLastEvent = document.getElementById('statusLastEvent');
  const statusSessions = document.getElementById('statusSessions');
  const equalizeSplitsBtn = document.getElementById('equalizeSplitsBtn');
  const closeAllTabsBtn = document.getElementById('closeAllTabsBtn');
  const toastsEl = document.getElementById('toasts');

  // Modals
  const cmdPaletteBtn = document.getElementById('cmdPaletteBtn');
  const cmdModal = document.getElementById('cmdModal');
  const cmdInput = document.getElementById('cmdInput');
  const cmdList = document.getElementById('cmdList');
  const confirmModal = document.getElementById('confirmModal');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const confirmOkBtn = document.getElementById('confirmOkBtn');
  const shortcutsBtn = document.getElementById('shortcutsBtn');
  const shortcutsModal = document.getElementById('shortcutsModal');
  const shortcutsCloseBtn = document.getElementById('shortcutsCloseBtn');

  // ---- Theme System -------------------------------------------------------
  function applyTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    localStorage.setItem('ct_theme', state.theme);
    const isLight = state.theme === 'light';
    themeIconSun.hidden = isLight;
    themeIconMoon.hidden = !isLight;

    // Update all active xterm instances
    const xtermTheme = getXtermTheme();
    state.panels.forEach((entry) => {
      if (entry.type === 'term' && entry.term) {
        entry.term.options.theme = xtermTheme;
      }
    });
  }

  function getXtermTheme() {
    if (state.theme === 'light') {
      return {
        background: '#fafbfd',
        foreground: '#0f172a',
        cursor: '#4f46e5',
        selectionBackground: 'rgba(79, 70, 229, 0.2)',
        black: '#1e293b',
        red: '#e11d48',
        green: '#059669',
        yellow: '#b45309',
        blue: '#4f46e5',
        magenta: '#9333ea',
        cyan: '#0d9488',
        white: '#f1f5f9',
      };
    }
    return {
      background: '#0a0c10',
      foreground: '#e5e7eb',
      cursor: '#2dd4bf',
      selectionBackground: 'rgba(99, 102, 241, 0.34)',
      black: '#181c27',
      red: '#fb7185',
      green: '#4ade80',
      yellow: '#fbbf24',
      blue: '#818cf8',
      magenta: '#c084fc',
      cyan: '#2dd4bf',
      white: '#f4f5f7',
    };
  }

  applyTheme(state.theme);
  themeToggle.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // ---- View Switcher (Overview vs. Workspace) & Sidebar Density -----------
  function setActiveView(view) {
    state.activeView = view === 'workspace' ? 'workspace' : 'overview';
    const isOverview = state.activeView === 'overview';
    overviewView.hidden = !isOverview;
    layoutRoot.hidden = isOverview;
    navOverviewBtn.classList.toggle('is-active', isOverview);
    navWorkspaceBtn.classList.toggle('is-active', !isOverview);
    if (!isOverview) {
      requestAnimationFrame(refitVisibleTerminals);
    }
  }
  navOverviewBtn.addEventListener('click', () => setActiveView('overview'));
  navWorkspaceBtn.addEventListener('click', () => setActiveView('workspace'));
  if (backToOverviewBtn) backToOverviewBtn.addEventListener('click', () => setActiveView('overview'));
  setActiveView('overview');

  function applySidebarDensity() {
    manifestEl.classList.toggle('is-compact', state.compactSidebar);
    densityToggleBtn.classList.toggle('btn--active', state.compactSidebar);
    densityToggleBtn.title = state.compactSidebar
      ? 'Modo compacto ativo (clique para detalhado)'
      : 'Alternar para visualização compacta';
  }
  applySidebarDensity();
  densityToggleBtn.addEventListener('click', () => {
    state.compactSidebar = !state.compactSidebar;
    localStorage.setItem('ct_compact', state.compactSidebar ? '1' : '0');
    applySidebarDensity();
  });

  // ---- Sidebar Resize & Collapse ------------------------------------------
  function applySidebarWidth(w) {
    const clamped = Math.min(520, Math.max(240, w));
    state.sidebarWidth = clamped;
    document.documentElement.style.setProperty('--sidebar-w', `${clamped}px`);
  }
  applySidebarWidth(state.sidebarWidth);

  function toggleSidebar() {
    if (window.innerWidth <= 860) {
      deck.classList.toggle('sidebar-open');
    } else {
      deck.classList.toggle('sidebar-collapsed');
      setTimeout(refitVisibleTerminals, 220);
    }
  }

  sidebarToggle.addEventListener('click', toggleSidebar);
  sidebarScrim.addEventListener('click', () => deck.classList.remove('sidebar-open'));

  sidebarResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.body.classList.add('is-resizing-sidebar');
    function onMove(ev) {
      applySidebarWidth(ev.clientX);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing-sidebar');
      localStorage.setItem('ct_sidebar_w', String(state.sidebarWidth));
      refitVisibleTerminals();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // ---- Toasts -------------------------------------------------------------
  function showToast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    const iconKey = type === 'error' ? 'alert' : type === 'success' ? 'check' : 'refresh';
    el.innerHTML = `${ICON[iconKey]}<span>${escapeHtml(message)}</span>`;
    toastsEl.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 200);
    }, 3200);
  }

  // ---- Confirmation Modal -------------------------------------------------
  let confirmResolver = null;
  function askConfirm({ title = 'Confirmar ação', message = '', confirmLabel = 'Confirmar' }) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmLabel;
    confirmModal.hidden = false;
    confirmOkBtn.focus();
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }
  function closeConfirm(result) {
    confirmModal.hidden = true;
    if (confirmResolver) {
      const r = confirmResolver;
      confirmResolver = null;
      r(result);
    }
  }
  confirmCancelBtn.addEventListener('click', () => closeConfirm(false));
  confirmOkBtn.addEventListener('click', () => closeConfirm(true));
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirm(false);
  });

  // ---- Shortcuts Modal ----------------------------------------------------
  shortcutsBtn.addEventListener('click', () => { shortcutsModal.hidden = false; });
  shortcutsCloseBtn.addEventListener('click', () => { shortcutsModal.hidden = true; });
  shortcutsModal.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) shortcutsModal.hidden = true;
  });

  // ---- Search & Filter Chips ----------------------------------------------
  searchInput.addEventListener('input', (e) => {
    state.containerFilter = e.target.value.trim().toLowerCase();
    const hasFilter = state.containerFilter.length > 0;
    searchClear.hidden = !hasFilter;
    searchKbdHint.hidden = hasFilter;
    renderCrates();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.containerFilter = '';
    searchClear.hidden = true;
    searchKbdHint.hidden = false;
    renderCrates();
    searchInput.focus();
  });

  document.querySelectorAll('[data-filter-state]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.stateFilter = btn.dataset.filterState;
      document.querySelectorAll('[data-filter-state]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      renderCrates();
    });
  });

  resetFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.containerFilter = '';
    state.stateFilter = 'all';
    searchClear.hidden = true;
    searchKbdHint.hidden = false;
    document.querySelectorAll('[data-filter-state]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.filterState === 'all');
    });
    renderCrates();
  });

  toggleAllGroupsBtn.addEventListener('click', () => {
    const allKeys = new Set();
    state.containers.forEach((c) => allKeys.add(c.composeProject || STANDALONE_KEY));
    if (state.collapsedGroups.size < allKeys.size) {
      allKeys.forEach((k) => state.collapsedGroups.add(k));
    } else {
      state.collapsedGroups.clear();
    }
    renderCrates();
  });

  refreshContainersBtn.addEventListener('click', () => {
    loadContainers();
    showToast('Lista de containers atualizada.', 'info');
  });

  quickStartLogsBtn.addEventListener('click', () => {
    const firstRunning = [...state.containers.values()].find((c) => c.state === 'running') || [...state.containers.values()][0];
    if (firstRunning) {
      openLogTab(firstRunning.id);
    } else {
      showToast('Nenhum container disponível no momento.', 'info');
    }
  });

  emptyOpenCmdBtn.addEventListener('click', openCommandPalette);

  // ---- Command Palette (Ctrl+K) -------------------------------------------
  let cmdItems = [];
  let cmdSelectedIndex = 0;

  function buildCommandsList(query) {
    const q = query.trim().toLowerCase();
    const list = [];

    // Per-container commands
    const sorted = [...state.containers.values()].sort((a, b) =>
      (a.state === 'running' ? -1 : 1) - (b.state === 'running' ? -1 : 1) || a.name.localeCompare(b.name)
    );

    sorted.forEach((c) => {
      const stackInfo = c.composeProject ? `stack: ${c.composeProject}` : c.shortId;
      list.push({
        icon: ICON.logs,
        label: `Abrir Logs: ${c.name}`,
        sub: `${c.state} · ${stackInfo}`,
        keywords: `logs log ${c.name} ${c.image} ${c.composeProject || ''}`,
        run: () => {
          const existing = findSession('log', c.id);
          if (existing) switchTab(existing);
          else openLogTab(c.id);
        },
      });
      if (c.state === 'running') {
        list.push({
          icon: ICON.shell,
          label: `Abrir Terminal (Shell): ${c.name}`,
          sub: `bash/sh · ${stackInfo}`,
          keywords: `shell terminal bash exec ${c.name} ${c.composeProject || ''}`,
          run: () => openTerminalTab(c.id),
        });
      }
      list.push({
        icon: ICON.inspect,
        label: `Inspecionar Container: ${c.name}`,
        sub: `env, volumes, rede, telemetria · ${c.shortId}`,
        keywords: `inspect inspecionar env portas volumes ${c.name} ${c.image}`,
        run: () => {
          const existing = findSession('inspect', c.id);
          if (existing) switchTab(existing);
          else openInspectTab(c.id);
        },
      });
      if (c.state === 'running') {
        list.push({
          icon: ICON.refresh,
          label: `Reiniciar Container: ${c.name}`,
          sub: stackInfo,
          keywords: `restart reiniciar ${c.name}`,
          run: () => containerAction(c.id, 'restart'),
        });
        list.push({
          icon: ICON.stop,
          label: `Parar Container: ${c.name}`,
          sub: stackInfo,
          keywords: `stop parar ${c.name}`,
          run: () => containerAction(c.id, 'stop'),
        });
      } else {
        list.push({
          icon: ICON.play,
          label: `Iniciar Container: ${c.name}`,
          sub: stackInfo,
          keywords: `start iniciar ${c.name}`,
          run: () => containerAction(c.id, 'start'),
        });
      }
    });

    // Global commands
    list.push({
      icon: ICON.eye,
      label: `Alternar Tema (${state.theme === 'dark' ? 'Mudar para Claro' : 'Mudar para Escuro'})`,
      sub: 'Interface',
      keywords: 'theme tema dark light claro escuro',
      run: () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'),
    });
    list.push({
      icon: ICON.splitRight,
      label: 'Igualar Tamanho dos Painéis Divididos',
      sub: 'Layout',
      keywords: 'split equalize igualar paineis',
      run: equalizeAllSplits,
    });
    if (state.panels.size > 0) {
      list.push({
        icon: ICON.close,
        label: 'Fechar Todas as Abas Abertas',
        sub: `${state.panels.size} abas`,
        keywords: 'close all fechar todas abas',
        run: closeAllTabs,
      });
    }

    if (!q) return list.slice(0, 30);
    return list.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      item.keywords.toLowerCase().includes(q) ||
      item.sub.toLowerCase().includes(q)
    ).slice(0, 30);
  }

  function renderCommandList() {
    cmdItems = buildCommandsList(cmdInput.value);
    if (cmdSelectedIndex >= cmdItems.length) cmdSelectedIndex = Math.max(0, cmdItems.length - 1);
    cmdList.innerHTML = '';

    if (cmdItems.length === 0) {
      cmdList.innerHTML = `<div style="padding:18px;text-align:center;color:var(--text-muted);">Nenhum comando ou container correspondente.</div>`;
      return;
    }

    cmdItems.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cmd-item${idx === cmdSelectedIndex ? ' is-selected' : ''}`;
      btn.innerHTML = `
        <span class="cmd-item__left">${item.icon}<span>${escapeHtml(item.label)}</span></span>
        <span class="cmd-item__sub">${escapeHtml(item.sub)}</span>
      `;
      btn.addEventListener('mouseenter', () => {
        cmdSelectedIndex = idx;
        cmdList.querySelectorAll('.cmd-item').forEach((el, i) => el.classList.toggle('is-selected', i === idx));
      });
      btn.addEventListener('click', () => {
        closeCommandPalette();
        item.run();
      });
      cmdList.appendChild(btn);
    });
  }

  function openCommandPalette() {
    cmdModal.hidden = false;
    cmdInput.value = '';
    cmdSelectedIndex = 0;
    renderCommandList();
    cmdInput.focus();
  }

  function closeCommandPalette() {
    cmdModal.hidden = true;
  }

  cmdPaletteBtn.addEventListener('click', openCommandPalette);
  cmdModal.addEventListener('click', (e) => {
    if (e.target === cmdModal) closeCommandPalette();
  });
  cmdInput.addEventListener('input', () => {
    cmdSelectedIndex = 0;
    renderCommandList();
  });
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cmdSelectedIndex = (cmdSelectedIndex + 1) % Math.max(1, cmdItems.length);
      renderCommandList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cmdSelectedIndex = (cmdSelectedIndex - 1 + Math.max(1, cmdItems.length)) % Math.max(1, cmdItems.length);
      renderCommandList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = cmdItems[cmdSelectedIndex];
      if (chosen) {
        closeCommandPalette();
        chosen.run();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
    }
  });

  // ---- Global Keyboard Shortcuts ------------------------------------------
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (cmdModal.hidden) openCommandPalette();
      else closeCommandPalette();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      const pane = state.panes.get(state.focusedPaneId);
      if (pane && pane.activeSessionId) closeSessionTab(pane.activeSessionId);
      return;
    }

    if (e.key === 'Escape') {
      if (!confirmModal.hidden) { closeConfirm(false); return; }
      if (!cmdModal.hidden) { closeCommandPalette(); return; }
      if (!shortcutsModal.hidden) { shortcutsModal.hidden = true; return; }
      if (document.activeElement === searchInput) { searchInput.blur(); return; }
    }

    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.classList.contains('xterm-helper-textarea');
    if (typing) return;

    if (e.key === '/') {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === '?') {
      e.preventDefault();
      shortcutsModal.hidden = !shortcutsModal.hidden;
    }
  });

  // ---- Socket Lifecycle & System Info -------------------------------------
  socket.on('connect', () => {
    setConn('live');
    loadContainers();
    loadSystemInfo();
  });
  socket.on('disconnect', () => {
    setConn('down');
    showToast('Conexão perdida com o servidor.', 'error');
  });
  socket.io.on('reconnect_attempt', () => setConn('pending'));
  socket.io.on('reconnect', () => showToast('Reconectado ao servidor.', 'success'));

  function setConn(mode) {
    connDot.className = `status-dot status-dot--${mode}`;
    connLabel.textContent = mode === 'live' ? 'conectado' : mode === 'down' ? 'desconectado' : 'reconectando…';
  }

  function loadSystemInfo() {
    socket.emit('system:info', (res) => {
      if (!res || !res.ok || !res.info) return;
      const info = res.info;
      state.systemInfo = info;
      hostBadge.textContent = `${info.hostname} · v${info.serverVersion}`;
      hostBadge.hidden = false;
      overviewHostSub.textContent = `${info.hostname} · Docker ${info.serverVersion} · ${info.os}`;
      kpiCpuSub.textContent = `Host: ${info.cpus || '—'} CPUs disponíveis`;
      kpiMemSub.textContent = `Host: ${formatBytes(info.memTotal)} total`;
      kpiImagesSub.textContent = `${info.images || 0} imagens locais`;
      statusEngine.innerHTML = `
        <svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M10 12h.01"/></svg>
        <span>Docker ${escapeHtml(info.serverVersion)} · ${escapeHtml(info.os)} (${info.cpus} CPUs, ${formatBytes(info.memTotal)})</span>
      `;
    });
  }

  socket.on('docker:event', (ev) => {
    if (!ev) return;
    const time = ev.ts ? ev.ts.slice(11, 19) : '';
    statusLastEvent.textContent = `[${time}] ${ev.name}: ${ev.action}`;
    state.recentEvents.unshift({ time, name: ev.name, action: ev.action });
    if (state.recentEvents.length > 12) state.recentEvents.pop();
    renderOverviewEvents();
  });

  function renderOverviewEvents() {
    if (!overviewEventsList) return;
    if (state.recentEvents.length === 0) {
      overviewEventsList.innerHTML = '<div class="events-feed__empty">Aguardando eventos do Docker Daemon…</div>';
      return;
    }
    overviewEventsList.innerHTML = state.recentEvents.map((ev) => {
      const act = String(ev.action || '').toLowerCase();
      let badgeMod = '';
      if (act === 'start' || act === 'unpause' || act.includes('healthy')) badgeMod = ' event-row__badge--run';
      else if (act === 'die' || act === 'kill' || act === 'destroy' || act.includes('unhealthy')) badgeMod = ' event-row__badge--err';
      else if (act === 'stop' || act === 'pause' || act === 'restart') badgeMod = ' event-row__badge--warn';
      return `
        <div class="event-row">
          <span class="event-row__ts">${escapeHtml(ev.time)}</span>
          <span class="event-row__badge${badgeMod}">${escapeHtml(ev.action)}</span>
          <span class="event-row__name">${escapeHtml(ev.name)}</span>
        </div>
      `;
    }).join('');
  }

  socket.on('containers:update', (list) => {
    list.forEach((c) => state.containers.set(c.id, c));
    const liveIds = new Set(list.map((c) => c.id));
    [...state.containers.keys()].forEach((id) => {
      if (!liveIds.has(id)) {
        state.containers.delete(id);
        state.stats.delete(id);
      }
    });
    renderCrates();
    syncTabStatusDots();
  });

  socket.on('containers:stats', (statsMap) => {
    if (!statsMap) return;
    let totalCpu = 0;
    let totalMem = 0;
    Object.entries(statsMap).forEach(([id, s]) => {
      state.stats.set(id, s);
      totalCpu += s.cpuPercent || 0;
      totalMem += s.memUsage || 0;
    });
    statCpu.textContent = `${totalCpu.toFixed(1)}%`;
    statMem.textContent = formatBytes(totalMem);

    // Update Overview KPIs
    kpiCpu.textContent = `${totalCpu.toFixed(1)}%`;
    const cpuCap = (state.systemInfo?.cpus || 1) * 100;
    kpiCpuBar.style.width = `${Math.min(100, (totalCpu / cpuCap) * 100)}%`;

    kpiMem.textContent = formatBytes(totalMem);
    const memTotal = state.systemInfo?.memTotal || 0;
    if (memTotal > 0) {
      const memRatio = Math.min(100, (totalMem / memTotal) * 100);
      kpiMemBar.style.width = `${memRatio}%`;
      kpiMemSub.textContent = `${memRatio.toFixed(1)}% de ${formatBytes(memTotal)}`;
    }

    updateCrateTelemetryInPlace();
    updateInspectTelemetryInPlace();
  });

  function loadContainers() {
    socket.emit('containers:list', (res) => {
      state.firstLoad = false;
      if (res && res.ok) {
        res.containers.forEach((c) => state.containers.set(c.id, c));
        renderCrates();
      } else {
        crateSkeleton.hidden = true;
        showToast((res && res.error) || 'Falha ao carregar containers.', 'error');
      }
    });
  }

  function nameOf(id) {
    const c = state.containers.get(id);
    return c ? c.name : id.slice(0, 12);
  }

  // ---- Manifest / Container Cards -----------------------------------------
  function matchesContainerQuery(c) {
    if (state.stateFilter === 'running' && c.state !== 'running') return false;
    if (state.stateFilter === 'stopped' && c.state === 'running') return false;
    if (!state.containerFilter) return true;
    const q = state.containerFilter;
    return (
      c.name.toLowerCase().includes(q) ||
      c.image.toLowerCase().includes(q) ||
      c.shortId.toLowerCase().includes(q) ||
      (c.composeProject && c.composeProject.toLowerCase().includes(q)) ||
      (c.composeService && c.composeService.toLowerCase().includes(q)) ||
      c.ports.some((p) => p.toLowerCase().includes(q))
    );
  }

  function renderCrates() {
    if (!state.firstLoad) {
      crateSkeleton.hidden = true;
      crateList.hidden = false;
    }

    const allContainers = [...state.containers.values()];
    const runningCount = allContainers.filter((c) => c.state === 'running').length;
    const stoppedCount = allContainers.length - runningCount;

    statRunning.textContent = runningCount;
    if (statTotalTop) statTotalTop.textContent = allContainers.length;
    statStopped.textContent = stoppedCount;
    manifestCount.textContent = allContainers.length;
    chipCountAll.textContent = allContainers.length;
    chipCountRun.textContent = runningCount;
    chipCountStop.textContent = stoppedCount;

    // Sync Overview KPIs & Fleet Grid
    kpiRunning.textContent = runningCount;
    kpiTotal.textContent = allContainers.length;
    kpiRunningSub.textContent = `${stoppedCount} parado${stoppedCount === 1 ? '' : 's'}`;
    kpiRunningBar.style.width = allContainers.length > 0 ? `${(runningCount / allContainers.length) * 100}%` : '0%';
    const stackSet = new Set(allContainers.map((c) => c.composeProject).filter(Boolean));
    kpiStacks.textContent = stackSet.size;
    renderOverviewFleet(allContainers);

    const items = allContainers
      .filter(matchesContainerQuery)
      .sort((a, b) => (a.state === 'running' ? -1 : 1) - (b.state === 'running' ? -1 : 1) || a.name.localeCompare(b.name));

    const hasActiveFilter = state.containerFilter.length > 0 || state.stateFilter !== 'all';
    manifestEmpty.hidden = items.length !== 0;
    if (items.length === 0) {
      manifestEmptyText.textContent = hasActiveFilter
        ? 'Nenhum container corresponde aos filtros aplicados.'
        : 'Nenhum container encontrado neste host Docker.';
      resetFiltersBtn.hidden = !hasActiveFilter;
    }

    const groups = new Map();
    items.forEach((c) => {
      const key = c.composeProject || STANDALONE_KEY;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    });

    const sortedKeys = [...groups.keys()].sort((a, b) => {
      if (a === STANDALONE_KEY) return 1;
      if (b === STANDALONE_KEY) return -1;
      return a.localeCompare(b);
    });

    const scrollTop = crateList.parentElement ? crateList.parentElement.scrollTop : 0;
    crateList.innerHTML = '';
    sortedKeys.forEach((key) => crateList.appendChild(renderGroup(key, groups.get(key))));
    if (crateList.parentElement) crateList.parentElement.scrollTop = scrollTop;
  }

  function renderGroup(key, containers) {
    const isStandalone = key === STANDALONE_KEY;
    const label = isStandalone ? 'Containers Isolados' : key;
    const collapsed = state.collapsedGroups.has(key);

    const wrap = document.createElement('div');
    wrap.className = 'group';
    wrap.innerHTML = `
      <div class="group__header">
        <button class="group__collapse" type="button">
          <span class="group__chevron${collapsed ? ' is-collapsed' : ''}">${ICON.chevron}</span>
          ${isStandalone ? ICON.box : ICON.stack}
          <span class="group__title">${escapeHtml(label)}</span>
          <span class="group__count">${containers.length}</span>
        </button>
        ${isStandalone ? '' : `
        <div class="group__actions">
          <button class="group__action" data-compose-action="start" title="Iniciar todo o stack">${ICON.play}</button>
          <button class="group__action" data-compose-action="stop" title="Parar todo o stack">${ICON.stop}</button>
          <button class="group__action" data-compose-action="restart" title="Reiniciar todo o stack">${ICON.refresh}</button>
          <button class="group__action group__action--danger" data-compose-action="remove" title="Remover todo o stack">${ICON.trash}</button>
        </div>`}
      </div>
      <div class="group__body"${collapsed ? ' hidden' : ''}></div>
    `;

    const body = wrap.querySelector('.group__body');
    containers.forEach((c) => body.appendChild(renderCrate(c)));

    wrap.querySelector('.group__collapse').addEventListener('click', () => {
      if (state.collapsedGroups.has(key)) state.collapsedGroups.delete(key);
      else state.collapsedGroups.add(key);
      renderCrates();
    });

    if (!isStandalone) {
      wrap.querySelectorAll('[data-compose-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.composeAction;
          if (action === 'remove') composeRemove(key);
          else composeAction(key, action);
        });
      });
    }

    return wrap;
  }

  function hasOpenPanel(containerId) {
    for (const p of state.panels.values()) {
      if (p.containerId === containerId) return true;
    }
    return false;
  }

  function findSession(type, containerId) {
    for (const [sessionId, p] of state.panels) {
      if (p.type === type && p.containerId === containerId) return sessionId;
    }
    return null;
  }

  function badgeClass(cstate) {
    if (cstate === 'running') return 'crate__badge--running';
    if (cstate === 'restarting' || cstate === 'paused') return 'crate__badge--restarting';
    return 'crate__badge--off';
  }

  function renderCrate(c) {
    const el = document.createElement('div');
    const isBusy = state.busyContainers.has(c.id);
    el.className = `crate${hasOpenPanel(c.id) ? ' has-open' : ''}${isBusy ? ' is-busy' : ''}`;
    el.dataset.state = c.state;
    el.dataset.containerId = c.id;

    const running = c.state === 'running';
    const isLogOpen = !!findSession('log', c.id);
    const isShellOpen = !!findSession('term', c.id);
    const isInspectOpen = !!findSession('inspect', c.id);
    const initial = c.name.replace(/[^a-z0-9]/gi, '')[0]?.toUpperCase() || '?';
    const st = state.stats.get(c.id);

    const portsHtml = (c.portBindings || []).slice(0, 3).map((p) => {
      if (p.publicPort) {
        const href = `http://${window.location.hostname}:${p.publicPort}`;
        return `<a class="crate__tag crate__tag--port" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="Abrir ${escapeHtml(href)}">${escapeHtml(p.publicPort)}→${escapeHtml(p.privatePort)} ${ICON.external}</a>`;
      }
      return `<span class="crate__tag">${escapeHtml(p.privatePort)}/${escapeHtml(p.type)}</span>`;
    }).join('');

    const healthHtml = c.health
      ? `<span class="crate__health crate__health--${escapeHtml(c.health)}">${escapeHtml(c.health)}</span>`
      : '';

    const cpuPct = st ? st.cpuPercent : 0;
    const memPct = st ? st.memPercent : 0;
    const memLabel = st ? formatBytes(st.memUsage) : '—';

    el.innerHTML = `
      <div class="crate__top">
        <span class="crate__avatar" style="background:${avatarGradient(c.id)}">${initial}<span class="crate__led"></span></span>
        <div class="crate__heading">
          <div class="crate__name-row">
            <span class="crate__name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
          </div>
          <span class="crate__image" title="${escapeHtml(c.image)}">${escapeHtml(c.image)}</span>
        </div>
        <div class="crate__badges">
          ${healthHtml}
          <span class="crate__badge ${badgeClass(c.state)}">${escapeHtml(c.state)}</span>
        </div>
      </div>

      <div class="crate__meta">
        <span class="crate__tag" title="Container ID">${escapeHtml(c.shortId)}</span>
        ${c.composeService ? `<span class="crate__tag" title="Compose Service">${escapeHtml(c.composeService)}</span>` : ''}
        ${portsHtml}
      </div>

      ${running ? `
      <div class="crate__telemetry" data-telemetry-for="${escapeHtml(c.id)}">
        <div class="telemetry-item">
          <div class="telemetry-item__top">
            <span>CPU</span>
            <span class="telemetry-item__val" data-tel="cpu-val">${cpuPct.toFixed(1)}%</span>
          </div>
          <div class="telemetry-bar">
            <div class="telemetry-bar__fill ${cpuPct > 85 ? 'is-crit' : cpuPct > 60 ? 'is-high' : ''}" data-tel="cpu-bar" style="width:${Math.min(100, cpuPct)}%"></div>
          </div>
        </div>
        <div class="telemetry-item">
          <div class="telemetry-item__top">
            <span>RAM</span>
            <span class="telemetry-item__val" data-tel="mem-val">${memLabel}</span>
          </div>
          <div class="telemetry-bar">
            <div class="telemetry-bar__fill telemetry-bar__fill--mem ${memPct > 85 ? 'is-crit' : memPct > 65 ? 'is-high' : ''}" data-tel="mem-bar" style="width:${Math.min(100, memPct)}%"></div>
          </div>
        </div>
      </div>` : ''}

      <div class="crate__footer">
        <div class="crate__actions">
          <button class="crate__action${isLogOpen ? ' is-open' : ''}" data-action="logs" title="Abrir stream de logs">${ICON.logs} Logs</button>
          <button class="crate__action${isShellOpen ? ' is-open' : ''}" data-action="shell" ${running ? '' : 'disabled'} title="${running ? 'Abrir terminal interativo' : 'Container parado'}">${ICON.shell} Shell</button>
          <button class="crate__action${isInspectOpen ? ' is-open' : ''}" data-action="inspect" title="Inspecionar container &amp; variáveis">${ICON.inspect} Info</button>
        </div>

        <div class="crate__lifecycle">
          <span class="crate__status-text" title="${escapeHtml(c.status)}">${escapeHtml(c.status)}</span>
          <div class="crate__life-btns">
            ${running
              ? `<button class="crate__life" data-life="stop" title="Parar container">${ICON.stop} Parar</button>
                 <button class="crate__life" data-life="restart" title="Reiniciar container">${ICON.refresh} Reiniciar</button>`
              : `<button class="crate__life" data-life="start" title="Iniciar container">${ICON.play} Iniciar</button>`
            }
            <button class="crate__life crate__life--danger" data-life="remove" title="Remover container">${ICON.trash}</button>
          </div>
        </div>
      </div>
    `;

    const openOrFocusLogs = () => {
      const existing = findSession('log', c.id);
      if (existing) switchTab(existing);
      else openLogTab(c.id);
    };

    el.querySelector('.crate__top').addEventListener('click', openOrFocusLogs);
    el.querySelector('[data-action="logs"]').addEventListener('click', openOrFocusLogs);

    el.querySelector('[data-action="shell"]').addEventListener('click', () => {
      if (running) openTerminalTab(c.id);
    });

    el.querySelector('[data-action="inspect"]').addEventListener('click', () => {
      const existing = findSession('inspect', c.id);
      if (existing) switchTab(existing);
      else openInspectTab(c.id);
    });

    el.querySelectorAll('[data-life]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const life = btn.dataset.life;
        if (life === 'remove') containerRemove(c.id, c.name);
        else containerAction(c.id, life);
      });
    });

    return el;
  }

  function renderOverviewFleet(allContainers) {
    if (!overviewFleetGrid) return;
    const sorted = [...allContainers].sort(
      (a, b) => (a.state === 'running' ? -1 : 1) - (b.state === 'running' ? -1 : 1) || a.name.localeCompare(b.name)
    );
    overviewFleetGrid.innerHTML = '';
    if (sorted.length === 0) {
      overviewFleetGrid.innerHTML = '<div class="events-feed__empty">Nenhum container encontrado neste host Docker.</div>';
      return;
    }

    sorted.forEach((c) => {
      const running = c.state === 'running';
      const st = state.stats.get(c.id);
      const cpuPct = st ? st.cpuPercent : 0;
      const memPct = st ? st.memPercent : 0;
      const memLabel = st ? formatBytes(st.memUsage) : '—';
      const initial = c.name.replace(/[^a-z0-9]/gi, '')[0]?.toUpperCase() || '?';

      const portsHtml = (c.portBindings || []).slice(0, 3).map((p) => {
        if (p.publicPort) {
          const href = `http://${window.location.hostname}:${p.publicPort}`;
          return `<a class="crate__tag crate__tag--port" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${escapeHtml(p.publicPort)}→${escapeHtml(p.privatePort)} ${ICON.external}</a>`;
        }
        return `<span class="crate__tag">${escapeHtml(p.privatePort)}/${escapeHtml(p.type)}</span>`;
      }).join('');

      const card = document.createElement('div');
      card.className = 'fleet-card';
      card.innerHTML = `
        <div class="fleet-card__top">
          <span class="crate__avatar" style="background:${avatarGradient(c.id)}">${initial}<span class="crate__led" style="border-color:var(--bg-surface);background:${running ? 'var(--state-run)' : 'var(--state-off)'}"></span></span>
          <div class="fleet-card__info">
            <div class="fleet-card__name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</div>
            <div class="fleet-card__image" title="${escapeHtml(c.image)}">${escapeHtml(c.image)}</div>
          </div>
          <span class="crate__badge ${badgeClass(c.state)}">${escapeHtml(c.state)}</span>
        </div>

        <div class="fleet-card__metrics" data-telemetry-for="${escapeHtml(c.id)}">
          <div class="telemetry-item">
            <div class="telemetry-item__top">
              <span>CPU</span>
              <span class="telemetry-item__val" data-tel="cpu-val">${running ? `${cpuPct.toFixed(1)}%` : '—'}</span>
            </div>
            <div class="telemetry-bar">
              <div class="telemetry-bar__fill ${cpuPct > 85 ? 'is-crit' : cpuPct > 60 ? 'is-high' : ''}" data-tel="cpu-bar" style="width:${running ? Math.min(100, cpuPct) : 0}%"></div>
            </div>
          </div>
          <div class="telemetry-item">
            <div class="telemetry-item__top">
              <span>RAM</span>
              <span class="telemetry-item__val" data-tel="mem-val">${running ? memLabel : '—'}</span>
            </div>
            <div class="telemetry-bar">
              <div class="telemetry-bar__fill telemetry-bar__fill--mem ${memPct > 85 ? 'is-crit' : memPct > 65 ? 'is-high' : ''}" data-tel="mem-bar" style="width:${running ? Math.min(100, memPct) : 0}%"></div>
            </div>
          </div>
        </div>

        <div class="fleet-card__ports">
          ${c.composeProject ? `<span class="crate__tag">${escapeHtml(c.composeProject)}</span>` : ''}
          ${portsHtml || `<span class="crate__tag">${escapeHtml(c.status)}</span>`}
        </div>

        <div class="fleet-card__actions">
          <button class="crate__action" data-action="logs" type="button">${ICON.logs} Logs</button>
          <button class="crate__action" data-action="shell" type="button" ${running ? '' : 'disabled'}>${ICON.shell} Shell</button>
          <button class="crate__action" data-action="inspect" type="button">${ICON.inspect} Info</button>
        </div>
      `;

      const openLogs = () => {
        const existing = findSession('log', c.id);
        if (existing) switchTab(existing);
        else openLogTab(c.id);
      };
      card.addEventListener('click', openLogs);
      card.querySelector('[data-action="logs"]').addEventListener('click', (e) => { e.stopPropagation(); openLogs(); });
      card.querySelector('[data-action="shell"]').addEventListener('click', (e) => { e.stopPropagation(); if (running) openTerminalTab(c.id); });
      card.querySelector('[data-action="inspect"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const existing = findSession('inspect', c.id);
        if (existing) switchTab(existing);
        else openInspectTab(c.id);
      });

      overviewFleetGrid.appendChild(card);
    });
  }

  function updateCrateTelemetryInPlace() {
    document.querySelectorAll('[data-telemetry-for]').forEach((telEl) => {
      const id = telEl.dataset.telemetryFor;
      const st = state.stats.get(id);
      if (!st) return;
      const cpuVal = telEl.querySelector('[data-tel="cpu-val"]');
      const cpuBar = telEl.querySelector('[data-tel="cpu-bar"]');
      const memVal = telEl.querySelector('[data-tel="mem-val"]');
      const memBar = telEl.querySelector('[data-tel="mem-bar"]');

      if (cpuVal) cpuVal.textContent = `${st.cpuPercent.toFixed(1)}%`;
      if (cpuBar) {
        cpuBar.style.width = `${Math.min(100, st.cpuPercent)}%`;
        cpuBar.className = `telemetry-bar__fill ${st.cpuPercent > 85 ? 'is-crit' : st.cpuPercent > 60 ? 'is-high' : ''}`;
      }
      if (memVal) memVal.textContent = formatBytes(st.memUsage);
      if (memBar) {
        memBar.style.width = `${Math.min(100, st.memPercent)}%`;
        memBar.className = `telemetry-bar__fill telemetry-bar__fill--mem ${st.memPercent > 85 ? 'is-crit' : st.memPercent > 65 ? 'is-high' : ''}`;
      }
    });
  }

  function syncTabStatusDots() {
    state.panels.forEach((entry) => {
      const c = state.containers.get(entry.containerId);
      const dot = entry.tabEl?.querySelector('.tab-dot');
      if (!dot || !c) return;
      if (entry.type !== 'term') {
        dot.classList.toggle('tab-dot--dead', c.state !== 'running');
      }
    });
  }

  // ---- Lifecycle Actions --------------------------------------------------
  const ACTION_LABEL = {
    start: 'Iniciar',
    stop: 'Parar',
    restart: 'Reiniciar',
    pause: 'Pausar',
    unpause: 'Retomar',
    remove: 'Remover',
  };

  function containerAction(id, action) {
    state.busyContainers.add(id);
    renderCrates();
    socket.emit('container:action', { id, action }, (res) => {
      state.busyContainers.delete(id);
      renderCrates();
      if (res && res.ok) showToast(`${ACTION_LABEL[action]} executado em "${nameOf(id)}".`, 'success');
      else showToast(`Erro ao ${ACTION_LABEL[action].toLowerCase()}: ${(res && res.error) || 'falha na ação'}`, 'error');
    });
  }

  async function containerRemove(id, name) {
    const ok = await askConfirm({
      title: `Remover "${name}"?`,
      message: `O container "${name}" será encerrado e removido permanentemente. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Remover Container',
    });
    if (!ok) return;

    state.busyContainers.add(id);
    renderCrates();
    socket.emit('container:remove', { id, force: true }, (res) => {
      state.busyContainers.delete(id);
      if (res && res.ok) {
        showToast(`Container "${name}" removido.`, 'success');
        closePanelsForContainer(id);
      } else {
        renderCrates();
        showToast(`Erro ao remover: ${(res && res.error) || 'falha ao remover'}`, 'error');
      }
    });
  }

  function composeAction(project, action) {
    showToast(`${ACTION_LABEL[action]} solicitado para o stack "${project}"…`, 'info');
    socket.emit('compose:action', { project, action }, (res) => {
      if (res && res.ok) {
        showToast(`${ACTION_LABEL[action]} concluído para "${project}" (${res.count} container${res.count === 1 ? '' : 's'}).`, 'success');
      } else {
        showToast(`Erro em "${project}": ${(res && res.error) || 'falha em um ou mais containers'}`, 'error');
      }
    });
  }

  async function composeRemove(project) {
    const ok = await askConfirm({
      title: `Remover stack "${project}"?`,
      message: `Todos os containers pertencentes ao stack "${project}" serão forçadamente removidos. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Remover Stack Completo',
    });
    if (!ok) return;

    socket.emit('compose:remove', { project, force: true }, (res) => {
      if (res && res.ok) {
        showToast(`Stack "${project}" removido (${res.count} container${res.count === 1 ? '' : 's'}).`, 'success');
        [...state.containers.values()].filter((c) => c.composeProject === project).forEach((c) => closePanelsForContainer(c.id));
      } else {
        showToast(`Erro ao remover stack "${project}": ${(res && res.error) || 'falha ao remover'}`, 'error');
      }
    });
  }

  function closePanelsForContainer(containerId) {
    [...state.panels.entries()].forEach(([sessionId, p]) => {
      if (p.containerId === containerId) closeSessionTab(sessionId);
    });
  }

  function closeSessionTab(sessionId) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    if (entry.type === 'log') closeLogTab(sessionId);
    else if (entry.type === 'term') closeTerminalTab(sessionId);
    else if (entry.type === 'inspect') closeInspectTab(sessionId);
  }

  function closeAllTabs() {
    [...state.panels.keys()].forEach(closeSessionTab);
  }

  // ---- Watch Refcounting --------------------------------------------------
  function incWatch(containerId) {
    const n = (state.watchRefs.get(containerId) || 0) + 1;
    state.watchRefs.set(containerId, n);
    if (n === 1) socket.emit('watch', { containerId, tail: 300 });
  }
  function decWatch(containerId) {
    const n = (state.watchRefs.get(containerId) || 0) - 1;
    if (n <= 0) {
      state.watchRefs.delete(containerId);
      socket.emit('unwatch', containerId);
    } else {
      state.watchRefs.set(containerId, n);
    }
  }

  // =========================================================================
  // PANE / SPLIT LAYOUT ENGINE
  // =========================================================================

  function findLeaf(node, paneId, parent = null, index = null) {
    if (node.type === 'leaf') return node.paneId === paneId ? { node, parent, index } : null;
    for (let i = 0; i < node.children.length; i++) {
      const res = findLeaf(node.children[i], paneId, node, i);
      if (res) return res;
    }
    return null;
  }

  function findNodeParent(root, target, parent = null, index = null) {
    if (root === target) return { parent, index };
    if (root.type === 'split') {
      for (let i = 0; i < root.children.length; i++) {
        const res = findNodeParent(root.children[i], target, root, i);
        if (res) return res;
      }
    }
    return null;
  }

  function firstLeafPaneId(node) {
    return node.type === 'leaf' ? node.paneId : firstLeafPaneId(node.children[0]);
  }

  function assignSessionToPane(sessionId, paneId) {
    const targetPaneId = state.panes.has(paneId) ? paneId : firstLeafPaneId(state.layoutTree);
    const entry = state.panels.get(sessionId);
    entry.paneId = targetPaneId;
    const pane = state.panes.get(targetPaneId);
    if (!pane.sessionIds.includes(sessionId)) pane.sessionIds.push(sessionId);
    pane.activeSessionId = sessionId;
  }

  function removeSessionFromPane(sessionId) {
    const entry = state.panels.get(sessionId);
    if (!entry || !entry.paneId) return;
    const pane = state.panes.get(entry.paneId);
    if (!pane) return;
    pane.sessionIds = pane.sessionIds.filter((id) => id !== sessionId);
    if (pane.activeSessionId === sessionId) {
      pane.activeSessionId = pane.sessionIds[pane.sessionIds.length - 1] || null;
    }
    removePaneIfEmpty(pane.id);
  }

  function removePaneIfEmpty(paneId) {
    const pane = state.panes.get(paneId);
    if (!pane || pane.sessionIds.length > 0) return;
    if (state.panes.size === 1) return;

    const leafInfo = findLeaf(state.layoutTree, paneId);
    if (!leafInfo || !leafInfo.parent) return;

    const parentSplit = leafInfo.parent;
    const siblingIndex = leafInfo.index === 0 ? 1 : 0;
    const sibling = parentSplit.children[siblingIndex];
    const grand = findNodeParent(state.layoutTree, parentSplit);

    if (!grand || !grand.parent) {
      state.layoutTree = sibling;
    } else {
      grand.parent.children[grand.index] = sibling;
    }

    state.panes.delete(paneId);
    if (state.focusedPaneId === paneId) state.focusedPaneId = firstLeafPaneId(sibling);
  }

  function splitPane(targetPaneId, edge, sessionId) {
    const newPaneId = createPane();
    assignSessionToPane(sessionId, newPaneId);

    const found = findLeaf(state.layoutTree, targetPaneId);
    if (!found) return;

    const direction = (edge === 'left' || edge === 'right') ? 'row' : 'column';
    const newLeaf = { type: 'leaf', paneId: newPaneId };
    const oldLeaf = found.node;
    const children = (edge === 'left' || edge === 'top') ? [newLeaf, oldLeaf] : [oldLeaf, newLeaf];
    const splitNode = { type: 'split', direction, sizes: [50, 50], children };

    if (!found.parent) state.layoutTree = splitNode;
    else found.parent.children[found.index] = splitNode;

    state.focusedPaneId = newPaneId;
  }

  // Quick 1-click split from a pane's header button
  function quickSplitPane(paneId, edge) {
    const pane = state.panes.get(paneId);
    if (!pane || !pane.activeSessionId) return;

    if (pane.sessionIds.length > 1) {
      // Move active tab to the new split
      const activeId = pane.activeSessionId;
      removeSessionFromPane(activeId);
      splitPane(paneId, edge, activeId);
      renderLayout();
    } else {
      // Only 1 tab in this pane: open a complementary tab (or second log/shell) in a new split
      const currentEntry = state.panels.get(pane.activeSessionId);
      if (!currentEntry) return;
      const newPaneId = createPane();
      const found = findLeaf(state.layoutTree, paneId);
      if (!found) return;
      const direction = (edge === 'left' || edge === 'right') ? 'row' : 'column';
      const newLeaf = { type: 'leaf', paneId: newPaneId };
      const oldLeaf = found.node;
      const children = (edge === 'left' || edge === 'top') ? [newLeaf, oldLeaf] : [oldLeaf, newLeaf];
      const splitNode = { type: 'split', direction, sizes: [50, 50], children };
      if (!found.parent) state.layoutTree = splitNode;
      else found.parent.children[found.index] = splitNode;

      state.focusedPaneId = newPaneId;
      const c = state.containers.get(currentEntry.containerId);
      if (currentEntry.type === 'log' && c && c.state === 'running') {
        openTerminalTab(currentEntry.containerId);
      } else {
        openInspectTab(currentEntry.containerId);
      }
    }
  }

  function equalizeNodeSplits(node) {
    if (!node || node.type === 'leaf') return;
    node.sizes = [50, 50];
    equalizeNodeSplits(node.children[0]);
    equalizeNodeSplits(node.children[1]);
  }

  function equalizeAllSplits() {
    equalizeNodeSplits(state.layoutTree);
    renderLayout();
  }

  equalizeSplitsBtn.addEventListener('click', equalizeAllSplits);
  closeAllTabsBtn.addEventListener('click', closeAllTabs);

  function switchTab(sessionId) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    const pane = state.panes.get(entry.paneId);
    if (!pane) return;
    pane.activeSessionId = sessionId;
    state.focusedPaneId = entry.paneId;
    setActiveView('workspace');
    renderLayout();
  }

  function updateFocusedPaneVisual() {
    layoutRoot.querySelectorAll('.pane').forEach((el) => {
      el.classList.toggle('is-focused', el.dataset.pane === state.focusedPaneId);
    });
  }

  function computeZone(x, y) {
    if (x < 0.25) return 'left';
    if (x > 0.75) return 'right';
    if (y < 0.25) return 'top';
    if (y > 0.75) return 'bottom';
    return 'center';
  }

  const DROP_ZONE_LABELS = {
    left: 'Dividir à esquerda',
    right: 'Dividir à direita',
    top: 'Dividir acima',
    bottom: 'Dividir abaixo',
    center: 'Mover para este painel',
  };

  function showDropOverlay(contentEl, zone) {
    let overlay = contentEl.querySelector('.drop-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'drop-overlay';
      contentEl.appendChild(overlay);
    }
    overlay.dataset.zone = zone;
    overlay.dataset.label = DROP_ZONE_LABELS[zone] || '';
    overlay.hidden = false;
  }

  function hideDropOverlay(contentEl) {
    const overlay = contentEl.querySelector('.drop-overlay');
    if (overlay) overlay.hidden = true;
  }

  function handleDrop(sessionId, targetPaneId, zone) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    const sourcePaneId = entry.paneId;

    if (zone === 'center') {
      if (sourcePaneId === targetPaneId) { switchTab(sessionId); return; }
      removeSessionFromPane(sessionId);
      assignSessionToPane(sessionId, targetPaneId);
      state.focusedPaneId = targetPaneId;
      renderLayout();
      return;
    }

    if (sourcePaneId === targetPaneId && state.panes.get(targetPaneId).sessionIds.length === 1) return;

    removeSessionFromPane(sessionId);
    splitPane(targetPaneId, zone, sessionId);
    renderLayout();
  }

  function wireDropZones(paneEl, paneId) {
    const contentEl = paneEl.querySelector('.pane__content');
    const tabsEl = paneEl.querySelector('.pane__tabs');

    contentEl.addEventListener('dragover', (e) => {
      if (!state.draggingSessionId) return;
      e.preventDefault();
      const rect = contentEl.getBoundingClientRect();
      const zone = computeZone((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      showDropOverlay(contentEl, zone);
    });
    contentEl.addEventListener('dragleave', (e) => {
      if (e.target === contentEl || e.target.classList.contains('drop-overlay')) hideDropOverlay(contentEl);
    });
    contentEl.addEventListener('drop', (e) => {
      e.preventDefault();
      hideDropOverlay(contentEl);
      const sessionId = state.draggingSessionId;
      state.draggingSessionId = null;
      if (!sessionId) return;
      const rect = contentEl.getBoundingClientRect();
      const zone = computeZone((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      handleDrop(sessionId, paneId, zone);
    });

    tabsEl.addEventListener('dragover', (e) => { if (state.draggingSessionId) e.preventDefault(); });
    tabsEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const sessionId = state.draggingSessionId;
      state.draggingSessionId = null;
      if (sessionId) handleDrop(sessionId, paneId, 'center');
    });
  }

  function wirePaneFocus(paneEl, paneId) {
    paneEl.addEventListener('mousedown', () => {
      if (state.focusedPaneId !== paneId) {
        state.focusedPaneId = paneId;
        updateFocusedPaneVisual();
      }
    });
  }

  function refitVisibleTerminals() {
    state.panes.forEach((pane) => {
      const entry = pane.activeSessionId ? state.panels.get(pane.activeSessionId) : null;
      if (entry && entry.type === 'term' && entry.fitAddon) {
        try { entry.fitAddon.fit(); } catch (_) {}
      }
    });
  }

  function wireDividerDrag(dividerEl, splitNode) {
    dividerEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const splitEl = dividerEl.parentElement;
      const isRow = splitNode.direction === 'row';
      const rect = splitEl.getBoundingClientRect();
      const total = isRow ? rect.width : rect.height;
      const [childA, , childB] = splitEl.children;

      function onMove(ev) {
        const pos = isRow ? (ev.clientX - rect.left) : (ev.clientY - rect.top);
        const pct = Math.min(85, Math.max(15, (pos / total) * 100));
        splitNode.sizes = [pct, 100 - pct];
        childA.style.flexBasis = `${pct}%`;
        childB.style.flexBasis = `${100 - pct}%`;
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('is-resizing');
        refitVisibleTerminals();
      }
      document.body.classList.add('is-resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function buildNode(node) {
    if (node.type === 'leaf') {
      const pane = state.panes.get(node.paneId);
      const paneEl = document.createElement('div');
      paneEl.className = 'pane';
      paneEl.dataset.pane = node.paneId;

      const headerEl = document.createElement('div');
      headerEl.className = 'pane__header';

      const tabsEl = document.createElement('div');
      tabsEl.className = 'pane__tabs';

      const quickActionsEl = document.createElement('div');
      quickActionsEl.className = 'pane__quick-actions';
      quickActionsEl.innerHTML = `
        <button class="icon-btn icon-btn--xs" data-pane-split="right" title="Dividir painel à direita">${ICON.splitRight}</button>
        <button class="icon-btn icon-btn--xs" data-pane-split="bottom" title="Dividir painel abaixo">${ICON.splitDown}</button>
      `;
      quickActionsEl.querySelectorAll('[data-pane-split]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          quickSplitPane(node.paneId, btn.dataset.paneSplit);
        });
      });

      headerEl.appendChild(tabsEl);
      headerEl.appendChild(quickActionsEl);

      const contentEl = document.createElement('div');
      contentEl.className = 'pane__content';

      paneEl.appendChild(headerEl);
      paneEl.appendChild(contentEl);

      pane.el = { paneEl, tabsEl, contentEl };
      wireDropZones(paneEl, node.paneId);
      wirePaneFocus(paneEl, node.paneId);
      return paneEl;
    }

    const splitEl = document.createElement('div');
    splitEl.className = `split split--${node.direction}`;
    const sizes = node.sizes || [50, 50];

    const childA = buildNode(node.children[0]);
    const childB = buildNode(node.children[1]);
    childA.classList.add('split__child');
    childB.classList.add('split__child');
    childA.style.flexBasis = `${sizes[0]}%`;
    childB.style.flexBasis = `${sizes[1]}%`;

    const divider = document.createElement('div');
    divider.className = `split__divider split__divider--${node.direction}`;
    wireDividerDrag(divider, node);

    splitEl.appendChild(childA);
    splitEl.appendChild(divider);
    splitEl.appendChild(childB);
    return splitEl;
  }

  function updateStatusBarSessions() {
    const total = state.panels.size;
    let logs = 0;
    let terms = 0;
    let inspects = 0;
    state.panels.forEach((p) => {
      if (p.type === 'log') logs++;
      else if (p.type === 'term') terms++;
      else if (p.type === 'inspect') inspects++;
    });

    const parts = [];
    if (logs) parts.push(`${logs} log${logs > 1 ? 's' : ''}`);
    if (terms) parts.push(`${terms} shell${terms > 1 ? 's' : ''}`);
    if (inspects) parts.push(`${inspects} info`);
    statusSessions.textContent = total === 0 ? '0 abas abertas' : parts.join(' · ');

    equalizeSplitsBtn.hidden = state.panes.size <= 1;
    closeAllTabsBtn.hidden = total === 0;
    if (workspaceTabBadge) {
      workspaceTabBadge.textContent = String(total);
      workspaceTabBadge.hidden = total === 0;
    }
  }

  function renderLayout() {
    state.panels.forEach((entry) => {
      if (entry.tabEl.parentElement) entry.tabEl.remove();
      if (entry.panelEl.parentElement) entry.panelEl.remove();
    });

    layoutRoot.innerHTML = '';
    updateStatusBarSessions();

    if (state.panels.size === 0) {
      layoutRoot.appendChild(emptyState);
      emptyState.classList.remove('is-hidden');
      setActiveView('overview');
      return;
    }

    layoutRoot.appendChild(buildNode(state.layoutTree));

    state.panes.forEach((pane) => {
      if (!pane.el) return;
      pane.sessionIds.forEach((sessionId) => {
        const entry = state.panels.get(sessionId);
        pane.el.tabsEl.appendChild(entry.tabEl);
        pane.el.contentEl.appendChild(entry.panelEl);
        const isActive = sessionId === pane.activeSessionId;
        entry.tabEl.classList.toggle('is-active', isActive);
        entry.panelEl.classList.toggle('is-active', isActive);
      });
    });

    updateFocusedPaneVisual();
    requestAnimationFrame(refitVisibleTerminals);
  }

  function createSessionTabElement(sessionId, type, label, onClose) {
    const tabEl = document.createElement('button');
    tabEl.type = 'button';
    tabEl.className = 'view-tab';
    tabEl.dataset.session = sessionId;
    tabEl.dataset.type = type;
    tabEl.draggable = true;
    const icon = type === 'log' ? ICON.logs : type === 'term' ? ICON.shell : ICON.inspect;
    const prefix = type === 'inspect' ? 'info: ' : '';
    tabEl.innerHTML = `
      <span class="tab-dot"></span>
      ${icon}
      <span>${escapeHtml(prefix + label)}</span>
      <span class="view-tab__close" title="Fechar aba (Alt+W)">${ICON.close}</span>
    `;
    tabEl.addEventListener('click', (e) => {
      if (e.target.closest('.view-tab__close')) {
        e.stopPropagation();
        onClose();
      } else {
        switchTab(sessionId);
      }
    });
    tabEl.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        onClose();
      }
    });
    tabEl.addEventListener('dragstart', (e) => {
      state.draggingSessionId = sessionId;
      e.dataTransfer.effectAllowed = 'move';
      tabEl.classList.add('is-dragging');
    });
    tabEl.addEventListener('dragend', () => {
      tabEl.classList.remove('is-dragging');
      state.draggingSessionId = null;
      layoutRoot.querySelectorAll('.drop-overlay').forEach((o) => { o.hidden = true; });
    });
    return tabEl;
  }

  // =========================================================================
  // LOG STREAM TABS (WITH ANSI PARSER, REGEX, LEVEL PILLS & JUMP-TO-BOTTOM)
  // =========================================================================

  function openLogTab(containerId) {
    const sessionId = newSessionId('log');
    const name = nameOf(containerId);
    const tabEl = createSessionTabElement(sessionId, 'log', name, () => closeLogTab(sessionId));

    const panelEl = document.createElement('div');
    panelEl.className = 'panel';
    panelEl.dataset.session = sessionId;
    panelEl.dataset.type = 'log';
    panelEl.innerHTML = `
      <div class="panel__bar">
        <span class="panel__title">${ICON.logs} <strong>${escapeHtml(name)}</strong></span>

        <div class="panel__levels" role="group" aria-label="Filtrar nível de log">
          <button class="level-pill is-active" data-level="all" type="button">Todos</button>
          <button class="level-pill" data-level="error" type="button">Erros <span class="level-pill__count" data-count="error"></span></button>
          <button class="level-pill" data-level="warn" type="button">Avisos <span class="level-pill__count" data-count="warn"></span></button>
          <button class="level-pill" data-level="stderr" type="button">stderr <span class="level-pill__count" data-count="stderr"></span></button>
        </div>

        <div class="panel__controls">
          <div class="panel__filter-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input class="panel__filter" type="text" placeholder="Buscar nos logs…" autocomplete="off" />
            <div class="panel__filter-meta">
              <span class="panel__match-count" data-role="match-count"></span>
              <button class="regex-btn" data-act="regex" type="button" title="Usar Expressão Regular (Regex)">.*</button>
            </div>
          </div>

          <span class="panel__sep" aria-hidden="true"></span>
          <button data-act="wrap" class="btn btn--sm btn--active" type="button" title="Alternar quebra de linha automática">${ICON.wrap} Wrap</button>
          <button data-act="timestamps" class="btn btn--sm btn--active" type="button" title="Mostrar/ocultar timestamps">${ICON.clock} Hora</button>
          <span class="panel__sep" aria-hidden="true"></span>
          <button data-act="pause" class="btn btn--sm" type="button" title="Pausar/retomar recebimento">${ICON.pause} Pausar</button>
          <button data-act="autoscroll" class="btn btn--sm btn--active" type="button" title="Rolagem automática">${ICON.autoscroll} Auto</button>
          <button data-act="copy" class="btn btn--sm" type="button" title="Copiar logs filtrados">${ICON.copy}</button>
          <button data-act="download" class="btn btn--sm" type="button" title="Baixar arquivo .log">${ICON.download} .log</button>
          <button data-act="clear" class="btn btn--sm btn--danger" type="button" title="Limpar buffer de logs">${ICON.trash}</button>
        </div>
      </div>
      <div class="panel__logview"></div>
      <button class="log-jump-btn" data-act="jump-bottom" type="button" hidden>
        ${ICON.autoscroll} <span>Ir para o fim</span>
      </button>
    `;

    const logViewEl = panelEl.querySelector('.panel__logview');
    const jumpBtn = panelEl.querySelector('[data-act="jump-bottom"]');
    const matchCountEl = panelEl.querySelector('[data-role="match-count"]');

    const entry = {
      type: 'log',
      containerId,
      tabEl,
      panelEl,
      paneId: null,
      logViewEl,
      jumpBtn,
      matchCountEl,
      countEls: {
        error: panelEl.querySelector('[data-count="error"]'),
        warn: panelEl.querySelector('[data-count="warn"]'),
        stderr: panelEl.querySelector('[data-count="stderr"]'),
      },
      counts: { error: 0, warn: 0, stderr: 0 },
      buffer: [],
      lineSeq: 0,
      paused: false,
      pausedMissed: 0,
      autoscroll: true,
      wrap: true,
      showTimestamps: true,
      levelFilter: 'all',
      filterText: '',
      useRegex: false,
    };
    state.panels.set(sessionId, entry);

    // Level pills
    panelEl.querySelectorAll('[data-level]').forEach((btn) => {
      btn.addEventListener('click', () => {
        entry.levelFilter = btn.dataset.level;
        panelEl.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('is-active', b === btn));
        rerenderLogSession(sessionId);
      });
    });

    // Search & Regex
    const filterInput = panelEl.querySelector('.panel__filter');
    const regexBtn = panelEl.querySelector('[data-act="regex"]');
    filterInput.addEventListener('input', (e) => {
      entry.filterText = e.target.value;
      rerenderLogSession(sessionId);
    });
    regexBtn.addEventListener('click', () => {
      entry.useRegex = !entry.useRegex;
      regexBtn.classList.toggle('is-active', entry.useRegex);
      rerenderLogSession(sessionId);
    });

    // Wrap & Timestamps toggles
    const btnWrap = panelEl.querySelector('[data-act="wrap"]');
    btnWrap.addEventListener('click', () => {
      entry.wrap = !entry.wrap;
      btnWrap.classList.toggle('btn--active', entry.wrap);
      logViewEl.classList.toggle('is-nowrap', !entry.wrap);
    });

    const btnTs = panelEl.querySelector('[data-act="timestamps"]');
    btnTs.addEventListener('click', () => {
      entry.showTimestamps = !entry.showTimestamps;
      btnTs.classList.toggle('btn--active', entry.showTimestamps);
      logViewEl.classList.toggle('hide-ts', !entry.showTimestamps);
    });

    // Pause & Autoscroll
    const btnPause = panelEl.querySelector('[data-act="pause"]');
    btnPause.addEventListener('click', () => {
      entry.paused = !entry.paused;
      btnPause.classList.toggle('btn--warn-active', entry.paused);
      if (!entry.paused) {
        entry.pausedMissed = 0;
        btnPause.innerHTML = `${ICON.pause} Pausar`;
        rerenderLogSession(sessionId);
      } else {
        btnPause.innerHTML = `${ICON.play} Retomar`;
      }
    });

    const btnAuto = panelEl.querySelector('[data-act="autoscroll"]');
    function setAutoscroll(val) {
      entry.autoscroll = val;
      btnAuto.classList.toggle('btn--active', val);
      jumpBtn.hidden = val;
      if (val) logViewEl.scrollTop = logViewEl.scrollHeight;
    }
    btnAuto.addEventListener('click', () => setAutoscroll(!entry.autoscroll));
    jumpBtn.addEventListener('click', () => setAutoscroll(true));

    logViewEl.addEventListener('scroll', () => {
      const distanceFromBottom = logViewEl.scrollHeight - logViewEl.scrollTop - logViewEl.clientHeight;
      if (distanceFromBottom > 48 && entry.autoscroll) {
        entry.autoscroll = false;
        btnAuto.classList.remove('btn--active');
        jumpBtn.hidden = false;
      } else if (distanceFromBottom <= 12 && !entry.autoscroll) {
        setAutoscroll(true);
      }
    });

    // Clear, Copy, Download
    panelEl.querySelector('[data-act="clear"]').addEventListener('click', () => {
      entry.buffer = [];
      entry.lineSeq = 0;
      entry.counts = { error: 0, warn: 0, stderr: 0 };
      syncLogLevelCounts(entry);
      entry.logViewEl.innerHTML = '';
      entry.matchCountEl.textContent = '';
    });

    panelEl.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      const visible = entry.buffer.filter((l) => matchesLogFilter(entry, l));
      const text = visible.map((l) => `${l.ts} ${l.stream === 'stderr' ? '[ERR] ' : ''}${stripAnsi(l.text)}`).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${visible.length} linhas copiadas para a área de transferência.`, 'success');
      } catch (_) {
        showToast('Não foi possível copiar (permissão do navegador).', 'error');
      }
    });

    panelEl.querySelector('[data-act="download"]').addEventListener('click', () => {
      const text = entry.buffer.map((l) => `${l.ts} ${l.stream === 'stderr' ? 'ERR ' : ''}${stripAnsi(l.text)}`).join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Download do arquivo .log iniciado.', 'success');
    });

    incWatch(containerId);
    assignSessionToPane(sessionId, state.focusedPaneId);
    setActiveView('workspace');
    renderLayout();
    renderCrates();
  }

  function closeLogTab(sessionId) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    decWatch(entry.containerId);
    removeSessionFromPane(sessionId);
    state.panels.delete(sessionId);
    entry.tabEl.remove();
    entry.panelEl.remove();
    renderLayout();
    renderCrates();
  }

  function syncLogLevelCounts(entry) {
    if (!entry.countEls) return;
    entry.countEls.error.textContent = entry.counts.error > 0 ? String(entry.counts.error) : '';
    entry.countEls.warn.textContent = entry.counts.warn > 0 ? String(entry.counts.warn) : '';
    entry.countEls.stderr.textContent = entry.counts.stderr > 0 ? String(entry.counts.stderr) : '';
  }

  socket.on('log:line', (line) => {
    state.panels.forEach((entry, sessionId) => {
      if (entry.type !== 'log' || entry.containerId !== line.containerId) return;
      const enriched = {
        ...line,
        num: ++entry.lineSeq,
        cleanText: stripAnsi(line.text),
        level: detectLevel(line.text, line.stream),
      };
      entry.buffer.push(enriched);
      if (enriched.level === 'error') entry.counts.error++;
      if (enriched.level === 'warn') entry.counts.warn++;
      if (enriched.stream === 'stderr') entry.counts.stderr++;

      if (entry.buffer.length > MAX_LINES) {
        const dropped = entry.buffer.shift();
        if (dropped.level === 'error') entry.counts.error = Math.max(0, entry.counts.error - 1);
        if (dropped.level === 'warn') entry.counts.warn = Math.max(0, entry.counts.warn - 1);
        if (dropped.stream === 'stderr') entry.counts.stderr = Math.max(0, entry.counts.stderr - 1);
      }
      syncLogLevelCounts(entry);

      if (entry.paused) {
        entry.pausedMissed++;
        const btnPause = entry.panelEl.querySelector('[data-act="pause"]');
        if (btnPause) btnPause.innerHTML = `${ICON.play} Retomar (${entry.pausedMissed})`;
      } else {
        appendLineToSession(sessionId, enriched);
      }
    });
  });

  socket.on('log:error', ({ containerId, message }) => {
    state.panels.forEach((entry, sessionId) => {
      if (entry.type === 'log' && entry.containerId === containerId) {
        appendSystemLine(sessionId, `Erro ao ler logs: ${message}`);
      }
    });
  });

  function stripAnsi(str) {
    return String(str).replace(/\x1b\[[0-9;]*m/g, '');
  }

  function detectLevel(text, stream) {
    const t = stripAnsi(text).toLowerCase();
    if (/\b(error|err|fatal|exception|panic|crit|critical)\b/.test(t)) return 'error';
    if (/\b(warn|warning)\b/.test(t)) return 'warn';
    if (stream === 'stderr') return 'stderr';
    return 'info';
  }

  function matchesLogFilter(entry, line) {
    if (entry.levelFilter === 'error' && line.level !== 'error') return false;
    if (entry.levelFilter === 'warn' && line.level !== 'warn') return false;
    if (entry.levelFilter === 'stderr' && line.stream !== 'stderr') return false;

    if (!entry.filterText) return true;
    const target = line.cleanText || stripAnsi(line.text);
    if (entry.useRegex) {
      try {
        return new RegExp(entry.filterText, 'i').test(target);
      } catch (_) {
        return target.toLowerCase().includes(entry.filterText.toLowerCase());
      }
    }
    return target.toLowerCase().includes(entry.filterText.toLowerCase());
  }

  // Convert basic ANSI SGR color sequences into safe HTML spans + search highlight
  const ANSI_CODE_MAP = {
    '1': 'ansi-bold',
    '2': 'ansi-dim',
    '31': 'ansi-fg-red',
    '91': 'ansi-fg-red',
    '32': 'ansi-fg-green',
    '92': 'ansi-fg-green',
    '33': 'ansi-fg-yellow',
    '93': 'ansi-fg-yellow',
    '34': 'ansi-fg-blue',
    '94': 'ansi-fg-blue',
    '35': 'ansi-fg-magenta',
    '95': 'ansi-fg-magenta',
    '36': 'ansi-fg-cyan',
    '96': 'ansi-fg-cyan',
    '90': 'ansi-fg-gray',
  };

  function renderAnsiAndHighlight(rawText, filterText, useRegex) {
    const parts = String(rawText).split(/(\x1b\[[0-9;]*m)/g);
    let activeClasses = [];
    let html = '';

    for (const part of parts) {
      if (!part) continue;
      const m = part.match(/^\x1b\[([0-9;]*)m$/);
      if (m) {
        const codes = m[1] ? m[1].split(';') : ['0'];
        for (const c of codes) {
          if (c === '0' || c === '39' || c === '22') activeClasses = [];
          else if (ANSI_CODE_MAP[c]) activeClasses.push(ANSI_CODE_MAP[c]);
        }
        continue;
      }

      let safeChunk = escapeHtml(part);
      if (filterText) {
        try {
          const pattern = useRegex
            ? filterText
            : filterText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (pattern) {
            safeChunk = safeChunk.replace(new RegExp(`(${pattern})`, 'ig'), '<mark>$1</mark>');
          }
        } catch (_) {}
      }

      if (activeClasses.length > 0) {
        html += `<span class="${activeClasses.join(' ')}">${safeChunk}</span>`;
      } else {
        html += safeChunk;
      }
    }
    return html;
  }

  function buildLineEl(line, entry) {
    const el = document.createElement('div');
    const lvl = line.level === 'error' || line.level === 'warn' ? ` log-line--${line.level}` : '';
    el.className = `log-line${line.stream === 'stderr' ? ' log-line--stderr' : ''}${lvl}`;
    const time = line.ts ? line.ts.slice(11, 19) : '';
    el.innerHTML = `
      <span class="log-line__num">${line.num || ''}</span>
      <span class="log-line__ts">${escapeHtml(time)}</span>
      <span class="log-line__text">${renderAnsiAndHighlight(line.text, entry.filterText, entry.useRegex)}</span>
      <button class="log-line__copy" type="button" title="Copiar linha">${ICON.copy}</button>
    `;
    el.querySelector('.log-line__copy').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(line.cleanText || stripAnsi(line.text));
        showToast('Linha copiada.', 'success');
      } catch (_) {}
    });
    return el;
  }

  function appendLineToSession(sessionId, line) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    if (!matchesLogFilter(entry, line)) return;
    entry.logViewEl.appendChild(buildLineEl(line, entry));
    while (entry.logViewEl.children.length > MAX_LINES) {
      entry.logViewEl.removeChild(entry.logViewEl.firstChild);
    }
    if (entry.filterText) {
      entry.matchCountEl.textContent = `${entry.logViewEl.children.length}`;
    }
    if (entry.autoscroll) {
      entry.logViewEl.scrollTop = entry.logViewEl.scrollHeight;
    }
  }

  function appendSystemLine(sessionId, text) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    const el = document.createElement('div');
    el.className = 'log-line log-line--system';
    el.innerHTML = `<span class="log-line__num"></span><span class="log-line__ts"></span><span class="log-line__text">${escapeHtml(text)}</span>`;
    entry.logViewEl.appendChild(el);
    if (entry.autoscroll) entry.logViewEl.scrollTop = entry.logViewEl.scrollHeight;
  }

  function rerenderLogSession(sessionId) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    entry.logViewEl.innerHTML = '';
    const matched = entry.buffer.filter((l) => matchesLogFilter(entry, l)).slice(-MAX_LINES);
    const frag = document.createDocumentFragment();
    matched.forEach((l) => frag.appendChild(buildLineEl(l, entry)));
    entry.logViewEl.appendChild(frag);
    entry.matchCountEl.textContent = entry.filterText ? `${matched.length}` : '';
    if (entry.autoscroll) entry.logViewEl.scrollTop = entry.logViewEl.scrollHeight;
  }

  // =========================================================================
  // INTERACTIVE TERMINAL TABS (xterm.js + ResizeObserver)
  // =========================================================================

  function createXterm() {
    const term = new Terminal({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      theme: getXtermTheme(),
      cursorBlink: true,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    return { term, fitAddon };
  }

  function openTerminalTab(containerId) {
    const sessionId = newSessionId('term');
    const name = nameOf(containerId);
    const tabEl = createSessionTabElement(sessionId, 'term', name, () => closeTerminalTab(sessionId));

    const panelEl = document.createElement('div');
    panelEl.className = 'panel';
    panelEl.dataset.session = sessionId;
    panelEl.dataset.type = 'term';
    panelEl.innerHTML = `
      <div class="panel__bar">
        <span class="panel__title">${ICON.shell} Conectando shell em <strong>${escapeHtml(name)}</strong>…</span>
        <div class="panel__controls">
          <span class="kbd-hint" data-role="term-dims">80×24</span>
          <button data-act="clear" class="btn btn--sm" type="button" title="Limpar tela do terminal">${ICON.trash} Limpar</button>
          <button data-act="restart" class="btn btn--sm" type="button" title="Reiniciar sessão do shell">${ICON.refresh} Reconectar</button>
        </div>
      </div>
      <div class="panel__xterm"></div>
    `;

    const xtermHost = panelEl.querySelector('.panel__xterm');
    const dimsBadge = panelEl.querySelector('[data-role="term-dims"]');
    const { term, fitAddon } = createXterm();
    term.open(xtermHost);

    const resizeObserver = new ResizeObserver(() => {
      if (panelEl.classList.contains('is-active')) {
        try { fitAddon.fit(); } catch (_) {}
      }
    });
    resizeObserver.observe(xtermHost);

    const entry = {
      type: 'term',
      term,
      fitAddon,
      resizeObserver,
      containerId,
      tabEl,
      panelEl,
      paneId: null,
      closed: false,
    };
    state.panels.set(sessionId, entry);

    term.onData((data) => {
      if (!entry.closed) socket.emit('term:input', { sessionId, data });
    });
    term.onResize(({ cols, rows }) => {
      dimsBadge.textContent = `${cols}×${rows}`;
      if (!entry.closed) socket.emit('term:resize', { sessionId, cols, rows });
    });

    panelEl.querySelector('[data-act="clear"]').addEventListener('click', () => term.clear());
    panelEl.querySelector('[data-act="restart"]').addEventListener('click', () => restartTerminal(sessionId));

    socket.emit('term:open', { containerId, sessionId });

    assignSessionToPane(sessionId, state.focusedPaneId);
    setActiveView('workspace');
    renderLayout();
    try { fitAddon.fit(); } catch (_) {}
    renderCrates();
  }

  function restartTerminal(sessionId) {
    const entry = state.panels.get(sessionId);
    if (!entry || entry.type !== 'term') return;
    socket.emit('term:close', sessionId);
    entry.term.reset();
    entry.closed = false;
    entry.tabEl.querySelector('.tab-dot').classList.remove('tab-dot--dead');
    entry.panelEl.querySelector('.panel__title').innerHTML = `${ICON.shell} Reconectando shell em <strong>${escapeHtml(nameOf(entry.containerId))}</strong>…`;
    socket.emit('term:open', { containerId: entry.containerId, sessionId });
    showToast('Sessão de terminal reiniciada.', 'info');
  }

  function closeTerminalTab(sessionId) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    socket.emit('term:close', sessionId);
    if (entry.resizeObserver) entry.resizeObserver.disconnect();
    entry.term.dispose();
    removeSessionFromPane(sessionId);
    state.panels.delete(sessionId);
    entry.tabEl.remove();
    entry.panelEl.remove();
    renderLayout();
    renderCrates();
  }

  socket.on('term:ready', ({ sessionId }) => {
    const entry = state.panels.get(sessionId);
    if (!entry || entry.type !== 'term') return;
    entry.panelEl.querySelector('.panel__title').innerHTML = `${ICON.shell} Shell ativo — <strong>${escapeHtml(nameOf(entry.containerId))}</strong>`;
    try { entry.fitAddon.fit(); } catch (_) {}
    entry.term.focus();
  });

  socket.on('term:data', ({ sessionId, data }) => {
    const entry = state.panels.get(sessionId);
    if (entry && entry.type === 'term') entry.term.write(data);
  });

  socket.on('term:closed', ({ sessionId, error }) => {
    const entry = state.panels.get(sessionId);
    if (!entry || entry.type !== 'term' || entry.closed) return;
    entry.closed = true;
    entry.term.write(`\r\n\x1b[38;5;203m[sessão encerrada${error ? ': ' + error : ''}]\x1b[0m\r\n`);
    entry.tabEl.querySelector('.tab-dot').classList.add('tab-dot--dead');
  });

  socket.on('term:error', ({ sessionId, message }) => {
    const entry = state.panels.get(sessionId);
    if (entry && entry.type === 'term') {
      entry.panelEl.querySelector('.panel__title').textContent = `Erro: ${message}`;
      entry.term.write(`\x1b[38;5;203mErro ao abrir shell: ${message}\x1b[0m\r\n`);
      showToast(`Erro ao abrir shell: ${message}`, 'error');
    }
  });

  // =========================================================================
  // CONTAINER INSPECTOR & TELEMETRY TABS
  // =========================================================================

  function isSecretKey(key) {
    return /(password|passwd|secret|token|api_key|apikey|private_key|auth|credentials|jwt)/i.test(key);
  }

  function openInspectTab(containerId) {
    const sessionId = newSessionId('inspect');
    const name = nameOf(containerId);
    const tabEl = createSessionTabElement(sessionId, 'inspect', name, () => closeInspectTab(sessionId));

    const panelEl = document.createElement('div');
    panelEl.className = 'panel';
    panelEl.dataset.session = sessionId;
    panelEl.dataset.type = 'inspect';
    panelEl.innerHTML = `
      <div class="panel__bar">
        <span class="panel__title">${ICON.inspect} Inspeção — <strong>${escapeHtml(name)}</strong></span>
        <div class="panel__controls">
          <button data-act="open-logs" class="btn btn--sm" type="button">${ICON.logs} Abrir Logs</button>
          <button data-act="open-shell" class="btn btn--sm" type="button">${ICON.shell} Abrir Shell</button>
          <button data-act="refresh-inspect" class="btn btn--sm" type="button">${ICON.refresh} Atualizar</button>
        </div>
      </div>
      <div class="inspect-view" data-role="inspect-body">
        <div style="color:var(--text-muted);padding:20px;">Carregando detalhes do container…</div>
      </div>
    `;

    const entry = {
      type: 'inspect',
      containerId,
      tabEl,
      panelEl,
      paneId: null,
      details: null,
    };
    state.panels.set(sessionId, entry);

    panelEl.querySelector('[data-act="open-logs"]').addEventListener('click', () => {
      const existing = findSession('log', containerId);
      if (existing) switchTab(existing);
      else openLogTab(containerId);
    });
    panelEl.querySelector('[data-act="open-shell"]').addEventListener('click', () => {
      const c = state.containers.get(containerId);
      if (c && c.state === 'running') openTerminalTab(containerId);
      else showToast('O container precisa estar em execução para abrir um terminal.', 'error');
    });
    panelEl.querySelector('[data-act="refresh-inspect"]').addEventListener('click', () => {
      fetchAndRenderInspect(sessionId);
      showToast('Dados de inspeção atualizados.', 'info');
    });

    assignSessionToPane(sessionId, state.focusedPaneId);
    setActiveView('workspace');
    renderLayout();
    renderCrates();
    fetchAndRenderInspect(sessionId);
  }

  function fetchAndRenderInspect(sessionId) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    socket.emit('container:inspect', { id: entry.containerId }, (res) => {
      if (!state.panels.has(sessionId)) return;
      const body = entry.panelEl.querySelector('[data-role="inspect-body"]');
      if (!res || !res.ok || !res.details) {
        body.innerHTML = `<div style="color:var(--state-error);padding:20px;">Erro ao inspecionar container: ${escapeHtml((res && res.error) || 'desconhecido')}</div>`;
        return;
      }
      entry.details = res.details;
      renderInspectBody(entry, body);
    });
  }

  function renderInspectBody(entry, body) {
    const d = entry.details;
    const st = state.stats.get(entry.containerId);

    const cpuPct = st ? st.cpuPercent : 0;
    const memPct = st ? st.memPercent : 0;
    const cpuText = st ? `${cpuPct.toFixed(1)}%` : (d.state.running ? '0.0%' : 'Parado');
    const memText = st ? `${formatBytes(st.memUsage)} / ${formatBytes(st.memLimit)}` : '—';
    const memPctText = st ? `${memPct.toFixed(1)}% utilizado` : 'Container inativo';
    const netText = st ? `↓ ${formatBytes(st.netRx)} · ↑ ${formatBytes(st.netTx)}` : '—';
    const pidsText = st ? `${st.pids} processos` : `PID ${d.state.pid || '—'}`;
    const fullCmd = [...(d.entrypoint || []), ...(d.cmd || [])].join(' ') || '—';

    const portsRows = d.ports.length
      ? d.ports.map((p) => {
          if (p.hostPort) {
            const url = `http://${window.location.hostname}:${p.hostPort}`;
            return `<div class="kv-key">${escapeHtml(p.containerPort)}</div>
                    <div class="kv-val"><a class="crate__tag crate__tag--port" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.hostIp)}:${escapeHtml(p.hostPort)} → ${escapeHtml(p.containerPort)} ${ICON.external}</a></div>`;
          }
          return `<div class="kv-key">${escapeHtml(p.containerPort)}</div><div class="kv-val">Interna (não publicada no host)</div>`;
        }).join('')
      : '<div class="kv-key">Portas</div><div class="kv-val">Nenhuma porta exposta</div>';

    const mountsRows = d.mounts.length
      ? d.mounts.map((m) => `
          <div class="kv-key">${escapeHtml(m.type.toUpperCase())} <span class="mount-badge${m.rw ? '' : ' mount-badge--ro'}">${m.rw ? 'RW' : 'RO'}</span></div>
          <div class="kv-val">${escapeHtml(m.source)} <span style="color:var(--accent-brand-hi)">→</span> ${escapeHtml(m.destination)}</div>
        `).join('')
      : '<div class="kv-key">Volumes</div><div class="kv-val">Nenhum volume ou bind mount</div>';

    const netRows = d.networks.length
      ? d.networks.map((n) => `
          <div class="kv-key">${escapeHtml(n.name)}</div>
          <div class="kv-val">IP: <strong>${escapeHtml(n.ipAddress)}</strong> · Gateway: ${escapeHtml(n.gateway)} · MAC: ${escapeHtml(n.macAddress)}</div>
        `).join('')
      : '<div class="kv-key">Rede</div><div class="kv-val">Sem rede anexada</div>';

    const hasSecrets = d.env.some((e) => isSecretKey(e.key));
    const envHtml = d.env.length
      ? d.env.map((e) => {
          const secret = isSecretKey(e.key);
          return `
            <div class="env-row" data-env-key="${escapeHtml(e.key.toLowerCase())}">
              <span class="env-row__key" title="${escapeHtml(e.key)}">${escapeHtml(e.key)}</span>
              <span class="env-row__val${secret ? ' is-secret' : ''}" data-originally-secret="${secret ? '1' : '0'}" title="${secret ? 'Clique para revelar/ocultar valor sensível' : ''}">${escapeHtml(e.value)}</span>
              <button class="icon-btn icon-btn--xs" data-copy-text="${escapeHtml(e.key + '=' + e.value)}" title="Copiar variável">${ICON.copy}</button>
            </div>
          `;
        }).join('')
      : '<div style="color:var(--text-muted)">Nenhuma variável de ambiente definida.</div>';

    body.innerHTML = `
      <div class="inspect-grid" data-inspect-metrics="${escapeHtml(entry.containerId)}">
        <div class="metric-card">
          <span class="metric-card__label">Uso de CPU</span>
          <span class="metric-card__value" data-ins="cpu">${cpuText}</span>
          <div class="metric-card__bar">
            <div class="metric-card__bar-fill ${cpuPct > 85 ? 'is-crit' : cpuPct > 60 ? 'is-high' : ''}" data-ins="cpu-bar" style="width:${Math.min(100, cpuPct)}%"></div>
          </div>
          <span class="metric-card__sub">Status: ${escapeHtml(d.state.status.toUpperCase())}</span>
        </div>
        <div class="metric-card">
          <span class="metric-card__label">Memória RAM</span>
          <span class="metric-card__value" data-ins="mem">${memText}</span>
          <div class="metric-card__bar">
            <div class="metric-card__bar-fill metric-card__bar-fill--mem ${memPct > 85 ? 'is-crit' : memPct > 65 ? 'is-high' : ''}" data-ins="mem-bar" style="width:${Math.min(100, memPct)}%"></div>
          </div>
          <span class="metric-card__sub" data-ins="mem-pct">${memPctText}</span>
        </div>
        <div class="metric-card">
          <span class="metric-card__label">Tráfego de Rede</span>
          <span class="metric-card__value" data-ins="net">${netText}</span>
          <span class="metric-card__sub">Acumulado RX / TX</span>
        </div>
        <div class="metric-card">
          <span class="metric-card__label">Processos &amp; Reinícios</span>
          <span class="metric-card__value" data-ins="pids">${pidsText}</span>
          <span class="metric-card__sub">Reinícios: ${d.restartCount} (${escapeHtml(d.restartPolicy)})</span>
        </div>
      </div>

      <div class="inspect-section">
        <div class="inspect-section__head">
          <h4>Configuração Geral &amp; Estado</h4>
          <span class="kbd-hint">${escapeHtml(d.shortId)}</span>
        </div>
        <div class="inspect-section__body">
          <div class="kv-grid">
            <div class="kv-key">ID Completo</div>
            <div class="kv-val"><span>${escapeHtml(d.id)}</span><button class="icon-btn icon-btn--xs" data-copy-text="${escapeHtml(d.id)}" title="Copiar ID">${ICON.copy}</button></div>
            <div class="kv-key">Imagem</div>
            <div class="kv-val"><span>${escapeHtml(d.image)} (${escapeHtml(d.imageId)})</span><button class="icon-btn icon-btn--xs" data-copy-text="${escapeHtml(d.image)}" title="Copiar imagem">${ICON.copy}</button></div>
            <div class="kv-key">Comando</div>
            <div class="kv-val"><span>${escapeHtml(fullCmd)}</span>${fullCmd !== '—' ? `<button class="icon-btn icon-btn--xs" data-copy-text="${escapeHtml(fullCmd)}" title="Copiar comando">${ICON.copy}</button>` : ''}</div>
            <div class="kv-key">Diretório (Workdir)</div><div class="kv-val">${escapeHtml(d.workingDir)}</div>
            <div class="kv-key">Iniciado em</div><div class="kv-val">${escapeHtml(d.state.startedAt || '—')}</div>
            ${d.compose.project ? `<div class="kv-key">Docker Compose</div><div class="kv-val">Projeto: <strong>${escapeHtml(d.compose.project)}</strong> · Serviço: <strong>${escapeHtml(d.compose.service || '—')}</strong></div>` : ''}
          </div>
        </div>
      </div>

      <div class="inspect-section">
        <div class="inspect-section__head">
          <h4>Portas &amp; Conectividade de Rede</h4>
        </div>
        <div class="inspect-section__body">
          <div class="kv-grid">
            ${portsRows}
            ${netRows}
          </div>
        </div>
      </div>

      <div class="inspect-section">
        <div class="inspect-section__head">
          <h4>Volumes &amp; Montagens (${d.mounts.length})</h4>
        </div>
        <div class="inspect-section__body">
          <div class="kv-grid">
            ${mountsRows}
          </div>
        </div>
      </div>

      <div class="inspect-section">
        <div class="inspect-section__head">
          <h4>Variáveis de Ambiente (${d.env.length})</h4>
          <div class="inspect-section__head-tools">
            ${hasSecrets ? `<button class="btn btn--sm" data-role="toggle-secrets" type="button">${ICON.eye} Revelar segredos</button>` : ''}
            <input type="text" class="panel__filter" data-role="env-filter" placeholder="Filtrar variáveis…" style="width:180px;padding:4px 10px;" />
          </div>
        </div>
        <div class="inspect-section__body">
          <div class="env-list">
            ${envHtml}
          </div>
        </div>
      </div>
    `;

    // Wire secret reveal & copy buttons
    body.querySelectorAll('.env-row__val[data-originally-secret="1"]').forEach((el) => {
      el.addEventListener('click', () => el.classList.toggle('is-secret'));
    });
    const toggleSecretsBtn = body.querySelector('[data-role="toggle-secrets"]');
    if (toggleSecretsBtn) {
      let revealed = false;
      toggleSecretsBtn.addEventListener('click', () => {
        revealed = !revealed;
        body.querySelectorAll('.env-row__val[data-originally-secret="1"]').forEach((el) => {
          el.classList.toggle('is-secret', !revealed);
        });
        toggleSecretsBtn.classList.toggle('btn--active', revealed);
        toggleSecretsBtn.innerHTML = `${ICON.eye} ${revealed ? 'Ocultar segredos' : 'Revelar segredos'}`;
      });
    }
    body.querySelectorAll('[data-copy-text]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.copyText);
          showToast('Copiado para a área de transferência.', 'success');
        } catch (_) {}
      });
    });
    const envFilter = body.querySelector('[data-role="env-filter"]');
    if (envFilter) {
      envFilter.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        body.querySelectorAll('.env-row').forEach((row) => {
          row.hidden = q.length > 0 && !row.dataset.envKey.includes(q);
        });
      });
    }
  }

  function updateInspectTelemetryInPlace() {
    document.querySelectorAll('[data-inspect-metrics]').forEach((grid) => {
      const id = grid.dataset.inspectMetrics;
      const st = state.stats.get(id);
      if (!st) return;
      const cpuEl = grid.querySelector('[data-ins="cpu"]');
      const cpuBar = grid.querySelector('[data-ins="cpu-bar"]');
      const memEl = grid.querySelector('[data-ins="mem"]');
      const memBar = grid.querySelector('[data-ins="mem-bar"]');
      const memPctEl = grid.querySelector('[data-ins="mem-pct"]');
      const netEl = grid.querySelector('[data-ins="net"]');
      const pidsEl = grid.querySelector('[data-ins="pids"]');

      if (cpuEl) cpuEl.textContent = `${st.cpuPercent.toFixed(1)}%`;
      if (cpuBar) {
        cpuBar.style.width = `${Math.min(100, st.cpuPercent)}%`;
        cpuBar.className = `metric-card__bar-fill ${st.cpuPercent > 85 ? 'is-crit' : st.cpuPercent > 60 ? 'is-high' : ''}`;
      }
      if (memEl) memEl.textContent = `${formatBytes(st.memUsage)} / ${formatBytes(st.memLimit)}`;
      if (memBar) {
        memBar.style.width = `${Math.min(100, st.memPercent)}%`;
        memBar.className = `metric-card__bar-fill metric-card__bar-fill--mem ${st.memPercent > 85 ? 'is-crit' : st.memPercent > 65 ? 'is-high' : ''}`;
      }
      if (memPctEl) memPctEl.textContent = `${st.memPercent.toFixed(1)}% utilizado`;
      if (netEl) netEl.textContent = `↓ ${formatBytes(st.netRx)} · ↑ ${formatBytes(st.netTx)}`;
      if (pidsEl) pidsEl.textContent = `${st.pids} processos`;
    });
  }

  function closeInspectTab(sessionId) {
    const entry = state.panels.get(sessionId);
    if (!entry) return;
    removeSessionFromPane(sessionId);
    state.panels.delete(sessionId);
    entry.tabEl.remove();
    entry.panelEl.remove();
    renderLayout();
    renderCrates();
  }

  window.addEventListener('resize', refitVisibleTerminals);

  // ---- Formatting Utils ---------------------------------------------------
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, i);
    return `${val >= 100 || i === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
})();
