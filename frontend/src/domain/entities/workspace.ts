export type SessionType = 'log' | 'term' | 'inspect';
export type SplitDirection = 'row' | 'column';
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center';
export type ActiveView = 'overview' | 'workspace';
export type ThemeMode = 'dark' | 'light';
export type ConnectionMode = 'live' | 'pending' | 'down';

export interface PanelSession {
  id: string;
  type: SessionType;
  containerId: string;
  paneId: string;
}

export interface Pane {
  id: string;
  sessionIds: string[];
  activeSessionId: string | null;
}

export interface LeafNode {
  type: 'leaf';
  paneId: string;
}

export interface SplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  sizes: [number, number];
  children: [LayoutNode, LayoutNode];
}

export type LayoutNode = LeafNode | SplitNode;

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
}
