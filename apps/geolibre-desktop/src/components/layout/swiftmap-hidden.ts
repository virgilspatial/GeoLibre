/**
 * SWIFTMAP (Change 30): GeoLibre features whose entry points Swiftmap hides.
 * Their engine code stays, so a project or link that uses them still loads.
 */

/**
 * Plugins kept out of the Tools menu and the command palette. Plain ids, so the
 * toolbar's command list doesn't load every plugin; a test checks each one
 * against GeoLibre's own constant.
 */
export const SWIFTMAP_HIDDEN_PLUGIN_IDS: ReadonlySet<string> = new Set([
  // JAXA Earth (GeoLibre v3.7.0): JAXA_EARTH_PLUGIN_ID.
  "geolibre-jaxa-earth",
]);

/** Indoor maps (v3.7.0): the on-map Floor picker and the Style panel's section. */
export const SHOW_INDOOR_MAPS = false;

/** I3S Building Scene Layers (v3.7.0): the Style panel's Building section. */
export const SHOW_I3S_BUILDING = false;
