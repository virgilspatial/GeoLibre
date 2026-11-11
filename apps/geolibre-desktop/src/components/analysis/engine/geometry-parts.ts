import type { Geometry } from "geojson";

/**
 * SWIFTMAP (Change 43): geometries as plain coordinate parts, for the overlay
 * tools. Heights are dropped (the tools are 2D). GeometryCollections aren't
 * handled: the tools skip them.
 */
export type Pos = [number, number];
export type Ring = Pos[];
/** A polygon: its outer ring, then any holes. */
export type Poly = Ring[];
export type MultiPoly = Poly[];
/** [minX, minY, maxX, maxY] */
export type Box = [number, number, number, number];

export type Shape = "point" | "line" | "polygon";

export interface Parts {
  shape: Shape;
  points: Pos[];
  lines: Pos[][];
  polygons: MultiPoly;
}

/**
 * A geometry's parts, or null for no geometry or a GeometryCollection. With
 * `grid`, coordinates are rounded to it, so edges that a projection round trip
 * left a hair apart coincide again (polygon overlay fails on near misses).
 */
export function partsOf(geometry: Geometry | null, grid?: number): Parts | null {
  if (!geometry) return null;
  const snap = grid ? (value: number) => Math.round(value / grid) * grid : (value: number) => value;
  const pos = (position: number[]): Pos => [snap(position[0]!), snap(position[1]!)];
  const empty = { points: [], lines: [], polygons: [] };
  switch (geometry.type) {
    case "Point":
      return { ...empty, shape: "point", points: [pos(geometry.coordinates)] };
    case "MultiPoint":
      return { ...empty, shape: "point", points: geometry.coordinates.map(pos) };
    case "LineString":
      return { ...empty, shape: "line", lines: [geometry.coordinates.map(pos)] };
    case "MultiLineString":
      return { ...empty, shape: "line", lines: geometry.coordinates.map((l) => l.map(pos)) };
    case "Polygon":
      return { ...empty, shape: "polygon", polygons: [geometry.coordinates.map((r) => r.map(pos))] };
    case "MultiPolygon":
      return {
        ...empty,
        shape: "polygon",
        polygons: geometry.coordinates.map((p) => p.map((r) => r.map(pos))),
      };
    default:
      return null;
  }
}

/** A geometry from parts of one shape, or null when there are none. */
export function geometryOf(shape: Shape, parts: Pos[] | Pos[][] | MultiPoly): Geometry | null {
  if (parts.length === 0) return null;
  if (shape === "point") {
    const points = parts as Pos[];
    return points.length === 1
      ? { type: "Point", coordinates: points[0]! }
      : { type: "MultiPoint", coordinates: points };
  }
  if (shape === "line") {
    const lines = parts as Pos[][];
    return lines.length === 1
      ? { type: "LineString", coordinates: lines[0]! }
      : { type: "MultiLineString", coordinates: lines };
  }
  const polygons = parts as MultiPoly;
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0]! }
    : { type: "MultiPolygon", coordinates: polygons };
}

/** The bounding box of some positions, or null when there are none. */
export function boxOf(positions: Iterable<Pos>): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of positions) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

/** Every position of some parts. */
export function* positionsOf(parts: Parts): Generator<Pos> {
  yield* parts.points;
  for (const line of parts.lines) yield* line;
  for (const polygon of parts.polygons) for (const ring of polygon) yield* ring;
}

export const boxesOverlap = (a: Box, b: Box) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
