/**
 * SWIFTMAP (Change 25): what the map draws in the current view, for the Legend
 * panel's In view mode. One `queryRenderedFeatures` over the whole map, limited
 * to the listed layers' own style layers, then each feature is matched to its
 * class the way the map styles it.
 */
import { compileFeatureExpression, type GeoLibreLayer } from "@geolibre/core";
import type { Feature } from "geojson";
import type { InViewResult, LegendClassifier, LegendLayer } from "./legend-model";

type Evaluate = (feature: Feature, zoom?: number) => unknown;

interface CompiledClassifier {
  /** The class id a feature belongs to, or null. */
  classify: (feature: Feature, zoom: number) => string | null;
  classCount: number;
}

/** A rendered feature as `queryRenderedFeatures` returns it (the parts used here). */
export interface RenderedFeatureLike {
  layer: { id: string };
  properties?: Record<string, unknown> | null;
  id?: string | number;
  /** MapLibre's tile feature: its `type` is 1 point, 2 line, 3 polygon. */
  _vectorTileFeature?: { type?: number };
}

const TILE_GEOMETRY_TYPES = ["Unknown", "Point", "LineString", "Polygon"] as const;

/** The minimal MapLibre surface this module needs, so tests can fake it. */
export interface InViewMap {
  getStyle(): { layers?: { id: string }[] } | undefined;
  queryRenderedFeatures(options: { layers: string[] }): RenderedFeatureLike[];
  getZoom(): number;
}

/** A style-spec Color (premultiplied r, g, b, a in 0..1) as lower-case #rrggbb. */
export function colorToHex(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const { r, g, b, a } = value as { r?: unknown; g?: unknown; b?: unknown; a?: unknown };
  if (
    typeof r !== "number" ||
    typeof g !== "number" ||
    typeof b !== "number" ||
    typeof a !== "number"
  ) {
    return null;
  }
  if (a <= 0) return null;
  const channel = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c / a)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function compile(source: unknown, expectedType: "color" | "boolean"): Evaluate | null {
  const compiled = compileFeatureExpression(JSON.stringify(source), { expectedType });
  return compiled.ok && compiled.evaluate ? compiled.evaluate : null;
}

const compiledCache = new WeakMap<LegendClassifier, CompiledClassifier | null>();

/** Compile a layer's classifier once; cached on the classifier object. */
export function compileClassifier(classifier: LegendClassifier): CompiledClassifier | null {
  if (compiledCache.has(classifier)) return compiledCache.get(classifier) ?? null;
  let result: CompiledClassifier | null = null;
  if (classifier.kind === "color") {
    const evaluate = compile(classifier.expression, "color");
    if (evaluate) {
      const byColor = new Map<string, string>();
      classifier.classColors.forEach((color, index) => {
        if (!byColor.has(color)) byColor.set(color, `${index}`);
      });
      result = {
        classCount: byColor.size,
        classify: (feature, zoom) => {
          try {
            const hex = colorToHex(evaluate(feature, zoom));
            return hex ? (byColor.get(hex) ?? null) : null;
          } catch {
            return null;
          }
        },
      };
    }
  } else {
    const rules = classifier.filters
      .map((rule) => ({ ...rule, evaluate: compile(rule.filter, "boolean") }))
      .filter((rule): rule is typeof rule & { evaluate: Evaluate } => rule.evaluate !== null);
    result = {
      classCount: rules.length + (classifier.elseClassId ? 1 : 0),
      classify: (feature, zoom) => {
        for (const rule of rules) {
          if (rule.minZoom !== undefined && zoom < rule.minZoom) continue;
          if (rule.maxZoom !== undefined && zoom >= rule.maxZoom) continue;
          try {
            if (rule.evaluate(feature, zoom) === true) return rule.classId;
          } catch {
            // A feature the filter can't evaluate matches nothing, as on the map.
          }
        }
        return classifier.elseClassId;
      },
    };
  }
  compiledCache.set(classifier, result);
  return result;
}

/**
 * Which style layer belongs to which listed layer: GeoLibre names its own style
 * layers `layer-<id>-…`, and vector-tile layers record theirs in
 * `metadata.nativeLayerIds`. The longest matching prefix wins.
 */
export function styleLayerOwners(
  styleLayerIds: readonly string[],
  layers: readonly Pick<GeoLibreLayer, "id" | "metadata">[],
  /** GeoLibre's `nativeLayerIdPrefix` from `@geolibre/map` (passed in to keep this module light). */
  prefixFor: (layerId: string) => string,
): Map<string, string> {
  const owners = new Map<string, string>();
  const prefixes = layers
    .map((layer) => ({ id: layer.id, prefix: prefixFor(layer.id) }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const native = new Map<string, string>();
  for (const layer of layers) {
    const ids = layer.metadata?.nativeLayerIds;
    if (Array.isArray(ids)) {
      for (const id of ids) if (typeof id === "string") native.set(id, layer.id);
    }
  }
  for (const styleLayerId of styleLayerIds) {
    const owner =
      native.get(styleLayerId) ??
      prefixes.find(({ prefix }) => styleLayerId.startsWith(prefix))?.id;
    if (owner) owners.set(styleLayerId, owner);
  }
  return owners;
}

/**
 * Classify rendered features into layers and classes. Stops looking at a
 * categorised layer once every one of its classes has been found.
 */
export function classifyRendered(
  features: readonly RenderedFeatureLike[],
  owners: ReadonlyMap<string, string>,
  layers: readonly LegendLayer[],
  zoom: number,
): InViewResult {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const layerIds = new Set<string>();
  const classIds = new Map<string, Set<string>>();
  const done = new Set<string>();
  for (const rendered of features) {
    const owner = owners.get(rendered.layer.id);
    if (!owner || done.has(owner)) continue;
    layerIds.add(owner);
    const layer = byId.get(owner);
    const compiled = layer?.classifier ? compileClassifier(layer.classifier) : null;
    if (!compiled) {
      done.add(owner);
      continue;
    }
    // Only the geometry type is read: `geometry` on a rendered feature is a
    // getter that decodes the whole shape, too slow across a full view.
    const feature = {
      type: "Feature",
      geometry: { type: TILE_GEOMETRY_TYPES[rendered._vectorTileFeature?.type ?? 0] ?? "Unknown" },
      properties: rendered.properties ?? {},
      ...(rendered.id !== undefined ? { id: rendered.id } : {}),
    } as Feature;
    const classId = compiled.classify(feature, zoom);
    if (classId === null) continue;
    let found = classIds.get(owner);
    if (!found) {
      found = new Set();
      classIds.set(owner, found);
    }
    found.add(classId);
    if (found.size >= compiled.classCount) done.add(owner);
  }
  return { layerIds, classIds };
}

/** Query the map for what is drawn in view, for the listed layers. */
export function queryInView(
  map: InViewMap,
  geoLayers: readonly Pick<GeoLibreLayer, "id" | "metadata">[],
  layers: readonly LegendLayer[],
  prefixFor: (layerId: string) => string,
): InViewResult {
  const styleLayers = map.getStyle()?.layers?.map((layer) => layer.id) ?? [];
  const owners = styleLayerOwners(styleLayers, geoLayers, prefixFor);
  if (owners.size === 0) return { layerIds: new Set(), classIds: new Map() };
  const features = map.queryRenderedFeatures({ layers: [...owners.keys()] });
  return classifyRendered(features, owners, layers, map.getZoom());
}
