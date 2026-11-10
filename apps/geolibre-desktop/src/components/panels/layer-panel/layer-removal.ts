import type { TFunction } from "i18next";
import { undo, useAppStore, withoutHistory, type GeoLibreLayer, type LayerType } from "@geolibre/core";
import { dismissNotification, notify } from "../../../lib/notify";

/**
 * SWIFTMAP: removing a layer without a confirmation when Undo can bring it
 * back in full (Change 40). GeoLibre's history snapshots the layer record, so
 * Undo restores its data, style, group and position, but only the layer types
 * the map redraws from that record alone, with nothing else torn down on the
 * way out, come back drawn. Everything else keeps GeoLibre's "Remove layer?"
 * dialog. Anything not known to be safe keeps the dialog.
 */

/**
 * The layer types MapLibre draws from the store record itself: the `native`
 * kinds in GeoLibre's `MAPLIBRE_SUPPORTED_LAYER_KINDS` (not exported, so
 * `tests/swiftmap-layer-removal.test.ts` checks this list against it). The
 * other types are drawn by a plugin control, which removal takes off the map.
 */
export const REDRAWN_LAYER_TYPES: ReadonlySet<LayerType> = new Set<LayerType>([
  "geojson",
  "raster",
  "wms",
  "wmts",
  "xyz",
  "vector-tiles",
  "pmtiles",
  "mbtiles",
  "video",
  "image",
]);

/** How long the "Removed" message stays, so there is time to reach Undo. */
export const REMOVED_MESSAGE_MS = 8000;

/** A PMTiles archive read over the web; an in-memory archive is freed on removal. */
function isRemotePMTiles(layer: GeoLibreLayer): boolean {
  const url = typeof layer.source?.url === "string" ? layer.source.url : layer.sourcePath;
  return typeof url === "string" && /^(pmtiles:\/\/)?https?:\/\//i.test(url);
}

/**
 * Whether Undo restores this layer completely, drawn on the map, after it is
 * removed. False for layers a plugin draws or registered, PMTiles held in
 * memory or owned by the PMTiles control, database tables (their connection
 * is dropped), GeoLens datasets (their edit baseline is dropped), and GeoJSON
 * whose features are not in memory.
 *
 * @param layer - The layer about to be removed.
 * @returns True when the layer can be removed without a confirmation.
 */
export function undoRestoresLayer(layer: GeoLibreLayer): boolean {
  if (!REDRAWN_LAYER_TYPES.has(layer.type)) return false;
  const metadata = layer.metadata ?? {};
  if (typeof metadata.customLayerType === "string") return false;
  if (layer.type === "pmtiles") {
    if (!isRemotePMTiles(layer) || metadata.controlArchiveId != null) return false;
  } else if (metadata.externalNativeLayer === true) {
    return false;
  }
  if (metadata.geolensDatasetId != null) return false;
  if (
    metadata.sourceKind === "postgis-table" ||
    metadata.sourceKind === "mssql-table" ||
    metadata.postgisConnectionLabel != null
  ) {
    return false;
  }
  if (layer.type === "geojson" && !layer.geojson && !layer.geoarrow) return false;
  return true;
}

/** Ends GeoLibre's 400 ms history window, so the next change is an Undo step of its own. */
function closeHistoryStep(): void {
  withoutHistory(() => {});
}

/**
 * Remove a layer as one Undo step and say so, with an Undo button that brings
 * it back selected. The button only ever undoes this removal: the message goes
 * as soon as the layers change again (another edit, or Ctrl+Z).
 *
 * @param layer - The layer to remove; the caller has checked {@link undoRestoresLayer}.
 * @param t - The translation function.
 */
export function removeLayerWithUndo(layer: GeoLibreLayer, t: TFunction): void {
  const store = useAppStore;
  closeHistoryStep();
  store.getState().removeLayer(layer.id);
  closeHistoryStep();
  // The store selects the next layer after a removal; the Layers panel starts
  // with nothing selected instead (Change 17).
  store.getState().selectLayer(null);
  const layersAfterRemoval = store.getState().layers;

  let unsubscribe = () => {};
  const id = notify.info(t("layerPanel.removedLayer", { name: layer.name }), {
    durationMs: REMOVED_MESSAGE_MS,
    dedupeKey: `swiftmap-removed-layer:${layer.id}`,
    action: {
      label: t("layerPanel.undoRemove"),
      onClick: () => {
        unsubscribe();
        if (store.getState().layers !== layersAfterRemoval) return;
        undo();
        if (store.getState().layers.some((candidate) => candidate.id === layer.id)) {
          store.getState().selectLayer(layer.id);
        }
      },
    },
  });
  unsubscribe = store.subscribe((state) => {
    if (state.layers === layersAfterRemoval) return;
    unsubscribe();
    dismissNotification(id);
  });
}
