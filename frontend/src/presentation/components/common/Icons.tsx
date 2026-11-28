import React from 'react';

export const IconLogs: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v5h5" />
    <path d="M8 12h8M8 16h5" />
  </svg>
);

export const IconShell: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9l4 3-4 3M13 15h4" />
  </svg>
);

export const IconInspect: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

export const IconPause: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

export const IconPlay: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 4l14 8-14 8V4z" />
  </svg>
);

export const IconAutoscroll: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 4v14M6 13l6 6 6-6" />
  </svg>
);

export const IconTrash: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </svg>
);

export const IconDownload: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </svg>
);

export const IconCopy: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="9" y="9" width="12" height="12" rx="1.5" />
    <path d="M5 15V4a1 1 0 0 1 1-1h11" />
  </svg>
);

export const IconRefresh: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
    <path d="M18 3v4h-4M6 21v-4h4" />
  </svg>
);

export const IconClose: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const IconCheck: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

export const IconAlert: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 9v4M12 17h.01M10.3 3.9L2.7 18a1.5 1.5 0 0 0 1.3 2.2h16a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z" />
  </svg>
);

export const IconStack: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5M3 8l9 5 9-5" />
  </svg>
);

export const IconBox: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M21 8l-9-5-9 5 9 5 9-5z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </svg>
);

export const IconChevron: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconStop: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const IconExternal: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="M10 14L21 3" />
  </svg>
);

export const IconSplitRight: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 3v18" />
  </svg>
);

export const IconSplitDown: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 12h18" />
  </svg>
);

export const IconWrap: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4" />
    <path d="M16 16l-2 2 2 2" />
    <path d="M3 18h7" />
  </svg>
);

export const IconClock: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconEye: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconSearch: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

export const IconSidebar: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

export const IconGrid: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const IconCommand: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
  </svg>
);

export const IconSun: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const IconMoon: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const IconKeyboard: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
  </svg>
);

export const IconDensity: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const IconCollapseAll: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
  </svg>
);

export const IconCpu: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
  </svg>
);

export const IconMemory: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 12h.01M10 12h.01M14 12h4" />
  </svg>
);

export const IconEngine: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 12h.01M10 12h.01" />
  </svg>
);
