import { getProtomapsApiKey, useAppStore } from "@geolibre/core";
import type * as maplibregl from "maplibre-gl";
import { parseSwiftmapBasemap } from "./basemap-catalog";
import { buildSwiftmapBasemapStyle } from "./basemap-styles";

// SWIFTMAP (Change 28): puts the style for a Swiftmap basemap sentinel into
// GeoLibre's offline-style registry, which resolveMapStyle reads. GeoLibre's
// own registerOfflineBasemapStyle can't be used: it adds a counter to the
// sentinel, so a saved project's basemap wouldn't resolve after a reload. The
// registry's key is internal to packages/map (protomaps-basemap.ts);
// tests/swiftmap-basemap-catalog.test.ts reads an entry back through the
// public getOfflineBasemapStyle, so a rename upstream fails a test instead of
// quietly turning every Swiftmap basemap into Liberty.

const REGISTRY_KEY = "__geolibreOfflineBasemapStyles";

function registry(): Map<string, maplibregl.StyleSpecification> {
  const scope = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: Map<string, maplibregl.StyleSpecification>;
  };
  if (!scope[REGISTRY_KEY]) scope[REGISTRY_KEY] = new Map();
  return scope[REGISTRY_KEY];
}

/** The registered style for a Swiftmap sentinel, or null. */
export function registeredSwiftmapStyle(
  url: string | undefined,
): maplibregl.StyleSpecification | null {
  if (!url || !parseSwiftmapBasemap(url)) return null;
  return registry().get(url) ?? null;
}

/**
 * Registers the style for `url` when it is a Swiftmap sentinel that can be
 * built. Without a Protomaps key the Protomaps flavours aren't registered, so
 * GeoLibre falls back to its default basemap (Liberty), as Change 23 does.
 *
 * @returns Whether a style was registered.
 */
export function ensureSwiftmapBasemap(
  url: string | undefined,
  env?: Record<string, string | undefined>,
): boolean {
  const basemap = parseSwiftmapBasemap(url);
  if (!url || !basemap) return false;
  const style = buildSwiftmapBasemapStyle(basemap, getProtomapsApiKey(env));
  if (!style) {
    registry().delete(url);
    return false;
  }
  registry().set(url, style);
  return true;
}

/**
 * Keeps the active basemap's style registered from now on. Store listeners run
 * inside `setState`, before React re-renders and the map applies the new
 * basemap, so the style is always there when the map asks for it. Call once,
 * before the first render.
 */
export function installSwiftmapBasemaps(): () => void {
  ensureSwiftmapBasemap(useAppStore.getState().basemapStyleUrl);
  const unsubscribe = useAppStore.subscribe((next, previous) => {
    if (next.basemapStyleUrl !== previous.basemapStyleUrl) {
      ensureSwiftmapBasemap(next.basemapStyleUrl);
    }
  });
  // A key set later in Settings → Environment variables reaches the next pick.
  const onEnvChange = () => ensureSwiftmapBasemap(useAppStore.getState().basemapStyleUrl);
  window.addEventListener("geolibre:runtime-env-change", onEnvChange);
  return () => {
    unsubscribe();
    window.removeEventListener("geolibre:runtime-env-change", onEnvChange);
  };
}
