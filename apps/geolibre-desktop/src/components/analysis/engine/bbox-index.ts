import { boxesOverlap, type Box } from "./geometry-parts";

/**
 * SWIFTMAP (Change 43): a static bounding-box index (sort-tile-recursive
 * packing), so the overlay tools compare only features whose boxes overlap.
 * Written here rather than adding a dependency (user, 11 Nov 2026); built once
 * per run, never changed.
 */
interface Entry<T> {
  box: Box;
  value: T;
}

interface IndexNode<T> {
  box: Box;
  children: IndexNode<T>[] | null;
  entries: Entry<T>[] | null;
}

const NODE_SIZE = 16;

function unionBox(boxes: Box[]): Box {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    if (b[0] < box[0]) box[0] = b[0];
    if (b[1] < box[1]) box[1] = b[1];
    if (b[2] > box[2]) box[2] = b[2];
    if (b[3] > box[3]) box[3] = b[3];
  }
  return box;
}

/** Groups items into runs of NODE_SIZE: sorted by x into slices, each slice sorted by y. */
function tile<T>(items: T[], boxOf: (item: T) => Box): T[][] {
  const centreX = (item: T) => boxOf(item)[0] + boxOf(item)[2];
  const centreY = (item: T) => boxOf(item)[1] + boxOf(item)[3];
  const sorted = [...items].sort((a, b) => centreX(a) - centreX(b));
  const sliceSize = Math.ceil(Math.sqrt(Math.ceil(items.length / NODE_SIZE))) * NODE_SIZE;
  const groups: T[][] = [];
  for (let start = 0; start < sorted.length; start += sliceSize) {
    const slice = sorted.slice(start, start + sliceSize).sort((a, b) => centreY(a) - centreY(b));
    for (let i = 0; i < slice.length; i += NODE_SIZE) groups.push(slice.slice(i, i + NODE_SIZE));
  }
  return groups;
}

export class BoxIndex<T> {
  private readonly root: IndexNode<T> | null;

  constructor(entries: Entry<T>[]) {
    if (entries.length === 0) {
      this.root = null;
      return;
    }
    let level: IndexNode<T>[] = tile(entries, (entry) => entry.box).map((group) => ({
      box: unionBox(group.map((entry) => entry.box)),
      children: null,
      entries: group,
    }));
    while (level.length > 1) {
      level = tile(level, (node) => node.box).map((group) => ({
        box: unionBox(group.map((node) => node.box)),
        children: group,
        entries: null,
      }));
    }
    this.root = level[0]!;
  }

  /** The values whose boxes overlap `box` (touching counts), in no particular order. */
  search(box: Box): T[] {
    const found: T[] = [];
    const stack = this.root && boxesOverlap(this.root.box, box) ? [this.root] : [];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.entries) {
        for (const entry of node.entries) if (boxesOverlap(entry.box, box)) found.push(entry.value);
      } else {
        for (const child of node.children!) if (boxesOverlap(child.box, box)) stack.push(child);
      }
    }
    return found;
  }
}
