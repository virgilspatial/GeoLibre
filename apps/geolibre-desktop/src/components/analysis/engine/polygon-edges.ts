import { BoxIndex } from "./bbox-index";
import { boxOf, type Box, type MultiPoly, type Pos } from "./geometry-parts";

/**
 * SWIFTMAP (Change 43): the edges of some polygons, indexed, for placing
 * points and cutting lines exactly at polygon edges, in projected metres. No
 * library needed (`@turf/line-split` isn't declared, and works the same way).
 *
 * Points and line pieces on an edge count as inside, as in ArcGIS.
 */

/** Distances below this, in metres, count as touching (a micrometre). */
export const EDGE_TOLERANCE = 1e-6;

interface Edge {
  a: Pos;
  b: Pos;
}

export type Location = "inside" | "boundary" | "outside";

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

function distanceToSegment(p: Pos, { a, b }: Edge): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export class PolygonEdges {
  private readonly index: BoxIndex<Edge>;
  private readonly maxX: number;

  constructor(polygons: MultiPoly) {
    const entries: { box: Box; value: Edge }[] = [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (let i = 1; i < ring.length; i += 1) {
          const edge = { a: ring[i - 1]!, b: ring[i]! };
          entries.push({ box: boxOf([edge.a, edge.b])!, value: edge });
        }
      }
    }
    this.index = new BoxIndex(entries);
    this.maxX = entries.reduce((max, entry) => Math.max(max, entry.box[2]), -Infinity);
  }

  /** Where a point lies: on an edge, inside (an odd number of edges to its right) or outside. */
  locate(p: Pos): Location {
    const t = EDGE_TOLERANCE;
    const near = this.index.search([p[0] - t, p[1] - t, p[0] + t, p[1] + t]);
    if (near.some((edge) => distanceToSegment(p, edge) <= t)) return "boundary";
    if (!(p[0] <= this.maxX)) return "outside";
    let inside = false;
    for (const { a, b } of this.index.search([p[0], p[1], this.maxX, p[1]])) {
      if (a[1] > p[1] === b[1] > p[1]) continue;
      const x = a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (p[0] < x) inside = !inside;
    }
    return inside ? "inside" : "outside";
  }

  /**
   * The pieces of a line inside the polygons (or on their edges). Each segment
   * is split where it meets an edge, and a piece is kept when its midpoint
   * isn't outside. Pieces that meet end to end stay joined.
   */
  cutLine(line: Pos[]): Pos[][] {
    const pieces: Pos[][] = [];
    let current: Pos[] | null = null;
    const close = () => {
      if (current && lengthOf(current) > EDGE_TOLERANCE) pieces.push(current);
      current = null;
    };
    for (let i = 1; i < line.length; i += 1) {
      const p = line[i - 1]!;
      const q = line[i]!;
      const cuts = this.cutsAlong(p, q);
      const at = (t: number): Pos =>
        t === 0 ? p : t === 1 ? q : [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      for (let j = 1; j < cuts.length; j += 1) {
        const t0 = cuts[j - 1]!;
        const t1 = cuts[j]!;
        if (this.locate(at((t0 + t1) / 2)) === "outside") {
          close();
        } else if (current) {
          (current as Pos[]).push(at(t1));
        } else {
          current = [at(t0), at(t1)];
        }
      }
    }
    close();
    return pieces;
  }

  /** The sorted positions along p→q (0 to 1) where it meets an edge, with 0 and 1. */
  private cutsAlong(p: Pos, q: Pos): number[] {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) return [0, 1];
    const tol = EDGE_TOLERANCE;
    const ts: number[] = [0, 1];
    const box: Box = [
      Math.min(p[0], q[0]) - tol,
      Math.min(p[1], q[1]) - tol,
      Math.max(p[0], q[0]) + tol,
      Math.max(p[1], q[1]) + tol,
    ];
    for (const { a, b } of this.index.search(box)) {
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const edgeLength = Math.hypot(ex, ey);
      if (edgeLength === 0) continue;
      const denom = cross(dx, dy, ex, ey);
      const apx = a[0] - p[0];
      const apy = a[1] - p[1];
      if (Math.abs(denom) > 1e-12 * length * edgeLength) {
        const t = cross(apx, apy, ex, ey) / denom;
        const u = cross(apx, apy, dx, dy) / denom;
        const slack = tol / edgeLength;
        if (t > 0 && t < 1 && u >= -slack && u <= 1 + slack) ts.push(t);
      } else if (Math.abs(cross(apx, apy, dx, dy)) / length <= tol) {
        // Collinear: the shared stretch starts and ends where the edge's ends project.
        for (const end of [a, b]) {
          const t = ((end[0] - p[0]) * dx + (end[1] - p[1]) * dy) / (length * length);
          if (t > 0 && t < 1) ts.push(t);
        }
      }
    }
    ts.sort((x, y) => x - y);
    const minStep = tol / length;
    return ts.filter((t, i) => i === 0 || t === 1 || t - ts[i - 1]! > minStep);
  }
}

function lengthOf(line: Pos[]): number {
  let length = 0;
  for (let i = 1; i < line.length; i += 1) {
    length += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
  }
  return length;
}
