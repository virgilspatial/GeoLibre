import { isCesiumKmlLayer, isCzmlLayer, type GeoLibreLayer } from "@geolibre/core";
import type { MapEngine } from "@geolibre/map";
import type { RefObject } from "react";
import {
  hasExternalDeckLayer,
  hasExternalNativeLayers,
} from "../panels/style-panel/layer-capabilities";
import { QuickFiltersSection } from "../panels/QuickFiltersSection";
import { cardClass } from "../panels/layer-panel/LayerRowCards";

// SWIFTMAP (Change 27): quick filters leave the Style panel for the layer ⋯
// menu ("Filter"), so viewers can use them too. The card holds GeoLibre's own
// quick filters section, unchanged, inline under the layer toolbar like the
// Opacity card.

/**
 * Whether quick filters reach this layer: the same test as GeoLibre's Style
 * panel (a per-feature MapLibre filter; deck.gl layers and CZML/KML scenes
 * take none).
 */
export function quickFiltersAvailable(layer: GeoLibreLayer): boolean {
  return (
    !hasExternalDeckLayer(layer) &&
    !isCzmlLayer(layer) &&
    !isCesiumKmlLayer(layer) &&
    (layer.type === "geojson" ||
      layer.type === "vector-tiles" ||
      layer.type === "mbtiles" ||
      hasExternalNativeLayers(layer))
  );
}

export function LayerFilterCard({
  layer,
  mapControllerRef,
}: {
  layer: GeoLibreLayer;
  mapControllerRef: RefObject<MapEngine | null>;
}) {
  return (
    // GeoLibre's section is reused as it is; only its heading is brought down to
    // the other cards' 12px/500 title (7b review round 1).
    <div
      className={`${cardClass} [&_[data-testid=quick-filters-section]>div:first-child>p]:text-xs [&_[data-testid=quick-filters-section]>div:first-child>p]:font-medium`}
      data-testid="layer-filter-card"
    >
      <QuickFiltersSection layer={layer} mapControllerRef={mapControllerRef} />
    </div>
  );
}
