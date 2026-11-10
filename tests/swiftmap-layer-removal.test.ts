import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { TFunction } from "i18next";
import { LAYER_TYPES, clearHistory, undo, useAppStore, type GeoLibreLayer } from "@geolibre/core";
import en from "../apps/geolibre-desktop/src/i18n/locales/en.json" with { type: "json" };
import { classifyLayer } from "../packages/map/src/layer-kind";
import { MAPLIBRE_SUPPORTED_LAYER_KINDS } from "../packages/map/src/maplibre-layer-kinds";
import {
  clearNotifications,
  useNotificationStore,
} from "../apps/geolibre-desktop/src/lib/notify";
import {
  REDRAWN_LAYER_TYPES,
  REMOVED_MESSAGE_MS,
  removeLayerWithUndo,
  undoRestoresLayer,
} from "../apps/geolibre-desktop/src/components/panels/layer-panel/layer-removal";
import { geojsonLayer } from "./helpers/layer-fixtures";

// SWIFTMAP: Remove layer without a dialog when Undo restores it (Change 40).
const t = ((key: string, values?: Record<string, string>) => {
  const text = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, name: string) => values?.[name] ?? "");
}) as unknown as TFunction;

const initialState = useAppStore.getState();

afterEach(() => {
  useAppStore.setState(initialState, true);
  clearHistory();
  clearNotifications();
});

const point = (lon: number) => ({
  type: "FeatureCollection" as const,
  features: [
    { type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [lon, 0] } },
  ],
});

const layerOf = (type: GeoLibreLayer["type"], patch: Partial<GeoLibreLayer> = {}) =>
  geojsonLayer({ id: `layer-${type}`, name: type, type, geojson: undefined, source: {}, ...patch });

describe("undoRestoresLayer", () => {
  it("lists exactly the layer types MapLibre redraws from the store record", () => {
    for (const type of LAYER_TYPES) {
      const native = MAPLIBRE_SUPPORTED_LAYER_KINDS[classifyLayer({ type })!] === "native";
      assert.equal(REDRAWN_LAYER_TYPES.has(type), native, type);
    }
  });

  it("removes GeoJSON with its features, tile services and overlays without a dialog", () => {
    assert.equal(undoRestoresLayer(geojsonLayer({ geojson: point(0) })), true);
    assert.equal(undoRestoresLayer(geojsonLayer({ geojson: undefined, geoarrow: {} as never })), true);
    for (const type of ["raster", "wms", "wmts", "xyz", "vector-tiles", "mbtiles", "video", "image"] as const) {
      assert.equal(undoRestoresLayer(layerOf(type, { source: { url: "https://example.com/{z}/{x}/{y}" } })), true, type);
    }
    const remote = layerOf("pmtiles", {
      source: { url: "pmtiles://https://example.com/a.pmtiles" },
      metadata: { externalNativeLayer: true, sourceKind: "pmtiles-url", nativeLayerIds: ["a"] },
    });
    assert.equal(undoRestoresLayer(remote), true);
  });

  it("keeps the dialog for layers a plugin draws or registered", () => {
    for (const type of ["cog", "zarr", "lidar", "gaussian-splat", "3d-tiles", "arcgis", "flatgeobuf", "geoparquet", "duckdb-query", "deckgl-viz"] as const) {
      assert.equal(undoRestoresLayer(layerOf(type)), false, type);
    }
    // The COG the browser probe added: a plugin kind, registered and custom-drawn.
    const cog = layerOf("cog", {
      metadata: { sourceKind: "maplibre-gl-raster", externalNativeLayer: true, customLayerType: "raster" },
    });
    assert.equal(undoRestoresLayer(cog), false);
    assert.equal(undoRestoresLayer(geojsonLayer({ metadata: { externalNativeLayer: true } })), false);
    assert.equal(undoRestoresLayer(geojsonLayer({ metadata: { customLayerType: "deck" } })), false);
  });

  it("keeps the dialog when removal tears something down outside the store", () => {
    // PMTiles in memory, or owned by the PMTiles control.
    assert.equal(undoRestoresLayer(layerOf("pmtiles", { source: { url: "pmtiles://extract-1" } })), false);
    assert.equal(
      undoRestoresLayer(
        layerOf("pmtiles", {
          source: { url: "https://example.com/a.pmtiles" },
          metadata: { controlArchiveId: "pmtiles-source-1" },
        }),
      ),
      false,
    );
    // Database tables lose their connection; GeoLens datasets their edit baseline.
    assert.equal(undoRestoresLayer(geojsonLayer({ metadata: { sourceKind: "postgis-table" } })), false);
    assert.equal(undoRestoresLayer(geojsonLayer({ metadata: { sourceKind: "mssql-table" } })), false);
    assert.equal(undoRestoresLayer(geojsonLayer({ metadata: { postgisConnectionLabel: "db" } })), false);
    assert.equal(undoRestoresLayer(geojsonLayer({ metadata: { geolensDatasetId: "d1" } })), false);
    // GeoJSON whose features aren't in memory.
    assert.equal(undoRestoresLayer(geojsonLayer({ geojson: undefined })), false);
  });
});

describe("removeLayerWithUndo", () => {
  const seed = () => {
    const parks = geojsonLayer({ id: "parks", name: "Parks", geojson: point(1), groupId: "g1" });
    const rivers = geojsonLayer({ id: "rivers", name: "Rivers", geojson: point(2), groupId: "g1" });
    const roads = geojsonLayer({ id: "roads", name: "Roads", geojson: point(3) });
    useAppStore.setState({
      layers: [roads, parks, rivers],
      layerGroups: [{ id: "g1", name: "Survey", collapsed: false, visible: true, opacity: 1 }],
      selectedLayerId: "parks",
    });
    clearHistory();
    return parks;
  };

  it("removes the layer, says so, and Undo brings it back in place and selected", () => {
    const parks = seed();
    removeLayerWithUndo(parks, t);

    const state = useAppStore.getState();
    assert.deepEqual(state.layers.map((l) => l.id), ["roads", "rivers"]);
    assert.equal(state.selectedLayerId, null);
    const [message] = useNotificationStore.getState().notifications;
    assert.equal(message.message, "Removed “Parks”.");
    assert.equal(message.kind, "info");
    assert.equal(message.durationMs, REMOVED_MESSAGE_MS);
    assert.equal(message.action?.label, "Undo");

    message.action!.onClick();
    const restored = useAppStore.getState();
    assert.deepEqual(restored.layers.map((l) => l.id), ["roads", "parks", "rivers"]);
    assert.equal(restored.layers[1], parks, "the same record: data, style and group");
    assert.equal(restored.selectedLayerId, "parks");
  });

  it("is one Undo step of its own, even right after another edit", () => {
    const parks = seed();
    // Inside GeoLibre's 400 ms window, so without the break the rename and the
    // removal would be one step and Undo would take back both.
    useAppStore.getState().updateLayer("roads", { name: "Main roads" });
    removeLayerWithUndo(parks, t);
    undo();
    const state = useAppStore.getState();
    assert.deepEqual(state.layers.map((l) => l.id), ["roads", "parks", "rivers"]);
    assert.equal(state.layers[0].name, "Main roads");
  });

  it("drops the message once the layers change, so its Undo can't undo something else", () => {
    const parks = seed();
    removeLayerWithUndo(parks, t);
    const [message] = useNotificationStore.getState().notifications;
    useAppStore.getState().updateLayer("roads", { name: "Main roads" });
    assert.equal(useNotificationStore.getState().notifications.length, 0);

    message.action!.onClick();
    const state = useAppStore.getState();
    assert.deepEqual(state.layers.map((l) => l.id), ["roads", "rivers"]);
    assert.equal(state.layers[0].name, "Main roads");
  });

  it("drops the message when Ctrl+Z undoes the removal first", () => {
    const parks = seed();
    removeLayerWithUndo(parks, t);
    undo();
    assert.equal(useNotificationStore.getState().notifications.length, 0);
    assert.equal(useAppStore.getState().layers.length, 3);
  });
});
