import { DEFAULT_BASEMAP, useAppStore } from "@geolibre/core";
import { applyBasemap } from "../basemap/basemap-actions";
import { swiftmapDefaultBasemapUrl } from "../map/swiftmap-basemap";

// SWIFTMAP (Change 32): an opened project's regional basemap that the user
// doesn't load falls back to Swiftmap's default (Light), not GeoLibre's
// (OpenFreeMap Liberty).

/**
 * Replaces GeoLibre's fallback basemap with Swiftmap's default, once the
 * Regional basemap prompt is answered without loading (Use default basemap,
 * closing the dialog, or a deployment that blocks regional basemaps).
 *
 * Call it only after the hold is resolved: Load applies the regional basemap
 * only while the map is still on GeoLibre's fallback. Like the fallback, the
 * swap is not an edit (no Undo step, `isDirty` unchanged), and undo snapshots
 * taken while the prompt was open get the new basemap too, as the engine does
 * for Load.
 *
 * @param url - The basemap to apply; Swiftmap's default unless a test passes one.
 * @returns Whether the basemap was replaced.
 */
export function applySwiftmapFallback(url: string = swiftmapDefaultBasemapUrl()): boolean {
  // Without a key the default is Liberty already; a basemap other than
  // GeoLibre's fallback was picked by the user, so it stays.
  if (url === DEFAULT_BASEMAP || useAppStore.getState().basemapStyleUrl !== DEFAULT_BASEMAP) {
    return false;
  }
  applyBasemap(url, { quiet: true });
  const temporal = useAppStore.temporal;
  const swap = <T extends { basemapStyleUrl?: string }>(states: T[]) =>
    states.map((state) =>
      state.basemapStyleUrl === DEFAULT_BASEMAP ? { ...state, basemapStyleUrl: url } : state,
    );
  const { pastStates, futureStates } = temporal.getState();
  if (pastStates.length > 0 || futureStates.length > 0) {
    temporal.setState({ pastStates: swap(pastStates), futureStates: swap(futureStates) });
  }
  return true;
}
