import { layers, namedFlavor } from "@protomaps/basemaps";
import type * as maplibregl from "maplibre-gl";
import type { SwiftmapBasemap } from "./basemap-catalog";

// SWIFTMAP (Change 28): builds the MapLibre style for each Swiftmap basemap.
// The Protomaps flavours match Protomaps' hosted style (the same
// @protomaps/basemaps version, tiles, glyphs and sprites), minus the label
// layers when labels are off. Map style constants are the one place app code
// may hold colours.

const PROTOMAPS_ASSETS = "https://protomaps.github.io/basemaps-assets";
const PROTOMAPS_ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>';

/** NSW Imagery Basemap (NSW DCS Spatial Services), no key. */
export const NSW_IMAGERY_TILES =
  "https://portal.spatial.nsw.gov.au/aid/tile/rest/services/NSWWebImagery/MapServer/tile/{z}/{y}/{x}";
export const NSW_IMAGERY_ATTRIBUTION =
  "© NSW DCS Spatial Services, SPOT Image (Geoimage GeoHD) © Airbus DS 2025, provided by DCCEEW";
/** The service's full extent (west, south, east, north), so no tiles are asked for outside it. */
const NSW_IMAGERY_BOUNDS: [number, number, number, number] = [140.86, -37.51, 159.34, -28.03];

/** Behind imagery and tile links: a neutral grey reads as "no imagery here". */
const RASTER_BACKGROUND = "#d4d4d4";

function protomapsSource(key: string): maplibregl.VectorSourceSpecification {
  return {
    type: "vector",
    tiles: [`https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=${encodeURIComponent(key)}`],
    maxzoom: 15,
    attribution: PROTOMAPS_ATTRIBUTION,
  };
}

/**
 * Protomaps' labels recoloured for imagery: white text on a dark halo, as
 * hybrid maps draw them. Each flavour's own label colours are tuned for its
 * own ground colour and read poorly over photos.
 */
function aerialLabelLayers(): maplibregl.LayerSpecification[] {
  return (
    layers("protomaps", namedFlavor("dark"), {
      labelsOnly: true,
      lang: "en",
    }) as maplibregl.LayerSpecification[]
  ).map((layer) =>
    layer.type === "symbol"
      ? {
          ...layer,
          paint: {
            ...layer.paint,
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0, 0, 0, 0.8)",
            "text-halo-width": 1.5,
          },
        }
      : layer,
  );
}

function background(color: string): maplibregl.LayerSpecification {
  return {
    id: "swiftmap-basemap-background",
    type: "background",
    paint: { "background-color": color },
  };
}

/**
 * The style for a Swiftmap basemap, or null when it can't be built (a
 * Protomaps flavour without a key). Aerial without a key has no labels.
 */
export function buildSwiftmapBasemapStyle(
  basemap: SwiftmapBasemap,
  protomapsKey: string | undefined,
): maplibregl.StyleSpecification | null {
  if (basemap.kind === "protomaps") {
    if (!protomapsKey) return null;
    return {
      version: 8,
      glyphs: `${PROTOMAPS_ASSETS}/fonts/{fontstack}/{range}.pbf`,
      sprite: `${PROTOMAPS_ASSETS}/sprites/v4/${basemap.flavor}`,
      sources: { protomaps: protomapsSource(protomapsKey) },
      layers: layers(
        "protomaps",
        namedFlavor(basemap.flavor),
        basemap.labels ? { lang: "en" } : undefined,
      ) as maplibregl.LayerSpecification[],
    };
  }

  if (basemap.kind === "aerial") {
    const labels = basemap.labels && protomapsKey;
    return {
      version: 8,
      ...(labels
        ? {
            glyphs: `${PROTOMAPS_ASSETS}/fonts/{fontstack}/{range}.pbf`,
            // The dark flavour's icons; the label text is recoloured below.
            sprite: `${PROTOMAPS_ASSETS}/sprites/v4/dark`,
          }
        : {}),
      sources: {
        "swiftmap-aerial": {
          type: "raster",
          tiles: [NSW_IMAGERY_TILES],
          tileSize: 256,
          maxzoom: 20,
          bounds: NSW_IMAGERY_BOUNDS,
          attribution: NSW_IMAGERY_ATTRIBUTION,
        },
        ...(labels ? { protomaps: protomapsSource(protomapsKey) } : {}),
      },
      layers: [
        background(RASTER_BACKGROUND),
        { id: "swiftmap-aerial", type: "raster", source: "swiftmap-aerial" },
        ...(labels ? aerialLabelLayers() : []),
      ],
    };
  }

  return {
    version: 8,
    sources: {
      "swiftmap-tiles": {
        type: "raster",
        tiles: [basemap.tileUrl],
        tileSize: 256,
        scheme: basemap.scheme,
      },
    },
    layers: [
      background(RASTER_BACKGROUND),
      { id: "swiftmap-tiles", type: "raster", source: "swiftmap-tiles" },
    ],
  };
}
