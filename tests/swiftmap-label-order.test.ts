import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { useAppStore, type GeoLibreLayer } from "@geolibre/core";
import {
  labelPlacement,
  liftLabels,
  swiftmapAfterPlacement,
} from "../apps/geolibre-desktop/src/components/draw-order/label-order";
import { geojsonLayer } from "./helpers/layer-fixtures";

// SWIFTMAP: labels always on top (Change 38).
const initialState = useAppStore.getState();
afterEach(() => useAppStore.setState(initialState, true));

/** A map that only keeps the style order, and counts moves. */
function orderMap(order: string[]) {
  let moves = 0;
  return {
    order,
    get moves() {
      return moves;
    },
    getLayersOrder: () => [...order],
    moveLayer(id: string, beforeId?: string) {
      moves += 1;
      order.splice(order.indexOf(id), 1);
      const at = beforeId ? order.indexOf(beforeId) : -1;
      if (at === -1) order.push(id);
      else order.splice(at, 0, id);
    },
  };
}

const layer = (id: string, patch: Partial<GeoLibreLayer> = {}) => geojsonLayer({ id, name: id, ...patch });
// Draw order, bottom to top: the zones (polygons), the roads (lines), the sites (points).
const drawn = [layer("zones"), layer("roads"), layer("sites")];

describe("labelPlacement and liftLabels", () => {
  it("lifts every label above all the shapes, in draw order, under anything above the data", () => {
    const map = orderMap([
      "bg",
      "place_label",
      "layer-zones-fill",
      "layer-zones-label",
      "layer-roads-line",
      "layer-roads-label",
      "layer-sites-circle",
      "layer-sites-label",
      "gl-draw-points",
    ]);
    liftLabels(map, drawn);
    assert.deepEqual(map.order, [
      "bg",
      "place_label",
      "layer-zones-fill",
      "layer-roads-line",
      "layer-sites-circle",
      "layer-zones-label",
      "layer-roads-label",
      "layer-sites-label",
      "gl-draw-points",
    ]);
  });

  it("moves nothing when the labels are already in place, or when there are none", () => {
    const placed = orderMap(["layer-zones-fill", "layer-sites-circle", "layer-zones-label", "layer-sites-label"]);
    liftLabels(placed, drawn);
    assert.equal(placed.moves, 0);
    const none = orderMap(["layer-zones-fill", "layer-sites-circle"]);
    liftLabels(none, drawn);
    assert.equal(none.moves, 0);
  });

  it("keeps text points, cluster counts and markers with their shapes", () => {
    const map = orderMap(["layer-zones-fill", "layer-zones-label", "layer-sites-text", "layer-sites-cluster-count"]);
    liftLabels(map, drawn);
    assert.deepEqual(map.order, ["layer-zones-fill", "layer-sites-text", "layer-sites-cluster-count", "layer-zones-label"]);
  });

  it("counts a plugin layer's native layers as shapes, and lifts below-labels layers' labels too", () => {
    const plugin = layer("tiles3d", { metadata: { nativeLayerIds: ["tiles3d-native"] } });
    const below = layer("parcels", { beforeId: "place_label", metadata: { swiftmapBelowLabels: true } });
    const placement = labelPlacement(
      ["layer-parcels-fill", "layer-parcels-label", "place_label", "layer-zones-fill", "tiles3d-native", "top-ui"],
      [below, layer("zones"), plugin],
    );
    assert.deepEqual(placement, { labels: ["layer-parcels-label"], beforeId: "top-ui" });
  });
});

describe("swiftmapAfterPlacement", () => {
  it("lifts the labels only while the draw-order switch is on", () => {
    const start = ["layer-zones-fill", "layer-zones-label", "layer-sites-circle"];
    const off = orderMap([...start]);
    useAppStore.setState({ metadata: { swiftmap: { drawOrderByShape: false } } });
    swiftmapAfterPlacement(off, drawn);
    assert.deepEqual(off.order, start);

    const on = orderMap([...start]);
    useAppStore.setState({ metadata: {} });
    swiftmapAfterPlacement(on, drawn);
    assert.deepEqual(on.order, ["layer-zones-fill", "layer-sites-circle", "layer-zones-label"]);
  });
});
