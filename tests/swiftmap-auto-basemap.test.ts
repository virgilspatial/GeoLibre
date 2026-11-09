import "./helpers/dom";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type * as maplibregl from "maplibre-gl";

// SWIFTMAP (Change 33): the Auto basemap follows the theme (Light in light
// mode, Dark in dark mode), is held on Light while an export dialog is open,
// and switches in place when the theme changes.

// Loaded after the harness so `document` exists.
const { autoFlavor, holdAutoOnLight, themeFlavor } =
  await import("../apps/geolibre-desktop/src/components/basemap/auto-flavor");
const { ensureSwiftmapBasemap, previousAutoStyle, registeredSwiftmapStyle } =
  await import("../apps/geolibre-desktop/src/components/basemap/basemap-registry");
const { swiftmapBasemapSwap } =
  await import("../apps/geolibre-desktop/src/components/basemap/basemap-swap");
const { buildSwiftmapBasemapStyle } =
  await import("../apps/geolibre-desktop/src/components/basemap/basemap-styles");
const { basemapLandColor, LIBERTY_LAND } =
  await import("../apps/geolibre-desktop/src/components/layout/legend-panel/legend-backing");
const { DEFAULT_BASEMAP, BLANK_BASEMAP } = await import("@geolibre/core");

const AUTO = "geolibre://offline-basemap/swiftmap/auto";
const KEY_ENV = { VITE_PROTOMAPS_API_KEY: "test-key" };

/** What useThemeMode sets on <html>. */
function setTheme(mode: "light" | "dark") {
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.style.colorScheme = mode;
}

const backgroundOf = (style: maplibregl.StyleSpecification | null) =>
  (style?.layers.find((layer) => layer.id === "background")?.paint as Record<string, unknown>)?.[
    "background-color"
  ];
const flavorStyle = (flavor: "light" | "dark") =>
  buildSwiftmapBasemapStyle({ kind: "protomaps", flavor, labels: true }, "test-key")!;

/** A map that only answers what the swap reads: the live layers and sources. */
function fakeMap(style: maplibregl.StyleSpecification) {
  let layers = style.layers.map((layer) => structuredClone(layer));
  const sources = new Set(Object.keys(style.sources));
  const map = {
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    getSource: (id: string) => (sources.has(id) ? {} : undefined),
    addSource: (id: string) => void sources.add(id),
    removeSource: (id: string) => void sources.delete(id),
    addLayer: (layer: maplibregl.LayerSpecification, before?: string) => {
      const at = before === undefined ? layers.length : layers.findIndex((l) => l.id === before);
      layers.splice(at, 0, structuredClone(layer));
    },
    removeLayer: (id: string) => {
      layers = layers.filter((layer) => layer.id !== id);
    },
    getLayersOrder: () => layers.map((layer) => layer.id),
    setPaintProperty: (id: string, key: string, value: unknown) => {
      const layer = layers.find((l) => l.id === id)!;
      layer.paint = { ...(layer.paint ?? {}), [key]: value } as never;
    },
    setLayoutProperty: () => undefined,
    setFilter: () => undefined,
    setLayerZoomRange: () => undefined,
    setSprite: () => undefined,
    setGlyphs: () => undefined,
  };
  return { map: map as unknown as maplibregl.Map, layers: () => layers };
}

describe("Auto basemap flavour", () => {
  afterEach(() => setTheme("light"));

  it("follows the theme", () => {
    setTheme("light");
    assert.equal(themeFlavor(), "light");
    assert.equal(autoFlavor(), "light");
    setTheme("dark");
    assert.equal(autoFlavor(), "dark");
  });

  it("stays on Light while an export holds it, and follows the theme after", () => {
    setTheme("dark");
    const release = holdAutoOnLight();
    const second = holdAutoOnLight();
    assert.equal(autoFlavor(), "light");
    release();
    release(); // a second call does nothing
    assert.equal(autoFlavor(), "light");
    second();
    assert.equal(autoFlavor(), "dark");
  });
});

describe("Auto basemap style", () => {
  afterEach(() => setTheme("light"));

  it("registers Light's or Dark's style under the one link", () => {
    setTheme("light");
    assert.equal(ensureSwiftmapBasemap(AUTO, KEY_ENV), true);
    assert.equal(backgroundOf(registeredSwiftmapStyle(AUTO)), backgroundOf(flavorStyle("light")));
    setTheme("dark");
    ensureSwiftmapBasemap(AUTO, KEY_ENV);
    assert.equal(backgroundOf(registeredSwiftmapStyle(AUTO)), backgroundOf(flavorStyle("dark")));
    // The style it replaced is kept: it's what the map still draws.
    assert.equal(backgroundOf(previousAutoStyle(AUTO)), backgroundOf(flavorStyle("light")));
  });

  it("swaps the same Auto link in place when the theme changes", () => {
    setTheme("light");
    ensureSwiftmapBasemap(AUTO, KEY_ENV);
    const { map, layers } = fakeMap(registeredSwiftmapStyle(AUTO)!);
    setTheme("dark");
    ensureSwiftmapBasemap(AUTO, KEY_ENV);
    assert.equal(swiftmapBasemapSwap(map, AUTO, AUTO), true);
    const background = layers().find((layer) => layer.id === "background");
    assert.equal(
      (background?.paint as Record<string, unknown>)["background-color"],
      backgroundOf(flavorStyle("dark")),
    );
  });

  it("still reloads any other basemap asked for twice", () => {
    const light = "geolibre://offline-basemap/swiftmap/light";
    ensureSwiftmapBasemap(light, KEY_ENV);
    const { map } = fakeMap(registeredSwiftmapStyle(light)!);
    assert.equal(swiftmapBasemapSwap(map, light, light), false);
  });
});

describe("Legend swatch backing", () => {
  it("is the land colour of Light, Grey, Dark and Auto's flavour", () => {
    const light = basemapLandColor("geolibre://offline-basemap/swiftmap/light", true, "light");
    const dark = basemapLandColor("geolibre://offline-basemap/swiftmap/dark", true, "light");
    assert.equal(light, "#e2dfda");
    assert.equal(dark, "#1f1f1f");
    assert.equal(basemapLandColor("geolibre://offline-basemap/swiftmap/grayscale", true, "light"), "#cccccc");
    assert.equal(basemapLandColor(AUTO, true, "light"), light);
    assert.equal(basemapLandColor(`${AUTO}?labels=off`, true, "dark"), dark);
  });

  it("is Liberty's land for Liberty, and for Protomaps without a key", () => {
    assert.equal(basemapLandColor(DEFAULT_BASEMAP, true, "dark"), LIBERTY_LAND);
    assert.equal(basemapLandColor(AUTO, false, "dark"), LIBERTY_LAND);
  });

  it("keeps the panel for Aerial, tile links, custom styles and None", () => {
    assert.equal(basemapLandColor("geolibre://offline-basemap/swiftmap/aerial", true, "light"), null);
    assert.equal(
      basemapLandColor("geolibre://offline-basemap/swiftmap/tiles?url=https%3A%2F%2Fa%2F%7Bz%7D", true, "light"),
      null,
    );
    assert.equal(basemapLandColor("https://example.com/style.json", true, "light"), null);
    assert.equal(basemapLandColor(BLANK_BASEMAP, true, "light"), null);
  });
});
