import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LAYER_STYLE,
  type GeoLibreLayer,
  type LayerGroup,
  type LayerStyle,
} from "@geolibre/core";
import {
  classifyRendered,
  colorToHex,
  styleLayerOwners,
  type RenderedFeatureLike,
} from "../apps/geolibre-desktop/src/components/layout/legend-panel/legend-in-view";
import {
  inZoomRange,
  legendLayer,
  legendView,
  listedLayers,
  type InViewResult,
  type LegendLayer,
} from "../apps/geolibre-desktop/src/components/layout/legend-panel/legend-model";

// SWIFTMAP (Change 25): the Legend panel's swatches, In view classification and
// the panel's notes, count and empty line.

type Geometry = "point" | "line" | "polygon";

function layer(
  id: string,
  geometry: Geometry,
  style: Partial<LayerStyle> = {},
  extra: Partial<GeoLibreLayer> = {},
): GeoLibreLayer {
  return {
    id,
    name: id,
    type: "geojson",
    source: {},
    visible: true,
    opacity: 1,
    style: { ...DEFAULT_LAYER_STYLE, ...style },
    metadata: { geometryType: geometry },
    ...extra,
  } as GeoLibreLayer;
}

const group = (id: string, visible: boolean, parentId?: string): LayerGroup => ({
  id,
  name: id,
  visible,
  collapsed: false,
  opacity: 1,
  ...(parentId ? { parentId } : {}),
});

describe("Legend: which layers are listed", () => {
  it("lists visible vector layers top first, hiding layers under a group that is off", () => {
    const layers = [
      layer("bottom", "polygon"),
      layer("hidden", "line", {}, { visible: false }),
      layer("inOffGroup", "point", {}, { groupId: "child" }),
      layer("imagery", "polygon", {}, { type: "cog" } as Partial<GeoLibreLayer>),
      layer("top", "point", {}, { groupId: "on" }),
    ];
    const groups = [group("on", true), group("off", false), group("child", true, "off")];
    assert.deepEqual(
      listedLayers(layers, groups).map((item) => item.id),
      ["top", "bottom"],
    );
  });

  it("uses MapLibre's zoom range: min inclusive, max exclusive", () => {
    assert.equal(inZoomRange({ minZoom: 14, maxZoom: 24 }, 14), true);
    assert.equal(inZoomRange({ minZoom: 14, maxZoom: 24 }, 13.9), false);
    assert.equal(inZoomRange({ minZoom: 0, maxZoom: 16 }, 16), false);
  });
});

describe("Legend: swatches from the GeoLibre style", () => {
  it("draws single-symbol points, lines and hatched polygons", () => {
    assert.deepEqual(legendLayer(layer("p", "point", { fillColor: "#a855f7" })).swatch, {
      kind: "point",
      color: "#a855f7",
    });
    assert.deepEqual(
      legendLayer(layer("l", "line", { strokeColor: "#dc2626", strokeWidth: 3 })).swatch,
      {
        kind: "line",
        color: "#dc2626",
        width: 3,
      },
    );
    const hatched = legendLayer(
      layer("b", "polygon", {
        fillColor: "#f97316",
        fillOpacity: 0.35,
        strokeColor: "#f97316",
        strokeWidth: 1,
        fillPattern: "hatch",
        fillPatternColor: "#f97316",
      }),
    ).swatch;
    assert.equal(hatched?.kind, "polygon");
    assert.equal(hatched?.kind === "polygon" && hatched.pattern, "hatch");
    assert.equal(hatched?.kind === "polygon" && hatched.outline, "#f97316");
  });

  it("draws no outline when the map draws none (width 0)", () => {
    const swatch = legendLayer(layer("c", "polygon", { strokeWidth: 0 })).swatch;
    assert.equal(swatch?.kind === "polygon" && swatch.outline, null);
  });

  it("lists rule-based rules as classes with their own fill, outline and width", () => {
    const entry = legendLayer(
      layer("constraints", "polygon", {
        strokeColor: "#000000",
        strokeWidth: 1,
        vectorStyleMode: "rule-based",
        vectorRules: [
          {
            id: "high",
            label: "3: High Risk",
            filter: '["==", ["get", "risk"], 3]',
            color: "#fc3b19",
            strokeColor: "#6e6e6e",
            strokeWidth: 0,
            isElse: false,
          },
          {
            id: "site",
            label: "B1",
            filter: '["==", ["get", "site"], "B1"]',
            color: "#fcc7d9",
            strokeColor: "#8400a8",
            isElse: false,
          },
          {
            id: "off",
            label: "Off",
            filter: '["==", 1, 1]',
            color: "#000000",
            enabled: false,
            isElse: false,
          },
        ],
      }),
    );
    assert.equal(entry.swatch, null);
    assert.deepEqual(
      entry.classes.map((item) => [
        item.label,
        item.swatch.kind === "polygon" && item.swatch.fill,
        item.swatch.kind === "polygon" && item.swatch.outline,
      ]),
      [
        ["3: High Risk", "#fc3b19", null],
        ["B1", "#fcc7d9", "#8400a8"],
      ],
    );
  });

  it("labels categorised and graduated classes as GeoLibre's legend does", () => {
    const categorised = legendLayer(
      layer("species", "point", {
        vectorStyleMode: "categorized",
        vectorStyleProperty: "status",
        vectorStyleStops: [
          { value: "CE", color: "#b91c1c", label: "Critically endangered" },
          { value: "M", color: "#0d9488" },
        ],
      }),
    );
    assert.deepEqual(
      categorised.classes.map((item) => item.label),
      ["Critically endangered", "M"],
    );
    const graduated = legendLayer(
      layer("area", "polygon", {
        vectorStyleMode: "graduated",
        vectorStyleProperty: "ha",
        vectorStyleStops: [
          { value: 10, color: "#bbbbbb" },
          { value: 0, color: "#aaaaaa" },
        ],
      }),
    );
    assert.deepEqual(
      graduated.classes.map((item) => item.label),
      ["0 – 10", "≥ 10"],
    );
  });

  it("steps graduated line widths up only when the map sizes them by that field", () => {
    const stops = [1, 2, 3, 4, 5, 6].map((value) => ({ value, color: "#0284c7" }));
    const base = {
      vectorStyleMode: "graduated",
      vectorStyleProperty: "order",
      vectorStyleStops: stops,
      strokeWidth: 2,
    } as const;
    const widths = (style: Partial<LayerStyle>) =>
      legendLayer(layer("s", "line", style)).classes.map(
        (item) => item.swatch.kind === "line" && item.swatch.width,
      );
    assert.deepEqual(widths(base), [2, 2, 2, 2, 2, 2]);
    assert.deepEqual(
      widths({
        ...base,
        proportionalSizeEnabled: true,
        proportionalSizeProperty: "order",
        proportionalSizeMinValue: 1,
        proportionalSizeMaxValue: 6,
        proportionalSizeMinRadius: 1,
        proportionalSizeMaxRadius: 5,
      }),
      [1, 2, 2.5, 3.5, 4, 5],
    );
  });
});

describe("Legend: In view classification", () => {
  it("converts style-spec colours to hex", () => {
    assert.equal(colorToHex({ r: 0.5, g: 0, b: 0, a: 0.5 }), "#ff0000");
    assert.equal(colorToHex({ r: 0, g: 0, b: 0, a: 0 }), null);
    assert.equal(colorToHex("#fff"), null);
  });

  it("maps style layers to their GeoLibre layer by the longest id prefix", () => {
    const owners = styleLayerOwners(
      ["layer-a-fill", "layer-a-b-line", "basemap-roads", "native-1"],
      [
        { id: "a", metadata: {} },
        { id: "a-b", metadata: {} },
        { id: "tiles", metadata: { nativeLayerIds: ["native-1"] } },
      ],
      (id) => `layer-${id}-`,
    );
    assert.deepEqual(
      [...owners],
      [
        ["layer-a-fill", "a"],
        ["layer-a-b-line", "a-b"],
        ["native-1", "tiles"],
      ],
    );
  });

  it("finds the classes drawn in view, by colour and by rule", () => {
    const species = legendLayer(
      layer("species", "point", {
        vectorStyleMode: "categorized",
        vectorStyleProperty: "status",
        vectorStyleStops: [
          { value: "CE", color: "#b91c1c" },
          { value: "E", color: "#ea580c" },
          { value: "M", color: "#0d9488" },
        ],
      }),
    );
    const zoning = legendLayer(
      layer("zoning", "polygon", {
        vectorStyleMode: "rule-based",
        vectorRules: [
          {
            id: "r2",
            label: "R2",
            filter: '["==", ["get", "zone"], "R2"]',
            color: "#f4a9a9",
            isElse: false,
          },
          {
            id: "e2",
            label: "E2",
            filter: '["==", ["get", "zone"], "E2"]',
            color: "#5b8fd6",
            isElse: false,
            minZoom: 15,
          },
        ],
      }),
    );
    const single = legendLayer(layer("heritage", "point"));
    const rendered = (
      layerId: string,
      properties: Record<string, unknown>,
      type = 1,
    ): RenderedFeatureLike => ({
      layer: { id: layerId },
      properties,
      _vectorTileFeature: { type },
    });
    const owners = new Map([
      ["layer-species-circle", "species"],
      ["layer-zoning-fill", "zoning"],
      ["layer-heritage-circle", "heritage"],
    ]);
    const features = [
      rendered("layer-species-circle", { status: "CE" }),
      rendered("layer-species-circle", { status: "M" }),
      rendered("layer-zoning-fill", { zone: "R2" }, 3),
      rendered("layer-zoning-fill", { zone: "E2" }, 3),
      rendered("layer-heritage-circle", {}),
    ];
    const result = classifyRendered(features, owners, [species, zoning, single], 14);
    assert.deepEqual([...result.layerIds].sort(), ["heritage", "species", "zoning"]);
    assert.deepEqual([...(result.classIds.get("species") ?? [])].sort(), ["0", "2"]);
    // E2's rule starts at zoom 15, so at 14 only R2 is drawn.
    assert.deepEqual([...(result.classIds.get("zoning") ?? [])], ["r2"]);
  });
});

describe("Legend: notes, count and the empty line", () => {
  const entry = (id: string, minZoom = 0, maxZoom = 24, classes = 0): LegendLayer => ({
    id,
    name: id,
    minZoom,
    maxZoom,
    swatch: classes ? null : { kind: "point", color: "#000000" },
    classes: Array.from({ length: classes }, (_, index) => ({
      id: `${index}`,
      label: `${index}`,
      swatch: { kind: "point", color: "#000000" },
    })),
    classifier: null,
  });
  const inView = (ids: string[], classes: Record<string, string[]> = {}): InViewResult => ({
    layerIds: new Set(ids),
    classIds: new Map(Object.entries(classes).map(([key, value]) => [key, new Set(value)])),
  });

  it("lists single-symbol layers first and keeps out-of-range layers, with a note", () => {
    const layers = [
      entry("zoning", 0, 24, 3),
      entry("species", 0, 24, 2),
      entry("heritage", 14),
      entry("transmission"),
    ];
    const view = legendView({
      hasAnyLayers: true,
      layers,
      zoom: 13,
      mode: "view",
      // Species has features in view, but none in its categories.
      inView: inView(["zoning", "species"], { zoning: ["1"] }),
    });
    // In view drops layers with nothing in view, and a categorised layer
    // with none of its categories in view, heading and all.
    assert.deepEqual(
      view.rows.map((row) => [row.layer.id, row.outOfRange, row.classes.map((item) => item.id)]),
      [
        ["heritage", true, []],
        ["zoning", false, ["1"]],
      ],
    );
    const all = legendView({
      hasAnyLayers: true,
      layers,
      zoom: 13,
      mode: "all",
      inView: inView(["zoning"]),
    });
    assert.deepEqual(
      all.rows.map((row) => [row.layer.id, row.outOfRange, row.classes.length]),
      [
        ["heritage", true, 0],
        ["transmission", false, 0],
        ["zoning", false, 3],
        ["species", false, 2],
      ],
    );
  });

  it("gives a category the same label in In view and All", () => {
    const constraints = legendLayer(
      layer("constraints", "polygon", {
        vectorStyleMode: "rule-based",
        vectorRules: [
          {
            id: "high",
            label: "3: High Risk (Avoid impact)",
            filter: '["==", ["get", "rating"], 3]',
            color: "#fc3b19",
            isElse: false,
          },
          {
            id: "low",
            label: "1: Low Risk (Manage impact)",
            filter: '["==", ["get", "rating"], 1]',
            color: "#76e600",
            isElse: false,
          },
        ],
      }),
    );
    const labels = (mode: "view" | "all") =>
      legendView({
        hasAnyLayers: true,
        layers: [constraints],
        zoom: 12,
        mode,
        inView: inView(["constraints"], { constraints: ["high", "low"] }),
      }).rows[0]?.classes.map((item) => item.label);
    assert.deepEqual(labels("view"), [
      "3: High Risk (Avoid impact)",
      "1: Low Risk (Manage impact)",
    ]);
    assert.deepEqual(labels("view"), labels("all"));
  });

  it("chooses the single empty line in the spec's order", () => {
    const empty = (input: Partial<Parameters<typeof legendView>[0]>) =>
      legendView({
        hasAnyLayers: true,
        layers: [],
        zoom: 12,
        mode: "view",
        inView: inView([]),
        ...input,
      }).empty;
    assert.equal(empty({ hasAnyLayers: false }), "noLayers");
    assert.equal(empty({}), "noneOn");
    assert.equal(empty({ layers: [entry("a", 14), entry("b", 16)] }), "zoomIn");
    assert.equal(empty({ layers: [entry("a", 0, 10), entry("b", 0, 11)] }), "zoomOut");
    assert.equal(empty({ layers: [entry("a", 14), entry("b", 0, 10)] }), "zoomInOrOut");
    assert.equal(empty({ layers: [entry("a"), entry("b", 14)] }), "nothingHere");
    assert.equal(empty({ layers: [entry("a"), entry("b", 14)], mode: "all" }), null);
  });
});
