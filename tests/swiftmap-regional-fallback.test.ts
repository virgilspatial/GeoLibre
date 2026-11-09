import { act, useAppStore } from "./helpers/dom";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

// SWIFTMAP (Change 32): a regional basemap the user doesn't load falls back to
// Swiftmap's default, not GeoLibre's Liberty. The tests pass Light's URL in;
// the test build has no Protomaps key, where the default is Liberty anyway.

// Loaded after the harness so its CSS imports and Vite globals are handled.
const { applySwiftmapFallback } =
  await import("../apps/geolibre-desktop/src/components/layout/regional-fallback");
const { swiftmapDefaultBasemapUrl } =
  await import("../apps/geolibre-desktop/src/components/map/swiftmap-basemap");
const { CHINA_BASEMAPS, DEFAULT_BASEMAP, createEmptyProject } = await import("@geolibre/core");

const AMAP = CHINA_BASEMAPS.find((basemap) => basemap.id === "amap-street")!;
const LIGHT = swiftmapDefaultBasemapUrl({ VITE_PROTOMAPS_API_KEY: "test-key" });

function openRegionalProject() {
  act(() => {
    useAppStore
      .getState()
      .loadProject(createEmptyProject("Shared", { basemapStyleUrl: AMAP.styleUrl }));
  });
}

describe("Regional basemap fallback", () => {
  beforeEach(() => {
    useAppStore.getState().newProject();
    useAppStore.setState({ regionalBasemapAnswers: {} });
    useAppStore.getState().setRegionalBasemapPolicy("prompt");
  });
  afterEach(() => {
    useAppStore.getState().setRegionalBasemapPolicy("allow");
    useAppStore.getState().newProject();
  });

  it("is Light, distinct from GeoLibre's fallback", () => {
    assert.notEqual(LIGHT, DEFAULT_BASEMAP);
  });

  it("replaces GeoLibre's fallback after Use default basemap, without an edit", () => {
    openRegionalProject();
    assert.equal(useAppStore.getState().basemapStyleUrl, DEFAULT_BASEMAP);
    const undoSteps = useAppStore.temporal.getState().pastStates.length;
    act(() => {
      useAppStore.getState().resolveRegionalBasemapHold(false);
      assert.equal(applySwiftmapFallback(LIGHT), true);
    });
    const state = useAppStore.getState();
    assert.equal(state.basemapStyleUrl, LIGHT);
    assert.equal(state.regionalBasemapHold, null);
    assert.equal(state.isDirty, false);
    assert.equal(useAppStore.temporal.getState().pastStates.length, undoSteps);
  });

  it("gives undo snapshots taken while the prompt was open the new basemap", () => {
    openRegionalProject();
    act(() => useAppStore.getState().setBlankBackgroundColor("#123456"));
    const before = useAppStore.temporal.getState().pastStates;
    assert.ok(before.some((snapshot) => snapshot.basemapStyleUrl === DEFAULT_BASEMAP));
    act(() => {
      useAppStore.getState().resolveRegionalBasemapHold(false);
      applySwiftmapFallback(LIGHT);
    });
    const after = useAppStore.temporal.getState().pastStates;
    assert.equal(after.length, before.length);
    assert.ok(after.every((snapshot) => snapshot.basemapStyleUrl !== DEFAULT_BASEMAP));
  });

  it("leaves a basemap the user picked meanwhile", () => {
    openRegionalProject();
    act(() => useAppStore.getState().setBasemapStyleUrl("https://example.com/style.json"));
    assert.equal(applySwiftmapFallback(LIGHT), false);
    assert.equal(useAppStore.getState().basemapStyleUrl, "https://example.com/style.json");
  });

  it("does nothing without a key (the default is Liberty already)", () => {
    openRegionalProject();
    act(() => useAppStore.getState().resolveRegionalBasemapHold(false));
    assert.equal(applySwiftmapFallback(DEFAULT_BASEMAP), false);
    assert.equal(useAppStore.getState().basemapStyleUrl, DEFAULT_BASEMAP);
  });

  it("still loads the regional basemap on Load (no swap while the prompt is open)", () => {
    openRegionalProject();
    act(() => useAppStore.getState().resolveRegionalBasemapHold(true));
    assert.equal(useAppStore.getState().basemapStyleUrl, AMAP.styleUrl);
  });
});
