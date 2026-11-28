import React, { useRef, useState } from 'react';
import type { DropZone } from '../../../domain/entities/workspace';
import { useApp } from '../../../application/store/AppContext';
import { computeDropZone, DROP_ZONE_LABELS } from '../../../domain/services/layoutEngine';
import {
  IconClose,
  IconInspect,
  IconLogs,
  IconShell,
  IconSplitDown,
  IconSplitRight,
} from '../common/Icons';
import { LogPanel } from './LogPanel';
import { TerminalPanel } from './TerminalPanel';
import { InspectPanel } from './InspectPanel';

interface PaneViewProps {
  paneId: string;
}

export const PaneView: React.FC<PaneViewProps> = ({ paneId }) => {
  const {
    panes,
    panels,
    containers,
    focusedPaneId,
    focusPane,
    switchTab,
    closeSessionTab,
    quickSplitPane,
    draggingSessionId,
    setDraggingSessionId,
    handleTabDrop,
  } = useApp();

  const pane = panes.get(paneId);
  const contentRef = useRef<HTMLDivElement>(null);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const [deadTerms, setDeadTerms] = useState<Set<string>>(() => new Set());

  if (!pane) return null;

  const isFocused = focusedPaneId === paneId;

  return (
    <div
      className={`pane${isFocused ? ' is-focused' : ''}`}
      data-pane={paneId}
      onMouseDown={() => focusPane(paneId)}
    >
      <div className="pane__header">
        <div
          className="pane__tabs"
          onDragOver={(e) => {
            if (draggingSessionId) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (draggingSessionId) {
              handleTabDrop(draggingSessionId, paneId, 'center');
              setDraggingSessionId(null);
            }
          }}
        >
          {pane.sessionIds.map((sessionId) => {
            const session = panels.get(sessionId);
            if (!session) return null;
            const c = containers.get(session.containerId);
            const label = c ? c.name : session.containerId.slice(0, 12);
            const isActive = sessionId === pane.activeSessionId;
            const isDead =
              session.type === 'term'
                ? deadTerms.has(sessionId)
                : c ? c.state !== 'running' : false;

            return (
              <button
                key={sessionId}
                type="button"
                draggable
                className={`view-tab${isActive ? ' is-active' : ''}${draggingSessionId === sessionId ? ' is-dragging' : ''}`}
                data-type={session.type}
                onClick={() => switchTab(sessionId)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeSessionTab(sessionId);
                  }
                }}
                onDragStart={(e) => {
                  setDraggingSessionId(sessionId);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDraggingSessionId(null);
                  setDropZone(null);
                }}
              >
                <span className={`tab-dot${isDead ? ' tab-dot--dead' : ''}`} />
                {session.type === 'log' ? <IconLogs /> : session.type === 'term' ? <IconShell /> : <IconInspect />}
                <span>{session.type === 'inspect' ? `info: ${label}` : label}</span>
                <span
                  className="view-tab__close"
                  title="Fechar aba (Alt+W)"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSessionTab(sessionId);
                  }}
                >
                  <IconClose />
                </span>
              </button>
            );
          })}
        </div>

        <div className="pane__quick-actions">
          <button
            className="icon-btn icon-btn--xs"
            type="button"
            title="Dividir painel à direita"
            onClick={(e) => {
              e.stopPropagation();
              quickSplitPane(paneId, 'right');
            }}
          >
            <IconSplitRight />
          </button>
          <button
            className="icon-btn icon-btn--xs"
            type="button"
            title="Dividir painel abaixo"
            onClick={(e) => {
              e.stopPropagation();
              quickSplitPane(paneId, 'bottom');
            }}
          >
            <IconSplitDown />
          </button>
        </div>
      </div>

      <div
        ref={contentRef}
        className="pane__content"
        onDragOver={(e) => {
          if (!draggingSessionId || !contentRef.current) return;
          e.preventDefault();
          const rect = contentRef.current.getBoundingClientRect();
          const zone = computeDropZone(
            (e.clientX - rect.left) / rect.width,
            (e.clientY - rect.top) / rect.height
          );
          setDropZone(zone);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDropZone(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const currentZone = dropZone || 'center';
          setDropZone(null);
          if (draggingSessionId) {
            handleTabDrop(draggingSessionId, paneId, currentZone);
            setDraggingSessionId(null);
          }
        }}
      >
        {pane.sessionIds.map((sessionId) => {
          const session = panels.get(sessionId);
          if (!session) return null;
          const isActive = sessionId === pane.activeSessionId;

          if (session.type === 'log') {
            return (
              <LogPanel
                key={sessionId}
                sessionId={sessionId}
                containerId={session.containerId}
                isActive={isActive}
              />
            );
          }
          if (session.type === 'term') {
            return (
              <TerminalPanel
                key={sessionId}
                sessionId={sessionId}
                containerId={session.containerId}
                isActive={isActive}
                onStatusChange={(dead) => {
                  setDeadTerms((prev) => {
                    const next = new Set(prev);
                    if (dead) next.add(sessionId);
                    else next.delete(sessionId);
                    return next;
                  });
                }}
              />
            );
          }
          return (
            <InspectPanel
              key={sessionId}
              sessionId={sessionId}
              containerId={session.containerId}
              isActive={isActive}
            />
          );
        })}

        {dropZone && (
          <div
            className="drop-overlay"
            data-zone={dropZone}
            data-label={DROP_ZONE_LABELS[dropZone]}
          />
        )}
      </div>
    </div>
  );
};
