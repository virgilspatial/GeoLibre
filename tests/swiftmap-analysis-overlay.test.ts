import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { BoxIndex } from "../apps/geolibre-desktop/src/components/analysis/engine/bbox-index";
import { AnalysisError } from "../apps/geolibre-desktop/src/components/analysis/engine/common";
import type {
  Box,
  MultiPoly,
} from "../apps/geolibre-desktop/src/components/analysis/engine/geometry-parts";
import { planarLength } from "../apps/geolibre-desktop/src/components/analysis/engine/measure";
import {
  overlayFieldNames,
  runClip,
  runDissolve,
  runIntersect,
} from "../apps/geolibre-desktop/src/components/analysis/engine/overlay";
import { planarArea } from "../apps/geolibre-desktop/src/components/analysis/engine/planar-area";
import {
  precisionFallbackUsed,
  resetPrecisionFallback,
  withRetry,
} from "../apps/geolibre-desktop/src/components/analysis/engine/polygon-ops";
import { runTool } from "../apps/geolibre-desktop/src/components/analysis/engine/run-tool";
import { zoneProjection } from "../apps/geolibre-desktop/src/components/analysis/engine/project";
import { zoneFor } from "../apps/geolibre-desktop/src/components/analysis/engine/zone";

// SWIFTMAP (Change 43): Clip, Intersect and Dissolve against known answers.
// Shapes are drawn in MGA 56 metres and stored as longitude/latitude, as a
// layer would be; the tools must pick MGA 56 and measure them exactly.

const MGA56 = zoneFor(153, -34);
const toLonLat = zoneProjection(MGA56).fromZone;
const toMetres = zoneProjection(MGA56).toZone;
const E = 500_000;
const N = 6_240_000;

const feature = (geometry: Geometry, properties: Record<string, unknown> = {}): Feature => ({
  type: "Feature",
  properties,
  geometry: toLonLat(geometry),
});
const collection = (...features: Feature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});
/** A square ring, `size` metres a side, from its south-west corner (metres from E, N). */
const ring = (x: number, y: number, size: number): Position[] => [
  [E + x, N + y],
  [E + x + size, N + y],
  [E + x + size, N + y + size],
  [E + x, N + y + size],
  [E + x, N + y],
];
const square = (x: number, y: number, size: number, properties = {}) =>
  feature({ type: "Polygon", coordinates: [ring(x, y, size)] }, properties);
const line = (properties: Record<string, unknown>, ...points: [number, number][]) =>
  feature(
    { type: "LineString", coordinates: points.map(([x, y]) => [E + x, N + y]) },
    properties,
  );
const point = (x: number, y: number, properties = {}) =>
  feature({ type: "Point", coordinates: [E + x, N + y] }, properties);

const AREA = "Area m² (MGA 56)";
const LENGTH = "Length m (MGA 56)";
const areaOf = (f: Feature) => planarArea(toMetres(f.geometry));
const lengthOf = (f: Feature) => planarLength(toMetres(f.geometry));
const within = (actual: number, expected: number, fraction = 1e-4) =>
  assert.ok(
    Math.abs(actual - expected) <= Math.abs(expected) * fraction,
    `${actual} should be within ${fraction * 100}% of ${expected}`,
  );

describe("Clip", () => {
  it("clips a square by a square: area exact, input attributes only", () => {
    const result = runClip(
      collection(square(0, 0, 1000, { name: "Site A" })),
      collection(square(500, 500, 1000, { zone: "R2" })),
    );
    assert.equal(result.zone.label, "MGA 56");
    assert.equal(result.collection.features.length, 1);
    const [clipped] = result.collection.features;
    within(areaOf(clipped!), 250_000);
    within(clipped!.properties![AREA] as number, 250_000);
    assert.equal(clipped!.properties!.name, "Site A");
    assert.equal("zone" in clipped!.properties!, false);
  });

  it("clips lines exactly at the edges, joining pieces and splitting where they leave", () => {
    const result = runClip(
      collection(
        line({ id: "across" }, [-500, 500], [1500, 500]),
        line({ id: "diagonal" }, [-100, -100], [1100, 1100]),
        // In, out through the top, and back in: two pieces.
        line({ id: "u" }, [200, 500], [200, 1500], [800, 1500], [800, 500]),
        // A bend inside stays one piece.
        line({ id: "bend" }, [100, 100], [500, 900], [900, 100]),
        line({ id: "outside" }, [2000, 0], [3000, 0]),
      ),
      collection(square(0, 0, 1000)),
    );
    const byId = new Map(result.collection.features.map((f) => [f.properties!.id, f]));
    assert.equal(byId.has("outside"), false);
    within(lengthOf(byId.get("across")!), 1000);
    within(byId.get("across")!.properties![LENGTH] as number, 1000);
    within(lengthOf(byId.get("diagonal")!), 1000 * Math.SQRT2);
    const u = byId.get("u")!;
    assert.equal(u.geometry.type, "MultiLineString");
    within(lengthOf(u), 1000);
    const bend = byId.get("bend")!;
    assert.equal(bend.geometry.type, "LineString");
    within(lengthOf(bend), 2 * Math.hypot(400, 800));
  });

  it("keeps points inside and on the edge, drops those outside, measures nothing", () => {
    const result = runClip(
      collection(
        point(500, 500, { id: "inside" }),
        point(1000, 500, { id: "edge" }),
        point(0, 0, { id: "corner" }),
        point(1000.01, 500, { id: "just outside" }),
        point(-300, 200, { id: "outside" }),
      ),
      collection(square(0, 0, 1000)),
    );
    const ids = result.collection.features.map((f) => f.properties!.id);
    assert.deepEqual(ids, ["inside", "edge", "corner"]);
    assert.equal(Object.keys(result.collection.features[0]!.properties!).length, 1);
  });

  it("keeps a line running along the clip edge", () => {
    const result = runClip(
      collection(line({ id: "edge" }, [200, 0], [800, 0])),
      collection(square(0, 0, 1000)),
    );
    within(lengthOf(result.collection.features[0]!), 600);
  });

  it("merges the clip layer first, so a feature over two clip polygons appears once", () => {
    const result = runClip(
      collection(square(500, 0, 1000, { id: "spans" })),
      collection(square(0, 0, 1000), square(1000, 0, 1000)),
    );
    assert.equal(result.collection.features.length, 1);
    within(areaOf(result.collection.features[0]!), 1_000_000);
  });

  it("respects holes, for polygons and lines", () => {
    const holed = feature({ type: "Polygon", coordinates: [ring(0, 0, 1000), ring(250, 250, 500)] });
    const result = runClip(
      collection(square(-100, -100, 1200, { id: "cover" }), line({ id: "line" }, [-100, 500], [1100, 500])),
      collection(holed),
    );
    const [cover, cut] = result.collection.features;
    within(areaOf(cover!), 1_000_000 - 250_000);
    assert.equal(cut!.geometry.type, "MultiLineString");
    within(lengthOf(cut!), 500);
  });

  it("picks the zone from the centre of both layers together", () => {
    // Input in zone 55 (west of 150°E), clip layer in zone 56: centre 150.5°E.
    const lonLatSquare = (west: number): Feature => ({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[[west, -34], [west + 0.1, -34], [west + 0.1, -33.9], [west, -33.9], [west, -34]]],
      },
    });
    const result = runClip(collection(lonLatSquare(149.4)), collection(lonLatSquare(151.5)));
    assert.equal(result.zone.label, "MGA 56");
    assert.equal(result.collection.features.length, 0);
  });

  it("refuses a clip layer without polygons", () => {
    assert.throws(
      () => runClip(collection(square(0, 0, 10)), collection(point(0, 0))),
      (error: unknown) => error instanceof AnalysisError && error.code === "noPolygons",
    );
  });
});

describe("Intersect", () => {
  it("gives one piece per overlap, with both layers' attributes and clashing names suffixed", () => {
    const result = runIntersect(
      collection(square(500, 0, 1000, { name: "Lot 1", name_1: "kept", area: 5 })),
      collection(
        square(0, 0, 1000, { name: "Zone A", code: "R2" }),
        square(1000, 0, 1000, { name: "Zone B", code: "B4" }),
        square(5000, 0, 1000, { name: "Far away", code: "E1" }),
      ),
    );
    assert.equal(result.collection.features.length, 2);
    const [a, b] = result.collection.features;
    within(areaOf(a!), 500_000);
    within(areaOf(b!), 500_000);
    assert.deepEqual(
      { ...a!.properties, [AREA]: undefined },
      { name: "Lot 1", name_1: "kept", area: 5, name_2: "Zone A", code: "R2", [AREA]: undefined },
    );
    assert.equal(b!.properties!.name_2, "Zone B");
    assert.equal(b!.properties!.code, "B4");
  });

  it("names clashing fields _1, then the next free number, and drops measured fields", () => {
    const names = overlayFieldNames(
      ["Name", "Name_1", "Type", AREA],
      ["Name", "Type", "Type_1", "Other", AREA],
      new Set([AREA]),
    );
    assert.deepEqual(Object.fromEntries(names), {
      Name: "Name_2",
      Type: "Type_2",
      Type_1: "Type_1",
      Other: "Other",
    });
  });

  it("intersects lines and points with each polygon they meet", () => {
    const result = runIntersect(
      collection(line({ id: "l" }, [0, 500], [2000, 500]), point(1000, 500, { id: "p" })),
      collection(square(0, 0, 1000, { zone: "A" }), square(1000, 0, 1000, { zone: "B" })),
    );
    const rows = result.collection.features.map((f) => `${f.properties!.id}:${f.properties!.zone}`);
    // The point sits on the shared edge, so it falls in both.
    assert.deepEqual(rows, ["l:A", "l:B", "p:A", "p:B"]);
    within(lengthOf(result.collection.features[0]!), 1000);
    within(result.collection.features[1]!.properties![LENGTH] as number, 1000);
  });

  it("drops polygons that only touch", () => {
    const result = runIntersect(
      collection(square(0, 0, 1000)),
      collection(square(1000, 0, 1000)),
    );
    assert.equal(result.collection.features.length, 0);
  });
});

describe("Dissolve", () => {
  it("merges everything into one feature with no attributes", () => {
    const touching = runDissolve(
      collection(square(0, 0, 1000, { a: 1 }), square(1000, 0, 1000, { a: 2 })),
      { field: null },
    );
    assert.equal(touching.collection.features.length, 1);
    const [one] = touching.collection.features;
    assert.equal(one!.geometry.type, "Polygon");
    within(areaOf(one!), 2_000_000);
    assert.deepEqual(Object.keys(one!.properties!), [AREA]);

    const separate = runDissolve(
      collection(square(0, 0, 1000), square(3000, 0, 500)),
      { field: null },
    );
    assert.equal(separate.collection.features[0]!.geometry.type, "MultiPolygon");
    within(areaOf(separate.collection.features[0]!), 1_250_000);
  });

  it("dissolves by a field, keeping only it, with no-value features as their own group", () => {
    const result = runDissolve(
      collection(
        square(0, 0, 1000, { zone: "A", other: 1 }),
        square(1000, 0, 1000, { zone: "A", other: 2 }),
        square(5000, 0, 1000, { zone: "A" }),
        square(0, 2000, 1000, { zone: "B" }),
        square(3000, 3000, 1000, {}),
        square(3000, 5000, 1000, { zone: null }),
      ),
      { field: "zone" },
    );
    const groups = result.collection.features.map((f) => ({
      zone: f.properties!.zone,
      type: f.geometry.type,
      keys: Object.keys(f.properties!).sort(),
      area: Math.round(areaOf(f)),
    }));
    assert.deepEqual(groups, [
      { zone: "A", type: "MultiPolygon", keys: [AREA, "zone"], area: 3_000_000 },
      { zone: "B", type: "Polygon", keys: [AREA, "zone"], area: 1_000_000 },
      { zone: null, type: "MultiPolygon", keys: [AREA, "zone"], area: 2_000_000 },
    ]);
    within(result.collection.features[0]!.properties![AREA] as number, 3_000_000);
  });

  it("ignores lines and points, and refuses a layer without polygons", () => {
    const result = runDissolve(
      collection(square(0, 0, 1000), line({}, [0, 0], [10, 10]), point(5, 5)),
      { field: null },
    );
    assert.equal(result.collection.features.length, 1);
    assert.throws(
      () => runDissolve(collection(point(0, 0)), { field: null }),
      (error: unknown) => error instanceof AnalysisError && error.code === "noPolygons",
    );
  });
});

describe("BoxIndex", () => {
  it("finds exactly the boxes a brute-force search finds", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 1000;
    const boxes: Box[] = Array.from({ length: 2000 }, () => {
      const x = random();
      const y = random();
      return [x, y, x + random() / 20, y + random() / 20];
    });
    const index = new BoxIndex(boxes.map((box, value) => ({ box, value })));
    for (let i = 0; i < 50; i += 1) {
      const x = random();
      const y = random();
      const query: Box = [x, y, x + 60, y + 60];
      const expected = boxes
        .map((box, value) => ({ box, value }))
        .filter(({ box }) => box[0] <= query[2] && query[0] <= box[2] && box[1] <= query[3] && query[1] <= box[3])
        .map(({ value }) => value);
      assert.deepEqual(index.search(query).sort((a, b) => a - b), expected);
    }
    assert.deepEqual(new BoxIndex<number>([]).search([0, 0, 1, 1]), []);
  });
});

describe("1 mm retry", () => {
  const onMillimetres = (value: number) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;
  const polygons: MultiPoly[] = [[[[[E + 0.0004, N], [E + 1, N], [E + 1, N + 1], [E + 0.0004, N]]]]];

  it("retries once at 1 mm when an overlay fails, and flags it", () => {
    resetPrecisionFallback();
    let calls = 0;
    const result = withRetry("Test", polygons, (set) => {
      calls += 1;
      const ok = set!.flat(3).every(onMillimetres);
      if (!ok) throw new Error("Unable to complete output ring");
      return set!;
    });
    assert.equal(calls, 2);
    assert.equal(precisionFallbackUsed(), true);
    assert.equal(result[0]![0]![0]![0], E);
  });

  it("reports the failure when the retry fails too, and doesn't flag a first-time success", () => {
    resetPrecisionFallback();
    withRetry("Test", polygons, (set) => set!);
    assert.equal(precisionFallbackUsed(), false);
    assert.throws(
      () =>
        withRetry("The clip layer", polygons, () => {
          throw new Error("ring");
        }),
      (error: unknown) =>
        error instanceof AnalysisError &&
        error.code === "badGeometry" &&
        error.message === "The clip layer couldn't be processed: ring",
    );
  });

  it("leaves results of ordinary runs unflagged", () => {
    const result = runTool({
      tool: "clip",
      input: collection(square(0, 0, 1000)),
      clip: collection(square(500, 500, 1000)),
    });
    assert.equal(result.precisionFallback, undefined);
  });
});
