import { buildLayerPanelUnits, normalizeGroupContiguity } from "@geolibre/core";
import type { GeoLibreLayer, LayerGroup } from "@geolibre/core";

/**
 * SWIFTMAP: the Layers panel as a nested tree, for drag and drop and the group
 * menu (Change 18). GeoLibre stores the panel as two flat arrays (layers in
 * draw order, groups with a `parentId`); the tree is read from them with the
 * engine's own placement rules and written back to them in one step.
 */

/** Groups nest up to this many levels (the mockup's limit). */
export const MAX_GROUP_LEVELS = 3;

export type LayerTreeNode =
  | { kind: "layer"; id: string }
  | { kind: "group"; id: string; children: LayerTreeNode[] };

type GroupNode = Extract<LayerTreeNode, { kind: "group" }>;

/** Where a node goes: the index in a group's children, or the panel's top level. */
export interface TreeSpot {
  parentId: string | null;
  index: number;
}

/** A node's key, unique across layers and groups: `layer:<id>` or `group:<id>`. */
export function nodeKey(node: Pick<LayerTreeNode, "kind" | "id">): string {
  return `${node.kind}:${node.id}`;
}

/**
 * The panel's tree, top of the panel first. Built from the engine's panel
 * blocks, so every node sits where the panel draws it.
 */
export function buildLayerTree(layers: GeoLibreLayer[], groups: LayerGroup[]): LayerTreeNode[] {
  const groupById = new Map(groups.map((g) => [g.id, g] as const));
  const roots: LayerTreeNode[] = [];
  const nodes = new Map<string, GroupNode>();
  // A group's node is placed the first time the walk reaches it, under its
  // parent's node; a `parentId` cycle or a missing parent puts it at the top.
  const ensure = (id: string, chain: Set<string>): GroupNode => {
    const existing = nodes.get(id);
    if (existing) return existing;
    const node: GroupNode = { kind: "group", id, children: [] };
    nodes.set(id, node);
    const parentId = groupById.get(id)?.parentId;
    if (parentId && groupById.has(parentId) && !chain.has(parentId)) {
      ensure(parentId, new Set(chain).add(id)).children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  };
  for (const unit of buildLayerPanelUnits(layers, groups)) {
    const layerNodes = unit.layers.map((layer) => ({ kind: "layer" as const, id: layer.id }));
    if (unit.groupId) ensure(unit.groupId, new Set()).children.push(...layerNodes);
    else roots.push(...layerNodes);
  }
  for (const group of groups) ensure(group.id, new Set());
  return roots;
}

/** The tree as one string, for comparing two trees. */
export function serializeTree(tree: LayerTreeNode[]): string {
  return tree
    .map((node) =>
      node.kind === "layer" ? node.id : `${node.id}(${serializeTree(node.children)})`,
    )
    .join(",");
}

/**
 * Write a tree back to the store's arrays: layers in draw order (bottom of the
 * panel first) with their `groupId`, groups in panel order (which places empty
 * groups) with their `parentId`. Unchanged records keep their identity, so the
 * map and the undo history see only real changes.
 */
export function writeLayerTree(
  tree: LayerTreeNode[],
  layers: GeoLibreLayer[],
  groups: LayerGroup[],
): { layers: GeoLibreLayer[]; layerGroups: LayerGroup[] } {
  const layerById = new Map(layers.map((l) => [l.id, l] as const));
  const groupById = new Map(groups.map((g) => [g.id, g] as const));
  const layerOrder: GeoLibreLayer[] = [];
  const groupOrder: LayerGroup[] = [];
  const walk = (nodes: LayerTreeNode[], parentId: string | null) => {
    for (const node of nodes) {
      if (node.kind === "layer") {
        const layer = layerById.get(node.id);
        if (!layer) continue;
        layerOrder.push(
          (layer.groupId ?? null) === parentId
            ? layer
            : { ...layer, groupId: parentId ?? undefined },
        );
      } else {
        const group = groupById.get(node.id);
        if (!group) continue;
        groupOrder.push(
          (group.parentId ?? null) === parentId
            ? group
            : { ...group, parentId: parentId ?? undefined },
        );
        walk(node.children, node.id);
      }
    }
  };
  walk(tree, null);
  // Anything the tree missed keeps its record rather than being dropped.
  const placedLayers = new Set(layerOrder.map((l) => l.id));
  const placedGroups = new Set(groupOrder.map((g) => g.id));
  const missedLayers = layers.filter((l) => !placedLayers.has(l.id));
  return {
    layers: normalizeGroupContiguity([...missedLayers, ...layerOrder.reverse()]),
    layerGroups: [...groupOrder, ...groups.filter((g) => !placedGroups.has(g.id))],
  };
}

/**
 * The tree without groups that hold no layer anywhere below them, except the
 * one keyed `keep` (and the groups around it).
 */
function withoutEmptyGroups(tree: LayerTreeNode[], keep?: string): LayerTreeNode[] {
  const result: LayerTreeNode[] = [];
  for (const node of tree) {
    if (node.kind === "layer") {
      result.push(node);
      continue;
    }
    const children = withoutEmptyGroups(node.children, keep);
    if (children.length > 0 || nodeKey(node) === keep) result.push({ ...node, children });
  }
  return result;
}

/**
 * Whether the engine keeps the tree as it is: writing it and reading it back
 * gives the same tree. It doesn't when a subgroup would split a group's own
 * layers, or an empty group would sit between two layers (Change 18).
 *
 * `looseEmptyGroups`: only where the layers and the groups holding them land
 * counts. A group left empty (its last layer moved out) goes wherever the
 * engine puts empty groups, at the top of its level, and that doesn't stop the
 * move (Change 22). `keep` names an empty group whose place still counts: the
 * one being dragged.
 */
export function engineKeepsTree(
  tree: LayerTreeNode[],
  layers: GeoLibreLayer[],
  groups: LayerGroup[],
  options: { looseEmptyGroups?: boolean; keep?: string } = {},
): boolean {
  const written = writeLayerTree(tree, layers, groups);
  const readBack = buildLayerTree(written.layers, written.layerGroups);
  if (!options.looseEmptyGroups) return serializeTree(readBack) === serializeTree(tree);
  return (
    serializeTree(withoutEmptyGroups(readBack, options.keep)) ===
    serializeTree(withoutEmptyGroups(tree, options.keep))
  );
}

/**
 * The tree with a node moved one place up or down among its siblings, past the
 * next sibling that holds a layer (an empty group has no place of its own), or
 * null when it is already first or last there. A layer never leaves its group
 * this way (Change 22); the engine may still refuse the result.
 */
export function stepNode(
  tree: LayerTreeNode[],
  key: string,
  direction: "up" | "down",
): LayerTreeNode[] | null {
  const { tree: detached, node, from } = detachNode(tree, key);
  if (!node || !from) return null;
  const siblings = childrenAt(detached, from.parentId) ?? [];
  const holdsLayer = (candidate: LayerTreeNode) =>
    withoutEmptyGroups([candidate]).length > 0;
  let index: number | null = null;
  if (direction === "up") {
    for (let i = from.index - 1; index === null && i >= 0; i--) {
      if (holdsLayer(siblings[i])) index = i;
    }
  } else {
    for (let i = from.index; index === null && i < siblings.length; i++) {
      if (holdsLayer(siblings[i])) index = i + 1;
    }
  }
  return index === null ? null : insertNode(detached, node, { parentId: from.parentId, index });
}

/**
 * A layer's Move up or Move down (Change 22): the tree with the layer one place
 * along among its siblings, or null when it can't move (first or last in its
 * group, or a spot the engine doesn't keep). GeoLibre's `reorderLayer` swaps it
 * with the next layer in draw order instead, which moves a group's top layer's
 * whole group past its neighbour.
 */
export function stepLayer(
  tree: LayerTreeNode[],
  layers: GeoLibreLayer[],
  groups: LayerGroup[],
  id: string,
  direction: "up" | "down",
): LayerTreeNode[] | null {
  const next = stepNode(tree, `layer:${id}`, direction);
  if (!next || !engineKeepsTree(next, layers, groups, { looseEmptyGroups: true })) return null;
  return next;
}

function cloneTree(tree: LayerTreeNode[]): LayerTreeNode[] {
  return tree.map((node) =>
    node.kind === "layer" ? node : { ...node, children: cloneTree(node.children) },
  );
}

/** The group node with this id, or undefined. */
export function findGroupNode(tree: LayerTreeNode[], id: string): GroupNode | undefined {
  for (const node of tree) {
    if (node.kind !== "group") continue;
    if (node.id === id) return node;
    const inner = findGroupNode(node.children, id);
    if (inner) return inner;
  }
  return undefined;
}

/** The list a spot's index counts in: the top level or a group's children. */
export function childrenAt(tree: LayerTreeNode[], parentId: string | null): LayerTreeNode[] | null {
  if (parentId === null) return tree;
  return findGroupNode(tree, parentId)?.children ?? null;
}

/** A copy of the tree with the node removed, and the node (with its subtree). */
export function detachNode(
  tree: LayerTreeNode[],
  key: string,
): { tree: LayerTreeNode[]; node: LayerTreeNode | null; from: TreeSpot | null } {
  const copy = cloneTree(tree);
  let node: LayerTreeNode | null = null;
  let from: TreeSpot | null = null;
  const remove = (nodes: LayerTreeNode[], parentId: string | null): boolean => {
    const index = nodes.findIndex((candidate) => nodeKey(candidate) === key);
    if (index >= 0) {
      node = nodes.splice(index, 1)[0];
      from = { parentId, index };
      return true;
    }
    return nodes.some((child) => child.kind === "group" && remove(child.children, child.id));
  };
  remove(copy, null);
  return { tree: copy, node, from };
}

/** A copy of `detached` with `node` inserted at `spot`, or null if the spot is gone. */
export function insertNode(
  detached: LayerTreeNode[],
  node: LayerTreeNode,
  spot: TreeSpot,
): LayerTreeNode[] | null {
  const copy = cloneTree(detached);
  const list = childrenAt(copy, spot.parentId);
  if (!list || spot.index < 0 || spot.index > list.length) return null;
  list.splice(spot.index, 0, node);
  return copy;
}

/** Levels of groups a node holds: 0 for a layer, 1 for a group without subgroups. */
export function groupHeight(node: LayerTreeNode): number {
  if (node.kind === "layer") return 0;
  return 1 + Math.max(0, ...node.children.map(groupHeight));
}

/** The layers inside a group, its subgroups' included. */
export function layersInGroup(
  layers: GeoLibreLayer[],
  groups: LayerGroup[],
  groupId: string,
): GeoLibreLayer[] {
  const parentOf = new Map(groups.map((g) => [g.id, g.parentId] as const));
  return layers.filter((layer) => {
    let id = layer.groupId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      if (id === groupId) return true;
      seen.add(id);
      id = parentOf.get(id);
    }
    return false;
  });
}

/** The level a group sits at: 1 at the top of the panel; 0 for "no group". */
export function groupLevel(groups: LayerGroup[], groupId: string | null): number {
  if (groupId === null) return 0;
  const byId = new Map(groups.map((g) => [g.id, g] as const));
  let level = 0;
  let id: string | undefined = groupId;
  const seen = new Set<string>();
  while (id && byId.has(id) && !seen.has(id)) {
    seen.add(id);
    level += 1;
    id = byId.get(id)?.parentId;
  }
  return level;
}

/** Whether a node can go inside `parentId` without passing the depth limit. */
export function withinDepthLimit(
  groups: LayerGroup[],
  node: LayerTreeNode,
  parentId: string | null,
): boolean {
  return groupLevel(groups, parentId) + groupHeight(node) <= MAX_GROUP_LEVELS;
}
