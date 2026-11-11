import type { Feature, FeatureCollection, Geometry } from "geojson";
import { BoxIndex } from "./bbox-index";
import { AnalysisError, type ToolResult } from "./common";
import {
  boxOf,
  geometryOf,
  partsOf,
  positionsOf,
  type Box,
  type MultiPoly,
  type Parts,
} from "./geometry-parts";
import { areaFieldName, lengthFieldName, withMeasurement } from "./measure";
import { planarArea } from "./planar-area";
import { intersectPolygons, unionPolygons } from "./polygon-ops";
import { EDGE_TOLERANCE, PolygonEdges } from "./polygon-edges";
import { zoneProjection, type ZoneProjection } from "./project";
import { extentOf, zoneForExtent, zoneWarningFor, type AnalysisZone } from "./zone";

/**
 * SWIFTMAP (Change 43): Clip and Intersect. Both project every input into one
 * analysis zone (from the centre of all inputs together), overlay in metres,
 * and project the result back. The second layer must hold polygons; the input
 * can be points, lines or polygons. Pure, so they run in the worker and tests.
 */

/** Projected coordinates are rounded to this, in metres (a micrometre). */
const GRID = 1e-6;

interface ProjectedFeature {
  index: number;
  parts: Parts;
  box: Box;
  properties: Record<string, unknown>;
}

/** The features with a usable geometry, projected into the zone. */
function projectFeatures(collection: FeatureCollection, projection: ZoneProjection) {
  const projected: ProjectedFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature.geometry || feature.geometry.type === "GeometryCollection") return;
    const parts = partsOf(projection.toZone(feature.geometry), GRID);
    const box = parts ? grow(boxOf(positionsOf(parts))) : null;
    if (parts && box) projected.push({ index, parts, box, properties: feature.properties ?? {} });
  });
  return projected;
}

/** A box grown by the edge tolerance, so features that only touch still meet. */
function grow(box: Box | null): Box | null {
  const t = EDGE_TOLERANCE;
  return box && [box[0] - t, box[1] - t, box[2] + t, box[3] + t];
}

/** The zone for some inputs, from the centre of their combined extent. */
function zoneOf(collections: FeatureCollection[]) {
  const extent = extentOf(collections);
  if (!extent) throw new AnalysisError("noGeometry", "The input layers have no geometry.");
  const zone = zoneForExtent(extent);
  return { zone, zoneWarning: zoneWarningFor(extent, zone), projection: zoneProjection(zone) };
}

const noPolygons = () =>
  new AnalysisError("noPolygons", "The second layer has no polygons to overlay.");

/** The part of `feature` that lies in `polygons` (with `edges` built from them), or null. */
function overlayOne(
  feature: ProjectedFeature,
  polygons: MultiPoly,
  edges: () => PolygonEdges,
): Geometry | null {
  const { parts } = feature;
  switch (parts.shape) {
    case "polygon": {
      const result = intersectPolygons(parts.polygons, polygons, `Feature ${feature.index + 1}`);
      const geometry = geometryOf("polygon", result);
      return geometry && planarArea(geometry) > 0 ? geometry : null;
    }
    case "line":
      return geometryOf(
        "line",
        parts.lines.flatMap((line) => edges().cutLine(line)),
      );
    case "point":
      return geometryOf(
        "point",
        parts.points.filter((point) => edges().locate(point) !== "outside"),
      );
  }
}

function output(
  geometry: Geometry,
  properties: Record<string, unknown>,
  zone: AnalysisZone,
  projection: ZoneProjection,
): Feature {
  return {
    type: "Feature",
    properties: withMeasurement(geometry, properties, zone),
    geometry: projection.fromZone(geometry),
  };
}

/** Lazily built edges, so polygon-only runs never build them. */
function lazy<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

/**
 * Clip: the parts of the input's features inside the clip layer's polygons.
 * The clip polygons are merged first, so each input feature appears at most
 * once. The input's attributes are kept; the clip layer's are not.
 */
export function runClip(input: FeatureCollection, clip: FeatureCollection): ToolResult {
  const { zone, zoneWarning, projection } = zoneOf([input, clip]);
  const clipPolygons = projectFeatures(clip, projection).flatMap((f) => f.parts.polygons);
  if (clipPolygons.length === 0) throw noPolygons();
  const mask = unionPolygons(clipPolygons, "The clip layer");
  // The merged polygons are separate, so each feature needs only those its box meets.
  const maskIndex = new BoxIndex(mask.map((polygon) => ({ box: boxOf(polygon[0]!)!, value: polygon })));
  const edges = lazy(() => new PolygonEdges(mask));
  const features: Feature[] = [];
  for (const feature of projectFeatures(input, projection)) {
    const near = maskIndex.search(feature.box);
    if (near.length === 0) continue;
    const geometry = overlayOne(feature, near, edges);
    if (geometry) features.push(output(geometry, feature.properties, zone, projection));
  }
  return { collection: { type: "FeatureCollection", features }, zone, zoneWarning };
}

/** All the field names in a collection, in the order first seen. */
function fieldNames(collection: FeatureCollection): string[] {
  const names = new Set<string>();
  for (const feature of collection.features) {
    for (const key of Object.keys(feature.properties ?? {})) names.add(key);
  }
  return [...names];
}

/**
 * The output name of each of the second layer's fields. A name the input
 * already uses gets "_1" ("Name" and "Name_1", as in ArcGIS), or the next free
 * number. `skip` (the measured fields) is dropped, as it is measured again.
 */
export function overlayFieldNames(
  inputFields: string[],
  overlayFields: string[],
  skip: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const taken = new Set(inputFields);
  const names = new Map<string, string>();
  const clashing: string[] = [];
  for (const field of overlayFields) {
    if (skip.has(field)) continue;
    if (taken.has(field)) clashing.push(field);
    else {
      names.set(field, field);
      taken.add(field);
    }
  }
  for (const field of clashing) {
    let n = 1;
    while (taken.has(`${field}_${n}`)) n += 1;
    names.set(field, `${field}_${n}`);
    taken.add(`${field}_${n}`);
  }
  return names;
}

/**
 * Intersect: one feature for each place an input feature overlaps a polygon
 * of the overlay layer, carrying the attributes of both. Overlay polygons are
 * kept apart (they say which area a piece is in).
 */
export function runIntersect(input: FeatureCollection, overlay: FeatureCollection): ToolResult {
  const { zone, zoneWarning, projection } = zoneOf([input, overlay]);
  const areas = projectFeatures(overlay, projection)
    .filter((feature) => feature.parts.shape === "polygon")
    .map((feature) => ({
      ...feature,
      edges: lazy(() => new PolygonEdges(feature.parts.polygons)),
    }));
  if (areas.length === 0) throw noPolygons();
  const index = new BoxIndex(areas.map((area) => ({ box: area.box, value: area })));
  const measured = new Set([areaFieldName(zone), lengthFieldName(zone)]);
  const renames = overlayFieldNames(fieldNames(input), fieldNames(overlay), measured);

  const features: Feature[] = [];
  for (const feature of projectFeatures(input, projection)) {
    const near = index.search(feature.box).sort((a, b) => a.index - b.index);
    for (const area of near) {
      const geometry = overlayOne(feature, area.parts.polygons, area.edges);
      if (!geometry) continue;
      const properties: Record<string, unknown> = { ...feature.properties };
      for (const [key, value] of Object.entries(area.properties)) {
        const name = renames.get(key);
        if (name) properties[name] = value;
      }
      features.push(output(geometry, properties, zone, projection));
    }
  }
  return { collection: { type: "FeatureCollection", features }, zone, zoneWarning };
}

export interface DissolveSettings {
  /** The field to dissolve by, or null to merge everything into one feature. */
  field: string | null;
}

/**
 * Dissolve: polygons merged into one feature, or one per value of a field.
 * With a field, only that field is kept; without one, no attributes. Features
 * with no value for the field form their own group. Separate polygons of a
 * group become one MultiPolygon.
 */
export function runDissolve(input: FeatureCollection, settings: DissolveSettings): ToolResult {
  const { zone, zoneWarning, projection } = zoneOf([input]);
  const groups = new Map<string, { value: unknown; polygons: MultiPoly }>();
  for (const feature of projectFeatures(input, projection)) {
    if (feature.parts.shape !== "polygon") continue;
    const value = settings.field === null ? null : (feature.properties[settings.field] ?? null);
    const key = settings.field === null ? "" : JSON.stringify(value);
    const group = groups.get(key) ?? { value, polygons: [] };
    group.polygons.push(...feature.parts.polygons);
    groups.set(key, group);
  }
  if (groups.size === 0) {
    throw new AnalysisError("noPolygons", "The input layer has no polygons to dissolve.");
  }
  const features: Feature[] = [];
  for (const { value, polygons } of groups.values()) {
    const geometry = geometryOf("polygon", unionPolygons(polygons, "The input layer"));
    if (!geometry) continue;
    const properties = settings.field === null ? {} : { [settings.field]: value };
    features.push(output(geometry, properties, zone, projection));
  }
  return { collection: { type: "FeatureCollection", features }, zone, zoneWarning };
}
