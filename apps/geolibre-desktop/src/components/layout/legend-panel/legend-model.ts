/**
 * SWIFTMAP (Change 25): what the Legend panel lists, read from each layer's
 * GeoLibre style so the legend matches the map. Pure (no React, no map), so it
 * runs under the unit tests; the map query lives in `legend-in-view.ts`.
 */
import {
  effectiveVectorRules,
  isHexColor,
  isStrokeDashPattern,
  proportionalSizeRange,
  strokeDashPresetName,
  strokeOpacityValue,
  styleValue,
  vectorColorExpression,
  type GeoLibreLayer,
  type LayerGroup,
  type LayerStyle,
} from "@geolibre/core";
import { formatLegendNumber } from "../../../lib/auto-legend";
import { isRasterLike, layerSwatchShape } from "../../../lib/layer-swatch";

/** Layer types that are neither styled vectors nor imagery: never listed. */
const UNLISTED_TYPES = new Set<GeoLibreLayer["type"]>([
  "lidar",
  "gaussian-splat",
  "3d-tiles",
  "video",
  "image",
]);

/** GeoLibre's flat fill patterns the swatch can draw. */
export type LegendPattern = "hatch" | "cross-hatch" | "horizontal" | "vertical" | "dots";
const PATTERNS = new Set<string>(["hatch", "cross-hatch", "horizontal", "vertical", "dots"]);

export type LegendSwatch =
  | {
      kind: "polygon";
      fill: string;
      /** Fill opacity, 0..1; with a pattern it applies to the pattern lines. */
      fillOpacity: number;
      /** Outline colour, or null when the map draws none (width 0). */
      outline: string | null;
      /** Outline opacity, 0..1 (Change 31). */
      outlineOpacity: number;
      /** A dashed or dotted outline, or null for solid (Change 31). */
      outlineDash: "dashed" | "dotted" | null;
      pattern: LegendPattern | null;
      patternColor: string;
    }
  | { kind: "point"; color: string }
  | {
      kind: "line";
      color: string;
      /** px, 1..5 */
      width: number;
      /** Line opacity, 0..1 (Change 31). */
      opacity: number;
      /** Dash and gap lengths in multiples of the width, or null for solid (Change 31). */
      dash: number[] | null;
    };

export interface LegendClass {
  id: string;
  label: string;
  swatch: LegendSwatch;
}

/**
 * How the map decides a feature's class, for In view: by the colour the
 * layer's own colour expression gives it (categorised, graduated, expression),
 * or by the first rule filter it matches (rule-based).
 */
export type LegendClassifier =
  | { kind: "color"; expression: unknown; classColors: string[] }
  | {
      kind: "rules";
      /** Leaf rules in order; the zoom range is checked beside the filter. */
      filters: { classId: string; filter: unknown[]; minZoom?: number; maxZoom?: number }[];
      elseClassId: string | null;
    };

export interface LegendLayer {
  id: string;
  name: string;
  minZoom: number;
  maxZoom: number;
  /** Single-symbol swatch; null for a categorised layer (its name is a heading). */
  swatch: LegendSwatch | null;
  /** Classes in style order; empty for a single-symbol layer. */
  classes: LegendClass[];
  classifier: LegendClassifier | null;
}

const MAX_CLASSES = 100;

/**
 * The layers the legend may list, top of Layers first: on, every group above
 * them on, and styled vectors (imagery, basemaps, 3D and media never appear).
 */
export function listedLayers(layers: GeoLibreLayer[], groups: LayerGroup[]): GeoLibreLayer[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const groupOn = (id: string | undefined): boolean => {
    const seen = new Set<string>();
    let group = id ? byId.get(id) : undefined;
    while (group && !seen.has(group.id)) {
      if (!group.visible) return false;
      seen.add(group.id);
      group = group.parentId ? byId.get(group.parentId) : undefined;
    }
    return true;
  };
  // Store order is bottom-first; Layers and the legend read top-first.
  return [...layers]
    .reverse()
    .filter(
      (layer) =>
        layer.visible &&
        !UNLISTED_TYPES.has(layer.type) &&
        !isRasterLike(layer) &&
        groupOn(layer.groupId),
    );
}

/** Whether the map draws the layer at this zoom (MapLibre: min inclusive, max exclusive). */
export function inZoomRange(
  layer: Pick<LegendLayer, "minZoom" | "maxZoom">,
  zoom: number,
): boolean {
  return zoom >= layer.minZoom && zoom < layer.maxZoom;
}

function clampWidth(width: number): number {
  return Math.min(5, Math.max(1, Math.round(width * 2) / 2));
}

function patternOf(style: LayerStyle): LegendPattern | null {
  const pattern = styleValue(style, "fillPattern");
  return PATTERNS.has(pattern) ? (pattern as LegendPattern) : null;
}

/** The layer's dash pattern, or null for a solid line (GeoLibre #3360). */
function dashOf(style: LayerStyle): number[] | null {
  const dash = styleValue(style, "strokeDash");
  return isStrokeDashPattern(dash) ? [...dash] : null;
}

function lineSwatch(style: LayerStyle, color: string, width: number): LegendSwatch {
  return { kind: "line", color, width, opacity: strokeOpacityValue(style), dash: dashOf(style) };
}

function polygonSwatch(
  style: LayerStyle,
  fill: string,
  overrides: { strokeColor?: string; strokeWidth?: number; fillOpacity?: number } = {},
): LegendSwatch {
  const width = overrides.strokeWidth ?? styleValue(style, "strokeWidth");
  return {
    kind: "polygon",
    fill,
    fillOpacity: overrides.fillOpacity ?? styleValue(style, "fillOpacity"),
    outline: width > 0 ? (overrides.strokeColor ?? styleValue(style, "strokeColor")) : null,
    outlineOpacity: strokeOpacityValue(style),
    outlineDash: dashOf(style)
      ? strokeDashPresetName(styleValue(style, "strokeDash")) === "dotted"
        ? "dotted"
        : "dashed"
      : null,
    pattern: patternOf(style),
    patternColor: isHexColor(styleValue(style, "fillPatternColor"))
      ? styleValue(style, "fillPatternColor")
      : "#1e40af",
  };
}

type Shape = ReturnType<typeof layerSwatchShape>;

/** A swatch for one symbol: `color` is the class colour (fill, dot or line). */
function swatchFor(
  shape: Shape,
  style: LayerStyle,
  color: string,
  overrides: { strokeColor?: string; strokeWidth?: number; fillOpacity?: number } = {},
): LegendSwatch {
  if (shape === "circle") return { kind: "point", color };
  if (shape === "line") {
    return lineSwatch(
      style,
      color,
      clampWidth(overrides.strokeWidth ?? styleValue(style, "strokeWidth")),
    );
  }
  return polygonSwatch(style, color, overrides);
}

function rangeLabel(bounds: number[], index: number): string {
  const from = formatLegendNumber(bounds[index]);
  if (index >= bounds.length - 1) return `≥ ${from}`;
  return `${from} – ${formatLegendNumber(bounds[index + 1])}`;
}

/**
 * A graduated line class's width, as the map draws it: sized by the class's
 * lower bound when proportional sizing reads the classified field (Strahler
 * order, say), else the layer's width. Clamped to the swatch's 1 to 5px.
 */
function graduatedLineWidth(style: LayerStyle, value: number): number {
  const range = proportionalSizeRange(style);
  if (!range || range.property !== styleValue(style, "vectorStyleProperty")) {
    return clampWidth(styleValue(style, "strokeWidth"));
  }
  const ratio = Math.min(
    1,
    Math.max(0, (value - range.minValue) / (range.maxValue - range.minValue)),
  );
  return clampWidth(range.minRadius + (range.maxRadius - range.minRadius) * ratio);
}

/**
 * The legend entry for one layer: a single swatch, or classes for categorised,
 * graduated and rule-based layers, labelled as GeoLibre's own legend labels them.
 */
export function legendLayer(layer: GeoLibreLayer): LegendLayer {
  const style = layer.style;
  const shape = layerSwatchShape(layer);
  const mode = styleValue(style, "vectorStyleMode");
  const base = {
    id: layer.id,
    name: layer.name,
    minZoom: styleValue(style, "minZoom"),
    maxZoom: styleValue(style, "maxZoom"),
  };
  // Points take the fill colour (GeoLibre has no separate point colour); lines
  // take the stroke colour. A marker layer bakes one sprite from markerColor.
  const singleColor =
    shape === "line"
      ? styleValue(style, "strokeColor")
      : shape === "circle" && styleValue(style, "markerEnabled")
        ? styleValue(style, "markerColor")
        : styleValue(style, "fillColor");
  const single: LegendLayer = {
    ...base,
    swatch: swatchFor(shape, style, singleColor),
    classes: [],
    classifier: null,
  };

  if (mode === "rule-based") {
    const { rules, elseRule } = effectiveVectorRules(style);
    const classes: LegendClass[] = rules.slice(0, MAX_CLASSES).map((rule) => ({
      id: rule.id,
      label: rule.label || JSON.stringify(rule.filter),
      swatch: swatchFor(shape, style, rule.color, rule),
    }));
    let elseClassId: string | null = null;
    if (elseRule && isHexColor(elseRule.color)) {
      elseClassId = elseRule.id;
      classes.push({
        id: elseRule.id,
        label: elseRule.label || "Other",
        swatch: swatchFor(shape, style, elseRule.color, {
          ...(isHexColor(elseRule.strokeColor) ? { strokeColor: elseRule.strokeColor } : {}),
          ...(typeof elseRule.strokeWidth === "number"
            ? { strokeWidth: elseRule.strokeWidth }
            : {}),
          ...(typeof elseRule.fillOpacity === "number"
            ? { fillOpacity: elseRule.fillOpacity }
            : {}),
        }),
      });
    }
    if (classes.length === 0) return single;
    return {
      ...base,
      swatch: null,
      classes,
      classifier: {
        kind: "rules",
        filters: rules.slice(0, MAX_CLASSES).map((rule) => ({
          classId: rule.id,
          filter: rule.filter,
          ...(rule.minZoom !== undefined ? { minZoom: rule.minZoom } : {}),
          ...(rule.maxZoom !== undefined ? { maxZoom: rule.maxZoom } : {}),
        })),
        elseClassId,
      },
    };
  }

  if (mode === "categorized" || mode === "graduated") {
    const fallback =
      shape === "line" ? styleValue(style, "strokeColor") : styleValue(style, "fillColor");
    const expression = vectorColorExpression(style, fallback);
    if (!Array.isArray(expression)) return single;
    const stops = styleValue(style, "vectorStyleStops").slice(0, MAX_CLASSES);
    const valid =
      mode === "categorized"
        ? stops.filter((stop) => String(stop.value).trim().length > 0 && isHexColor(stop.color))
        : stops
            .map((stop) => ({ ...stop, numeric: Number(stop.value) }))
            .filter((stop) => Number.isFinite(stop.numeric) && isHexColor(stop.color))
            .sort((a, b) => a.numeric - b.numeric);
    if (valid.length === 0) return single;
    const bounds = valid.map((stop) => Number(stop.value));
    const classes = valid.map((stop, index) => {
      const label =
        stop.label?.trim() ||
        (mode === "categorized" ? String(stop.value ?? "") : rangeLabel(bounds, index));
      const swatch =
        mode === "graduated" && shape === "line"
          ? lineSwatch(style, stop.color, graduatedLineWidth(style, bounds[index]))
          : swatchFor(shape, style, stop.color);
      return { id: `${index}`, label, swatch };
    });
    return {
      ...base,
      swatch: null,
      classes,
      classifier: {
        kind: "color",
        expression,
        classColors: valid.map((stop) => stop.color.toLowerCase()),
      },
    };
  }

  return single;
}

/** One layer's row in the panel, after In view / All and the zoom are applied. */
export interface LegendRow {
  layer: LegendLayer;
  /** The layer's zoom range excludes the current zoom: dimmed, with a note. */
  outOfRange: boolean;
  /** Classes to list under a categorised layer's heading (empty when out of range). */
  classes: LegendClass[];
}

/** What the map shows in the current view, per layer id (from `legend-in-view.ts`). */
export interface InViewResult {
  /** Layers with at least one feature drawn in view. */
  layerIds: Set<string>;
  /** Class ids drawn in view, per categorised layer id. */
  classIds: Map<string, Set<string>>;
}

export type LegendMode = "view" | "all";

export type LegendEmptyMessage =
  | "noLayers"
  | "noneOn"
  | "zoomIn"
  | "zoomOut"
  | "zoomInOrOut"
  | "nothingHere";

export interface LegendView {
  rows: LegendRow[];
  /** The single muted line shown instead of the list, or null. */
  empty: LegendEmptyMessage | null;
}

/**
 * The panel's contents. Single-symbol layers first, then categorised ones, each
 * in Layers order. In view leaves out layers with nothing drawn in view (and a
 * categorised layer with none of its categories in view); layers out of their
 * zoom range stay, with a note. `inView` is null when the map can't be queried;
 * every layer then counts as drawn.
 */
export function legendView(input: {
  /** Whether the map has any layers at all (imagery included). */
  hasAnyLayers: boolean;
  layers: LegendLayer[];
  zoom: number;
  mode: LegendMode;
  inView: InViewResult | null;
}): LegendView {
  const { layers, zoom, mode, inView } = input;
  const ordered = [
    ...layers.filter((layer) => layer.classes.length === 0),
    ...layers.filter((layer) => layer.classes.length > 0),
  ];
  const filterToView = mode === "view" && inView !== null;
  const rows: LegendRow[] = [];
  for (const layer of ordered) {
    if (!inZoomRange(layer, zoom)) {
      rows.push({ layer, outOfRange: true, classes: [] });
      continue;
    }
    if (!filterToView) {
      rows.push({ layer, outOfRange: false, classes: layer.classes });
      continue;
    }
    if (!inView.layerIds.has(layer.id)) continue;
    const found = inView.classIds.get(layer.id);
    const classes = layer.classes.filter((item) => found?.has(item.id));
    if (layer.classes.length > 0 && classes.length === 0) continue;
    rows.push({ layer, outOfRange: false, classes });
  }

  let empty: LegendEmptyMessage | null = null;
  if (layers.length === 0) {
    empty = input.hasAnyLayers ? "noneOn" : "noLayers";
  } else if (rows.every((row) => row.outOfRange)) {
    if (!layers.some((layer) => inZoomRange(layer, zoom))) {
      empty = layers.every((layer) => zoom < layer.minZoom)
        ? "zoomIn"
        : layers.every((layer) => zoom >= layer.maxZoom)
          ? "zoomOut"
          : "zoomInOrOut";
    } else {
      empty = "nothingHere";
    }
  }
  return { rows: empty ? [] : rows, empty };
}
