import {
  documentLocale,
  resolvePopupRows,
  resolvePopupTitle,
  type FieldVisibility,
  type LayerPopupConfig,
  type LayerStyle,
  type PopupFieldConfig,
  type PopupFieldKind,
  type PopupRow,
  type VectorRule,
  type VectorStyleStop,
} from "@geolibre/core";

// SWIFTMAP (Change 27): the Style panel's rules, kept free of React and of the
// map so they can be unit tested. Everything here reads or builds GeoLibre's
// own `LayerStyle` fields; nothing is stored anywhere else.

/** What the "Show as" control shows for a style. */
export type ShowAs = "single" | "categories" | "graduated" | "custom" | "heatmap" | "clusters";

/** The geometry a layer is styled as. */
export type GeometryKind = "polygon" | "line" | "point" | "mixed";

/** One category row: a value of the field and its symbol. */
export interface Category {
  value: string | number | boolean;
  label: string;
  /** Fill for polygons and points; the line colour for lines. */
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
}

/** A style read as Categories: the field, its rows, and an optional "Other" row. */
export interface CategoriesView {
  field: string;
  categories: Category[];
  /** GeoLibre's else-rule: everything not listed. */
  other: Category | null;
}

/**
 * A rule's filter as a field and value when it has the simple shape
 * `["==", ["get", field], value]`, written by Swiftmap or by the ArcGIS Pro
 * converter (any JSON spacing), else null.
 */
export function parseCategoryFilter(
  filter: string,
): { field: string; value: string | number | boolean } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(filter);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3 || parsed[0] !== "==") return null;
  const [, getter, value] = parsed as [unknown, unknown, unknown];
  if (
    !Array.isArray(getter) ||
    getter.length !== 2 ||
    getter[0] !== "get" ||
    typeof getter[1] !== "string"
  ) {
    return null;
  }
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return null;
  }
  return { field: getter[1], value };
}

/** The filter that selects one value of a field. */
export function categoryFilter(field: string, value: string | number | boolean): string {
  return JSON.stringify(["==", ["get", field], value]);
}

/**
 * Reads rule-based rules as Categories when they are one rule per value of a
 * single field: no nesting, no zoom limits, every rule on, at most one
 * else-rule. Anything else is someone's own rule tree ("Custom rules").
 */
export function readRuleCategories(rules: readonly VectorRule[]): CategoriesView | null {
  let field: string | null = null;
  const categories: Category[] = [];
  let other: Category | null = null;
  const seen = new Set<string>();
  for (const rule of rules) {
    if (rule.parentId || rule.enabled === false) return null;
    if (rule.minZoom !== undefined || rule.maxZoom !== undefined) return null;
    const symbol = {
      label: rule.label,
      color: rule.color,
      ...(rule.strokeColor !== undefined ? { strokeColor: rule.strokeColor } : {}),
      ...(rule.strokeWidth !== undefined ? { strokeWidth: rule.strokeWidth } : {}),
    };
    if (rule.isElse) {
      if (other) return null;
      other = { value: "", ...symbol };
      continue;
    }
    const parsed = parseCategoryFilter(rule.filter);
    if (!parsed) return null;
    if (field !== null && parsed.field !== field) return null;
    field = parsed.field;
    const key = JSON.stringify(parsed.value);
    if (seen.has(key)) return null;
    seen.add(key);
    categories.push({ value: parsed.value, ...symbol });
  }
  if (field === null || categories.length === 0) return null;
  return { field, categories, other };
}

/** GeoLibre's own categorised mode (one stop per value) as Categories. */
export function stopsToCategories(
  field: string,
  stops: readonly VectorStyleStop[],
): CategoriesView {
  return {
    field,
    categories: stops.map((stop) => ({
      value: stop.value,
      label: stop.label?.trim() ? stop.label : String(stop.value),
      color: stop.color,
    })),
    other: null,
  };
}

/**
 * The rule-based rules a Categories view is saved as: one rule per value, then
 * the "Other" else-rule when there is one. Existing rule ids are kept by
 * position so Undo and the legend stay steady.
 */
export function categoriesToRules(
  view: CategoriesView,
  makeId: () => string,
  previous: readonly VectorRule[] = [],
): VectorRule[] {
  const ids = previous.map((rule) => rule.id);
  const rule = (category: Category, index: number, isElse: boolean): VectorRule => ({
    id: ids[index] ?? makeId(),
    label: category.label,
    filter: isElse ? "" : categoryFilter(view.field, category.value),
    color: category.color,
    isElse,
    ...(category.strokeColor !== undefined ? { strokeColor: category.strokeColor } : {}),
    ...(category.strokeWidth !== undefined ? { strokeWidth: category.strokeWidth } : {}),
  });
  const rules = view.categories.map((category, index) => rule(category, index, false));
  if (view.other) rules.push(rule(view.other, rules.length, true));
  return rules;
}

/** The style patch that saves a Categories view (always as rules). */
export function categoriesPatch(
  view: CategoriesView,
  makeId: () => string,
  previous: readonly VectorRule[] = [],
): Partial<LayerStyle> {
  return {
    vectorStyleMode: "rule-based",
    vectorStyleProperty: view.field,
    vectorRules: categoriesToRules(view, makeId, previous),
  };
}

/** How the panel shows a style. */
export function showAsOf(style: LayerStyle, pointLayer: boolean): ShowAs {
  if (pointLayer && style.pointRenderer === "heatmap") return "heatmap";
  if (pointLayer && style.pointRenderer === "cluster") return "clusters";
  switch (style.vectorStyleMode) {
    case "graduated":
      return "graduated";
    case "categorized":
      return style.vectorStyleProperty ? "categories" : "custom";
    case "rule-based":
      return readRuleCategories(style.vectorRules) ? "categories" : "custom";
    case "expression":
      return "custom";
    default:
      return "single";
  }
}

/** The Categories a style shows, whichever way GeoLibre stores them. */
export function categoriesOf(style: LayerStyle): CategoriesView | null {
  if (style.vectorStyleMode === "rule-based") return readRuleCategories(style.vectorRules);
  if (style.vectorStyleMode === "categorized" && style.vectorStyleProperty) {
    return stopsToCategories(style.vectorStyleProperty, style.vectorStyleStops);
  }
  return null;
}

/** The geometry the panel styles a layer as. */
export function geometryKindOf(flags: {
  hasPoint: boolean;
  hasLine: boolean;
  hasPolygon: boolean;
}): GeometryKind {
  const kinds = [flags.hasPolygon, flags.hasLine, flags.hasPoint].filter(Boolean).length;
  if (kinds !== 1) return "mixed";
  if (flags.hasPolygon) return "polygon";
  if (flags.hasLine) return "line";
  return "point";
}

/** The arrow colour on lines drawn in several colours: reads on every category. */
export const ARROW_NEUTRAL = "#27272a";

/**
 * Switching Direction arrows on or off. Single-symbol lines leave the colour
 * empty, which GeoLibre draws in the line's colour; lines drawn by category or
 * class get one dark neutral, changeable afterwards.
 */
export function directionArrowsPatch(style: LayerStyle, on: boolean): Partial<LayerStyle> {
  if (!on) return { lineDecoration: "none" };
  const multiColour = style.vectorStyleMode !== "single";
  return {
    lineDecoration: "arrow",
    lineDecorationColor: multiColour ? ARROW_NEUTRAL : "",
  };
}

/** The first label layer of the basemap, the layer to draw below. */
export function firstLabelLayerId(
  styleLayers: readonly { id: string; type: string }[],
  basemapLayerIds: readonly string[],
): string | null {
  const basemap = new Set(basemapLayerIds);
  return styleLayers.find((layer) => layer.type === "symbol" && basemap.has(layer.id))?.id ?? null;
}

/** Whether a raster draws in greys (GeoLibre's Greyscale is saturation −1). */
export function isGreyscale(style: Pick<LayerStyle, "rasterSaturation">): boolean {
  return style.rasterSaturation <= -1;
}

/** Graduated class ranges for the class rows: each from its break to the next. */
export function classRanges(
  stops: readonly VectorStyleStop[],
): { from: number; to: number | null }[] {
  const values = stops.map((stop) => Number(stop.value));
  return values.map((from, index) => ({
    from,
    to: index + 1 < values.length ? values[index + 1] : null,
  }));
}

/** A class break as text: whole numbers plain, others to 2 decimals. */
export function formatBreak(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
}

/** Moves one item of a list, for the pop-up field order. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item as T);
  return next;
}

/**
 * GIS bookkeeping columns a pop-up leaves unticked by default (7b review round
 * 1): ids and ArcGIS geometry measures. Editors can tick them back on.
 */
const SYSTEM_FIELD =
  /^(objectid|object_id|oid|fid|ogc_fid|gid|id|globalid|global_id|shape|shape_len|shape_leng|shape_length|shape_area|shape__length|shape__area|st_area\(shape\)|st_length\(shape\))$/i;

export function isSystemField(field: string): boolean {
  return SYSTEM_FIELD.test(field.trim());
}

/** Decimal places a pop-up shows by default for numbers that have decimals. */
export const DEFAULT_POPUP_DECIMALS = 2;

/**
 * The pop-up fields a layer with no saved list starts with: every field except
 * system ones, in the data's order, with number fields that carry decimals
 * rounded to 2 places.
 */
export function defaultPopupFields(
  fields: readonly string[],
  samples: readonly Record<string, unknown>[],
): PopupFieldConfig[] {
  const kept = fields.filter((field) => !isSystemField(field));
  // A layer of only system fields keeps them all: an empty list would mean
  // "every field" to GeoLibre anyway.
  return (kept.length > 0 ? kept : fields).map((field) => {
    const values = samples.map((row) => row[field]).filter((v) => v !== null && v !== undefined);
    const decimals =
      values.length > 0 &&
      values.every((v) => typeof v === "number") &&
      values.some((v) => !Number.isInteger(v));
    return decimals
      ? { field, kind: "number" as const, format: { decimals: DEFAULT_POPUP_DECIMALS } }
      : { field };
  });
}

/** Whether a pop-up has a field list of its own (GeoLibre reads an empty one as "every field"). */
export function hasPopupFieldList(popup: LayerPopupConfig | undefined): boolean {
  return Array.isArray(popup?.fields) && popup.fields.length > 0;
}

/**
 * A layer's pop-up with Swiftmap's defaults filled in (7b review round 3), or
 * null when nothing is missing. Defaults are settings: with no field list the
 * map would show every field unformatted, and unless a project chose
 * otherwise the feature id row stays hidden.
 */
export function popupWithDefaults(
  popup: LayerPopupConfig | undefined,
  fields: readonly string[],
  samples: readonly Record<string, unknown>[],
): LayerPopupConfig | null {
  const needsFields = !hasPopupFieldList(popup) && fields.length > 0;
  const needsIdRow = popup?.showFeatureId === undefined;
  if (!needsFields && !needsIdRow) return null;
  return {
    ...popup,
    ...(needsFields ? { fields: defaultPopupFields(fields, samples) } : {}),
    ...(needsIdRow ? { showFeatureId: false } : {}),
  };
}

/**
 * What the map pop-up shows for one feature: its title and rows, from the same
 * GeoLibre functions the map renders with, so the Pop-up tab's preview can't
 * drift from it.
 */
export function popupPreview(
  layerName: string,
  properties: Record<string, unknown>,
  popup: LayerPopupConfig | undefined,
  fieldVisibility?: Record<string, FieldVisibility>,
): { title: string; rows: PopupRow[] } {
  return {
    title: resolvePopupTitle(layerName, properties, popup, { fieldVisibility }),
    rows: resolvePopupRows(properties, { popup, fieldVisibility, locale: documentLocale() }),
  };
}

/**
 * The value type a format change needs: GeoLibre's pop-up ignores decimals and
 * prefix/suffix on an "Auto" field, so one gets Number (Text for a text value).
 */
export function kindForFormat(kind: PopupFieldKind | undefined, sample: unknown): PopupFieldKind {
  if (kind && kind !== "auto") return kind;
  return typeof sample === "string" && !Number.isFinite(Number(sample)) ? "text" : "number";
}
