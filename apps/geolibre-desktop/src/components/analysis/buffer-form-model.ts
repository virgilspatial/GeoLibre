import type { GeoLibreLayer } from "@geolibre/core";
import type { FeatureCollection } from "geojson";
import { sizeCheck, type AnalysisInput, type SizeCheck } from "./analysis-inputs";
import { extentOf, zoneForExtent, zoneWarningFor, type AnalysisZone } from "./engine/zone";
import { isAnalysisResult } from "./origin";

/**
 * SWIFTMAP (Change 37): what the Buffer form shows and allows, worked out from
 * its fields. Pure, for tests; the form only renders it.
 */

/** "Heritage items buffer 100 m": the mockup's pattern. */
export function autoOutputName(inputName: string, distance: string, unitLabel: string): string {
  return `${inputName} buffer ${distance.trim() || "0"} ${unitLabel}`;
}

/**
 * What a run's output name meets in the map (`design-decisions.md`, "Analysis
 * output names"): the name decides, as in ArcGIS.
 * - `new`: no layer has the name, so the run adds a layer.
 * - `replace`: an analysis result has it, so the run overwrites that layer.
 * - `taken`: a layer that isn't an analysis result has it, or the input layer
 *   itself does, so Run is disabled.
 *
 * Names match regardless of capitals and of spaces at the ends (Change 37
 * review). When several analysis results share the name, the top one is
 * replaced; a replaced layer keeps its own name.
 */
export type NameMatch =
  | { kind: "new" }
  | { kind: "replace"; layer: GeoLibreLayer }
  | { kind: "taken" };

export function matchOutputName(
  name: string,
  layers: readonly GeoLibreLayer[],
  inputLayerId: string | null,
): NameMatch {
  const key = (value: string) => value.trim().toLowerCase();
  const wanted = key(name);
  const same = layers.filter((layer) => key(layer.name) === wanted);
  if (same.length === 0) return { kind: "new" };
  if (same.some((layer) => layer.id === inputLayerId || !isAnalysisResult(layer))) {
    return { kind: "taken" };
  }
  // The store lists layers bottom first, so the last match is the top one.
  return { kind: "replace", layer: same[same.length - 1]! };
}

/** The typed distance as a number more than 0, or null. */
export function parseDistance(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Why Run is disabled, in the order the form reports it. */
export type RunBlock =
  | "noInput"
  | "tiles"
  | "partial"
  | "tooLarge"
  | "noGeometry"
  | "badDistance"
  | "noName"
  | "nameTaken";

export interface FormStatus {
  block: RunBlock | null;
  size: SizeCheck | null;
  /** The zone the run will measure in, and whether the data reaches more than 1° outside it. */
  zone: { zone: AnalysisZone; warning: boolean } | null;
  /** What the output name meets in the map; null until there's a valid input. */
  name: NameMatch | null;
}

const zoneCache = new WeakMap<FeatureCollection, FormStatus["zone"]>();

/** The zone for an input, cached per collection. */
export function inputZone(collection: FeatureCollection): FormStatus["zone"] {
  if (zoneCache.has(collection)) return zoneCache.get(collection)!;
  const extent = extentOf([collection]);
  const zone = extent ? zoneForExtent(extent) : null;
  const result = extent && zone ? { zone, warning: zoneWarningFor(extent, zone) } : null;
  zoneCache.set(collection, result);
  return result;
}

export function bufferFormStatus(options: {
  input: AnalysisInput | null;
  distance: string;
  name: string;
  layers: readonly GeoLibreLayer[];
}): FormStatus {
  const { input } = options;
  if (!input) return { block: "noInput", size: null, zone: null, name: null };
  if (input.status !== "ok" || !input.layer.geojson) {
    const block = input.status === "tiles" ? "tiles" : "partial";
    return { block, size: null, zone: null, name: null };
  }
  const collection = input.layer.geojson;
  const size = sizeCheck([collection]);
  if (size === "tooLarge") return { block: "tooLarge", size, zone: null, name: null };
  const zone = inputZone(collection);
  let block: RunBlock | null = null;
  if (!zone) block = "noGeometry";
  else if (parseDistance(options.distance) === null) block = "badDistance";
  else if (!options.name.trim()) block = "noName";
  const name = options.name.trim()
    ? matchOutputName(options.name, options.layers, input.layer.id)
    : null;
  if (!block && name?.kind === "taken") block = "nameTaken";
  return { block, size, zone, name };
}
