import type { GeoLibreLayer } from "@geolibre/core";
import type { FeatureCollection } from "geojson";
import { shapeInfo, sizeCheck, type AnalysisInput, type SizeCheck } from "./analysis-inputs";
import {
  extentOf,
  zoneForExtent,
  zoneWarningFor,
  type AnalysisZone,
  type Extent,
} from "./engine/zone";
import { isAnalysisResult } from "./origin";

/**
 * SWIFTMAP (Change 37, shared by every tool since Change 43): what a tool's
 * form shows and allows, worked out from its fields. Pure, for tests; the
 * forms only render it.
 */

/**
 * What a run's output name meets in the map (`design-decisions.md`, "Analysis
 * output names"): the name decides, as in ArcGIS.
 * - `new`: no layer has the name, so the run adds a layer.
 * - `replace`: an analysis result has it, so the run overwrites that layer.
 * - `taken`: a layer that isn't an analysis result has it, or one of the run's
 *   input layers does, so Run is disabled.
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
  inputLayerIds: string | null | readonly string[],
): NameMatch {
  const inputs = new Set(
    inputLayerIds === null ? [] : typeof inputLayerIds === "string" ? [inputLayerIds] : inputLayerIds,
  );
  const key = (value: string) => value.trim().toLowerCase();
  const wanted = key(name);
  const same = layers.filter((layer) => key(layer.name) === wanted);
  if (same.length === 0) return { kind: "new" };
  if (same.some((layer) => inputs.has(layer.id) || !isAnalysisResult(layer))) {
    return { kind: "taken" };
  }
  // The store lists layers bottom first, so the last match is the top one.
  return { kind: "replace", layer: same[same.length - 1]! };
}

/** Why Run is disabled, in the order the form reports it. */
export type RunBlock =
  | "noInput"
  | "tiles"
  | "partial"
  | "sameLayer"
  | "tooLarge"
  | "noGeometry"
  | "badDistance"
  | "noName"
  | "nameTaken";

export interface FormStatus {
  block: RunBlock | null;
  /** The layer a `tiles` or `partial` block is about, for tools with two inputs. */
  blockLayer?: string;
  size: SizeCheck | null;
  /** The zone the run will measure in, and whether the data reaches more than 1° outside it. */
  zone: { zone: AnalysisZone; warning: boolean } | null;
  /** What the output name meets in the map; null until there's a valid input. */
  name: NameMatch | null;
  /** Polygon-only inputs that also hold other shapes, which are left out (Change 43). */
  polygonsOnly?: string[];
}

const extentCache = new WeakMap<FeatureCollection, Extent | null>();

function cachedExtent(collection: FeatureCollection): Extent | null {
  if (!extentCache.has(collection)) extentCache.set(collection, extentOf([collection]));
  return extentCache.get(collection)!;
}

/** The zone for some inputs together, from the centre of their combined extent. */
export function inputsZone(collections: FeatureCollection[]): FormStatus["zone"] {
  const extents = collections.map(cachedExtent).filter((extent): extent is Extent => !!extent);
  if (extents.length === 0) return null;
  const extent: Extent = [
    Math.min(...extents.map((e) => e[0])),
    Math.min(...extents.map((e) => e[1])),
    Math.max(...extents.map((e) => e[2])),
    Math.max(...extents.map((e) => e[3])),
  ];
  const zone = zoneForExtent(extent);
  return { zone, warning: zoneWarningFor(extent, zone) };
}

export interface FormInput {
  input: AnalysisInput | null;
  /** Only this input's polygons are used (a clip, overlay or Dissolve layer). */
  polygonsOnly?: boolean;
}

/**
 * The status of any tool's form. `check` adds the tool's own field checks
 * (such as Buffer's distance); `named` makes tile and partial refusals name
 * the layer, for tools with two inputs.
 */
export function toolFormStatus(options: {
  inputs: FormInput[];
  name: string;
  layers: readonly GeoLibreLayer[];
  named?: boolean;
  check?: () => RunBlock | null;
}): FormStatus {
  const none = { size: null, zone: null, name: null };
  const inputs = options.inputs.map((item) => item.input);
  if (inputs.some((input) => !input)) return { block: "noInput", ...none };
  for (const input of inputs as AnalysisInput[]) {
    if (input.status !== "ok" || !input.layer.geojson) {
      const block = input.status === "tiles" ? "tiles" : "partial";
      return options.named
        ? { block, blockLayer: input.layer.name, ...none }
        : { block, ...none };
    }
  }
  const layerIds = (inputs as AnalysisInput[]).map((input) => input.layer.id);
  if (new Set(layerIds).size < layerIds.length) return { block: "sameLayer", ...none };
  const collections = (inputs as AnalysisInput[]).map((input) => input.layer.geojson!);
  const size = sizeCheck(collections);
  if (size === "tooLarge") return { block: "tooLarge", ...none, size };
  const zone = inputsZone(collections);
  let block: RunBlock | null = null;
  if (!zone) block = "noGeometry";
  else block = options.check?.() ?? null;
  if (!block && !options.name.trim()) block = "noName";
  const name = options.name.trim() ? matchOutputName(options.name, options.layers, layerIds) : null;
  if (!block && name?.kind === "taken") block = "nameTaken";
  const polygonsOnly = options.inputs
    .filter((item) => item.polygonsOnly && shapeInfo(item.input!.layer.geojson!).other)
    .map((item) => item.input!.layer.name);
  return polygonsOnly.length > 0
    ? { block, size, zone, name, polygonsOnly }
    : { block, size, zone, name };
}

/** "Heritage items clipped to Site boundary" */
export function clipOutputName(inputName: string, clipName: string): string {
  return `${inputName} clipped to ${clipName}`;
}

/** "Heritage items intersected with Zones" */
export function intersectOutputName(inputName: string, overlayName: string): string {
  return `${inputName} intersected with ${overlayName}`;
}

/** "Lots dissolved", or "Lots dissolved by Zone" */
export function dissolveOutputName(inputName: string, field: string | null): string {
  return field ? `${inputName} dissolved by ${field}` : `${inputName} dissolved`;
}

/** Whether a field name is one of the measured fields the tools write. */
export const isMeasuredField = (name: string) =>
  /^(Area m²|Length m) \(.+\)$/.test(name);
