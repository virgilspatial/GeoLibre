import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useAppStore } from "@geolibre/core";
import type { GeoLibreLayer, LayerGroup } from "@geolibre/core";
import {
  buildLayerTree,
  childrenAt,
  detachNode,
  engineKeepsTree,
  insertNode,
  type LayerTreeNode,
  nodeKey,
  serializeTree,
  type TreeSpot,
  withinDepthLimit,
  writeLayerTree,
} from "./layer-tree";

/**
 * SWIFTMAP: drag and drop for the Layers panel (Change 18). Grab a layer or
 * group row anywhere on its name line, with no handle; a drag starts only once
 * the pointer has moved a few pixels, so a click selects and a double-click
 * renames as before. The dragged row stays in place, faded; the rows below
 * slide down to open a gap with a 2px line in it, or a group is outlined to
 * drop inside it. Only spots the engine keeps are offered (Change 18), and
 * groups nest up to three levels. A drop is one store write, so one Undo.
 *
 * Mouse and pen only: on touch screens a move scrolls the list, and the ⋯
 * menus' Move items do the same job.
 */

/** Pixels the pointer must move before a press becomes a drag. */
const DRAG_THRESHOLD = 5;
/** How close to the list's top or bottom edge the list starts scrolling. */
const SCROLL_EDGE = 28;
const SCROLL_STEP = 8;
const SLIDE_MS = 180;
/**
 * The gap the rows open around the drop line. Kept small: a gap as tall as a
 * row slid the row under the pointer out of reach, so a drop below the last
 * row, or below a group's own layers, could not be aimed at.
 */
const GAP = 10;

export type DragIndicator =
  | { kind: "line"; top: number }
  | { kind: "outline"; top: number; height: number; left: number; width: number };

interface RowGeometry {
  key: string;
  el: HTMLElement;
  /** The row's whole extent (a group's includes its cards and empty box). */
  top: number;
  bottom: number;
  /** The part that answers the pointer: a group's header line only. */
  hitTop: number;
  hitBottom: number;
  hitLeft: number;
  hitWidth: number;
}

type Target =
  | { kind: "line"; spot: TreeSpot; y: number }
  | { kind: "into"; spot: TreeSpot; groupKey: string };

interface ActiveDrag {
  key: string;
  node: LayerTreeNode;
  tree: LayerTreeNode[];
  detached: LayerTreeNode[];
  layers: GeoLibreLayer[];
  groups: LayerGroup[];
  rows: RowGeometry[];
  rowByKey: Map<string, RowGeometry>;
  emptyBoxes: { groupId: string; top: number; bottom: number }[];
  /** Every direct child of the list, with its top, for the sliding gap. */
  slides: { el: HTMLElement; top: number }[];
  gap: number;
  lineSpots: { spot: TreeSpot; y: number }[];
  valid: Map<string, boolean>;
  target: Target | null;
  depthWarned: boolean;
  lastY: number;
  lastX: number;
  scrollFrame: number | null;
}

interface Gesture {
  pointerId: number;
  key: string;
  x: number;
  y: number;
}

interface UseRowDragOptions {
  listRef: RefObject<HTMLDivElement | null>;
  /** Off while searching (the list is filtered, so positions mislead). */
  enabled: boolean;
  /** Whether this node may be dragged (collaboration locks, renames). */
  canDrag: (key: string) => boolean;
  /** Called once per drag when the pointer is over a spot past the depth limit. */
  onDepthLimit: () => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function spotId(spot: TreeSpot): string {
  return `${spot.parentId ?? ""}|${spot.index}`;
}

function subtreeKeys(node: LayerTreeNode, into = new Set<string>()): Set<string> {
  into.add(nodeKey(node));
  if (node.kind === "group") for (const child of node.children) subtreeKeys(child, into);
  return into;
}

export function useRowDrag({ listRef, enabled, canDrag, onDepthLimit }: UseRowDragOptions) {
  const [indicator, setIndicator] = useState<DragIndicator | null>(null);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const active = useRef<ActiveDrag | null>(null);
  const pendingSlide = useRef<Map<string, number> | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const options = useRef({ canDrag, onDepthLimit });
  options.current = { canDrag, onDepthLimit };

  // Rows slide from where they were drawn to where the drop put them.
  useLayoutEffect(() => {
    const before = pendingSlide.current;
    const list = listRef.current;
    if (!before || !list) return;
    pendingSlide.current = null;
    if (prefersReducedMotion()) return;
    const moved: HTMLElement[] = [];
    for (const el of list.querySelectorAll<HTMLElement>(":scope > [data-drag-key]")) {
      const old = before.get(el.dataset.dragKey ?? "");
      if (old === undefined) continue;
      const dy = old - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      moved.push(el);
    }
    if (moved.length === 0) return;
    void list.offsetHeight; // apply the start positions before sliding
    for (const el of moved) {
      el.style.transition = `transform ${SLIDE_MS}ms ease`;
      el.style.transform = "";
    }
    window.setTimeout(() => {
      for (const el of moved) el.style.transition = "";
    }, SLIDE_MS + 40);
  });

  useEffect(() => () => cleanup.current?.(), []);

  const contentY = (list: HTMLElement, clientY: number) =>
    clientY - list.getBoundingClientRect().top;

  /** Measure the rows and work out every spot the dragged node can land. */
  const begin = (key: string): ActiveDrag | null => {
    const list = listRef.current;
    if (!list) return null;
    const { layers, layerGroups: groups } = useAppStore.getState();
    const tree = buildLayerTree(layers, groups);
    const { tree: detached, node } = detachNode(tree, key);
    if (!node) return null;
    // A drag that starts while rows still slide from the last drop measures
    // them where they end up.
    for (const el of list.children) {
      if (!(el instanceof HTMLElement)) continue;
      el.style.transition = "none";
      el.style.transform = "";
    }
    const listTop = list.getBoundingClientRect().top;
    const listLeft = list.getBoundingClientRect().left;
    const dragged = subtreeKeys(node);
    const rows: RowGeometry[] = [];
    for (const el of list.querySelectorAll<HTMLElement>(":scope > [data-drag-key]")) {
      const rowKey = el.dataset.dragKey ?? "";
      const box = el.getBoundingClientRect();
      const hit = (el.querySelector<HTMLElement>("[data-drag-grip]") ?? el).getBoundingClientRect();
      const row: RowGeometry = {
        key: rowKey,
        el,
        top: box.top - listTop,
        bottom: box.bottom - listTop,
        hitTop: hit.top - listTop,
        hitBottom: hit.bottom - listTop,
        hitLeft: hit.left - listLeft,
        hitWidth: hit.width,
      };
      if (dragged.has(rowKey)) el.style.opacity = "0.45";
      rows.push(row);
    }
    const emptyBoxes = [...list.querySelectorAll<HTMLElement>("[data-drop-into]")]
      .filter((el) => !dragged.has(`group:${el.dataset.dropInto}`))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { groupId: el.dataset.dropInto ?? "", top: r.top - listTop, bottom: r.bottom - listTop };
      });
    const slides = [...list.children]
      .filter((el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute("data-drag-overlay"))
      .map((el) => ({ el, top: el.getBoundingClientRect().top - listTop }));
    if (!prefersReducedMotion()) {
      for (const { el } of slides) el.style.transition = `transform ${SLIDE_MS}ms ease`;
    }
    const rowByKey = new Map(rows.map((row) => [row.key, row] as const));
    const drag: ActiveDrag = {
      key,
      node,
      tree,
      detached,
      layers,
      groups,
      rows: rows.filter((row) => !dragged.has(row.key)),
      rowByKey,
      emptyBoxes,
      slides,
      gap: GAP,
      lineSpots: [],
      valid: new Map(),
      target: null,
      depthWarned: false,
      lastY: 0,
      lastX: 0,
      scrollFrame: null,
    };
    drag.lineSpots = collectLineSpots(drag);
    return drag;
  };

  /** Top of a node's row, or the bottom of everything drawn for it. */
  const rowTop = (drag: ActiveDrag, node: LayerTreeNode) => drag.rowByKey.get(nodeKey(node))?.top;
  const rowBottom = (drag: ActiveDrag, node: LayerTreeNode): number | undefined => {
    const own = drag.rowByKey.get(nodeKey(node))?.bottom;
    if (own === undefined || node.kind === "layer") return own;
    return Math.max(own, ...node.children.map((child) => rowBottom(drag, child) ?? own));
  };

  const lineY = (drag: ActiveDrag, spot: TreeSpot): number | undefined => {
    const list = childrenAt(drag.detached, spot.parentId);
    if (!list) return undefined;
    const next = list[spot.index];
    if (next) {
      const top = rowTop(drag, next);
      if (top !== undefined) return top;
    }
    const previous = list[spot.index - 1];
    return previous ? rowBottom(drag, previous) : undefined;
  };

  const spotValid = (drag: ActiveDrag, spot: TreeSpot): boolean => {
    const id = spotId(spot);
    const cached = drag.valid.get(id);
    if (cached !== undefined) return cached;
    const next = insertNode(drag.detached, drag.node, spot);
    const ok =
      next !== null &&
      withinDepthLimit(drag.groups, drag.node, spot.parentId) &&
      engineKeepsTree(next, drag.layers, drag.groups);
    drag.valid.set(id, ok);
    return ok;
  };

  /** Every line spot that is drawn (its rows are showing) and kept by the engine. */
  function collectLineSpots(drag: ActiveDrag): { spot: TreeSpot; y: number }[] {
    const spots: { spot: TreeSpot; y: number }[] = [];
    const visit = (children: LayerTreeNode[], parentId: string | null) => {
      for (let index = 0; index <= children.length; index++) {
        const spot = { parentId, index };
        const y = lineY(drag, spot);
        if (y !== undefined && spotValid(drag, spot)) spots.push({ spot, y });
      }
      for (const child of children) {
        // Only a drawn, expanded group shows its children.
        if (child.kind !== "group" || !drag.rowByKey.has(nodeKey(child))) continue;
        const group = drag.groups.find((g) => g.id === child.id);
        if (group && !group.collapsed) visit(child.children, child.id);
      }
    };
    visit(drag.detached, null);
    return spots;
  }

  const positionOf = (drag: ActiveDrag, key: string): TreeSpot | null => {
    const find = (children: LayerTreeNode[], parentId: string | null): TreeSpot | null => {
      for (let index = 0; index < children.length; index++) {
        const child = children[index];
        if (nodeKey(child) === key) return { parentId, index };
        if (child.kind === "group") {
          const inner = find(child.children, child.id);
          if (inner) return inner;
        }
      }
      return null;
    };
    return find(drag.detached, null);
  };

  /** Drop inside a group: the first spot in it the engine keeps. */
  const intoTarget = (drag: ActiveDrag, groupId: string): Target | "depth" | null => {
    if (!withinDepthLimit(drag.groups, drag.node, groupId)) return "depth";
    const children = childrenAt(drag.detached, groupId) ?? [];
    for (let index = 0; index <= children.length; index++) {
      const spot = { parentId: groupId, index };
      if (spotValid(drag, spot)) return { kind: "into", spot, groupKey: `group:${groupId}` };
    }
    return null;
  };

  /** A line spot, or the nearest kept one when the engine can't keep it. */
  const lineTarget = (drag: ActiveDrag, spot: TreeSpot, y: number): Target | "depth" | null => {
    if (!withinDepthLimit(drag.groups, drag.node, spot.parentId)) return "depth";
    if (spotValid(drag, spot)) {
      const at = lineY(drag, spot);
      if (at !== undefined) return { kind: "line", spot, y: at };
    }
    // The nearest kept spot; of spots drawn at the same height (the end of a
    // group and the spot below it), the one at the level aimed at.
    const distance = (candidate: { spot: TreeSpot; y: number }) =>
      Math.abs(candidate.y - y) + (candidate.spot.parentId === spot.parentId ? 0 : 0.5);
    let best: { spot: TreeSpot; y: number } | null = null;
    for (const candidate of drag.lineSpots) {
      if (!best || distance(candidate) < distance(best)) best = candidate;
    }
    return best ? { kind: "line", ...best } : null;
  };

  const targetAt = (drag: ActiveDrag, y: number): Target | "depth" | null => {
    for (const box of drag.emptyBoxes) {
      if (y >= box.top && y < box.bottom) return intoTarget(drag, box.groupId);
    }
    const rows = drag.rows;
    if (rows.length === 0) return lineTarget(drag, { parentId: null, index: drag.detached.length }, y);
    let row = rows.find((candidate) => y >= candidate.hitTop && y < candidate.hitBottom);
    if (!row) {
      if (y < rows[0].hitTop) row = rows[0];
      else if (y >= Math.max(...rows.map((candidate) => candidate.bottom))) {
        return lineTarget(drag, { parentId: null, index: drag.detached.length }, y);
      } else {
        row = rows.reduce((best, candidate) =>
          Math.min(Math.abs(candidate.hitTop - y), Math.abs(candidate.hitBottom - y)) <
          Math.min(Math.abs(best.hitTop - y), Math.abs(best.hitBottom - y))
            ? candidate
            : best,
        );
      }
    }
    const position = positionOf(drag, row.key);
    if (!position) return null;
    const fraction = (y - row.hitTop) / Math.max(1, row.hitBottom - row.hitTop);
    const after = { parentId: position.parentId, index: position.index + 1 };
    if (row.key.startsWith("layer:")) {
      return lineTarget(drag, fraction < 0.5 ? position : after, y);
    }
    const groupId = row.key.slice("group:".length);
    const collapsed = drag.groups.find((g) => g.id === groupId)?.collapsed ?? false;
    if (fraction < 0.25) return lineTarget(drag, position, y);
    if (collapsed && fraction > 0.75) return lineTarget(drag, after, y);
    return intoTarget(drag, groupId);
  };

  const sameTarget = (a: Target | null, b: Target | null) =>
    a === b ||
    (a !== null && b !== null && a.kind === b.kind && spotId(a.spot) === spotId(b.spot));

  /** Show a target: open the gap and draw the line, or outline the group. */
  const show = (drag: ActiveDrag, target: Target | null) => {
    if (sameTarget(drag.target, target)) return;
    drag.target = target;
    const gapAt = target?.kind === "line" ? target.y : null;
    for (const { el, top } of drag.slides) {
      el.style.transform = gapAt !== null && top >= gapAt - 0.5 ? `translateY(${drag.gap}px)` : "";
    }
    if (!target) {
      setIndicator(null);
    } else if (target.kind === "line") {
      setIndicator({ kind: "line", top: target.y + drag.gap / 2 - 1 });
    } else {
      const row = drag.rowByKey.get(target.groupKey);
      setIndicator(
        row
          ? {
              kind: "outline",
              top: row.hitTop,
              height: row.hitBottom - row.hitTop,
              left: row.hitLeft,
              width: row.hitWidth,
            }
          : null,
      );
    }
  };

  const update = (drag: ActiveDrag) => {
    const list = listRef.current;
    const viewport = list?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? list;
    if (!list || !viewport) return;
    const bounds = viewport.getBoundingClientRect();
    // Away from the list, a release drops nothing.
    if (drag.lastX < bounds.left - 24 || drag.lastX > bounds.right + 24) {
      show(drag, null);
      return;
    }
    // Measured against where the rows were before the gap opened: the gap is
    // small enough (GAP) that the row under the pointer never slides away.
    const target = targetAt(drag, contentY(list, drag.lastY));
    if (target === "depth") {
      show(drag, null);
      if (!drag.depthWarned) {
        drag.depthWarned = true;
        options.current.onDepthLimit();
      }
      return;
    }
    show(drag, target);
  };

  const autoScroll = (drag: ActiveDrag) => {
    const viewport = listRef.current?.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const step =
      drag.lastY < bounds.top + SCROLL_EDGE
        ? -SCROLL_STEP
        : drag.lastY > bounds.bottom - SCROLL_EDGE
          ? SCROLL_STEP
          : 0;
    if (step === 0 || drag.scrollFrame !== null) return;
    const tick = () => {
      drag.scrollFrame = null;
      if (active.current !== drag) return;
      const now = viewport.getBoundingClientRect();
      const still =
        (step < 0 && drag.lastY < now.top + SCROLL_EDGE) ||
        (step > 0 && drag.lastY > now.bottom - SCROLL_EDGE);
      if (!still) return;
      const before = viewport.scrollTop;
      viewport.scrollTop += step;
      if (viewport.scrollTop === before) return;
      update(drag);
      drag.scrollFrame = window.requestAnimationFrame(tick);
    };
    drag.scrollFrame = window.requestAnimationFrame(tick);
  };

  /** Put every row back as it was drawn. */
  const restore = (drag: ActiveDrag) => {
    if (drag.scrollFrame !== null) window.cancelAnimationFrame(drag.scrollFrame);
    for (const { el } of drag.slides) {
      el.style.transform = "";
      el.style.opacity = "";
    }
    for (const row of drag.rowByKey.values()) row.el.style.opacity = "";
    window.setTimeout(() => {
      for (const { el } of drag.slides) el.style.transition = "";
    }, SLIDE_MS + 40);
  };

  const finish = (drop: boolean) => {
    const drag = active.current;
    active.current = null;
    gesture.current = null;
    cleanup.current?.();
    cleanup.current = null;
    setIndicator(null);
    setDragging(false);
    if (!drag) return;
    const target = drop ? drag.target : null;
    const next = target ? insertNode(drag.detached, drag.node, target.spot) : null;
    if (!next || serializeTree(next) === serializeTree(drag.tree)) {
      restore(drag);
      return;
    }
    // Where each row is drawn now, so it can slide from there after the drop.
    const drawn = new Map<string, number>();
    for (const { el } of drag.slides) {
      const key = el.dataset.dragKey;
      if (key) drawn.set(key, el.getBoundingClientRect().top);
    }
    for (const { el } of drag.slides) {
      el.style.transition = "none";
      el.style.transform = "";
      el.style.opacity = "";
    }
    for (const row of drag.rowByKey.values()) row.el.style.opacity = "";
    pendingSlide.current = drawn;
    const written = writeLayerTree(next, drag.layers, drag.groups);
    useAppStore.setState({ ...written, isDirty: true });
    window.setTimeout(() => {
      for (const { el } of drag.slides) {
        if (el.style.transition === "none") el.style.transition = "";
      }
    }, SLIDE_MS + 40);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || gesture.current || event.button !== 0 || !event.isPrimary) return;
    if (event.pointerType === "touch") return;
    const target = event.target;
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
    if (!target.closest("[data-drag-grip]")) return;
    if (target.closest("input, textarea, select, [role='slider'], [role='toolbar']")) return;
    const control = target.closest("button, a, [role='menuitem']");
    if (control && !control.hasAttribute("data-drag-ok")) return;
    const row = target.closest<HTMLElement>("[data-drag-key]");
    const key = row?.dataset.dragKey;
    if (!key || !options.current.canDrag(key)) return;
    gesture.current = { pointerId: event.pointerId, key, x: event.clientX, y: event.clientY };

    const onMove = (move: PointerEvent) => {
      const current = gesture.current;
      if (!current || move.pointerId !== current.pointerId) return;
      let drag = active.current;
      if (!drag) {
        if (Math.hypot(move.clientX - current.x, move.clientY - current.y) < DRAG_THRESHOLD) return;
        drag = begin(current.key);
        if (!drag) {
          finish(false);
          return;
        }
        active.current = drag;
        setDragging(true);
        window.getSelection()?.removeAllRanges();
      }
      move.preventDefault();
      drag.lastX = move.clientX;
      drag.lastY = move.clientY;
      update(drag);
      autoScroll(drag);
    };
    const onUp = (up: PointerEvent) => {
      if (gesture.current && up.pointerId !== gesture.current.pointerId) return;
      if (active.current) {
        // The click that follows a drag must not select or deselect a row. It
        // comes straight after the release, if at all, so the guard goes with
        // the next click or press, whichever is first, and leaves clicks
        // elsewhere (a dialog, the map) alone.
        const stop = () => {
          window.removeEventListener("click", swallow, true);
          window.removeEventListener("pointerdown", stop, true);
        };
        const swallow = (click: MouseEvent) => {
          stop();
          if (!(click.target instanceof Node) || !listRef.current?.contains(click.target)) return;
          click.stopPropagation();
          click.preventDefault();
        };
        window.addEventListener("click", swallow, true);
        window.addEventListener("pointerdown", stop, true);
        window.setTimeout(stop, 0);
      }
      finish(true);
    };
    const onCancel = () => finish(false);
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== "Escape" || !active.current) return;
      key.preventDefault();
      key.stopPropagation();
      finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onCancel);
    cleanup.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onCancel);
    };
  };

  return { onPointerDown, indicator, dragging };
}
