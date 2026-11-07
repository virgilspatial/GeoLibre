import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PROJECT_PREFERENCES } from "@geolibre/core";
import { DEFAULT_BUILT_IN_CONTROL_VISIBILITY } from "../packages/map/src/map-engine";
import { maplibreLayerControlPlugin } from "../packages/plugins/src/plugins/layer-control";
import {
  NATIVE_CONTROL_MARGIN,
  STACK_GAP,
  STACK_INSET,
  nativeCornerTop,
  needleRotation,
  visibleMapButtons,
} from "../apps/geolibre-desktop/src/components/map-buttons/map-buttons-model";
import { newProjectToolbarControlVisibility } from "../apps/geolibre-desktop/src/components/layout/toolbar/constants";
import { seedSwiftmapControlDefaults } from "../apps/geolibre-desktop/src/components/map-buttons/control-defaults";

// SWIFTMAP (Change 26): the map button stack's order, compass and placement,
// and the defaults behind it.

describe("map button stack", () => {
  it("draws the switched-on buttons in the mockup's order", () => {
    assert.deepEqual(
      visibleMapButtons({ fullscreen: true, geolocate: true, compass: true, navigation: true }),
      ["zoom", "compass", "geolocate", "fullscreen"],
    );
    assert.deepEqual(visibleMapButtons({ navigation: true, compass: false, fullscreen: true }), [
      "zoom",
      "fullscreen",
    ]);
    assert.deepEqual(visibleMapButtons({ globe: true, terrain: true }), []);
  });

  it("turns the compass needle against the bearing so it points north", () => {
    assert.equal(needleRotation(0), 0);
    assert.equal(needleRotation(-0), 0);
    assert.equal(needleRotation(30), -30);
    assert.equal(needleRotation(-45), 45);
    assert.equal(needleRotation(180), 180);
    assert.equal(needleRotation(270), 90);
    assert.equal(needleRotation(-270), -90);
    assert.equal(needleRotation(390), -30);
    assert.equal(needleRotation(Number.NaN), 0);
  });

  it("starts the map's own top-right corner one gap below the stack", () => {
    // Zoom (69px) + Compass + Full screen + Map controls, 8px apart.
    const height = 69 + 3 * 34 + 3 * STACK_GAP;
    assert.equal(nativeCornerTop(height) + NATIVE_CONTROL_MARGIN, STACK_INSET + height + STACK_GAP);
    assert.equal(nativeCornerTop(0), STACK_INSET - NATIVE_CONTROL_MARGIN);
  });
});

describe("map button defaults", () => {
  it("shows Zoom, Compass and Full screen on a new device, not Globe, My location or Layer Control", () => {
    const stored: Record<string, boolean> = {};
    const read = (key: string, fallback: boolean) => stored[key] ?? fallback;
    const write = (key: string, visible: boolean) => {
      stored[key] = visible;
    };
    assert.deepEqual(seedSwiftmapControlDefaults(read, write).sort(), ["globe", "navigation"]);
    const visible = Object.fromEntries(
      Object.entries(DEFAULT_BUILT_IN_CONTROL_VISIBILITY).map(([id, on]) => [id, read(id, on)]),
    );
    assert.deepEqual(visibleMapButtons(visible), ["zoom", "compass", "fullscreen"]);
    assert.equal(visible.globe, false);
    assert.equal(maplibreLayerControlPlugin.activeByDefault, false);
  });

  it("keeps a device's own choices", () => {
    const stored: Record<string, boolean> = { navigation: false, globe: true };
    const writes: string[] = [];
    const seeded = seedSwiftmapControlDefaults(
      (key, fallback) => stored[key] ?? fallback,
      (key) => writes.push(key),
    );
    assert.deepEqual(seeded, []);
    assert.deepEqual(writes, []);
  });

  it("gives a new project the same buttons", () => {
    const visible = newProjectToolbarControlVisibility();
    assert.deepEqual(visibleMapButtons(visible), ["zoom", "compass", "fullscreen"]);
    assert.equal(visible.globe, false);
    assert.equal(visible.geolocate, false);
  });

  it("opens new maps flat", () => {
    assert.equal(DEFAULT_PROJECT_PREFERENCES.map.projection, "mercator");
  });
});
