import type { GeoLibreLayer } from "@geolibre/core";
import type { TFunction } from "i18next";
import type { BufferSettings } from "./engine/buffer";
import type { AnalysisZone } from "./engine/zone";

/**
 * SWIFTMAP (Change 37): the origin record of an analysis result. Until Vault
 * exists (Stage 0) it lives in the result layer's metadata, saved with the map,
 * ready to move into Vault with the layer in Stage 1.
 */

/** `metadata.sourceKind` of a layer an analysis tool created. */
export const ANALYSIS_SOURCE_KIND = "swiftmap-analysis";
/** The metadata key holding the origin record. */
export const ORIGIN_KEY = "swiftmapOrigin";

export type AnalysisToolId =
  | "buffer"
  | "clip"
  | "intersect"
  | "constraintSummary"
  | "areaByZone"
  | "dissolve";

/** A run's input layer; `role` (Change 43) tells a clip or overlay layer from the input. */
export interface OriginInput {
  layerId: string;
  name: string;
  featureCount: number;
  role?: "input" | "clip" | "overlay";
}

/** Each tool's settings (Change 43): Clip and Intersect have none of their own. */
export type OriginSettings =
  | (BufferSettings & { segments: number })
  | { field: string | null }
  | Record<string, never>;

export interface AnalysisOrigin {
  version: 1;
  tool: AnalysisToolId;
  inputs: OriginInput[];
  settings: OriginSettings;
  crs: { epsg: number; name: string; label: string };
  /** Whether the inputs reached more than 1° outside the zone. */
  zoneWarning: boolean;
  /** ISO 8601. */
  createdAt: string;
  /** Set when the overlay only succeeded with coordinates rounded to 1 mm (Change 43). */
  precisionFallback?: "1 mm";
}

export function buildOrigin(options: {
  tool: AnalysisToolId;
  inputs: AnalysisOrigin["inputs"];
  settings: AnalysisOrigin["settings"];
  zone: AnalysisZone;
  zoneWarning: boolean;
  precisionFallback?: "1 mm";
  now?: Date;
}): AnalysisOrigin {
  return {
    version: 1,
    tool: options.tool,
    inputs: options.inputs,
    settings: options.settings,
    crs: { epsg: options.zone.epsg, name: options.zone.name, label: options.zone.label },
    zoneWarning: options.zoneWarning,
    createdAt: (options.now ?? new Date()).toISOString(),
    ...(options.precisionFallback ? { precisionFallback: options.precisionFallback } : {}),
  };
}

/** The metadata a result layer is created with. */
export function resultMetadata(origin: AnalysisOrigin): Record<string, unknown> {
  return { sourceKind: ANALYSIS_SOURCE_KIND, [ORIGIN_KEY]: origin };
}

export function isAnalysisResult(layer: GeoLibreLayer): boolean {
  return layer.metadata.sourceKind === ANALYSIS_SOURCE_KIND;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The layer's origin record, or null when it is missing or unreadable. */
export function originOf(layer: GeoLibreLayer): AnalysisOrigin | null {
  const origin = layer.metadata[ORIGIN_KEY];
  if (!isRecord(origin) || origin.version !== 1) return null;
  const { inputs, settings, crs, createdAt, tool } = origin;
  if (typeof tool !== "string" || !Array.isArray(inputs) || inputs.length === 0) return null;
  if (!isRecord(settings) || !isRecord(crs) || typeof createdAt !== "string") return null;
  if (typeof crs.epsg !== "number" || typeof crs.name !== "string") return null;
  if (Number.isNaN(new Date(createdAt).getTime())) return null;
  if (!inputs.every((input) => isRecord(input) && typeof input.name === "string")) return null;
  return origin as unknown as AnalysisOrigin;
}

export interface LineageRow {
  label: string;
  value: string;
}

/**
 * The Settings row: "100 m, dissolved" (Buffer), "Clipped to Site boundary",
 * "Intersected with Zones", "By Zone" or "All features merged" (Dissolve).
 */
export function settingsSummary(origin: AnalysisOrigin, t: TFunction, language: string): string {
  const second = origin.inputs.find((input) => input.role === "clip" || input.role === "overlay");
  switch (origin.tool) {
    case "clip":
      return t("swiftmapAnalysis.settingsClip", { name: second?.name ?? "" });
    case "intersect":
      return t("swiftmapAnalysis.settingsIntersect", { name: second?.name ?? "" });
    case "dissolve": {
      const field = (origin.settings as { field?: unknown }).field;
      return typeof field === "string"
        ? t("swiftmapAnalysis.settingsDissolveBy", { field })
        : t("swiftmapAnalysis.settingsDissolveAll");
    }
  }
  const settings = origin.settings as BufferSettings;
  const distance = `${new Intl.NumberFormat(language).format(settings.distance)} ${t(
    `swiftmapAnalysis.units.${settings.unit}`,
  )}`;
  return settings.dissolve ? t("swiftmapAnalysis.settingsDissolved", { distance }) : distance;
}

/** The lineage rows Properties shows for an analysis result, before Features and CRS. */
export function lineageRows(origin: AnalysisOrigin, t: TFunction, language: string): LineageRow[] {
  return [
    {
      label: t("swiftmapAnalysis.prop.createdWith"),
      value: t(`swiftmapAnalysis.tools.${origin.tool}`),
    },
    {
      label: t("swiftmapAnalysis.prop.input", { count: origin.inputs.length }),
      value: origin.inputs.map((input) => input.name).join(", "),
    },
    {
      label: t("swiftmapAnalysis.prop.settings"),
      value: settingsSummary(origin, t, language),
    },
    {
      label: t("swiftmapAnalysis.prop.created"),
      value: new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(origin.createdAt),
      ),
    },
  ];
}

/** The "Precision" row, shown after "Measured in" only when the 1 mm retry was needed. */
export function precisionRow(origin: AnalysisOrigin, t: TFunction): LineageRow | null {
  return origin.precisionFallback === "1 mm"
    ? { label: t("swiftmapAnalysis.prop.precision"), value: t("swiftmapAnalysis.prop.precision1mm") }
    : null;
}

/** The "Measured in" row, shown after CRS. */
export function measuredInRow(origin: AnalysisOrigin, t: TFunction): LineageRow {
  return {
    label: t("swiftmapAnalysis.prop.measuredIn"),
    value: `${origin.crs.name} (EPSG:${origin.crs.epsg})`,
  };
}
