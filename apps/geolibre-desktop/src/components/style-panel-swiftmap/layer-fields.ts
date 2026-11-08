import type { GeoLibreLayer } from "@geolibre/core";
import { getAttributePropertyNames } from "../../lib/expression-inputs";
import { isNumericProperty } from "../../lib/vector-style-classification";

// SWIFTMAP (Change 27): the field lists the Style panel offers, from GeoLibre's
// own attribute scan. Kept apart from `style-actions.ts` because the scan
// imports the map package, which unit tests can't load.

/** The layer's attribute names. */
export function layerFields(layer: GeoLibreLayer): string[] {
  return getAttributePropertyNames(layer);
}

/** The attribute names holding numbers (for Graduated and 3D height). */
export function numericFields(layer: GeoLibreLayer): string[] {
  return layerFields(layer).filter((field) => isNumericProperty(layer, field));
}
