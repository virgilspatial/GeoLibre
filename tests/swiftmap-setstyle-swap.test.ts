import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createMapController, type MapController } from "../packages/map/src/map-controller";
import {
  installSwiftmapBasemapSwap,
  swiftmapBasemapSwap,
} from "../apps/geolibre-desktop/src/components/basemap/basemap-swap";
import { swiftmapBasemapUrl } from "../apps/geolibre-desktop/src/components/basemap/basemap-catalog";

// SWIFTMAP (Change 28): guards the one engine edit. MapController.setStyle
// hands a switch between Swiftmap basemaps to the swap Swiftmap registers on
// globalThis, so labels on/off and Light/Grey/Dark/Aerial don't reload the
// style (which blanks the map). If a GeoLibre release changes or bypasses that
// hook, these fail: re-apply the tagged lines in map-controller.ts.

type Swap = (map: unknown, previousUrl: string, nextUrl: string) => boolean;
const registry = globalThis as { __swiftmapBasemapSwap?: Swap };

const LIGHT = swiftmapBasemapUrl({ kind: "protomaps", flavor: "light", labels: true });
const LIGHT_NO_LABELS = swiftmapBasemapUrl({ kind: "protomaps", flavor: "light", labels: false });
const AERIAL = swiftmapBasemapUrl({ kind: "aerial", labels: true });

/** The controller on a stub map (as map-controller.test.ts does), on Light. */
function controllerOnLight(): { controller: MapController; map: object; reloads: unknown[] } {
  const reloads: unknown[] = [];
  const map = {
    setStyle: (style: unknown) => reloads.push(style),
    getStyle: () => ({ version: 8, sources: {}, layers: [] }),
    isStyleLoaded: () => true,
    getLayer: () => undefined,
    stop: () => {},
    once: () => {},
    on: () => {},
    off: () => {},
    getTerrain: () => null,
    setTerrain: () => {},
  };
  const controller = createMapController();
  const internal = controller as unknown as {
    map: unknown;
    styleReady: boolean;
    basemapStyleUrl: string;
  };
  internal.map = map;
  internal.styleReady = true;
  internal.basemapStyleUrl = LIGHT;
  return { controller, map, reloads };
}

afterEach(() => {
  delete registry.__swiftmapBasemapSwap;
});

describe("MapController.setStyle hands Swiftmap basemap switches to the swap", () => {
  it("registers the swap on the global name the controller reads", () => {
    installSwiftmapBasemapSwap();
    assert.equal(registry.__swiftmapBasemapSwap, swiftmapBasemapSwap);
  });

  it("calls the swap, not a style reload, for labels off and for Light to Aerial", () => {
    const { controller, map, reloads } = controllerOnLight();
    const calls: [unknown, string, string][] = [];
    registry.__swiftmapBasemapSwap = (m, previous, next) => {
      calls.push([m, previous, next]);
      return true;
    };

    controller.setStyle(LIGHT_NO_LABELS);
    controller.setStyle(AERIAL);

    assert.deepEqual(calls, [
      [map, LIGHT, LIGHT_NO_LABELS],
      [map, LIGHT_NO_LABELS, AERIAL],
    ]);
    assert.equal(reloads.length, 0, "map.setStyle must not run when the swap applies");
  });

  it("reloads the style as before when the swap declines", () => {
    const { controller, reloads } = controllerOnLight();
    registry.__swiftmapBasemapSwap = () => false;
    controller.setStyle(AERIAL);
    assert.equal(reloads.length, 1);
  });
});
