import { DEFAULT_BASEMAP, getProtomapsApiKey, useAppStore } from "@geolibre/core";
import { namedFlavor } from "@protomaps/basemaps";
import { useEffect, useState } from "react";
import { useAutoFlavor, type AutoFlavor } from "../../basemap/auto-flavor";
import { hostedProtomapsFlavor, parseSwiftmapBasemap } from "../../basemap/basemap-catalog";

// SWIFTMAP (Change 33): the colour polygon swatches are drawn over, so a
// see-through fill or outline blends with the basemap's land as it does on
// the map, not with the panel. Aerial, tile links, custom styles and None
// keep the panel (null): they have no single land colour.

/** OpenFreeMap Liberty's `background` layer, which is its land colour. */
export const LIBERTY_LAND = "#f8f4f0";

/**
 * The land colour of the basemap drawn for `url`, or null to keep the panel.
 * A Protomaps flavour (or Auto) without a key draws Liberty.
 */
export function basemapLandColor(url: string, hasKey: boolean, flavor: AutoFlavor): string | null {
  if (url === DEFAULT_BASEMAP) return LIBERTY_LAND;
  const parsed = parseSwiftmapBasemap(url);
  const protomaps =
    parsed?.kind === "protomaps"
      ? parsed.flavor
      : parsed?.kind === "auto"
        ? flavor
        : parsed
          ? null
          : hostedProtomapsFlavor(url);
  if (!protomaps) return null;
  return hasKey ? namedFlavor(protomaps).earth : LIBERTY_LAND;
}

/** The land colour behind polygon swatches, following the basemap, key and theme. */
export function useLegendBacking(): string | null {
  const url = useAppStore((state) => state.basemapStyleUrl);
  const flavor = useAutoFlavor();
  const [hasKey, setHasKey] = useState(() => Boolean(getProtomapsApiKey()));
  useEffect(() => {
    const refresh = () => setHasKey(Boolean(getProtomapsApiKey()));
    window.addEventListener("geolibre:runtime-env-change", refresh);
    return () => window.removeEventListener("geolibre:runtime-env-change", refresh);
  }, []);
  return basemapLandColor(url, hasKey, flavor);
}
