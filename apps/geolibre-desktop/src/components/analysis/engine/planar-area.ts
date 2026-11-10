import type { Geometry, Position } from "geojson";

/**
 * SWIFTMAP (Change 37): planar area of a projected geometry, in the square of
 * its coordinate unit (square metres in an analysis zone). Turf's `area()`
 * assumes degrees, so the tools measure with this instead.
 */
function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!);
  }
  return Math.abs(sum) / 2;
}

function polygonArea(rings: Position[][]): number {
  if (rings.length === 0) return 0;
  const [outer, ...holes] = rings;
  return holes.reduce((area, hole) => area - ringArea(hole), ringArea(outer!));
}

/** The area of a geometry's polygons; points and lines have none. */
export function planarArea(geometry: Geometry | null): number {
  if (!geometry) return 0;
  switch (geometry.type) {
    case "Polygon":
      return polygonArea(geometry.coordinates);
    case "MultiPolygon":
      return geometry.coordinates.reduce((area, polygon) => area + polygonArea(polygon), 0);
    case "GeometryCollection":
      return geometry.geometries.reduce((area, part) => area + planarArea(part), 0);
    default:
      return 0;
  }
}
