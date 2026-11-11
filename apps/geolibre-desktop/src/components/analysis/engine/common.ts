import type { FeatureCollection } from "geojson";
import type { AnalysisZone } from "./zone";

/**
 * SWIFTMAP (Change 37, shared since Change 43): what every analysis tool
 * returns, and how it refuses to run.
 */
export interface ToolResult {
  collection: FeatureCollection;
  zone: AnalysisZone;
  /** Whether the inputs reach more than 1° outside the zone. */
  zoneWarning: boolean;
  /**
   * Set when a polygon overlay only succeeded after rounding coordinates to a
   * millimetre (Change 43), so the origin record can say so.
   */
  precisionFallback?: "1 mm";
}

/** Why a tool refused to run, for the message under Run. */
export type AnalysisErrorCode = "noGeometry" | "badDistance" | "badGeometry" | "noPolygons";

export class AnalysisError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

export const round2 = (value: number) => Math.round(value * 100) / 100;
