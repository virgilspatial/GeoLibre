import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_LAYER_STYLE, type GeoLibreLayer } from "@geolibre/core";
import { createMapController, type MapController } from "../packages/map/src/map-controller";
import { orderByShape } from "../apps/geolibre-desktop/src/components/draw-order/draw-order";

// SWIFTMAP (Change 36): guards the two engine edits in map-controller.ts.
// 1. syncLayers places style layers in the order Swiftmap registers on
//    globalThis (`__swiftmapDrawOrder`), and keeps the panel order otherwise.
// 2. getBeforeStyleLayerId keeps a layer with its own `beforeId` (Draw below
//    basemap labels) under that layer even when a normal layer sits above it.
// If a GeoLibre release changes or bypasses either, these fail: re-apply the
// tagged lines in map-controller.ts.

type DrawOrder = (layers: GeoLibreLayer[]) => GeoLibreLayer[];
const registry = globalThis as { __swiftmapDrawOrder?: DrawOrder };

/**
 * A small stand-in for a MapLibre map: tracks style layers bottom to top
 * (`moveLayer(id, beforeId)` puts id beneath beforeId) and answers every other
 * call with a no-op.
 */
function fakeMap(basemap: string[]) {
  const layers = new Map<string, Record<string, unknown>>();
  const sources = new Map<string, Record<string, unknown>>();
  const order: string[] = [];
  const insertBefore = (id: string, beforeId?: string) => {
    const existing = order.indexOf(id);
    if (existing !== -1) order.splice(existing, 1);
    const at = beforeId ? order.indexOf(beforeId) : -1;
    if (at === -1) order.push(id);
    else order.splice(at, 0, id);
  };
  for (const id of basemap) {
    layers.set(id, { id, type: id.includes("label") ? "symbol" : "background" });
    order.push(id);
  }
  const known: Record<string, unknown> = {
    getStyle: () => ({ layers: order.map((id) => ({ ...layers.get(id), id })), sources: {} }),
    getLayersOrder: () => [...order],
    getLayer: (id: string) => (layers.has(id) ? { ...layers.get(id), id } : undefined),
    addLayer: (spec: Record<string, unknown>, beforeId?: string) => {
      layers.set(spec.id as string, spec);
      insertBefore(spec.id as string, beforeId);
    },
    moveLayer: (id: string, beforeId?: string) => insertBefore(id, beforeId),
    removeLayer: (id: string) => {
      layers.delete(id);
      order.splice(order.indexOf(id), 1);
    },
    getSource: (id: string) =>
      sources.has(id) ? { type: "geojson", setData: () => {}, serialize: () => sources.get(id) } : undefined,
    addSource: (id: string, spec: Record<string, unknown>) => sources.set(id, spec),
    getZoom: () => 4,
    getCanvas: () => ({ clientWidth: 600, clientHeight: 600 }),
  };
  const map = new Proxy(known, {
    get: (target, key: string) => (key in target ? target[key] : () => undefined),
  });
  return { map, order };
}

function controllerOn(map: unknown): MapController {
  const controller = createMapController();
  const internal = controller as unknown as { map: unknown; styleReady: boolean };
  internal.map = map;
  internal.styleReady = true;
  return controller;
}

function layer(id: string, geometry: Record<string, unknown>, patch: Partial<GeoLibreLayer> = {}): GeoLibreLayer {
  return {
    id,
    name: id,
    type: "geojson",
    source: { type: "geojson" },
    visible: true,
    opacity: 1,
    style: { ...DEFAULT_LAYER_STYLE },
    metadata: {},
    geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry }] },
    ...patch,
  } as GeoLibreLayer;
}

const point = (id: string, patch?: Partial<GeoLibreLayer>) =>
  layer(id, { type: "Point", coordinates: [0, 0] }, patch);
const polygon = (id: string, patch?: Partial<GeoLibreLayer>) =>
  layer(id, { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, patch);

/** Index of the lowest style layer belonging to a store layer. */
function lowest(order: string[], layerId: string): number {
  return order.findIndex((id) => id.includes(layerId));
}

afterEach(() => {
  delete registry.__swiftmapDrawOrder;
});

describe("MapController.syncLayers follows Swiftmap's draw order", () => {
  it("draws in panel order when no order is registered", () => {
    const { map, order } = fakeMap(["bg"]);
    // Bottom to top: the point under the polygon.
    controllerOn(map).syncLayers([point("pt"), polygon("poly")]);
    assert.ok(lowest(order, "pt") < lowest(order, "poly"), order.join(", "));
  });

  it("places style layers in the registered order", () => {
    registry.__swiftmapDrawOrder = (layers) => orderByShape(layers);
    const { map, order } = fakeMap(["bg"]);
    controllerOn(map).syncLayers([point("pt"), polygon("poly")]);
    assert.ok(lowest(order, "poly") < lowest(order, "pt"), order.join(", "));
  });

  it("keeps the panel order for later syncs, so turning the order off restores it", () => {
    let on = true;
    registry.__swiftmapDrawOrder = (layers) => (on ? orderByShape(layers) : layers);
    const { map, order } = fakeMap(["bg"]);
    const controller = controllerOn(map);
    controller.syncLayers([point("pt"), polygon("poly")]);
    on = false;
    controller.syncLayers([point("pt"), polygon("poly")]);
    assert.ok(lowest(order, "pt") < lowest(order, "poly"), order.join(", "));
  });
});

describe("a layer drawn below another style layer stays there", () => {
  it("keeps a below-labels layer under the labels with a normal layer above it", () => {
    const { map, order } = fakeMap(["bg", "roads", "place_label"]);
    // Bottom to top: the zones (below labels), then a normal point layer.
    controllerOn(map).syncLayers([
      polygon("zones", { beforeId: "place_label", metadata: { swiftmapBelowLabels: true } }),
      point("sites"),
    ]);
    const label = order.indexOf("place_label");
    assert.ok(lowest(order, "zones") < label, order.join(", "));
    assert.ok(lowest(order, "sites") > label, order.join(", "));
  });
});
