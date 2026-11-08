import { useAppStore, type GeoLibreLayer } from "@geolibre/core";
import { useEffect } from "react";
import { layerFields } from "./layer-fields";
import { hasPopupFieldList, popupWithDefaults } from "./style-model";

// SWIFTMAP (Change 27, 7b review rounds 1 and 3): Swiftmap's pop-up defaults
// are settings, not just what the Pop-up tab shows. With no saved field list
// GeoLibre's map pop-up shows every field at full precision plus the feature
// id, so every layer without one gets the defaults saved on it: new layers,
// layers in a loaded project, converter files, and layers whose fields arrive
// after loading. The write is quiet (no Undo step, the project's saved/unsaved
// state unchanged); the defaults go into the file with the next save.

/** Up to 50 features' properties, to tell number fields with decimals. */
export function popupSamples(layer: Pick<GeoLibreLayer, "geojson">): Record<string, unknown>[] {
  return (layer.geojson?.features ?? [])
    .slice(0, 50)
    .map((feature) => (feature.properties ?? {}) as Record<string, unknown>);
}

/** Saves the pop-up defaults on every layer that is missing them. */
export function usePopupDefaults(): void {
  const layers = useAppStore((s) => s.layers);

  useEffect(() => {
    let changed = false;
    const current = useAppStore.getState().layers;
    const next = current.map((layer) => {
      // Cheap check first: the field scan reads the layer's features.
      if (hasPopupFieldList(layer.popup) && layer.popup?.showFeatureId !== undefined) return layer;
      const fields = layerFields(layer);
      // Only vector layers with fields have a field pop-up to set up; the rest
      // are tried again when their data arrives.
      if (fields.length === 0) return layer;
      const popup = popupWithDefaults(layer.popup, fields, popupSamples(layer));
      if (!popup) return layer;
      changed = true;
      return { ...layer, popup };
    });
    if (!changed) return;
    const history = useAppStore.temporal.getState();
    history.pause();
    try {
      useAppStore.setState({ layers: next });
    } finally {
      history.resume();
    }
  }, [layers]);
}
