import type { ArcGISLayerType } from "@geolibre/plugins";

/**
 * SWIFTMAP (Change 24): the layer type a prefilled ArcGIS service URL names, so
 * a MapServer link from Add Data's From a link tab opens GeoLibre's ArcGIS form
 * on Map service rather than Feature layer.
 */
export function layerTypeForUrl(url: string): ArcGISLayerType {
  const path = url.toLowerCase().split("?")[0] ?? "";
  if (/\/vectortileserver(\/|$)/.test(path)) return "vector-tile";
  if (/\/imageserver(\/|$)/.test(path)) return "image-service";
  if (/\/mapserver\/?$/.test(path)) return "map-service";
  return "feature";
}
