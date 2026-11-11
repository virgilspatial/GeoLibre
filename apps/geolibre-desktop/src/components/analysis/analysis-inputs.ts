import type { GeoLibreLayer } from "@geolibre/core";
import type { FeatureCollection } from "geojson";

/**
 * SWIFTMAP (Change 37): which layers a tool can take as input, and whether a
 * run is within the in-browser limits (`BACKEND_INFRASTRUCTURE.md`, "Size limit
 * for tool inputs"). A tool never runs on partial data: a truncated load or a
 * tile layer is refused, never analysed as if it were whole.
 */

/** Above this many input features, warn that the run may take a minute. */
export const SLOW_FEATURES = 2_000;
/** Above this many input features, refuse. */
export const MAX_FEATURES = 10_000;
/** Above this many bytes of GeoJSON, refuse. */
export const MAX_BYTES = 25 * 1024 * 1024;

/**
 * - `ok`: features are loaded in full.
 * - `tiles`: drawn from map tiles, which hold only part of the data.
 * - `partial`: only part of the layer was loaded.
 */
export type InputStatus = "ok" | "tiles" | "partial";

export interface AnalysisInput {
  layer: GeoLibreLayer;
  status: InputStatus;
}

const TILE_TYPES: ReadonlySet<string> = new Set(["vector-tiles", "pmtiles", "mbtiles"]);

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Whether a layer with loaded features holds only part of its dataset. */
export function isPartialLoad(layer: GeoLibreLayer): boolean {
  const loaded = layer.geojson?.features.length ?? 0;
  const { metadata, source } = layer;
  if (metadata.truncated === true) return true;
  const matched = finiteNumber(metadata.numberMatched);
  if (matched !== null && matched > loaded) return true;
  // A GeoLens load limited to the view, or stopped at its feature limit.
  if (Array.isArray(metadata.geolensBbox)) return true;
  const geolensLimit = finiteNumber(metadata.geolensFeatureLimit);
  if (geolensLimit !== null && loaded >= geolensLimit) return true;
  const maxFeatures = finiteNumber(source?.maxFeatures);
  if (maxFeatures !== null && loaded >= maxFeatures) return true;
  return false;
}

/** The status of a layer as a tool input, or null when it isn't a vector layer at all. */
export function inputStatusOf(layer: GeoLibreLayer): InputStatus | null {
  if (Array.isArray(layer.geojson?.features)) return isPartialLoad(layer) ? "partial" : "ok";
  const kind = layer.metadata.sourceKind;
  if (TILE_TYPES.has(layer.type) || kind === "geolens-vector-tiles") return "tiles";
  return null;
}

/** The layers a tool lists as inputs, top of the Layers panel first. */
export function analysisInputs(layers: GeoLibreLayer[]): AnalysisInput[] {
  const inputs: AnalysisInput[] = [];
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]!;
    const status = inputStatusOf(layer);
    if (status) inputs.push({ layer, status });
  }
  return inputs;
}

const byteCache = new WeakMap<FeatureCollection, number>();

/** The size of a collection as GeoJSON text, in bytes (UTF-8), cached per collection. */
export function geojsonBytes(collection: FeatureCollection): number {
  let bytes = byteCache.get(collection);
  if (bytes === undefined) {
    bytes = new TextEncoder().encode(JSON.stringify(collection)).length;
    byteCache.set(collection, bytes);
  }
  return bytes;
}

/**
 * - `ok`: run.
 * - `slow`: run, warning it may take a minute.
 * - `tooLarge`: Run is disabled.
 */
export type SizeCheck = "ok" | "slow" | "tooLarge";

/**
 * The size check across all of a run's inputs. Counts features first, from
 * what is loaded, and measures bytes only when the count is within the limit.
 */
export function sizeCheck(collections: FeatureCollection[]): SizeCheck {
  const features = collections.reduce((sum, collection) => sum + collection.features.length, 0);
  if (features > MAX_FEATURES) return "tooLarge";
  const bytes = collections.reduce((sum, collection) => sum + geojsonBytes(collection), 0);
  if (bytes > MAX_BYTES) return "tooLarge";
  return features > SLOW_FEATURES ? "slow" : "ok";
}

/** What shapes a collection holds (Change 43), cached per collection. */
export interface ShapeInfo {
  polygons: boolean;
  /** Points, lines or anything else with a geometry. */
  other: boolean;
}

const shapeCache = new WeakMap<FeatureCollection, ShapeInfo>();

export function shapeInfo(collection: FeatureCollection): ShapeInfo {
  let info = shapeCache.get(collection);
  if (!info) {
    info = { polygons: false, other: false };
    for (const { geometry } of collection.features) {
      if (!geometry) continue;
      if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") info.polygons = true;
      else info.other = true;
      if (info.polygons && info.other) break;
    }
    shapeCache.set(collection, info);
  }
  return info;
}

/**
 * The layers listed where a tool needs polygons (Clip's clip layer,
 * Intersect's overlay layer, Dissolve's input): loaded layers with at least
 * one polygon, plus tile and partial layers, which are listed and refused.
 */
export function polygonInputs(layers: GeoLibreLayer[]): AnalysisInput[] {
  return analysisInputs(layers).filter(
    (input) => !input.layer.geojson || shapeInfo(input.layer.geojson).polygons,
  );
}

/**
 * The fields Dissolve can group by: those holding plain values (text,
 * numbers, true/false), in the order first seen. `skip` drops our measured
 * fields.
 */
export function plainFields(collection: FeatureCollection, skip: (name: string) => boolean): string[] {
  const fields = new Map<string, boolean>();
  for (const feature of collection.features) {
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
      if (skip(key)) continue;
      const plain =
        value === null ||
        value === undefined ||
        ["string", "number", "boolean"].includes(typeof value);
      fields.set(key, (fields.get(key) ?? true) && plain);
    }
  }
  return [...fields].filter(([, plain]) => plain).map(([key]) => key);
}
