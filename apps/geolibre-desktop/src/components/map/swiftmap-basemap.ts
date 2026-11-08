import { DEFAULT_BASEMAP, getProtomapsApiKey, useAppStore } from "@geolibre/core";
import { readLastBasemap, writeLastBasemap } from "../../lib/last-basemap";
import { swiftmapBasemapUrl } from "../basemap/basemap-catalog";

/**
 * SWIFTMAP (Change 23): Protomaps Light is the default basemap for new maps
 * when a Protomaps key is available (build-time or runtime
 * `VITE_PROTOMAPS_API_KEY`); without one, GeoLibre's default (OpenFreeMap
 * Liberty) stays. GeoLibre's `DEFAULT_BASEMAP` is left alone. Since Change 28
 * the default is Swiftmap's own Light basemap (a sentinel, built locally and
 * carrying no key), not Protomaps' hosted style URL.
 */

/** Set once the default has been applied, so later basemap choices are kept. */
export const SWIFTMAP_DEFAULT_BASEMAP_FLAG = "swiftmap.defaultBasemap.v1";

type Env = Record<string, string | undefined>;

/** Swiftmap's Light basemap, the default with a Protomaps key. */
const SWIFTMAP_LIGHT = swiftmapBasemapUrl({ kind: "protomaps", flavor: "light", labels: true });

/** The style URL a new map starts with. */
export function swiftmapDefaultBasemapUrl(env?: Env): string {
  return getProtomapsApiKey(env) ? SWIFTMAP_LIGHT : DEFAULT_BASEMAP;
}

function storageOf(storage?: Storage): Storage | null {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function flagSet(storage: Storage | null): boolean {
  try {
    return storage?.getItem(SWIFTMAP_DEFAULT_BASEMAP_FLAG) === "1";
  } catch {
    return false;
  }
}

function setFlag(storage: Storage | null): void {
  try {
    storage?.setItem(SWIFTMAP_DEFAULT_BASEMAP_FLAG, "1");
  } catch {
    // Best-effort, like GeoLibre's own last-basemap storage.
  }
}

/**
 * Switch an untouched startup map from Liberty to Protomaps Light.
 *
 * GeoLibre remembers the last basemap and restores it at startup, so anyone who
 * used the app before has Liberty remembered only because it was the default.
 * That remembered Liberty is upgraded once; the flag then keeps every later
 * choice, Liberty included. A remembered non-default basemap is a choice and is
 * kept. Nothing changes once a project is opened or created, or without a key.
 *
 * @returns Whether the basemap was switched.
 */
export function applySwiftmapDefaultBasemap(options: { env?: Env; storage?: Storage } = {}): boolean {
  if (!getProtomapsApiKey(options.env)) return false;
  const styleUrl = SWIFTMAP_LIGHT;
  const storage = storageOf(options.storage);
  if (flagSet(storage)) return false;

  const remembered = storage ? readLastBasemap(storage) : null;
  if (remembered !== null && remembered !== DEFAULT_BASEMAP) {
    setFlag(storage);
    return false;
  }

  const state = useAppStore.getState();
  const untouched =
    state.projectGeneration === 0 &&
    state.projectPath === null &&
    !state.isDirty &&
    state.layers.length === 0 &&
    state.basemapStyleUrl === DEFAULT_BASEMAP;
  if (!untouched) return false;

  useAppStore.setState({ basemapStyleUrl: styleUrl });
  if (storage) writeLastBasemap(styleUrl, storage);
  setFlag(storage);
  return true;
}
