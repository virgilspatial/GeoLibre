import proj4 from "proj4";
import type { Geometry, Position } from "geojson";
import type { AnalysisZone } from "./zone";

/**
 * SWIFTMAP (Change 37): moving geometries between longitude/latitude and an
 * analysis zone's metres. Inputs are held as EPSG:4326, read as GDA2020 with
 * no shift in an MGA zone (approved).
 */
export interface ZoneProjection {
  /** Longitude/latitude to the zone's easting/northing. */
  toZone: (geometry: Geometry) => Geometry;
  /** The zone's easting/northing back to longitude/latitude. */
  fromZone: (geometry: Geometry) => Geometry;
}

/** Applies `convert` to every position of a geometry, returning a new geometry. */
export function mapPositions(
  geometry: Geometry,
  convert: (position: Position) => Position,
): Geometry {
  const line = (positions: Position[]) => positions.map(convert);
  switch (geometry.type) {
    case "Point":
      return { type: "Point", coordinates: convert(geometry.coordinates) };
    case "MultiPoint":
      return { type: "MultiPoint", coordinates: line(geometry.coordinates) };
    case "LineString":
      return { type: "LineString", coordinates: line(geometry.coordinates) };
    case "MultiLineString":
      return { type: "MultiLineString", coordinates: geometry.coordinates.map(line) };
    case "Polygon":
      return { type: "Polygon", coordinates: geometry.coordinates.map(line) };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon) => polygon.map(line)),
      };
    case "GeometryCollection":
      return {
        type: "GeometryCollection",
        geometries: geometry.geometries.map((part) => mapPositions(part, convert)),
      };
  }
}

/** The projection to and from an analysis zone. */
export function zoneProjection(zone: AnalysisZone): ZoneProjection {
  const converter = proj4("EPSG:4326", zone.proj4);
  // Only x and y are projected; a height is dropped, as the tools are 2D.
  const forward = (position: Position): Position => {
    const [x, y] = converter.forward([position[0]!, position[1]!]);
    return [x!, y!];
  };
  const inverse = (position: Position): Position => {
    const [lon, lat] = converter.inverse([position[0]!, position[1]!]);
    return [lon!, lat!];
  };
  return {
    toZone: (geometry) => mapPositions(geometry, forward),
    fromZone: (geometry) => mapPositions(geometry, inverse),
  };
}
