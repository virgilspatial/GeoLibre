import { useAppStore, type GeoLibreLayer } from "@geolibre/core";
import type { MapEngine } from "@geolibre/map";
import { useEffect, type RefObject } from "react";
import { firstLabelLayerId } from "./style-model";

// SWIFTMAP (Change 27): "Draw below basemap labels". GeoLibre can draw a layer
// below any style layer (`beforeId`); Swiftmap offers one switch, below the
// active basemap's first label layer, and keeps it there across basemap
// switches by re-finding the new basemap's labels. The choice is saved in the
// layer's own metadata, so it travels with the project.

/** The layer metadata key that records the choice. */
export const BELOW_LABELS_KEY = "swiftmapBelowLabels";

export function isBelowLabels(layer: Pick<GeoLibreLayer, "metadata">): boolean {
  return layer.metadata[BELOW_LABELS_KEY] === true;
}

/** The active basemap's first label layer, or null (no map, or no labels). */
export function basemapLabelLayerId(engine: MapEngine | null): string | null {
  const map = engine?.getMap();
  if (!engine || !map) return null;
  const layers = map.getStyle()?.layers ?? [];
  return firstLabelLayerId(layers, engine.getBasemapStyleLayerIds());
}

/**
 * Switches the choice. With no label layer to find, the layer keeps its normal
 * place (GeoLibre ignores a missing `beforeId`), and the switch stays on so a
 * later basemap with labels picks it up.
 */
export function setBelowLabels(layer: GeoLibreLayer, on: boolean, engine: MapEngine | null): void {
  const { updateLayer } = useAppStore.getState();
  const metadata = { ...layer.metadata };
  if (on) {
    metadata[BELOW_LABELS_KEY] = true;
    updateLayer(layer.id, { metadata, beforeId: basemapLabelLayerId(engine) ?? undefined });
  } else {
    delete metadata[BELOW_LABELS_KEY];
    updateLayer(layer.id, { metadata, beforeId: undefined });
  }
}

/**
 * Points every layer that asked to be below the labels at `target`, the
 * basemap's first label layer, or back to its normal place when there is none.
 */
export function pointBelowLabelsAt(target: string | undefined): void {
  const { layers, updateLayer } = useAppStore.getState();
  for (const layer of layers) {
    if (isBelowLabels(layer) && layer.beforeId !== target) {
      updateLayer(layer.id, { beforeId: target });
    }
  }
}

/**
 * After each map (re)load, including a basemap switch, points every layer that
 * asked to be below the labels at the new basemap's label layer. (A Swiftmap
 * basemap swapped in place, Change 28, calls `pointBelowLabelsAt` itself.)
 */
export function useBelowLabelsSync(
  engineRef: RefObject<MapEngine | null>,
  mapReadyGeneration: number | undefined,
): void {
  useEffect(() => {
    pointBelowLabelsAt(basemapLabelLayerId(engineRef.current) ?? undefined);
  }, [engineRef, mapReadyGeneration]);
}
