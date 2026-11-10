/// <reference path="./jsts.d.ts" />
import jsts from "@turf/jsts";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { planarArea } from "./planar-area";
import { zoneProjection } from "./project";
import { extentOf, zoneForExtent, zoneWarningFor, type AnalysisZone } from "./zone";

/**
 * SWIFTMAP (Change 37): the Buffer tool. Projects the input into one analysis
 * zone, buffers with JSTS `BufferOp` (Turf's `buffer()` expects degrees and
 * applies its own projection), and projects the result back to
 * longitude/latitude. Pure, so it runs in the analysis worker and in tests.
 */

/** Segments per quarter circle: about 0.16% under a true circle's area (approved). */
export const BUFFER_QUADRANT_SEGMENTS = 16;

export type DistanceUnit = "m" | "km";

export interface BufferSettings {
  distance: number;
  unit: DistanceUnit;
  dissolve: boolean;
}

export interface ToolResult {
  collection: FeatureCollection;
  zone: AnalysisZone;
  /** Whether the inputs reach more than 1° outside the zone. */
  zoneWarning: boolean;
}

/** Why a tool refused to run, for the message under Run. */
export type AnalysisErrorCode = "noGeometry" | "badDistance" | "badGeometry";

export class AnalysisError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

/** The distance in metres. */
export function distanceInMetres(settings: Pick<BufferSettings, "distance" | "unit">): number {
  return settings.unit === "km" ? settings.distance * 1000 : settings.distance;
}

/** The measured-area field a result carries, labelled with its zone, e.g. "Area m² (MGA 56)". */
export function areaFieldName(zone: AnalysisZone): string {
  return `Area m² (${zone.label})`;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Buffers every feature of `input`, or all of them as one when dissolving. */
export function runBuffer(input: FeatureCollection, settings: BufferSettings): ToolResult {
  const metres = distanceInMetres(settings);
  if (!Number.isFinite(metres) || metres <= 0) {
    throw new AnalysisError("badDistance", "The buffer distance must be more than 0.");
  }
  const extent = extentOf([input]);
  if (!extent) throw new AnalysisError("noGeometry", "The input layer has no geometry.");
  const zone = zoneForExtent(extent);
  const projection = zoneProjection(zone);
  const reader = new jsts.GeoJSONReader();
  const writer = new jsts.GeoJSONWriter();
  const areaField = areaFieldName(zone);

  const buffer = (geometry: Geometry, index: number): Geometry | null => {
    let result;
    try {
      result = jsts.BufferOp.bufferOp(reader.read(geometry), metres, BUFFER_QUADRANT_SEGMENTS);
    } catch (error) {
      const what = index < 0 ? "The features" : `Feature ${index + 1}`;
      throw new AnalysisError(
        "badGeometry",
        `${what} couldn't be buffered: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return result.isEmpty() ? null : writer.write(result);
  };

  const toFeature = (projected: Geometry, properties: Feature["properties"]): Feature => ({
    type: "Feature",
    properties: { ...properties, [areaField]: round2(planarArea(projected)) },
    geometry: projection.fromZone(projected),
  });

  const withGeometry = input.features
    .map((feature, index) => ({ feature, index }))
    .filter(({ feature }) => feature.geometry);
  const features: Feature[] = [];
  if (settings.dissolve) {
    const merged = buffer(
      {
        type: "GeometryCollection",
        geometries: withGeometry.map(({ feature }) => projection.toZone(feature.geometry!)),
      },
      -1,
    );
    if (merged) features.push(toFeature(merged, {}));
  } else {
    for (const { feature, index } of withGeometry) {
      const buffered = buffer(projection.toZone(feature.geometry!), index);
      if (buffered) features.push(toFeature(buffered, feature.properties ?? {}));
    }
  }
  return {
    collection: { type: "FeatureCollection", features },
    zone,
    zoneWarning: zoneWarningFor(extent, zone),
  };
}
