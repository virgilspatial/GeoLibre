import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { parseHTML } from "linkedom";
import type { FeatureCollection } from "geojson";
import {
  DEFAULT_LAYER_STYLE,
  type GeoLibreLayer,
  type LayerStyle,
  type VectorRule,
} from "@geolibre/core";
import {
  ARROW_NEUTRAL,
  categoriesOf,
  categoriesPatch,
  categoryFilter,
  classRanges,
  defaultPopupFields,
  directionArrowsPatch,
  firstLabelLayerId,
  geometryKindOf,
  isGreyscale,
  isSystemField,
  kindForFormat,
  moveItem,
  popupPreview,
  popupWithDefaults,
  parseCategoryFilter,
  readRuleCategories,
  showAsOf,
} from "../apps/geolibre-desktop/src/components/style-panel-swiftmap/style-model";
import {
  buildCategories,
  defaultCategoryField,
  OTHER_COLOR,
} from "../apps/geolibre-desktop/src/components/style-panel-swiftmap/style-actions";
import { createIdentifyPopupRows } from "../packages/map/src/feature-popup";

// SWIFTMAP (Change 27): the Style panel's model. The converter-shaped rules
// below are synthetic: the same shape as the ArcGIS Pro converter's output
// (one rule per value, spaced JSON, labels and outline overrides).

const style = (patch: Partial<LayerStyle> = {}): LayerStyle => ({
  ...DEFAULT_LAYER_STYLE,
  ...patch,
});

const converterRules: VectorRule[] = [
  {
    id: "r-a",
    label: "3: High",
    filter: '["==", ["get", "rating"], 3]',
    color: "#fc3b19",
    isElse: false,
    strokeWidth: 0,
    strokeColor: "#6e6e6e",
  },
  {
    id: "r-b",
    label: "2: Moderate",
    filter: '["==", ["get", "rating"], 2]',
    color: "#ffaa00",
    isElse: false,
    strokeWidth: 0,
    strokeColor: "#6e6e6e",
  },
  {
    id: "r-c",
    label: "1: Low",
    filter: '["==", ["get", "rating"], 1]',
    color: "#76e600",
    isElse: false,
    strokeWidth: 0,
    strokeColor: "#6e6e6e",
  },
];

describe("reading rules as Categories", () => {
  it("parses a one-value filter whatever its JSON spacing", () => {
    assert.deepEqual(parseCategoryFilter('["==", ["get", "zone"], "R2"]'), {
      field: "zone",
      value: "R2",
    });
    assert.deepEqual(parseCategoryFilter('["==",["get","n"],4]'), { field: "n", value: 4 });
    assert.equal(parseCategoryFilter('["in", ["get", "zone"], ["literal", ["R2"]]]'), null);
    assert.equal(parseCategoryFilter('[">", ["get", "n"], 4]'), null);
    assert.equal(parseCategoryFilter("not json"), null);
  });

  it("opens converter-shaped rules as Categories, keeping labels and outlines", () => {
    const view = readRuleCategories(converterRules);
    assert.ok(view);
    assert.equal(view.field, "rating");
    assert.deepEqual(
      view.categories.map((c) => [c.value, c.label]),
      [
        [3, "3: High"],
        [2, "2: Moderate"],
        [1, "1: Low"],
      ],
    );
    assert.equal(view.categories[0]?.strokeColor, "#6e6e6e");
    assert.equal(view.categories[0]?.strokeWidth, 0);
    assert.equal(view.other, null);
    assert.equal(
      showAsOf(style({ vectorStyleMode: "rule-based", vectorRules: converterRules }), false),
      "categories",
    );
  });

  it("accepts one else-rule as Other", () => {
    const view = readRuleCategories([
      ...converterRules,
      { id: "e", label: "Other", filter: "", color: "#aaaaaa", isElse: true },
    ]);
    assert.equal(view?.other?.label, "Other");
  });

  it("shows anything else as Custom rules", () => {
    const twoFields = [
      converterRules[0]!,
      { ...converterRules[1]!, filter: '["==", ["get", "other"], 2]' },
    ];
    const nested = [{ ...converterRules[0]!, parentId: "x" }];
    const zoomed = [{ ...converterRules[0]!, minZoom: 10 }];
    const off = [{ ...converterRules[0]!, enabled: false }];
    const twoElses = [
      { ...converterRules[0]! },
      { id: "e1", label: "", filter: "", color: "#000000", isElse: true },
      { id: "e2", label: "", filter: "", color: "#000000", isElse: true },
    ];
    for (const rules of [twoFields, nested, zoomed, off, twoElses, []]) {
      assert.equal(readRuleCategories(rules), null);
      assert.equal(
        showAsOf(style({ vectorStyleMode: "rule-based", vectorRules: rules }), false),
        "custom",
      );
    }
    assert.equal(showAsOf(style({ vectorStyleMode: "expression" }), false), "custom");
  });

  it("reads GeoLibre's own categorised mode, labels falling back to the value", () => {
    const view = categoriesOf(
      style({
        vectorStyleMode: "categorized",
        vectorStyleProperty: "zone",
        vectorStyleStops: [
          { value: "R2", color: "#111111", label: "Low density" },
          { value: "B4", color: "#222222" },
        ],
      }),
    );
    assert.deepEqual(
      view?.categories.map((c) => c.label),
      ["Low density", "B4"],
    );
  });
});

describe("saving Categories", () => {
  it("writes one rule per value plus Other, keeping rule ids by position", () => {
    let n = 0;
    const patch = categoriesPatch(
      {
        field: "zone",
        categories: [
          {
            value: "R2",
            label: "Residential",
            color: "#111111",
            strokeColor: "#000000",
            strokeWidth: 2,
          },
          { value: 5, label: "Five", color: "#222222" },
        ],
        other: { value: "", label: "Other", color: "#a1a1aa" },
      },
      () => `new-${++n}`,
      [{ id: "kept", label: "", filter: "", color: "#000000", isElse: false }],
    );
    assert.equal(patch.vectorStyleMode, "rule-based");
    assert.equal(patch.vectorStyleProperty, "zone");
    const rules = patch.vectorRules!;
    assert.deepEqual(
      rules.map((r) => r.id),
      ["kept", "new-1", "new-2"],
    );
    assert.equal(rules[0]?.filter, categoryFilter("zone", "R2"));
    assert.equal(rules[0]?.strokeWidth, 2);
    assert.equal("strokeColor" in rules[1]!, false);
    assert.equal(rules[2]?.isElse, true);
    // And it reads back the same.
    assert.equal(readRuleCategories(rules)?.categories[1]?.value, 5);
  });

  it("builds categories from data: every value when few, else the top 12 and Other", () => {
    const features = (values: (string | number)[]): FeatureCollection => ({
      type: "FeatureCollection",
      features: values.map((v) => ({
        type: "Feature",
        properties: { zone: v, id: Math.random() },
        geometry: { type: "Point", coordinates: [0, 0] },
      })),
    });
    const layer = (values: (string | number)[]): GeoLibreLayer => ({
      id: "l",
      name: "l",
      type: "geojson",
      source: {},
      visible: true,
      opacity: 1,
      style: style(),
      metadata: {},
      geojson: features(values),
    });
    const few = buildCategories(layer(["B", "A", "C", "A"]), "zone", "viridis", style());
    assert.deepEqual(
      few.categories.map((c) => c.value),
      ["A", "B", "C"],
    );
    assert.equal(few.other, null);
    const many = buildCategories(
      layer(Array.from({ length: 60 }, (_, i) => `v${i}`)),
      "zone",
      "viridis",
      style(),
    );
    assert.equal(many.categories.length, 12);
    assert.equal(many.other?.color, OTHER_COLOR);
    // Text fields only (id is a number).
    assert.equal(defaultCategoryField(layer(["R", "R", "B", "B"]), ["id", "zone"]), "zone");
  });

  it("starts Categories on the text field with the most values up to 12, shorter values on a tie", () => {
    const rows = [
      { code: "R1", name: "Residential", kind: "a", lot: "L1", n: 1 },
      { code: "B2", name: "Business", kind: "a", lot: "L2", n: 2 },
      { code: "IN", name: "Industry", kind: "b", lot: "L3", n: 3 },
    ];
    const many = Array.from({ length: 14 }, (_, i) => ({
      code: "R1",
      name: "Residential",
      kind: "a",
      lot: `L${i}`,
      n: i,
    }));
    const zoning: GeoLibreLayer = {
      id: "z",
      name: "z",
      type: "geojson",
      source: {},
      visible: true,
      opacity: 1,
      style: style(),
      metadata: {},
      geojson: {
        type: "FeatureCollection",
        features: [...rows, ...many].map((properties) => ({
          type: "Feature",
          properties,
          geometry: { type: "Point", coordinates: [0, 0] },
        })),
      },
    };
    // lot has 14 values (over 12); code and name tie on 3 or more, code's values are shorter.
    assert.equal(defaultCategoryField(zoning, ["code", "kind", "lot", "n", "name"]), "code");
    assert.equal(defaultCategoryField(zoning, ["kind", "lot", "n"]), "kind");
    assert.equal(defaultCategoryField(zoning, ["kind"], "n"), "kind");
  });
});

describe("the rest of the panel's rules", () => {
  it("names the geometry", () => {
    assert.equal(geometryKindOf({ hasPoint: false, hasLine: false, hasPolygon: true }), "polygon");
    assert.equal(geometryKindOf({ hasPoint: false, hasLine: true, hasPolygon: false }), "line");
    assert.equal(geometryKindOf({ hasPoint: true, hasLine: false, hasPolygon: false }), "point");
    assert.equal(geometryKindOf({ hasPoint: true, hasLine: true, hasPolygon: false }), "mixed");
  });

  it("shows point heatmaps and clusters by name", () => {
    assert.equal(showAsOf(style({ pointRenderer: "heatmap" }), true), "heatmap");
    assert.equal(showAsOf(style({ pointRenderer: "cluster" }), true), "clusters");
    assert.equal(showAsOf(style({ pointRenderer: "heatmap" }), false), "single");
  });

  it("colours direction arrows: the line's own colour, or one neutral for categories", () => {
    assert.deepEqual(directionArrowsPatch(style(), true), {
      lineDecoration: "arrow",
      lineDecorationColor: "",
    });
    assert.deepEqual(directionArrowsPatch(style({ vectorStyleMode: "rule-based" }), true), {
      lineDecoration: "arrow",
      lineDecorationColor: ARROW_NEUTRAL,
    });
    assert.deepEqual(directionArrowsPatch(style(), false), { lineDecoration: "none" });
  });

  it("finds the basemap's first label layer, ignoring user layers", () => {
    const layers = [
      { id: "water", type: "fill" },
      { id: "user-labels", type: "symbol" },
      { id: "roads", type: "line" },
      { id: "place-labels", type: "symbol" },
    ];
    assert.equal(firstLabelLayerId(layers, ["water", "roads", "place-labels"]), "place-labels");
    assert.equal(firstLabelLayerId(layers, ["water", "roads"]), null);
  });

  it("leaves system fields out of a new pop-up and rounds decimals to 2", () => {
    const fields = [
      "OBJECTID",
      "SHAPE_Area",
      "Shape_Leng",
      "fid",
      "id",
      "name",
      "count",
      "frontage",
    ];
    const samples = [
      {
        OBJECTID: 1,
        SHAPE_Area: 12.345,
        Shape_Leng: 3.2,
        fid: 1,
        id: 1,
        name: "A",
        count: 4,
        frontage: 18.4375,
      },
      {
        OBJECTID: 2,
        SHAPE_Area: 9.5,
        Shape_Leng: 1.1,
        fid: 2,
        id: 2,
        name: "B",
        count: 7,
        frontage: 20,
      },
    ];
    assert.deepEqual(defaultPopupFields(fields, samples), [
      { field: "name" },
      { field: "count" },
      { field: "frontage", kind: "number", format: { decimals: 2 } },
    ]);
    assert.equal(isSystemField("shape__area"), true);
    assert.equal(isSystemField("site_id"), false);
  });

  it("reads greyscale, class ranges and moves pop-up fields", () => {
    assert.equal(isGreyscale({ rasterSaturation: -1 }), true);
    assert.equal(isGreyscale({ rasterSaturation: 0 }), false);
    assert.deepEqual(
      classRanges([
        { value: 0, color: "" },
        { value: 10, color: "" },
        { value: 25, color: "" },
      ]),
      [
        { from: 0, to: 10 },
        { from: 10, to: 25 },
        { from: 25, to: null },
      ],
    );
    assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
    assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 5, 0), ["a", "b"]);
  });
});

// SWIFTMAP (Change 27, 7b review round 3): the map pop-up shows exactly what
// the Pop-up tab's preview shows. The layer is synthetic, shaped like the
// ArcGIS Pro converter's output: no saved pop-up, a numeric feature id, ArcGIS
// system fields and an unrounded geometry measure.
describe("the map pop-up and the Pop-up tab's preview", () => {
  const FIELDS = ["OBJECTID", "_constraint_rating", "_overlaps", "SHAPE_Length", "SHAPE_Area"];
  const FEATURE = {
    OBJECTID: 20,
    _constraint_rating: 2,
    _overlaps: 2,
    SHAPE_Length: 6481.646915804342,
    SHAPE_Area: 192159.33363761083,
  };
  const original = { document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  afterEach(() => {
    Object.assign(globalThis, original);
  });

  /** What GeoLibre's map renderer draws: [label, value] per row. */
  function mapRows(popup: Parameters<typeof popupPreview>[2]): string[][] {
    const { window, document } = parseHTML("<html><body></body></html>");
    Object.assign(globalThis, { document, HTMLElement: window.HTMLElement });
    const rows = createIdentifyPopupRows(FEATURE, 20, { popup });
    return [...rows.children].map((row) => [...row.children].map((cell) => cell.textContent ?? ""));
  }

  function previewRows(popup: Parameters<typeof popupPreview>[2]): string[][] {
    return popupPreview("Constraint_mapping", FEATURE, popup).rows.map((row) => [
      row.label,
      row.text,
    ]);
  }

  it("fills in the defaults on a layer with no saved pop-up, and only once", () => {
    const popup = popupWithDefaults(undefined, FIELDS, [FEATURE]);
    assert.deepEqual(popup, {
      fields: [{ field: "_constraint_rating" }, { field: "_overlaps" }],
      showFeatureId: false,
    });
    assert.equal(popupWithDefaults(popup ?? undefined, FIELDS, [FEATURE]), null);
  });

  it("shows the same fields and values on the map as in the preview", () => {
    const popup = popupWithDefaults(undefined, FIELDS, [FEATURE]) ?? undefined;
    assert.deepEqual(mapRows(popup), [
      ["_constraint_rating", "2"],
      ["_overlaps", "2"],
    ]);
    assert.deepEqual(previewRows(popup), mapRows(popup));
  });

  it("rounds a ticked-on measure to 2 decimals in both", () => {
    const base = popupWithDefaults(undefined, FIELDS, [FEATURE]) ?? {};
    const popup = {
      ...base,
      fields: [...(base.fields ?? []), ...defaultPopupFields(["SHAPE_Length"], [FEATURE])],
    };
    assert.deepEqual(mapRows(popup).at(-1), ["SHAPE_Length", "6481.65"]);
    assert.deepEqual(previewRows(popup), mapRows(popup));
  });

  it("keeps a project's own choices", () => {
    const saved = { fields: [{ field: "OBJECTID", label: "Object" }], showFeatureId: true };
    assert.equal(popupWithDefaults(saved, FIELDS, [FEATURE]), null);
    assert.deepEqual(mapRows(saved), [
      ["id", "20"],
      ["Object", "20"],
    ]);
  });

  it("keeps every field on a layer of only system fields, so the defaults settle", () => {
    const popup = popupWithDefaults(undefined, ["OBJECTID", "SHAPE_Area"], [FEATURE]);
    assert.equal(popup?.fields?.length, 2);
    assert.equal(
      popupWithDefaults(popup ?? undefined, ["OBJECTID", "SHAPE_Area"], [FEATURE]),
      null,
    );
  });

  it("sets a value type when a format is added to an Auto field", () => {
    assert.equal(kindForFormat(undefined, 12.5), "number");
    assert.equal(kindForFormat("auto", "Lot 4"), "text");
    assert.equal(kindForFormat("date", 0), "date");
  });
});
