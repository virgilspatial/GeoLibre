import type { Feature, Geometry, Position } from "geojson";
import { round2 } from "./common";
import { planarArea } from "./planar-area";
import type { AnalysisZone } from "./zone";

/**
 * SWIFTMAP (Change 37, lengths since Change 43): the measured fields a result
 * feature carries, labelled with the zone they were measured in. Polygons get
 * an area, lines a length, points nothing.
 */

/** "Area m² (MGA 56)" */
export function areaFieldName(zone: AnalysisZone): string {
  return `Area m² (${zone.label})`;
}

/** "Length m (MGA 56)" */
export function lengthFieldName(zone: AnalysisZone): string {
  return `Length m (${zone.label})`;
}

function lineLength(line: Position[]): number {
  let length = 0;
  for (let i = 1; i < line.length; i += 1) {
    length += Math.hypot(line[i]![0]! - line[i - 1]![0]!, line[i]![1]! - line[i - 1]![1]!);
  }
  return length;
}

/** The length of a projected geometry's lines, in its coordinate unit; others have none. */
export function planarLength(geometry: Geometry | null): number {
  if (!geometry) return 0;
  switch (geometry.type) {
    case "LineString":
      return lineLength(geometry.coordinates);
    case "MultiLineString":
      return geometry.coordinates.reduce((sum, line) => sum + lineLength(line), 0);
    case "GeometryCollection":
      return geometry.geometries.reduce((sum, part) => sum + planarLength(part), 0);
    default:
      return 0;
  }
}

/**
 * The properties of a result feature: `properties` plus the measured field
 * for the projected geometry's shape. Fields of the zone's measured names are
 * removed first, so an input's old value is replaced, never carried over.
 */
export function withMeasurement(
  projected: Geometry,
  properties: Feature["properties"],
  zone: AnalysisZone,
): Record<string, unknown> {
  const area = areaFieldName(zone);
  const length = lengthFieldName(zone);
  const { [area]: _area, [length]: _length, ...rest } = properties ?? {};
  switch (projected.type) {
    case "Polygon":
    case "MultiPolygon":
      return { ...rest, [area]: round2(planarArea(projected)) };
    case "LineString":
    case "MultiLineString":
      return { ...rest, [length]: round2(planarLength(projected)) };
    default:
      return rest;
  }
}
