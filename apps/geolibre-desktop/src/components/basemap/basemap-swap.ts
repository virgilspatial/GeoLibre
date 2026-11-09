import type * as maplibregl from "maplibre-gl";
import { pointBelowLabelsAt } from "../style-panel-swiftmap/below-labels";
import { parseSwiftmapBasemap } from "./basemap-catalog";
import { previousAutoStyle, registeredSwiftmapStyle } from "./basemap-registry";

// SWIFTMAP (Change 28, 7c review 1): switches between Swiftmap's basemaps on
// the live map instead of reloading the whole style, so turning labels on or
// off, or moving between Light, Grey, Dark and Aerial, never blanks the map.
// GeoLibre's MapController.setStyle calls the function registered here (the
// one SWIFTMAP engine edit) and does its usual full reload when it declines.

type Layer = maplibregl.LayerSpecification;
type Style = maplibregl.StyleSpecification;

/** The parts of a MapLibre map the swap uses (a fake in the unit tests). */
export type SwapMap = Pick<
  maplibregl.Map,
  | "getLayer"
  | "getSource"
  | "addSource"
  | "removeSource"
  | "addLayer"
  | "removeLayer"
  | "getLayersOrder"
  | "setPaintProperty"
  | "setLayoutProperty"
  | "setFilter"
  | "setLayerZoomRange"
  | "setSprite"
  | "setGlyphs"
>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type PaintKey = Parameters<SwapMap["setPaintProperty"]>[1];
type LayoutKey = Parameters<SwapMap["setLayoutProperty"]>[1];
type PaintValue = Parameters<SwapMap["setPaintProperty"]>[2];
type LayoutValue = Parameters<SwapMap["setLayoutProperty"]>[2];

function sourceOf(layer: Layer): string | undefined {
  return "source" in layer ? (layer.source as string) : undefined;
}

function sourceLayerOf(layer: Layer): string | undefined {
  return "source-layer" in layer ? layer["source-layer"] : undefined;
}

/** Whether a live layer can be changed into `next` without re-adding it. */
function sameKind(previous: Layer, next: Layer): boolean {
  return (
    previous.type === next.type &&
    sourceOf(previous) === sourceOf(next) &&
    sourceLayerOf(previous) === sourceLayerOf(next)
  );
}

function updateLayer(map: SwapMap, previous: Layer, next: Layer): void {
  const prevPaint = (previous.paint ?? {}) as Record<string, unknown>;
  const nextPaint = (next.paint ?? {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(prevPaint), ...Object.keys(nextPaint)])) {
    if (!same(prevPaint[key], nextPaint[key]))
      map.setPaintProperty(next.id, key as PaintKey, nextPaint[key] as PaintValue);
  }
  const prevLayout = (previous.layout ?? {}) as Record<string, unknown>;
  const nextLayout = (next.layout ?? {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(prevLayout), ...Object.keys(nextLayout)])) {
    // GeoLibre owns basemap visibility (its eye and sync); leave it alone.
    if (key === "visibility") continue;
    if (!same(prevLayout[key], nextLayout[key])) {
      map.setLayoutProperty(next.id, key as LayoutKey, nextLayout[key] as LayoutValue);
    }
  }
  const prevFilter = "filter" in previous ? previous.filter : undefined;
  const nextFilter = "filter" in next ? next.filter : undefined;
  if (!same(prevFilter, nextFilter)) map.setFilter(next.id, nextFilter ?? null);
  if (previous.minzoom !== next.minzoom || previous.maxzoom !== next.maxzoom) {
    map.setLayerZoomRange(next.id, next.minzoom ?? 0, next.maxzoom ?? 24);
  }
}

/**
 * Turns the live map's `previous` basemap into `next`, changing only what
 * differs. Layers that aren't in either style are the user's (or GeoLibre's
 * own): new basemap layers go below the ones above the basemap, and below any
 * that sit right under the layer they are placed before, which is where
 * "Draw below basemap labels" puts a layer.
 *
 * @returns False, having changed nothing, when it can't be done in place.
 */
export function swapBasemapStyle(map: SwapMap, previous: Style, next: Style): boolean {
  const prevLayers = new Map(previous.layers.map((layer) => [layer.id, layer]));
  // The live map must hold the previous basemap, and a source both styles
  // share must be the same source.
  if (previous.layers.some((layer) => !map.getLayer(layer.id))) return false;
  for (const [id, source] of Object.entries(next.sources)) {
    if (id in previous.sources && !same(previous.sources[id], source)) return false;
  }

  const basemapIds = new Set([...prevLayers.keys(), ...next.layers.map((layer) => layer.id)]);
  const isUserLayer = (id: string) => !basemapIds.has(id);

  for (const [id, source] of Object.entries(next.sources)) {
    if (!map.getSource(id)) map.addSource(id, source);
  }
  for (const layer of previous.layers) {
    const kept = next.layers.find((candidate) => candidate.id === layer.id);
    if (!kept || !sameKind(layer, kept)) map.removeLayer(layer.id);
  }
  if (next.sprite && !same(previous.sprite, next.sprite)) {
    map.setSprite(next.sprite as string);
  }
  if (next.glyphs && previous.glyphs !== next.glyphs) map.setGlyphs(next.glyphs);

  // The first layer above the basemap: new layers with nothing of the next
  // basemap above them go below it.
  const order = map.getLayersOrder();
  const lastBasemap = order.reduce((last, id, index) => (basemapIds.has(id) ? index : last), -1);
  const aboveBasemap: string | undefined = order[lastBasemap + 1];

  /** `anchor`, moved down past user layers sitting right under it. */
  const below = (anchor: string | undefined): string | undefined => {
    if (anchor === undefined || isUserLayer(anchor)) return anchor;
    const live = map.getLayersOrder();
    let index = live.indexOf(anchor);
    while (index > 0 && isUserLayer(live[index - 1])) index -= 1;
    return live[index];
  };

  // From the top down, so each layer is placed before the one above it.
  let anchor = aboveBasemap;
  for (let index = next.layers.length - 1; index >= 0; index -= 1) {
    const layer = next.layers[index];
    const old = prevLayers.get(layer.id);
    if (old && sameKind(old, layer)) {
      updateLayer(map, old, layer);
      anchor = layer.id;
      continue;
    }
    map.addLayer(layer, anchor === aboveBasemap ? aboveBasemap : below(anchor));
    anchor = layer.id;
  }

  for (const id of Object.keys(previous.sources)) {
    if (!(id in next.sources) && map.getSource(id)) map.removeSource(id);
  }
  return true;
}

/** The first label layer of a style: where "Draw below basemap labels" goes. */
function firstLabel(style: Style): string | undefined {
  return style.layers.find((layer) => layer.type === "symbol")?.id;
}

/**
 * GeoLibre's hook (`MapController.setStyle`): swaps one Swiftmap basemap for
 * another in place. Tile links and anything not Swiftmap's take the reload.
 */
export function swiftmapBasemapSwap(
  map: maplibregl.Map,
  previousUrl: string,
  nextUrl: string,
): boolean {
  const inPlace = (url: string) => {
    const kind = parseSwiftmapBasemap(url)?.kind;
    return kind === "protomaps" || kind === "aerial" || kind === "auto";
  };
  if (!inPlace(previousUrl) || !inPlace(nextUrl)) return false;
  // The same link again is Auto after a theme change (Change 33): swap from the
  // flavour still drawn to the one now registered under it.
  const same = previousUrl === nextUrl;
  if (same && parseSwiftmapBasemap(nextUrl)?.kind !== "auto") return false;
  const previous = same ? previousAutoStyle(nextUrl) : registeredSwiftmapStyle(previousUrl);
  const next = registeredSwiftmapStyle(nextUrl);
  if (!previous || !next) return false;
  try {
    if (!swapBasemapStyle(map, previous, next)) return false;
  } catch (error) {
    // A half-applied swap is put right by the full reload GeoLibre falls back to.
    console.warn("Swiftmap couldn't switch the basemap in place; reloading it.", error);
    return false;
  }
  // Layers drawn below the labels follow the new first label layer, or go
  // back to their normal place when the labels are off. After this call, so
  // the store update doesn't run inside GeoLibre's own.
  const target = firstLabel(next);
  queueMicrotask(() => pointBelowLabelsAt(target));
  return true;
}

/** Registers the swap with GeoLibre's map controller. */
export function installSwiftmapBasemapSwap(): void {
  (globalThis as { __swiftmapBasemapSwap?: typeof swiftmapBasemapSwap }).__swiftmapBasemapSwap =
    swiftmapBasemapSwap;
}
