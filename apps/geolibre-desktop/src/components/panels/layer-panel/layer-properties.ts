import type { TFunction } from "i18next";
import type { GeoLibreLayer } from "@geolibre/core";
import type { RasterInfo } from "../../../lib/raster-info";
import { isAnalysisResult, lineageRows, measuredInRow, originOf } from "../../analysis/origin";

/**
 * SWIFTMAP: the rows of the Layers panel's Properties card (Change 17): what
 * GeoLibre already knows about a layer, as label/value pairs. A row GeoLibre
 * cannot answer is left out rather than shown empty. The lineage rows (tool,
 * inputs, settings, who, when) wait for Vault in Stage 1.
 *
 * Never shows a server address: a web source is named by its kind only.
 */
export interface LayerPropertyRow {
  label: string;
  value: string;
  /** A full-width muted line in place of a label and value ("Origin not recorded"). */
  note?: boolean;
}

/** File extensions, lower case, and the format name shown for them. */
const FORMAT_BY_EXTENSION: Record<string, string> = {
  geojson: "GeoJSON",
  json: "GeoJSON",
  gpkg: "GeoPackage",
  shp: "Shapefile",
  zip: "Shapefile (zipped)",
  kml: "KML",
  kmz: "KMZ",
  csv: "CSV",
  gpx: "GPX",
  fgb: "FlatGeobuf",
  parquet: "GeoParquet",
  geoparquet: "GeoParquet",
  gml: "GML",
  tif: "GeoTIFF",
  tiff: "GeoTIFF",
  las: "LAS",
  laz: "LAZ",
  pmtiles: "PMTiles",
  mbtiles: "MBTiles",
};

/** The format name for a layer type, when no file extension says more. */
const FORMAT_BY_TYPE: Partial<Record<GeoLibreLayer["type"], string>> = {
  geojson: "GeoJSON",
  raster: "Raster",
  wms: "WMS",
  wmts: "WMTS",
  xyz: "Raster tiles",
  "vector-tiles": "Vector tiles",
  arcgis: "ArcGIS",
  pmtiles: "PMTiles",
  mbtiles: "MBTiles",
  zarr: "Zarr",
  lidar: "Point cloud",
  "gaussian-splat": "Gaussian splat",
  "3d-tiles": "3D Tiles",
  cog: "Cloud Optimized GeoTIFF",
  flatgeobuf: "FlatGeobuf",
  geoparquet: "GeoParquet",
  "duckdb-query": "SQL query",
  video: "Video",
  image: "Image",
};

function isUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

/** The last path segment of a local path or URL, without a query string. */
function baseName(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? path;
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? clean;
}

function extensionOf(name: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1]!.toLowerCase() : null;
}

/** A local file name the layer was read from, if any. */
function localFileName(layer: GeoLibreLayer): string | null {
  const path = layer.sourcePath;
  if (typeof path !== "string" || !path.trim()) return null;
  if (isUrl(path) && !/^(file|content):\/\//i.test(path)) return null;
  return baseName(path);
}

/** A remote URL the layer reads from, if any (used for its kind and extension only). */
function remoteUrl(layer: GeoLibreLayer): string | null {
  const candidates = [layer.sourcePath, layer.source?.url, layer.metadata?.originalUrl];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
  }
  const tiles = layer.source?.tiles;
  if (Array.isArray(tiles) && typeof tiles[0] === "string" && /^https?:\/\//i.test(tiles[0])) {
    return tiles[0];
  }
  return null;
}

function sourceValue(layer: GeoLibreLayer, t: TFunction): string {
  const file = localFileName(layer);
  if (file) return file;
  if (remoteUrl(layer)) {
    if (layer.type === "wms" || layer.type === "wmts") return t("layerPanel.sourceWebMapService");
    if (layer.type === "arcgis") return t("layerPanel.sourceArcgisService");
    if (layer.type === "xyz" || layer.type === "vector-tiles") {
      return t("layerPanel.sourceTileService");
    }
    return t("layerPanel.sourceWebLink");
  }
  return t("layerPanel.sourceThisMap");
}

function formatValue(layer: GeoLibreLayer): string | null {
  const name = localFileName(layer) ?? remoteUrl(layer);
  const ext = name ? extensionOf(baseName(name)) : null;
  if (ext && FORMAT_BY_EXTENSION[ext]) return FORMAT_BY_EXTENSION[ext]!;
  return FORMAT_BY_TYPE[layer.type] ?? null;
}

function crsValue(
  layer: GeoLibreLayer,
  t: TFunction,
  raster: RasterInfo | "loading" | null,
): string | null {
  if (raster === "loading") return t("layerPanel.propReading");
  if (raster) {
    // The label is already "EPSG:<code>" when the file declares one.
    return raster.epsg && !raster.crs.includes(String(raster.epsg))
      ? `${raster.crs} (EPSG:${raster.epsg})`
      : raster.crs;
  }
  // GeoLibre holds vector features as GeoJSON, which is always WGS 84.
  if (layer.type === "geojson") return t("layerPanel.crsWgs84");
  if (layer.type === "xyz" || layer.type === "vector-tiles" || layer.type === "wmts") {
    return t("layerPanel.crsWebMercator");
  }
  return null;
}

/**
 * The Properties card rows for a layer.
 *
 * @param layer - The layer shown.
 * @param t - The translator.
 * @param language - The UI language, for number and date formatting.
 * @param raster - GeoTIFF header facts for a raster: `"loading"` while read,
 *   `null` when there are none.
 */
export function layerPropertyRows(
  layer: GeoLibreLayer,
  t: TFunction,
  language: string,
  raster: RasterInfo | "loading" | null = null,
): LayerPropertyRow[] {
  const analysis = isAnalysisResult(layer);
  const origin = analysis ? originOf(layer) : null;
  const rows: LayerPropertyRow[] = [];
  if (origin) {
    rows.push(...lineageRows(origin, t, language));
  } else if (analysis) {
    rows.push({ label: "", value: t("swiftmapAnalysis.prop.originMissing"), note: true });
  } else {
    rows.push({ label: t("layerPanel.propSource"), value: sourceValue(layer, t) });
    const format = formatValue(layer);
    if (format) rows.push({ label: t("layerPanel.propFormat"), value: format });
  }
  const features = layer.geojson?.features;
  if (Array.isArray(features)) {
    rows.push({
      label: t("layerPanel.propFeatures"),
      value: new Intl.NumberFormat(language).format(features.length),
    });
  }
  const crs = crsValue(layer, t, raster);
  if (crs) rows.push({ label: t("layerPanel.propCrs"), value: crs });
  if (origin) rows.push(measuredInRow(origin, t));
  const synced = layer.connection?.lastSyncedAt;
  const syncedDate = synced ? new Date(synced) : null;
  if (syncedDate && !Number.isNaN(syncedDate.getTime())) {
    rows.push({
      label: t("layerPanel.propUpdated"),
      value: new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
        syncedDate,
      ),
    });
  }
  return rows;
}
