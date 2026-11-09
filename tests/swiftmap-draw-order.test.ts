import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LAYER_STYLE, type GeoLibreLayer, type LayerStyle } from "@geolibre/core";
import {
  DrawTier,
  drawTierOf,
  isDrawOrderByShapeOn,
  orderByShape,
  reorderLeftMapUnchanged,
  withDrawOrderByShape,
} from "../apps/geolibre-desktop/src/components/draw-order/draw-order";

// SWIFTMAP (Change 36): the tiers behind "Draw points above lines and polygons".

function layer(
  id: string,
  geometryTypes: string[],
  patch: Partial<GeoLibreLayer> = {},
  style: Partial<LayerStyle> = {},
): GeoLibreLayer {
  return {
    id,
    name: id,
    type: "geojson",
    source: { type: "geojson" },
    visible: true,
    opacity: 1,
    style: { ...DEFAULT_LAYER_STYLE, ...style },
    metadata: {},
    geojson: {
      type: "FeatureCollection",
      features: geometryTypes.map((type) => ({
        type: "Feature",
        properties: {},
        geometry: { type, coordinates: [] },
      })),
    },
    ...patch,
  } as GeoLibreLayer;
}

const point = (id: string, patch?: Partial<GeoLibreLayer>) => layer(id, ["Point"], patch);
const line = (id: string, patch?: Partial<GeoLibreLayer>) => layer(id, ["LineString"], patch);
const polygon = (id: string, patch?: Partial<GeoLibreLayer>) => layer(id, ["Polygon"], patch);
const ids = (layers: GeoLibreLayer[]) => layers.map((l) => l.id).join(" ");

describe("drawTierOf", () => {
  it("sorts by shape", () => {
    assert.equal(drawTierOf(point("p")), DrawTier.point);
    assert.equal(drawTierOf(line("l")), DrawTier.line);
    assert.equal(drawTierOf(polygon("a")), DrawTier.polygon);
  });

  it("puts mixed and unknown geometry in the polygon tier", () => {
    assert.equal(drawTierOf(layer("m", ["Point", "Polygon"])), DrawTier.polygon);
    assert.equal(drawTierOf(layer("m2", ["Point", "LineString"])), DrawTier.polygon);
    assert.equal(drawTierOf(layer("t", [], { type: "vector-tiles" })), DrawTier.polygon);
  });

  it("uses the host's geometryType for tile layers", () => {
    const tiles = layer("t", [], { type: "vector-tiles", metadata: { geometryType: "point" } });
    assert.equal(drawTierOf(tiles), DrawTier.point);
  });

  it("counts heatmaps and clusters as points, extrusions as polygons", () => {
    assert.equal(drawTierOf(layer("h", ["Polygon"], {}, { pointRenderer: "heatmap" })), DrawTier.point);
    assert.equal(drawTierOf(layer("c", ["Point"], {}, { pointRenderer: "cluster" })), DrawTier.point);
    assert.equal(drawTierOf(layer("x", ["Point"], {}, { extrusionEnabled: true })), DrawTier.polygon);
  });

  it("puts rasters and imagery at the bottom, 3D and deck.gl layers on top", () => {
    assert.equal(drawTierOf(layer("r", [], { type: "cog" })), DrawTier.raster);
    assert.equal(drawTierOf(layer("i", [], { type: "image" })), DrawTier.raster);
    assert.equal(drawTierOf(layer("w", [], { type: "wms" })), DrawTier.raster);
    for (const type of ["lidar", "3d-tiles", "deckgl-viz", "gaussian-splat"] as const) {
      assert.equal(drawTierOf(layer(type, [], { type })), DrawTier.overlay, type);
    }
  });
});

describe("orderByShape", () => {
  it("tiers bottom to top and keeps panel order within a tier", () => {
    const layers = [
      point("p1"),
      polygon("a1"),
      line("l1"),
      layer("r", [], { type: "cog" }),
      layer("t", [], { type: "3d-tiles" }),
      point("p2"),
      polygon("a2"),
    ];
    assert.equal(ids(orderByShape(layers)), "r a1 a2 l1 p1 p2 t");
  });

  it("keeps below-labels layers in their own band underneath", () => {
    const below = (l: GeoLibreLayer) =>
      ({ ...l, beforeId: "place_label", metadata: { swiftmapBelowLabels: true } }) as GeoLibreLayer;
    const layers = [polygon("a1"), below(point("bp")), line("l1"), below(polygon("ba"))];
    assert.equal(ids(orderByShape(layers)), "ba bp a1 l1");
  });

  it("treats a below-labels layer with no label layer to point at as normal", () => {
    const layers = [point("p"), { ...polygon("a"), metadata: { swiftmapBelowLabels: true } } as GeoLibreLayer];
    assert.equal(ids(orderByShape(layers)), "a p");
  });
});

describe("the switch", () => {
  it("is on unless the map was saved with it off", () => {
    assert.equal(isDrawOrderByShapeOn({}), true);
    assert.equal(isDrawOrderByShapeOn({ swiftmap: {} }), true);
    assert.equal(isDrawOrderByShapeOn(withDrawOrderByShape({}, false)), false);
    assert.equal(isDrawOrderByShapeOn(withDrawOrderByShape({ swiftmap: { other: 1 } }, true)), true);
  });

  it("keeps other metadata", () => {
    const next = withDrawOrderByShape({ title: "x", swiftmap: { other: 1 } }, false);
    assert.deepEqual(next, { title: "x", swiftmap: { other: 1, drawOrderByShape: false } });
  });
});

describe("reorderLeftMapUnchanged (the one-time hint)", () => {
  const a = polygon("a");
  const l = line("l");
  const p = point("p");

  it("is true when the panel order changed but the map draws the same", () => {
    assert.equal(reorderLeftMapUnchanged([a, l, p], [a, p, l]), true);
  });

  it("is false when the map order changes too", () => {
    const a2 = polygon("a2");
    assert.equal(reorderLeftMapUnchanged([a, a2], [a2, a]), false);
  });

  it("is false when layers were added or removed, or nothing moved", () => {
    assert.equal(reorderLeftMapUnchanged([a, l], [a, l, p]), false);
    assert.equal(reorderLeftMapUnchanged([a, l, p], [a, l, p]), false);
  });
});
