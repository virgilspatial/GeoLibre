import type { FeatureCollection, Geometry, Position } from "geojson";

/**
 * SWIFTMAP (Change 37): the projected zone an analysis run measures in. One
 * zone per run, chosen from the centre of the inputs' combined extent:
 * GDA2020 / MGA (EPSG:7849–7856) for Australian data, WGS 84 / UTM elsewhere.
 * See `BACKEND_INFRASTRUCTURE.md`, "Accuracy: measure in a projected metric CRS".
 */
export interface AnalysisZone {
  /** UTM zone number, 1–60. */
  zone: number;
  /** True for the southern hemisphere (false north). */
  south: boolean;
  /** "mga" for GDA2020 / MGA, "utm" for WGS 84 / UTM. */
  kind: "mga" | "utm";
  epsg: number;
  /** Short label for measured values, e.g. "MGA 56" or "UTM 30N". */
  label: string;
  /** Full CRS name, e.g. "GDA2020 / MGA zone 56". */
  name: string;
  /** The zone's central meridian, in degrees. */
  centralMeridian: number;
  /** A proj4 definition for the zone. */
  proj4: string;
}

/** [west, south, east, north] in degrees. */
export type Extent = [number, number, number, number];

const FIRST_MGA_ZONE = 49;
const LAST_MGA_ZONE = 56;
/** Latitudes, in degrees, treated as Australian when the zone is an MGA zone. */
const AUSTRALIA_NORTH = -8;
const AUSTRALIA_SOUTH = -48;

/** How far outside the chosen zone, in degrees, the data may reach before a warning. */
export const ZONE_WARNING_DEGREES = 1;

/** The UTM zone number for a longitude, wrapped into -180..180. */
export function utmZoneOf(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return Math.min(60, Math.floor((wrapped + 180) / 6) + 1);
}

/** The zone to measure in for data centred on (lon, lat). */
export function zoneFor(lon: number, lat: number): AnalysisZone {
  const zone = utmZoneOf(lon);
  const south = lat < 0;
  const centralMeridian = zone * 6 - 183;
  const mga =
    zone >= FIRST_MGA_ZONE &&
    zone <= LAST_MGA_ZONE &&
    lat <= AUSTRALIA_NORTH &&
    lat >= AUSTRALIA_SOUTH;
  if (mga) {
    return {
      zone,
      south: true,
      kind: "mga",
      epsg: 7800 + zone,
      label: `MGA ${zone}`,
      name: `GDA2020 / MGA zone ${zone}`,
      centralMeridian,
      // GDA2020 is treated as WGS 84 with no shift (approved): distances and
      // areas are unaffected.
      proj4: `+proj=utm +zone=${zone} +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
    };
  }
  const hemisphere = south ? "S" : "N";
  return {
    zone,
    south,
    kind: "utm",
    epsg: (south ? 32700 : 32600) + zone,
    label: `UTM ${zone}${hemisphere}`,
    name: `WGS 84 / UTM zone ${zone}${hemisphere}`,
    centralMeridian,
    proj4: `+proj=utm +zone=${zone}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`,
  };
}

function visitPositions(geometry: Geometry | null, visit: (position: Position) => void): void {
  if (!geometry) return;
  switch (geometry.type) {
    case "Point":
      visit(geometry.coordinates);
      return;
    case "MultiPoint":
    case "LineString":
      geometry.coordinates.forEach(visit);
      return;
    case "MultiLineString":
    case "Polygon":
      geometry.coordinates.forEach((line) => line.forEach(visit));
      return;
    case "MultiPolygon":
      geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach(visit)));
      return;
    case "GeometryCollection":
      geometry.geometries.forEach((part) => visitPositions(part, visit));
  }
}

/** The combined extent of one or more feature collections, or null when they hold no coordinates. */
export function extentOf(collections: FeatureCollection[]): Extent | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const collection of collections) {
    for (const feature of collection.features) {
      visitPositions(feature.geometry, ([lon, lat]) => {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        if (lon < west) west = lon;
        if (lon > east) east = lon;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      });
    }
  }
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

/** The zone for an extent, from its centre. */
export function zoneForExtent(extent: Extent): AnalysisZone {
  const [west, south, east, north] = extent;
  return zoneFor((west + east) / 2, (south + north) / 2);
}

/** How far, in degrees of longitude, the extent reaches outside the zone (0 when inside). */
export function degreesOutsideZone(extent: Extent, zone: AnalysisZone): number {
  const zoneWest = zone.centralMeridian - 3;
  const zoneEast = zone.centralMeridian + 3;
  return Math.max(0, zoneWest - extent[0], extent[2] - zoneEast);
}

/** Whether the extent reaches far enough outside the zone to warn. */
export function zoneWarningFor(extent: Extent, zone: AnalysisZone): boolean {
  return degreesOutsideZone(extent, zone) > ZONE_WARNING_DEGREES;
}
