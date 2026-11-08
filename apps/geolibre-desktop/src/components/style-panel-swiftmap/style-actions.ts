import {
  darkenHex,
  initialLayerStyle,
  type GeoLibreLayer,
  type LayerStyle,
  type VectorRule,
} from "@geolibre/core";
import {
  chooseGraduatedProperty,
  countCategorizedValues,
  createCategorizedStops,
  createGraduatedStops,
  getPropertyValues,
  isNumericProperty,
} from "../../lib/vector-style-classification";
import {
  categoriesPatch,
  stopsToCategories,
  type CategoriesView,
} from "./style-model";

// SWIFTMAP (Change 27): builds the styles "Show as" applies, from the layer's
// data, with GeoLibre's own classification code. Each returns a patch for
// `setLayerStyle`.

/** Categories shown in full up to this many values; past it, the most common 12 plus "Other". */
export const ALL_CATEGORIES_LIMIT = 50;
const TOP_CATEGORIES = 12;
/** The "Other" row's colour: a quiet grey that reads as "everything else". */
export const OTHER_COLOR = "#a1a1aa";
/** Graduated defaults: Natural breaks, 5 classes. */
export const DEFAULT_GRADUATED_SCHEME = "natural-breaks";
export const DEFAULT_CLASS_COUNT = 5;
export const GRADUATED_SCHEMES = ["natural-breaks", "equal-interval", "quantile", "manual"] as const;

export function newRuleId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rule-${Math.random().toString(36).slice(2)}`;
}

/**
 * The field Categories starts with (7b review round 1): the suggestion's when
 * given; else the text field with the most values up to 12, a tie going to
 * the field whose values are shorter on average ("R1" over "Residential");
 * else a number field with 2–12 values; else the first field.
 */
export function defaultCategoryField(
  layer: GeoLibreLayer,
  fields: readonly string[],
  suggested?: string,
): string {
  if (suggested && fields.includes(suggested)) return suggested;
  const stats = fields.map((field) => {
    const values = getPropertyValues(layer, field).filter((v) => v !== null && v !== undefined && v !== "");
    const distinct = new Set(values.map((v) => String(v)));
    const length = distinct.size ? [...distinct].reduce((sum, v) => sum + v.length, 0) / distinct.size : 0;
    return { field, count: distinct.size, length, numeric: isNumericProperty(layer, field) };
  });
  const text = stats
    .filter((s) => !s.numeric && s.count >= 2 && s.count <= TOP_CATEGORIES)
    .sort((a, b) => b.count - a.count || a.length - b.length);
  if (text[0]) return text[0].field;
  const numeric = stats.filter((s) => s.numeric && s.count >= 2 && s.count <= TOP_CATEGORIES);
  return numeric[0]?.field ?? fields[0] ?? "";
}

/** The field Graduated starts with: the suggestion's, else GeoLibre's pick. */
export function defaultGraduatedField(
  layer: GeoLibreLayer,
  fields: string[],
  suggested?: string,
): string {
  if (suggested && fields.includes(suggested)) return suggested;
  return chooseGraduatedProperty(layer, fields) || fields[0] || "";
}

/**
 * Categories for a field: every value (sorted, numbers in order) when there are
 * few enough, else the most common 12 and an "Other" row for the rest.
 */
export function buildCategories(
  layer: GeoLibreLayer,
  field: string,
  ramp: string,
  style: LayerStyle,
): CategoriesView {
  const distinct = countCategorizedValues(getPropertyValues(layer, field));
  const all = distinct > 0 && distinct <= ALL_CATEGORIES_LIMIT;
  const count = all ? distinct : TOP_CATEGORIES;
  const stops = createCategorizedStops(layer, field, Math.max(1, count), ramp, all ? "alphabetical" : "top-values");
  const view = stopsToCategories(field, stops);
  const other =
    !all && distinct > count
      ? { value: "", label: "Other", color: OTHER_COLOR, strokeColor: style.strokeColor }
      : null;
  return { ...view, other };
}

/** "Show as Categories" by a field, saved as one rule per value. */
export function categoriesStylePatch(
  layer: GeoLibreLayer,
  style: LayerStyle,
  field: string,
  ramp: string,
  otherLabel: string,
  previous: readonly VectorRule[] = [],
): Partial<LayerStyle> {
  const view = buildCategories(layer, field, ramp, style);
  if (view.other) view.other.label = otherLabel;
  return {
    ...categoriesPatch(view, newRuleId, previous),
    vectorStyleColorRamp: ramp,
    pointRenderer: "single",
  };
}

/** "Show as Graduated": classes of a number field. */
export function graduatedStylePatch(
  layer: GeoLibreLayer,
  field: string,
  classCount: number,
  ramp: string,
  scheme: string,
): Partial<LayerStyle> {
  // Manual keeps hand-set breaks; a new field, count or ramp recomputes them evenly.
  const computeWith = scheme === "manual" ? "equal-interval" : scheme;
  return {
    vectorStyleMode: "graduated",
    vectorStyleProperty: field,
    vectorStyleClassCount: classCount,
    vectorStyleColorRamp: ramp,
    vectorStyleClassificationScheme: scheme,
    vectorStyleStops: createGraduatedStops(layer, field, classCount, ramp, computeWith),
    pointRenderer: "single",
  };
}

/** "Show as Single symbol": one symbol, keeping the layer's colours. */
export function singleStylePatch(): Partial<LayerStyle> {
  return { vectorStyleMode: "single", pointRenderer: "single" };
}

/**
 * Reset to default: the style a new layer of this geometry gets, keeping the
 * layer's current fill colour (and the outline derived from it) and its labels.
 * Pop-up settings live outside the style and are untouched.
 */
export function resetStyle(layer: GeoLibreLayer, style: LayerStyle): LayerStyle {
  const fill = /^#[0-9a-f]{6}$/i.test(style.fillColor) ? style.fillColor : undefined;
  return initialLayerStyle({
    geojson: layer.geojson,
    overrides: {
      ...(fill ? { fillColor: fill, strokeColor: darkenHex(fill, 0.55) } : {}),
      labels: style.labels,
    },
  });
}
