import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as maplibregl from "maplibre-gl";
import {
  swapBasemapStyle,
  type SwapMap,
} from "../apps/geolibre-desktop/src/components/basemap/basemap-swap";
import { buildSwiftmapBasemapStyle } from "../apps/geolibre-desktop/src/components/basemap/basemap-styles";

// SWIFTMAP (Change 28, 7c review 1): Swiftmap basemaps swap in place, so the
// map never blanks. A fake map records the live layer order and every call.

type Layer = maplibregl.LayerSpecification;

function fakeMap(style: maplibregl.StyleSpecification, userLayers: Layer[] = []) {
  let layers: Layer[] = [...style.layers.map((l) => structuredClone(l)), ...userLayers];
  const sources = new Set(Object.keys(style.sources));
  const calls: string[] = [];
  const fake = {
    getLayer: (id: string) => layers.find((l) => l.id === id),
    getSource: (id: string) => (sources.has(id) ? {} : undefined),
    addSource: (id: string) => {
      sources.add(id);
      calls.push(`addSource ${id}`);
    },
    removeSource: (id: string) => {
      sources.delete(id);
      calls.push(`removeSource ${id}`);
    },
    addLayer: (layer: Layer, before?: string) => {
      const at = before === undefined ? layers.length : layers.findIndex((l) => l.id === before);
      assert.ok(at >= 0, `before ${before} exists`);
      layers.splice(at, 0, structuredClone(layer));
    },
    removeLayer: (id: string) => {
      layers = layers.filter((l) => l.id !== id);
    },
    getLayersOrder: () => layers.map((l) => l.id),
    setPaintProperty: (id: string, key: string, value: unknown) => {
      const layer = layers.find((l) => l.id === id)!;
      layer.paint = { ...(layer.paint ?? {}), [key]: value } as never;
      calls.push("paint");
    },
    setLayoutProperty: (id: string, key: string, value: unknown) => {
      const layer = layers.find((l) => l.id === id)!;
      layer.layout = { ...(layer.layout ?? {}), [key]: value } as never;
    },
    setFilter: () => undefined,
    setLayerZoomRange: () => undefined,
    setSprite: (sprite: string) => calls.push(`sprite ${sprite}`),
    setGlyphs: () => undefined,
  };
  const map = fake as unknown as SwapMap;
  return { map, calls, order: () => layers.map((l) => l.id), sources };
}

const style = (
  basemap: Parameters<typeof buildSwiftmapBasemapStyle>[0],
): maplibregl.StyleSpecification => buildSwiftmapBasemapStyle(basemap, "k")!;

const light = style({ kind: "protomaps", flavor: "light", labels: true });
const lightNoLabels = style({ kind: "protomaps", flavor: "light", labels: false });
const dark = style({ kind: "protomaps", flavor: "dark", labels: true });
const aerial = style({ kind: "aerial", labels: true });

const fill: Layer = { id: "user-fill", type: "fill", source: "user" };
const firstLabel = (s: maplibregl.StyleSpecification) =>
  s.layers.find((l) => l.type === "symbol")!.id;

describe("Swiftmap basemap swap", () => {
  it("turns labels off and on without touching the base layers", () => {
    const { map, order } = fakeMap(light, [fill]);
    assert.equal(swapBasemapStyle(map, light, lightNoLabels), true);
    assert.deepEqual(order(), [...lightNoLabels.layers.map((l) => l.id), "user-fill"]);
    assert.equal(swapBasemapStyle(map, lightNoLabels, light), true);
    // Labels come back below the user's layer, in style order.
    assert.deepEqual(order(), [...light.layers.map((l) => l.id), "user-fill"]);
  });

  it("restyles Light as Dark in place, keeping a layer drawn below the labels", () => {
    // The user's layer sits right under the first label (Draw below labels).
    const { map, order, calls } = fakeMap(light);
    const labelAt = order().indexOf(firstLabel(light));
    const live = order();
    live.splice(labelAt, 0, "user-fill");
    map.addLayer(fill, firstLabel(light));
    assert.deepEqual(order(), live);

    assert.equal(swapBasemapStyle(map, light, dark), true);
    assert.deepEqual(order(), live, "no layer moved");
    assert.ok(calls.includes("paint"));
    assert.ok(calls.some((c) => c.startsWith("sprite") && c.endsWith("/dark")));
  });

  it("swaps Aerial for Light with the new base under a below-labels layer", () => {
    const { map, order, sources } = fakeMap(aerial);
    map.addLayer(fill, firstLabel(aerial));
    assert.equal(swapBasemapStyle(map, aerial, light), true);
    const live = order();
    const base = light.layers.filter((l) => l.type !== "symbol").map((l) => l.id);
    // Every new base layer is below the user's layer, which is below the labels.
    for (const id of base) assert.ok(live.indexOf(id) < live.indexOf("user-fill"), id);
    assert.ok(live.indexOf("user-fill") < live.indexOf(firstLabel(light)));
    assert.ok(!live.includes("swiftmap-aerial"));
    assert.ok(!sources.has("swiftmap-aerial"));
  });

  it("declines, changing nothing, when the map doesn't hold the previous basemap", () => {
    const { map, order } = fakeMap(dark);
    const before = order();
    assert.equal(swapBasemapStyle(map, aerial, light), false);
    assert.deepEqual(order(), before);
  });
});
