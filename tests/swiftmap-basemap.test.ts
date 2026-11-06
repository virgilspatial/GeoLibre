import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { DEFAULT_BASEMAP, useAppStore, type GeoLibreLayer } from "@geolibre/core";
import {
  applySwiftmapDefaultBasemap,
  swiftmapDefaultBasemapId,
  swiftmapDefaultBasemapUrl,
  SWIFTMAP_DEFAULT_BASEMAP_FLAG,
} from "../apps/geolibre-desktop/src/components/map/swiftmap-basemap";
import { readLastBasemap, writeLastBasemap } from "../apps/geolibre-desktop/src/lib/last-basemap";

// SWIFTMAP (Change 23): Protomaps Light as the default basemap.

const KEY_ENV = { VITE_PROTOMAPS_API_KEY: "test-key" };
const NO_KEY_ENV = { VITE_PROTOMAPS_API_KEY: "" };
const LIGHT = "https://api.protomaps.com/styles/v5/light/en.json?key=test-key";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
});

describe("Swiftmap default basemap", () => {
  it("is Protomaps Light with a key, and GeoLibre's default without one", () => {
    assert.equal(swiftmapDefaultBasemapUrl(KEY_ENV), LIGHT);
    assert.equal(swiftmapDefaultBasemapUrl(NO_KEY_ENV), DEFAULT_BASEMAP);
  });

  it("preselects Protomaps Light in the New Project dialog only when it is offered", () => {
    assert.equal(swiftmapDefaultBasemapId(["protomaps-light", "protomaps-dark"]), "protomaps-light");
    assert.equal(swiftmapDefaultBasemapId([]), "liberty");
  });

  it("switches an untouched first-run map and remembers it", () => {
    const storage = memoryStorage();
    assert.equal(applySwiftmapDefaultBasemap({ env: KEY_ENV, storage }), true);
    assert.equal(useAppStore.getState().basemapStyleUrl, LIGHT);
    assert.equal(useAppStore.getState().isDirty, false);
    assert.equal(readLastBasemap(storage), LIGHT);
    assert.equal(storage.getItem(SWIFTMAP_DEFAULT_BASEMAP_FLAG), "1");
  });

  it("does nothing without a key, and leaves the upgrade for later", () => {
    const storage = memoryStorage();
    assert.equal(applySwiftmapDefaultBasemap({ env: NO_KEY_ENV, storage }), false);
    assert.equal(useAppStore.getState().basemapStyleUrl, DEFAULT_BASEMAP);
    assert.equal(storage.getItem(SWIFTMAP_DEFAULT_BASEMAP_FLAG), null);
  });

  it("upgrades a remembered Liberty once, then keeps a later Liberty choice", () => {
    const storage = memoryStorage();
    writeLastBasemap(DEFAULT_BASEMAP, storage);
    assert.equal(applySwiftmapDefaultBasemap({ env: KEY_ENV, storage }), true);
    assert.equal(readLastBasemap(storage), LIGHT);

    // The user picks Liberty again; the next launch keeps it.
    useAppStore.setState(useAppStore.getInitialState(), true);
    writeLastBasemap(DEFAULT_BASEMAP, storage);
    assert.equal(applySwiftmapDefaultBasemap({ env: KEY_ENV, storage }), false);
    assert.equal(readLastBasemap(storage), DEFAULT_BASEMAP);
  });

  it("keeps a remembered basemap that isn't the default", () => {
    const storage = memoryStorage();
    writeLastBasemap("https://example.com/style.json", storage);
    assert.equal(applySwiftmapDefaultBasemap({ env: KEY_ENV, storage }), false);
    assert.equal(readLastBasemap(storage), "https://example.com/style.json");
    assert.equal(storage.getItem(SWIFTMAP_DEFAULT_BASEMAP_FLAG), "1");
  });

  it("never changes an opened or created project, or one with layers", () => {
    for (const touched of [
      { projectGeneration: 1 },
      { projectPath: "C:/maps/site.geolibre.json" },
      { isDirty: true },
      { layers: [{ id: "a" } as GeoLibreLayer] },
    ]) {
      useAppStore.setState(useAppStore.getInitialState(), true);
      useAppStore.setState(touched);
      const storage = memoryStorage();
      assert.equal(applySwiftmapDefaultBasemap({ env: KEY_ENV, storage }), false);
      assert.equal(useAppStore.getState().basemapStyleUrl, DEFAULT_BASEMAP);
      assert.equal(storage.getItem(SWIFTMAP_DEFAULT_BASEMAP_FLAG), null);
    }
  });
});
