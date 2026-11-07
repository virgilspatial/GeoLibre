/**
 * SWIFTMAP (Change 24): the file types the Add Data dialog's Upload tab
 * offers, and what it can tell about a file before it is added. Pure, so it
 * runs under the unit tests.
 *
 * Only formats confirmed to load in the browser build are listed (see Change 24
 * in UI_CUSTOMISATION.md for the test of each).
 */

export type UploadFamily = "vector" | "raster" | "pointCloud";

export interface UploadFormat {
  /** Shown on the file card and in "See all file types". */
  label: string;
  extensions: readonly string[];
  family: UploadFamily;
  /** The geometry every file of this format has, when it is known without reading it. */
  geometry?: GeometryFamily;
}

/** Confirmed to load in the browser build, in the order "See all file types" lists them. */
export const UPLOAD_FORMATS: readonly UploadFormat[] = [
  { label: "GeoJSON", extensions: ["geojson", "json"], family: "vector" },
  { label: "Shapefile (.zip)", extensions: ["zip"], family: "vector" },
  { label: "GeoPackage", extensions: ["gpkg"], family: "vector" },
  { label: "KML/KMZ", extensions: ["kml", "kmz"], family: "vector" },
  { label: "CSV", extensions: ["csv"], family: "vector" },
  { label: "GPX", extensions: ["gpx"], family: "vector" },
  { label: "FlatGeobuf", extensions: ["fgb"], family: "vector" },
  { label: "GeoParquet", extensions: ["parquet", "geoparquet"], family: "vector" },
  { label: "GeoTIFF", extensions: ["tif", "tiff"], family: "raster" },
  { label: "LAS/LAZ", extensions: ["las", "laz"], family: "pointCloud" },
  // Placed from each photo's EXIF GPS position by GeoLibre's drop pipeline.
  {
    label: "Geotagged photos (.jpg)",
    extensions: ["jpg", "jpeg"],
    family: "vector",
    geometry: "Point",
  },
];

/** The formats a viewer may upload (handoff, "Add Data dialog", viewers). */
export const VIEWER_UPLOAD_EXTENSIONS: readonly string[] = [
  "geojson",
  "json",
  "zip",
  "kml",
  "kmz",
  "gpx",
  "csv",
];

/** A viewer's upload limit: 50 MB. */
export const VIEWER_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

/** The lower-cased extension of a file name, without the dot, or "". */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** The confirmed format a file name belongs to, or null. */
export function uploadFormatFor(name: string): UploadFormat | null {
  const ext = fileExtension(name);
  return UPLOAD_FORMATS.find((format) => format.extensions.includes(ext)) ?? null;
}

/** The file input's `accept` attribute for the given audience. */
export function uploadAccept(viewer: boolean): string {
  const extensions = viewer
    ? VIEWER_UPLOAD_EXTENSIONS
    : UPLOAD_FORMATS.flatMap((format) => format.extensions);
  return extensions.map((ext) => `.${ext}`).join(",");
}

/** "1.1 MB", "48 KB", "512 B": the file card's size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export type GeometryFamily = "Point" | "Line" | "Polygon" | "Mixed";

export interface GeoJsonSummary {
  featureCount: number;
  geometry: GeometryFamily | null;
}

/** GeoJSON larger than this isn't parsed just to fill in the card. */
export const GEOJSON_SUMMARY_MAX_BYTES = 20 * 1024 * 1024;

function geometryFamily(type: unknown): GeometryFamily | null {
  if (type === "Point" || type === "MultiPoint") return "Point";
  if (type === "LineString" || type === "MultiLineString") return "Line";
  if (type === "Polygon" || type === "MultiPolygon") return "Polygon";
  if (type === "GeometryCollection") return "Mixed";
  return null;
}

/**
 * The feature count and geometry type of a GeoJSON document, for the file card.
 *
 * @param text - The file's text.
 * @returns The summary, or null when the text isn't GeoJSON.
 */
export function summariseGeoJson(text: string): GeoJsonSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const doc = parsed as { type?: unknown; features?: unknown; geometry?: unknown };
  let geometries: unknown[];
  if (doc.type === "FeatureCollection" && Array.isArray(doc.features)) {
    geometries = doc.features.map((feature) =>
      feature && typeof feature === "object" ? (feature as { geometry?: unknown }).geometry : null,
    );
  } else if (doc.type === "Feature") {
    geometries = [doc.geometry];
  } else {
    return null;
  }
  const families = new Set<GeometryFamily>();
  for (const geometry of geometries) {
    const family =
      geometry && typeof geometry === "object"
        ? geometryFamily((geometry as { type?: unknown }).type)
        : null;
    if (family) families.add(family);
  }
  const [only] = families;
  return {
    featureCount: geometries.length,
    geometry: families.size === 0 ? null : families.size === 1 && only ? only : "Mixed",
  };
}
