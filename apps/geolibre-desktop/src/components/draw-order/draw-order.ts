import { isDuckDBQueryLayer, useAppStore, type GeoLibreLayer } from "@geolibre/core";
import { isRasterLike, layerSwatchShape } from "../../lib/layer-swatch";
import { isBelowLabels } from "../style-panel-swiftmap/below-labels";

// SWIFTMAP (Change 36): "Draw points above lines and polygons". The map draws
// layers in tiers, bottom to top: rasters and imagery, polygons, lines, points,
// then 3D and deck.gl layers. The Layers panel order applies within a tier, and
// the panel and legend keep their own order. GeoLibre's MapController asks for
// this order through `__swiftmapDrawOrder` (one tagged line in syncLayers).

/** Bottom to top. */
export const DrawTier = {
  raster: 0,
  polygon: 1,
  line: 2,
  point: 3,
  overlay: 4,
} as const;
export type DrawTier = (typeof DrawTier)[keyof typeof DrawTier];

/** 3D and deck.gl layers: above every tier, in panel order among themselves. */
const OVERLAY_TYPES = new Set<GeoLibreLayer["type"]>([
  "lidar",
  "gaussian-splat",
  "3d-tiles",
  "deckgl-viz",
]);

/** Image and video overlays are imagery, though the swatch treats them apart. */
const IMAGERY_TYPES = new Set<GeoLibreLayer["type"]>(["image", "video"]);

/** Store layers are replaced, not mutated, on change, so a layer's tier can be cached. */
const tierCache = new WeakMap<GeoLibreLayer, DrawTier>();

export function drawTierOf(layer: GeoLibreLayer): DrawTier {
  const cached = tierCache.get(layer);
  if (cached !== undefined) return cached;
  const tier = computeTier(layer);
  tierCache.set(layer, tier);
  return tier;
}

function computeTier(layer: GeoLibreLayer): DrawTier {
  if (OVERLAY_TYPES.has(layer.type) || isDuckDBQueryLayer(layer)) return DrawTier.overlay;
  if (IMAGERY_TYPES.has(layer.type) || isRasterLike(layer)) return DrawTier.raster;
  const renderer = layer.style?.pointRenderer;
  if (renderer === "heatmap" || renderer === "cluster") return DrawTier.point;
  if (layer.style?.extrusionEnabled) return DrawTier.polygon;
  // Mixed and unknown geometry count as polygons: the bottom vector tier, so
  // their fills never cover other layers' points or lines.
  if (hasMixedGeometry(layer)) return DrawTier.polygon;
  const shape = layerSwatchShape(layer);
  if (shape === "circle") return DrawTier.point;
  if (shape === "line") return DrawTier.line;
  return DrawTier.polygon;
}

/** More than one of point, line and polygon among the first features. */
function hasMixedGeometry(layer: GeoLibreLayer): boolean {
  const kinds = new Set<string>();
  for (const feature of layer.geojson?.features.slice(0, 500) ?? []) {
    const type = feature.geometry?.type ?? "";
    if (type.includes("Polygon")) kinds.add("polygon");
    else if (type.includes("LineString")) kinds.add("line");
    else if (type.includes("Point")) kinds.add("point");
    if (kinds.size > 1) return true;
  }
  return false;
}

function byTier(layers: readonly GeoLibreLayer[]): GeoLibreLayer[] {
  // Array.prototype.sort is stable, so panel order holds within a tier.
  return [...layers].sort((a, b) => drawTierOf(a) - drawTierOf(b));
}

/**
 * The order to draw `layers` in (both bottom to top). Layers set to "Draw below
 * basemap labels" (and placed there) form their own band under the rest, tiered
 * among themselves: that choice wins over the tiers.
 */
export function orderByShape(layers: readonly GeoLibreLayer[]): GeoLibreLayer[] {
  const belowLabels = layers.filter((layer) => isBelowLabels(layer) && layer.beforeId);
  if (belowLabels.length === 0) return byTier(layers);
  const rest = layers.filter((layer) => !belowLabels.includes(layer));
  return [...byTier(belowLabels), ...byTier(rest)];
}

/** Whether two bottom-to-top lists draw the same layers in the same order. */
export function sameDrawOrder(a: readonly GeoLibreLayer[], b: readonly GeoLibreLayer[]): boolean {
  return a.length === b.length && a.every((layer, index) => layer.id === b[index]?.id);
}

/** Where the switch is saved: the project's free-form metadata. */
const METADATA_KEY = "swiftmap";

/** On unless the map was saved with it off (so earlier maps get it too). */
export function isDrawOrderByShapeOn(metadata: Record<string, unknown>): boolean {
  const own = metadata[METADATA_KEY];
  return !(typeof own === "object" && own !== null && (own as Record<string, unknown>).drawOrderByShape === false);
}

export function withDrawOrderByShape(
  metadata: Record<string, unknown>,
  on: boolean,
): Record<string, unknown> {
  const own = metadata[METADATA_KEY];
  const swiftmap = typeof own === "object" && own !== null ? { ...(own as Record<string, unknown>) } : {};
  swiftmap.drawOrderByShape = on;
  return { ...metadata, [METADATA_KEY]: swiftmap };
}

/**
 * Turns the switch on or off. The layer list is replaced with a copy so every
 * map pane syncs again and redraws in the new order; it's a saved map setting,
 * so the map is marked unsaved.
 */
export function setDrawOrderByShape(on: boolean): void {
  const { metadata, layers } = useAppStore.getState();
  // Not an Undo step: Undo would bring back the layer list but not the switch.
  const history = useAppStore.temporal.getState();
  history.pause();
  try {
    useAppStore.setState({
      metadata: withDrawOrderByShape(metadata, on),
      layers: [...layers],
      isDirty: true,
    });
  } finally {
    history.resume();
  }
}

/** Set once the "drag didn't change the map" hint has been shown in this browser. */
export const DRAW_ORDER_HINT_FLAG = "swiftmap.drawOrderHintShown";

/**
 * Whether a change of panel order from `previous` to `next` should show the
 * hint: the same layers, reordered, while the map still draws them the same way.
 */
export function reorderLeftMapUnchanged(
  previous: readonly GeoLibreLayer[],
  next: readonly GeoLibreLayer[],
): boolean {
  if (previous.length !== next.length || previous.length < 2) return false;
  if (sameDrawOrder(previous, next)) return false;
  const ids = new Set(previous.map((layer) => layer.id));
  if (!next.every((layer) => ids.has(layer.id))) return false;
  return sameDrawOrder(orderByShape(previous), orderByShape(next));
}

/** The order the map asks for: tiered while the open map has the switch on. */
export function swiftmapDrawOrder(layers: GeoLibreLayer[]): GeoLibreLayer[] {
  return isDrawOrderByShapeOn(useAppStore.getState().metadata) ? orderByShape(layers) : layers;
}

/** Registers the draw order with GeoLibre's map controller. */
export function installSwiftmapDrawOrder(): void {
  (globalThis as { __swiftmapDrawOrder?: typeof swiftmapDrawOrder }).__swiftmapDrawOrder =
    swiftmapDrawOrder;
}
