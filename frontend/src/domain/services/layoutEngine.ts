import type { DropZone, LayoutNode, SplitDirection } from '../entities/workspace';

let splitSeq = 0;
export const nextSplitId = () => `split-${++splitSeq}`;

export function firstLeafPaneId(node: LayoutNode): string {
  return node.type === 'leaf' ? node.paneId : firstLeafPaneId(node.children[0]);
}

export function splitLeafInTree(
  root: LayoutNode,
  targetPaneId: string,
  newPaneId: string,
  edge: Exclude<DropZone, 'center'>
): LayoutNode {
  if (root.type === 'leaf') {
    if (root.paneId !== targetPaneId) return root;
    const direction: SplitDirection = edge === 'left' || edge === 'right' ? 'row' : 'column';
    const newLeaf: LayoutNode = { type: 'leaf', paneId: newPaneId };
    const children: [LayoutNode, LayoutNode] =
      edge === 'left' || edge === 'top' ? [newLeaf, root] : [root, newLeaf];
    return {
      type: 'split',
      id: nextSplitId(),
      direction,
      sizes: [50, 50],
      children,
    };
  }

  return {
    ...root,
    children: [
      splitLeafInTree(root.children[0], targetPaneId, newPaneId, edge),
      splitLeafInTree(root.children[1], targetPaneId, newPaneId, edge),
    ],
  };
}

export function removeLeafFromTree(root: LayoutNode, targetPaneId: string): LayoutNode | null {
  if (root.type === 'leaf') {
    return root.paneId === targetPaneId ? null : root;
  }

  const left = removeLeafFromTree(root.children[0], targetPaneId);
  const right = removeLeafFromTree(root.children[1], targetPaneId);

  if (!left && !right) return null;
  if (!left) return right;
  if (!right) return left;

  return {
    ...root,
    children: [left, right],
  };
}

export function updateSplitSizesInTree(
  root: LayoutNode,
  splitId: string,
  sizes: [number, number]
): LayoutNode {
  if (root.type === 'leaf') return root;
  if (root.id === splitId) {
    return { ...root, sizes };
  }
  return {
    ...root,
    children: [
      updateSplitSizesInTree(root.children[0], splitId, sizes),
      updateSplitSizesInTree(root.children[1], splitId, sizes),
    ],
  };
}

export function equalizeTreeSplits(root: LayoutNode): LayoutNode {
  if (root.type === 'leaf') return root;
  return {
    ...root,
    sizes: [50, 50],
    children: [
      equalizeTreeSplits(root.children[0]),
      equalizeTreeSplits(root.children[1]),
    ],
  };
}

export function computeDropZone(relX: number, relY: number): DropZone {
  if (relX < 0.25) return 'left';
  if (relX > 0.75) return 'right';
  if (relY < 0.25) return 'top';
  if (relY > 0.75) return 'bottom';
  return 'center';
}

export const DROP_ZONE_LABELS: Record<DropZone, string> = {
  left: 'Dividir à esquerda',
  right: 'Dividir à direita',
  top: 'Dividir acima',
  bottom: 'Dividir abaixo',
  center: 'Mover para este painel',
};
