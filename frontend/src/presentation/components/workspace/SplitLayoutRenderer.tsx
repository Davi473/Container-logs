import React, { useRef } from 'react';
import type { LayoutNode } from '../../../domain/entities/workspace';
import { useApp } from '../../../application/store/AppContext';
import { PaneView } from './PaneView';

interface SplitLayoutRendererProps {
  node: LayoutNode;
  style?: React.CSSProperties;
  className?: string;
}

export const SplitLayoutRenderer: React.FC<SplitLayoutRendererProps> = ({
  node,
  style,
  className = '',
}) => {
  const { resizeSplit } = useApp();
  const splitRef = useRef<HTMLDivElement>(null);

  if (node.type === 'leaf') {
    return (
      <div
        className={className}
        style={{ display: 'flex', flex: '1 1 0', minWidth: 0, minHeight: 0, ...style }}
      >
        <PaneView paneId={node.paneId} />
      </div>
    );
  }

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const splitEl = splitRef.current;
    if (!splitEl) return;
    const isRow = node.direction === 'row';
    const rect = splitEl.getBoundingClientRect();
    const total = isRow ? rect.width : rect.height;

    const onMove = (ev: MouseEvent) => {
      const pos = isRow ? ev.clientX - rect.left : ev.clientY - rect.top;
      const pct = Math.min(85, Math.max(15, (pos / total) * 100));
      resizeSplit(node.id, [pct, 100 - pct]);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing');
    };

    document.body.classList.add('is-resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={splitRef}
      className={`split split--${node.direction} ${className}`}
      style={style}
    >
      <SplitLayoutRenderer
        node={node.children[0]}
        className="split__child"
        style={{ flexBasis: `${node.sizes[0]}%`, flexGrow: 0, flexShrink: 0 }}
      />
      <div
        className={`split__divider split__divider--${node.direction}`}
        onMouseDown={handleDividerMouseDown}
      />
      <SplitLayoutRenderer
        node={node.children[1]}
        className="split__child"
        style={{ flexBasis: `${node.sizes[1]}%`, flexGrow: 0, flexShrink: 0 }}
      />
    </div>
  );
};
