import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Feature, FeatureCollection, Geometry, Polygon, Position } from "geojson";
import {
  AnalysisError,
  BUFFER_QUADRANT_SEGMENTS,
  areaFieldName,
  runBuffer,
} from "../apps/geolibre-desktop/src/components/analysis/engine/buffer";
import { planarArea } from "../apps/geolibre-desktop/src/components/analysis/engine/planar-area";
import { zoneProjection } from "../apps/geolibre-desktop/src/components/analysis/engine/project";
import {
  degreesOutsideZone,
  extentOf,
  zoneFor,
  zoneForExtent,
  zoneWarningFor,
} from "../apps/geolibre-desktop/src/components/analysis/engine/zone";

// SWIFTMAP (Change 37): the analysis engine. Known answers, not QGIS baselines
// (those come later): a 16-segment buffer is a polygon of 64 sides with its
// corners on the circle, so the exact answer for a point is that polygon's
// area, (n/2)·r²·sin(2π/n), 0.16% under πr².

const SIDES = 4 * BUFFER_QUADRANT_SEGMENTS;
const polygonCircleArea = (r: number) => (SIDES / 2) * r * r * Math.sin((2 * Math.PI) / SIDES);
/** The approved per-feature area tolerance. */
const AREA_TOLERANCE = 0.0001;

const collection = (...geometries: (Geometry | null)[]): FeatureCollection => ({
  type: "FeatureCollection",
  features: geometries.map((geometry, index): Feature => ({
    type: "Feature",
    properties: { id: index },
    // Features without geometry are valid GeoJSON, and the tools skip them.
    geometry: geometry as Geometry,
  })),
});

const assertRelative = (actual: number, expected: number, tolerance: number, what: string) => {
  const error = Math.abs(actual - expected) / expected;
  assert.ok(
    error <= tolerance,
    `${what}: ${actual} vs ${expected}, off by ${(error * 100).toFixed(4)}% (limit ${tolerance * 100}%)`,
  );
};

/** The area of a result feature, measured again in its zone. */
const measured = (feature: Feature, zone: ReturnType<typeof zoneFor>) =>
  planarArea(zoneProjection(zone).toZone(feature.geometry!));

describe("analysis zone", () => {
  const cases: [string, number, number, number, string, number][] = [
    ["Sydney", 151.21, -33.87, 56, "MGA 56", 7856],
    ["Brisbane", 153.03, -27.47, 56, "MGA 56", 7856],
    ["Hobart", 147.33, -42.88, 55, "MGA 55", 7855],
    ["Darwin", 130.84, -12.46, 52, "MGA 52", 7852],
    ["Broome", 122.24, -17.96, 51, "MGA 51", 7851],
    ["Perth", 115.86, -31.95, 50, "MGA 50", 7850],
    ["London", -0.13, 51.51, 30, "UTM 30N", 32630],
    ["Auckland", 174.76, -36.85, 60, "UTM 60S", 32760],
    ["Jakarta (zone 48, not MGA)", 106.85, -6.21, 48, "UTM 48S", 32748],
    ["Port Moresby (zone 55, north of 8°S)", 147.18, -6.31, 55, "UTM 55S", 32755],
  ];
  for (const [place, lon, lat, zone, label, epsg] of cases) {
    it(`${place} measures in ${label}`, () => {
      const chosen = zoneFor(lon, lat);
      assert.equal(chosen.zone, zone);
      assert.equal(chosen.label, label);
      assert.equal(chosen.epsg, epsg);
    });
  }

  it("names the MGA CRS in full", () => {
    assert.equal(zoneFor(151, -34).name, "GDA2020 / MGA zone 56");
    assert.equal(zoneFor(-0.13, 51.5).name, "WGS 84 / UTM zone 30N");
  });

  it("picks the zone from the centre of the combined extent", () => {
    const extent = extentOf([
      collection({ type: "Point", coordinates: [149.5, -35] }),
      collection({ type: "Point", coordinates: [152.5, -33] }),
    ]);
    assert.deepEqual(extent, [149.5, -35, 152.5, -33]);
    assert.equal(zoneForExtent(extent!).zone, 56);
  });

  it("warns only beyond 1° outside the zone", () => {
    const zone = zoneFor(151, -34); // 150°E to 156°E
    assert.equal(degreesOutsideZone([150.5, -34, 155, -33], zone), 0);
    assert.equal(zoneWarningFor([149.5, -34, 152, -33], zone), false);
    assert.equal(zoneWarningFor([148.9, -34, 152.6, -33], zone), true);
    assert.equal(zoneWarningFor([151, -34, 157.2, -33], zone), true);
  });

  it("has no extent for features without coordinates", () => {
    assert.equal(extentOf([collection(null)]), null);
  });

  it("projects to MGA: the central meridian is easting 500,000", () => {
    const zone = zoneFor(153, -30);
    const point = zoneProjection(zone).toZone({ type: "Point", coordinates: [153, -30] });
    const [easting, northing] = (point as { coordinates: Position }).coordinates;
    assert.ok(Math.abs(easting! - 500_000) < 1e-6);
    // About 3,320 km south of the equator, from a false northing of 10,000 km.
    assert.ok(northing! > 6_670_000 && northing! < 6_690_000, String(northing));
  });
});

describe("planarArea", () => {
  it("subtracts holes", () => {
    const square: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
          [2, 2],
        ],
      ],
    };
    assert.equal(planarArea(square), 96);
    assert.equal(
      planarArea({ type: "MultiPolygon", coordinates: [square.coordinates, square.coordinates] }),
      192,
    );
    assert.equal(
      planarArea({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
      0,
    );
  });
});

describe("runBuffer accuracy", () => {
  it("buffers a point near Sydney to the 64-gon's area, 0.16% under πr²", () => {
    const r = 1000;
    const result = runBuffer(collection({ type: "Point", coordinates: [151.21, -33.87] }), {
      distance: 1,
      unit: "km",
      dissolve: false,
    });
    assert.equal(result.zone.label, "MGA 56");
    assert.equal(result.zoneWarning, false);
    const [feature] = result.collection.features;
    assertRelative(measured(feature!, result.zone), polygonCircleArea(r), AREA_TOLERANCE, "area");
    const field = feature!.properties![areaFieldName(result.zone)] as number;
    assert.equal(areaFieldName(result.zone), "Area m² (MGA 56)");
    assertRelative(field, polygonCircleArea(r), AREA_TOLERANCE, "area field");
    const underCircle = 1 - field / (Math.PI * r * r);
    assert.ok(underCircle > 0.0015 && underCircle < 0.0017, `under πr² by ${underCircle}`);
  });

  it("puts every boundary vertex at the distance, within 0.05 m", () => {
    const centre: Position = [115.86, -31.95];
    const result = runBuffer(collection({ type: "Point", coordinates: centre }), {
      distance: 250,
      unit: "m",
      dissolve: false,
    });
    assert.equal(result.zone.label, "MGA 50");
    const projection = zoneProjection(result.zone);
    const [cx, cy] = (
      projection.toZone({ type: "Point", coordinates: centre }) as {
        coordinates: Position;
      }
    ).coordinates;
    const ring = (projection.toZone(result.collection.features[0]!.geometry!) as Polygon)
      .coordinates[0]!;
    assert.equal(ring.length, SIDES + 1);
    for (const [x, y] of ring) {
      assert.ok(Math.abs(Math.hypot(x! - cx!, y! - cy!) - 250) < 0.05);
    }
  });

  it("buffers a line to 2dL plus the two rounded ends", () => {
    // A 2 km east-west line in MGA 56, built in metres and taken back to degrees.
    const zone = zoneFor(151, -34);
    const projection = zoneProjection(zone);
    const line = projection.fromZone({
      type: "LineString",
      coordinates: [
        [330_000, 6_250_000],
        [332_000, 6_250_000],
      ],
    });
    const d = 100;
    const result = runBuffer(collection(line), { distance: d, unit: "m", dissolve: false });
    const expected = 2 * d * 2000 + polygonCircleArea(d);
    assertRelative(
      measured(result.collection.features[0]!, zone),
      expected,
      AREA_TOLERANCE,
      "line",
    );
  });

  it("buffers a polygon to s² + 4sd plus the four rounded corners", () => {
    const zone = zoneFor(151, -34);
    const projection = zoneProjection(zone);
    const s = 500;
    const square = projection.fromZone({
      type: "Polygon",
      coordinates: [
        [
          [330_000, 6_250_000],
          [330_000 + s, 6_250_000],
          [330_000 + s, 6_250_000 + s],
          [330_000, 6_250_000 + s],
          [330_000, 6_250_000],
        ],
      ],
    });
    const d = 50;
    const result = runBuffer(collection(square), { distance: d, unit: "m", dissolve: false });
    const expected = s * s + 4 * s * d + polygonCircleArea(d);
    assertRelative(
      measured(result.collection.features[0]!, zone),
      expected,
      AREA_TOLERANCE,
      "polygon",
    );
  });

  it("keeps attributes and one feature per input, skipping features without geometry", () => {
    const input = collection({ type: "Point", coordinates: [151, -34] }, null, {
      type: "Point",
      coordinates: [151.1, -34],
    });
    const result = runBuffer(input, { distance: 100, unit: "m", dissolve: false });
    assert.deepEqual(
      result.collection.features.map((feature) => feature.properties!.id),
      [0, 2],
    );
  });

  it("dissolves overlapping buffers into one feature and leaves separate ones whole", () => {
    const zone = zoneFor(151, -34);
    const projection = zoneProjection(zone);
    const point = (x: number) =>
      projection.fromZone({ type: "Point", coordinates: [330_000 + x, 6_250_000] });
    const r = 1000;
    const overlapping = runBuffer(collection(point(0), point(1500)), {
      distance: r,
      unit: "m",
      dissolve: true,
    });
    assert.equal(overlapping.collection.features.length, 1);
    assert.deepEqual(overlapping.collection.features[0]!.properties, {
      [areaFieldName(zone)]: overlapping.collection.features[0]!.properties![areaFieldName(zone)],
    });
    // Two circles of radius r, c = 1.5r apart, overlap by a lens of
    // 2r²·acos(c/2r) − (c/2)·√(4r² − c²).
    const c = 1.5 * r;
    const lens = 2 * r * r * Math.acos(c / (2 * r)) - (c / 2) * Math.sqrt(4 * r * r - c * c);
    const circles = 2 * Math.PI * r * r - lens;
    // The polygon approximation sits up to 0.16% under the true circles.
    assertRelative(
      measured(overlapping.collection.features[0]!, zone),
      circles,
      0.002,
      "dissolved",
    );

    const apart = runBuffer(collection(point(0), point(10_000)), {
      distance: r,
      unit: "m",
      dissolve: true,
    });
    assert.equal(apart.collection.features.length, 1);
    assertRelative(
      measured(apart.collection.features[0]!, zone),
      2 * polygonCircleArea(r),
      AREA_TOLERANCE,
      "two apart",
    );
  });

  it("reports the zone warning for data reaching more than 1° outside", () => {
    const result = runBuffer(
      collection(
        { type: "Point", coordinates: [148.5, -34] },
        { type: "Point", coordinates: [153.5, -34] },
      ),
      { distance: 100, unit: "m", dissolve: false },
    );
    assert.equal(result.zone.label, "MGA 56");
    assert.equal(result.zoneWarning, true);
  });

  it("refuses a distance of 0 or less, and input with no geometry", () => {
    const point = collection({ type: "Point", coordinates: [151, -34] });
    assert.throws(
      () => runBuffer(point, { distance: 0, unit: "m", dissolve: false }),
      (error: unknown) => error instanceof AnalysisError && error.code === "badDistance",
    );
    assert.throws(
      () => runBuffer(collection(null), { distance: 10, unit: "m", dissolve: false }),
      (error: unknown) => error instanceof AnalysisError && error.code === "noGeometry",
    );
  });
});
