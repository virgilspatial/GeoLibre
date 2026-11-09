import {
  STROKE_DASH_PRESETS,
  isStrokeDashPattern,
  strokeBlurValue,
  strokeDashPresetName,
  strokeOpacityValue,
  styleValue,
  type LayerStyle,
  type StrokeDashPreset,
} from "@geolibre/core";

// SWIFTMAP (Change 31): line opacity, dashes and blur (GeoLibre #3360) as the
// Style panel offers them. Pure, so the unit tests cover it.

/** The line styles the panel offers, in menu order (GeoLibre's presets). */
export const LINE_STYLES = [
  "solid",
  "dashed",
  "dotted",
  "dash-dot",
  "long-dash",
] as const satisfies readonly StrokeDashPreset[];

/** A menu choice: a preset, or "custom" for a pattern set elsewhere (an import). */
export type LineStyleChoice = StrokeDashPreset | "custom";

/** The layer's line style choice. */
export function lineStyleOf(style: LayerStyle): LineStyleChoice {
  return strokeDashPresetName(styleValue(style, "strokeDash"));
}

/**
 * The menu's options: the presets, plus "Custom" only while the layer has a
 * pattern no preset matches, so picking a preset can't be undone into nothing.
 */
export function lineStyleChoices(style: LayerStyle): readonly LineStyleChoice[] {
  return lineStyleOf(style) === "custom" ? [...LINE_STYLES, "custom"] : LINE_STYLES;
}

/** The patch for a menu choice. "Custom" keeps the current pattern. */
export function lineStylePatch(choice: LineStyleChoice): Partial<LayerStyle> {
  if (choice === "custom") return {};
  return { strokeDash: [...STROKE_DASH_PRESETS[choice]] };
}

/** The layer's stroke opacity as a whole percentage. */
export function strokeOpacityPercent(style: LayerStyle): number {
  return Math.round(strokeOpacityValue(style) * 100);
}

/** The patch for a stroke opacity percentage (clamped to 0–100). */
export function strokeOpacityPatch(percent: number): Partial<LayerStyle> {
  return { strokeOpacity: Math.min(100, Math.max(0, percent)) / 100 };
}

/** The layer's blur in px. */
export const lineBlurOf = strokeBlurValue;

/** The layer's dash pattern, or null when it's solid. */
export function dashPatternOf(style: LayerStyle): number[] | null {
  const dash = styleValue(style, "strokeDash");
  return isStrokeDashPattern(dash) ? [...dash] : null;
}
