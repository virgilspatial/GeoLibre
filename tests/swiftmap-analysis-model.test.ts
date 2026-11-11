import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Feature, FeatureCollection } from "geojson";
import type { TFunction } from "i18next";
import { createEmptyProject, parseProject, serializeProject } from "@geolibre/core";
import en from "../apps/geolibre-desktop/src/i18n/locales/en.json" with { type: "json" };
import { geojsonLayer } from "./helpers/layer-fixtures";
import {
  MAX_BYTES,
  analysisInputs,
  inputStatusOf,
  isPartialLoad,
  plainFields,
  polygonInputs,
  sizeCheck,
} from "../apps/geolibre-desktop/src/components/analysis/analysis-inputs";
import {
  clipOutputName,
  dissolveOutputName,
  intersectOutputName,
  isMeasuredField,
  toolFormStatus,
} from "../apps/geolibre-desktop/src/components/analysis/form-model";
import {
  ANALYSIS_TOOLS,
  readRecent,
  rememberRecent,
  searchTools,
} from "../apps/geolibre-desktop/src/components/analysis/analysis-tools";
import {
  autoOutputName,
  bufferFormStatus,
  parseDistance,
  matchOutputName,
} from "../apps/geolibre-desktop/src/components/analysis/buffer-form-model";
import { zoneFor } from "../apps/geolibre-desktop/src/components/analysis/engine/zone";
import {
  ANALYSIS_SOURCE_KIND,
  buildOrigin,
  originOf,
  resultMetadata,
} from "../apps/geolibre-desktop/src/components/analysis/origin";
import { layerPropertyRows } from "../apps/geolibre-desktop/src/components/panels/layer-panel/layer-properties";

// SWIFTMAP (Change 37): the Analysis panel's inputs, limits, form, Recent and
// origin record.

/** The English catalog, with plurals and {{interpolation}}. */
const t = ((key: string, options: Record<string, unknown> = {}) => {
  const lookup = (path: string) =>
    path
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
  const plural =
    typeof options.count === "number"
      ? lookup(`${key}_${options.count === 1 ? "one" : "other"}`)
      : undefined;
  const text = (plural ?? lookup(key) ?? key) as string;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name]));
}) as unknown as TFunction;

const points = (count: number, lon = 151, lat = -34): FeatureCollection => ({
  type: "FeatureCollection",
  features: Array.from({ length: count }, (_, index): Feature => ({
    type: "Feature",
    properties: { index },
    geometry: { type: "Point", coordinates: [lon + index * 1e-5, lat] },
  })),
});

describe("analysis inputs", () => {
  it("accepts loaded features, refuses tiles, and skips other layers", () => {
    const loaded = geojsonLayer({ id: "a", geojson: points(3) });
    const tiles = geojsonLayer({ id: "b", type: "vector-tiles", geojson: undefined });
    const geolensTiles = geojsonLayer({
      id: "c",
      type: "xyz",
      geojson: undefined,
      metadata: { sourceKind: "geolens-vector-tiles" },
    });
    const raster = geojsonLayer({ id: "d", type: "raster", geojson: undefined });
    assert.equal(inputStatusOf(loaded), "ok");
    assert.equal(inputStatusOf(tiles), "tiles");
    assert.equal(inputStatusOf(geolensTiles), "tiles");
    assert.equal(inputStatusOf(raster), null);
    // Top of the Layers panel (end of the store's list) first.
    assert.deepEqual(
      analysisInputs([loaded, tiles, raster]).map((input) => input.layer.id),
      ["b", "a"],
    );
  });

  it("treats truncated and capped loads as partial", () => {
    const three = points(3);
    assert.equal(isPartialLoad(geojsonLayer({ geojson: three })), false);
    assert.equal(
      isPartialLoad(geojsonLayer({ geojson: three, metadata: { truncated: true } })),
      true,
    );
    assert.equal(
      isPartialLoad(geojsonLayer({ geojson: three, metadata: { numberMatched: 9 } })),
      true,
    );
    assert.equal(
      isPartialLoad(geojsonLayer({ geojson: three, metadata: { numberMatched: 3 } })),
      false,
    );
    assert.equal(
      isPartialLoad(geojsonLayer({ geojson: three, metadata: { geolensBbox: [0, 0, 1, 1] } })),
      true,
    );
    assert.equal(
      isPartialLoad(geojsonLayer({ geojson: three, metadata: { geolensFeatureLimit: 3 } })),
      true,
    );
    assert.equal(
      isPartialLoad(geojsonLayer({ geojson: three, metadata: { geolensFeatureLimit: 10 } })),
      false,
    );
    assert.equal(
      isPartialLoad(geojsonLayer({ geojson: three, source: { type: "geojson", maxFeatures: 3 } })),
      true,
    );
  });

  it("warns above 2,000 features and refuses above 10,000 or 25 MB", () => {
    assert.equal(sizeCheck([points(2000)]), "ok");
    assert.equal(sizeCheck([points(2001)]), "slow");
    assert.equal(sizeCheck([points(10_000)]), "slow");
    assert.equal(sizeCheck([points(10_001)]), "tooLarge");
    // Counted across all inputs.
    assert.equal(sizeCheck([points(6000), points(6000)]), "tooLarge");
    const heavy: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { note: "x".repeat(MAX_BYTES) },
          geometry: { type: "Point", coordinates: [151, -34] },
        },
      ],
    };
    assert.equal(sizeCheck([heavy]), "tooLarge");
  });
});

describe("Buffer form", () => {
  it("names the output after the input and distance, uniquely", () => {
    assert.equal(autoOutputName("Heritage items", "100", "m"), "Heritage items buffer 100 m");
    assert.equal(autoOutputName("Sites", " ", "km"), "Sites buffer 0 km");
  });

  it("lets the output name decide: new, replace an analysis result, or taken", () => {
    const result = (id: string, name: string) =>
      geojsonLayer({ id, name, metadata: { sourceKind: ANALYSIS_SOURCE_KIND } });
    const upload = geojsonLayer({ id: "up", name: "Sites" });
    const r1 = result("r1", "Sites buffer 100 m");
    const r2 = result("r2", "Sites buffer 100 m");
    assert.deepEqual(matchOutputName("Other", [upload, r1], "up"), { kind: "new" });
    // An analysis result of that name is replaced; the top one when several share it.
    assert.deepEqual(matchOutputName(" Sites buffer 100 m ", [upload, r1, r2], "up"), {
      kind: "replace",
      layer: r2,
    });
    // Never an upload, and never the input layer, even when it is a result.
    assert.deepEqual(matchOutputName("Sites", [upload], null), { kind: "taken" });
    assert.deepEqual(matchOutputName("Sites buffer 100 m", [r1], "r1"), { kind: "taken" });
    assert.deepEqual(
      matchOutputName(
        "Sites buffer 100 m",
        [r1, geojsonLayer({ name: "Sites buffer 100 m" })],
        "x",
      ),
      { kind: "taken" },
    );
  });

  it("matches names regardless of capitals and spaces at the ends", () => {
    const result = geojsonLayer({
      id: "r",
      name: "GeotechCollar - 1 buffer 100 m",
      metadata: { sourceKind: ANALYSIS_SOURCE_KIND },
    });
    const upload = geojsonLayer({ id: "up", name: "Boreholes" });
    assert.deepEqual(matchOutputName("  geotechcollar - 1 BUFFER 100 m ", [upload, result], "up"), {
      kind: "replace",
      layer: result,
    });
    assert.deepEqual(matchOutputName("BOREHOLES", [upload, result], null), { kind: "taken" });
    assert.deepEqual(matchOutputName("geotechcollar - 1 buffer 100 m", [result], "r"), {
      kind: "taken",
    });
  });

  it("reads only distances more than 0", () => {
    assert.equal(parseDistance("12.5"), 12.5);
    assert.equal(parseDistance("0"), null);
    assert.equal(parseDistance("-3"), null);
    assert.equal(parseDistance(""), null);
    assert.equal(parseDistance("abc"), null);
  });

  it("blocks Run for refused inputs, a bad distance or an empty name", () => {
    const ok = { layer: geojsonLayer({ geojson: points(3) }), status: "ok" as const };
    assert.equal(
      bufferFormStatus({ input: null, distance: "1", name: "x", layers: [] }).block,
      "noInput",
    );
    assert.equal(
      bufferFormStatus({ input: { ...ok, status: "tiles" }, distance: "1", name: "x", layers: [] })
        .block,
      "tiles",
    );
    assert.equal(
      bufferFormStatus({
        input: { ...ok, status: "partial" },
        distance: "1",
        name: "x",
        layers: [],
      }).block,
      "partial",
    );
    assert.equal(
      bufferFormStatus({ input: ok, distance: "0", name: "x", layers: [] }).block,
      "badDistance",
    );
    assert.equal(
      bufferFormStatus({ input: ok, distance: "5", name: " ", layers: [] }).block,
      "noName",
    );
    const good = bufferFormStatus({ input: ok, distance: "5", name: "x", layers: [] });
    assert.equal(good.block, null);
    assert.equal(good.size, "ok");
    assert.equal(good.zone?.zone.label, "MGA 56");
    assert.equal(good.zone?.warning, false);
    const big = { layer: geojsonLayer({ geojson: points(10_001) }), status: "ok" as const };
    assert.equal(
      bufferFormStatus({ input: big, distance: "5", name: "x", layers: [] }).block,
      "tooLarge",
    );
    assert.equal(
      bufferFormStatus({ input: ok, distance: "5", name: "Layer A", layers: [ok.layer] }).block,
      "nameTaken",
    );
    const earlier = geojsonLayer({
      id: "earlier",
      name: "x",
      metadata: { sourceKind: ANALYSIS_SOURCE_KIND },
    });
    const replacing = bufferFormStatus({ input: ok, distance: "5", name: "x", layers: [earlier] });
    assert.equal(replacing.block, null);
    assert.equal(replacing.name?.kind, "replace");
    const empty = { layer: geojsonLayer({ geojson: points(0) }), status: "ok" as const };
    assert.equal(
      bufferFormStatus({ input: empty, distance: "5", name: "x", layers: [] }).block,
      "noGeometry",
    );
  });
});

describe("analysis tools and Recent", () => {
  const nameOf = (id: string) => t(`swiftmapAnalysis.tools.${id}`);

  it("lists the six screening tools with Buffer, Clip, Intersect and Dissolve available", () => {
    assert.deepEqual(
      ANALYSIS_TOOLS.map((tool) => nameOf(tool.id)),
      ["Buffer", "Clip", "Intersect", "Constraint summary", "Area by zone", "Dissolve"],
    );
    assert.deepEqual(
      ANALYSIS_TOOLS.filter((tool) => tool.available).map((tool) => tool.id),
      ["buffer", "clip", "intersect", "dissolve"],
    );
  });

  it("searches by name, case-insensitively", () => {
    assert.deepEqual(
      searchTools("ZONE", nameOf).map((tool) => tool.id),
      ["areaByZone"],
    );
    assert.deepEqual(
      searchTools("s", nameOf).map((tool) => tool.id),
      ["intersect", "constraintSummary", "dissolve"],
    );
    assert.equal(searchTools("  ", nameOf).length, 6);
  });

  it("keeps the last three tools run, most recent first, ignoring unknown ids", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    let recent = readRecent(storage);
    assert.deepEqual(recent, []);
    for (const id of ["buffer", "clip", "intersect", "buffer", "dissolve"] as const) {
      recent = rememberRecent(id, recent, storage);
    }
    assert.deepEqual(recent, ["dissolve", "buffer", "intersect"]);
    assert.deepEqual(readRecent(storage), recent);
    store.set("swiftmap.analysis.recent", '["nope","clip"]');
    assert.deepEqual(readRecent(storage), ["clip"]);
    store.set("swiftmap.analysis.recent", "{broken");
    assert.deepEqual(readRecent(storage), []);
  });
});

describe("origin record and Properties", () => {
  const origin = buildOrigin({
    tool: "buffer",
    inputs: [{ layerId: "in", name: "Heritage items", featureCount: 12 }],
    settings: { distance: 100, unit: "m", dissolve: true, segments: 16 },
    zone: zoneFor(151, -34),
    zoneWarning: false,
    now: new Date("2026-11-09T10:30:00Z"),
  });

  const rows = (layer: ReturnType<typeof geojsonLayer>) =>
    layerPropertyRows(layer, t, "en-AU").map((row) => [row.label, row.value, row.note ?? false]);

  it("records the tool, input, settings, zone and time", () => {
    assert.deepEqual(origin, {
      version: 1,
      tool: "buffer",
      inputs: [{ layerId: "in", name: "Heritage items", featureCount: 12 }],
      settings: { distance: 100, unit: "m", dissolve: true, segments: 16 },
      crs: { epsg: 7856, name: "GDA2020 / MGA zone 56", label: "MGA 56" },
      zoneWarning: false,
      createdAt: "2026-11-09T10:30:00.000Z",
    });
  });

  it("shows the lineage rows in place of Source and Format", () => {
    const layer = geojsonLayer({ geojson: points(1), metadata: resultMetadata(origin) });
    const shown = rows(layer);
    assert.deepEqual(
      shown.map(([label]) => label),
      ["Created with", "Input", "Settings", "Created", "Features", "CRS", "Measured in"],
    );
    assert.deepEqual(shown[0], ["Created with", "Buffer", false]);
    assert.deepEqual(shown[1], ["Input", "Heritage items", false]);
    assert.deepEqual(shown[2], ["Settings", "100 m, dissolved", false]);
    assert.match(String(shown[3]![1]), /2026/);
    assert.deepEqual(shown[6], ["Measured in", "GDA2020 / MGA zone 56 (EPSG:7856)", false]);
  });

  it("says Origin not recorded when a result's record is missing or broken", () => {
    for (const metadata of [
      { sourceKind: ANALYSIS_SOURCE_KIND },
      { sourceKind: ANALYSIS_SOURCE_KIND, swiftmapOrigin: { version: 1, tool: "buffer" } },
      { sourceKind: ANALYSIS_SOURCE_KIND, swiftmapOrigin: { ...origin, createdAt: "never" } },
    ]) {
      const layer = geojsonLayer({ geojson: points(1), metadata });
      assert.equal(originOf(layer), null);
      assert.deepEqual(rows(layer), [
        ["", "Origin not recorded", true],
        ["Features", "1", false],
        ["CRS", "WGS 84 (EPSG:4326)", false],
      ]);
    }
  });

  it("is saved with the map and read back from the file", () => {
    const layer = geojsonLayer({
      id: "result",
      geojson: points(2),
      metadata: resultMetadata(origin),
    });
    const project = { ...createEmptyProject("Analysis"), layers: [layer] };
    const reopened = parseProject(serializeProject(project)).layers[0]!;
    assert.deepEqual(originOf(reopened), origin);
    assert.equal(reopened.geojson?.features.length, 2);
  });

  it("leaves other layers' Properties as they were", () => {
    const layer = geojsonLayer({ geojson: points(1) });
    assert.deepEqual(
      rows(layer).map(([label]) => label),
      ["Source", "Format", "Features", "CRS"],
    );
  });
});

// Change 43: the rules shared by Clip, Intersect and Dissolve.
describe("overlay forms (Change 43)", () => {
  const polygons = (count: number, lon = 151): FeatureCollection => ({
    type: "FeatureCollection",
    features: Array.from({ length: count }, (_, index): Feature => ({
      type: "Feature",
      properties: { index },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [lon + index * 0.01, -34],
            [lon + index * 0.01 + 0.005, -34],
            [lon + index * 0.01 + 0.005, -33.995],
            [lon + index * 0.01, -34],
          ],
        ],
      },
    })),
  });
  const ok = (layer: ReturnType<typeof geojsonLayer>) => ({ layer, status: "ok" as const });

  it("lists only layers with polygons where polygons are needed, plus tile layers", () => {
    const layers = [
      geojsonLayer({ id: "pts", geojson: points(2) }),
      geojsonLayer({ id: "polys", geojson: polygons(2) }),
      geojsonLayer({ id: "tiles", type: "vector-tiles", geojson: undefined }),
    ];
    assert.deepEqual(
      polygonInputs(layers).map((input) => input.layer.id),
      ["tiles", "polys"],
    );
  });

  it("counts the size limits across both inputs and finds the zone from both", () => {
    const a = geojsonLayer({ id: "a", geojson: points(1200) });
    const b = geojsonLayer({ id: "b", geojson: polygons(900, 149.5) });
    const status = toolFormStatus({
      inputs: [{ input: ok(a) }, { input: ok(b), polygonsOnly: true }],
      name: "Out",
      layers: [a, b],
      named: true,
    });
    assert.equal(status.size, "slow");
    assert.equal(status.block, null);
    // Points from 151°E, polygons from 149.5°E: the centre is in zone 56.
    assert.equal(status.zone?.zone.label, "MGA 56");

    const big = geojsonLayer({ id: "big", geojson: points(9_500) });
    assert.equal(
      toolFormStatus({ inputs: [{ input: ok(big) }, { input: ok(b) }], name: "Out", layers: [] })
        .block,
      "tooLarge",
    );
  });

  it("blocks the same layer twice, names refused layers, and treats every input's name as taken", () => {
    const a = geojsonLayer({ id: "a", name: "Sites", geojson: points(2) });
    const b = geojsonLayer({ id: "b", name: "Site boundary", geojson: polygons(1) });
    const same = toolFormStatus({
      inputs: [{ input: ok(b) }, { input: ok(b) }],
      name: "Out",
      layers: [a, b],
    });
    assert.equal(same.block, "sameLayer");

    const partial = toolFormStatus({
      inputs: [{ input: ok(a) }, { input: { layer: b, status: "partial" } }],
      name: "Out",
      layers: [a, b],
      named: true,
    });
    assert.deepEqual([partial.block, partial.blockLayer], ["partial", "Site boundary"]);

    for (const name of ["sites", " SITE BOUNDARY "]) {
      const status = toolFormStatus({
        inputs: [{ input: ok(a) }, { input: ok(b) }],
        name,
        layers: [a, b],
      });
      assert.equal(status.block, "nameTaken", name);
    }
  });

  it("reports polygon-only inputs that hold other shapes", () => {
    const mixed: FeatureCollection = {
      type: "FeatureCollection",
      features: [...polygons(1).features, ...points(1).features],
    };
    const a = geojsonLayer({ id: "a", name: "Sites", geojson: points(2) });
    const m = geojsonLayer({ id: "m", name: "Mixed", geojson: mixed });
    const status = toolFormStatus({
      inputs: [{ input: ok(a) }, { input: ok(m), polygonsOnly: true }],
      name: "Out",
      layers: [a, m],
    });
    assert.deepEqual(status.polygonsOnly, ["Mixed"]);
  });

  it("builds the default names", () => {
    assert.equal(clipOutputName("Heritage items", "Site boundary"), "Heritage items clipped to Site boundary");
    assert.equal(intersectOutputName("Lots", "Zones"), "Lots intersected with Zones");
    assert.equal(dissolveOutputName("Lots", null), "Lots dissolved");
    assert.equal(dissolveOutputName("Lots", "Zone"), "Lots dissolved by Zone");
  });

  it("lists Dissolve's fields: plain values only, measured fields left out", () => {
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { zone: "R2", lot: 1, tags: ["a"], "Area m² (MGA 56)": 5 }, geometry: { type: "Point", coordinates: [151, -34] } },
        { type: "Feature", properties: { zone: null, ok: true, meta: { a: 1 } }, geometry: { type: "Point", coordinates: [151, -34] } },
      ],
    };
    assert.deepEqual(plainFields(collection, isMeasuredField), ["zone", "lot", "ok"]);
  });

  it("shows each tool's Settings and both inputs in Properties", () => {
    const base = {
      zone: zoneFor(151, -34),
      zoneWarning: false,
      now: new Date("2026-11-11T10:30:00Z"),
    };
    const twoInputs = [
      { layerId: "in", name: "Heritage items", featureCount: 12, role: "input" as const },
      { layerId: "clip", name: "Site boundary", featureCount: 1, role: "clip" as const },
    ];
    const settingsOf = (origin: ReturnType<typeof buildOrigin>) => {
      const layer = geojsonLayer({ geojson: points(1), metadata: resultMetadata(origin) });
      return layerPropertyRows(layer, t, "en-AU")
        .filter((row) => ["Created with", "Inputs", "Input", "Settings"].includes(row.label))
        .map((row) => `${row.label}: ${row.value}`);
    };
    assert.deepEqual(settingsOf(buildOrigin({ ...base, tool: "clip", inputs: twoInputs, settings: {} })), [
      "Created with: Clip",
      "Inputs: Heritage items, Site boundary",
      "Settings: Clipped to Site boundary",
    ]);
    const overlayInputs = twoInputs.map((input, index) =>
      index === 1 ? { ...input, role: "overlay" as const, name: "Zones" } : input,
    );
    assert.deepEqual(
      settingsOf(buildOrigin({ ...base, tool: "intersect", inputs: overlayInputs, settings: {} })),
      ["Created with: Intersect", "Inputs: Heritage items, Zones", "Settings: Intersected with Zones"],
    );
    const lots = [{ layerId: "lots", name: "Lots", featureCount: 3 }];
    assert.deepEqual(
      settingsOf(buildOrigin({ ...base, tool: "dissolve", inputs: lots, settings: { field: "Zone" } })),
      ["Created with: Dissolve", "Input: Lots", "Settings: By Zone"],
    );
    assert.deepEqual(
      settingsOf(buildOrigin({ ...base, tool: "dissolve", inputs: lots, settings: { field: null } })),
      ["Created with: Dissolve", "Input: Lots", "Settings: All features merged"],
    );
  });
});

describe("1 mm retry in the origin record (Change 43)", () => {
  it("records the fallback and shows a Precision row after Measured in", () => {
    const origin = buildOrigin({
      tool: "clip",
      inputs: [
        { layerId: "in", name: "Lots", featureCount: 3, role: "input" },
        { layerId: "clip", name: "Site", featureCount: 1, role: "clip" },
      ],
      settings: {},
      zone: zoneFor(151, -34),
      zoneWarning: false,
      precisionFallback: "1 mm",
    });
    assert.equal(origin.precisionFallback, "1 mm");
    const layer = geojsonLayer({ geojson: points(1), metadata: resultMetadata(origin) });
    const rows = layerPropertyRows(layer, t, "en-AU").map((row) => [row.label, row.value]);
    assert.deepEqual(rows.slice(-2), [
      ["Measured in", "GDA2020 / MGA zone 56 (EPSG:7856)"],
      ["Precision", "Rounded to 1 mm to complete the overlay"],
    ]);
    const plain = buildOrigin({ ...origin, zone: zoneFor(151, -34), precisionFallback: undefined });
    assert.equal("precisionFallback" in plain, false);
  });
});
