import {
  BLANK_BASEMAP,
  DEFAULT_BASEMAP,
  getPlanetaryBasemapByStyleUrl,
  getRegionalBasemapByStyleUrl,
  OPENFREEMAP_BASEMAPS,
  PROTOMAPS_BASEMAPS,
} from "@geolibre/core";

// SWIFTMAP (Change 28): Swiftmap's basemaps. Each is a `geolibre://` sentinel
// that GeoLibre's resolveMapStyle expands from its offline-style registry,
// where basemap-registry.ts puts the style built by basemap-styles.ts. Labels
// off is part of the sentinel, because GeoLibre re-shows every basemap layer on
// each layer sync: a basemap without labels has to be a style without them.

/**
 * GeoLibre's `OFFLINE_BASEMAP_SENTINEL_PREFIX`, written out so this module
 * doesn't load the map package (a test checks they match).
 */
export const OFFLINE_SENTINEL_PREFIX = "geolibre://offline-basemap/";

/** Every Swiftmap basemap sentinel starts with this. */
export const SWIFTMAP_BASEMAP_PREFIX = `${OFFLINE_SENTINEL_PREFIX}swiftmap/`;

/** Protomaps flavours Swiftmap can build (only light, grayscale and dark are listed). */
export const SWIFTMAP_PROTOMAPS_FLAVORS = ["light", "grayscale", "dark", "white", "black"] as const;
export type SwiftmapProtomapsFlavor = (typeof SWIFTMAP_PROTOMAPS_FLAVORS)[number];

export type SwiftmapBasemap =
  | { kind: "protomaps"; flavor: SwiftmapProtomapsFlavor; labels: boolean }
  | { kind: "aerial"; labels: boolean }
  | { kind: "tiles"; tileUrl: string; scheme: "xyz" | "tms" };

/** The picker's rows, in order. `liberty` is listed only without a Protomaps key. */
export type BasemapChoiceId = "light" | "grey" | "dark" | "aerial" | "none" | "liberty";

const CHOICE_FLAVOR = { light: "light", grey: "grayscale", dark: "dark" } as const;

function isFlavor(value: string): value is SwiftmapProtomapsFlavor {
  return (SWIFTMAP_PROTOMAPS_FLAVORS as readonly string[]).includes(value);
}

/** The sentinel for a Swiftmap basemap. Labels on is the default and adds nothing. */
export function swiftmapBasemapUrl(basemap: SwiftmapBasemap): string {
  if (basemap.kind === "tiles") {
    const params = new URLSearchParams({ url: basemap.tileUrl });
    if (basemap.scheme === "tms") params.set("scheme", "tms");
    return `${SWIFTMAP_BASEMAP_PREFIX}tiles?${params.toString()}`;
  }
  const name = basemap.kind === "aerial" ? "aerial" : basemap.flavor;
  return `${SWIFTMAP_BASEMAP_PREFIX}${name}${basemap.labels ? "" : "?labels=off"}`;
}

/** Reads a Swiftmap sentinel back, or null for anything else. */
export function parseSwiftmapBasemap(url: string | undefined): SwiftmapBasemap | null {
  if (!url?.startsWith(SWIFTMAP_BASEMAP_PREFIX)) return null;
  const rest = url.slice(SWIFTMAP_BASEMAP_PREFIX.length);
  const queryAt = rest.indexOf("?");
  const name = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? "" : rest.slice(queryAt + 1));
  const labels = params.get("labels") !== "off";
  if (name === "aerial") return { kind: "aerial", labels };
  if (isFlavor(name)) return { kind: "protomaps", flavor: name, labels };
  if (name === "tiles") {
    const tileUrl = params.get("url");
    if (!tileUrl) return null;
    return { kind: "tiles", tileUrl, scheme: params.get("scheme") === "tms" ? "tms" : "xyz" };
  }
  return null;
}

/** The flavour of a hosted Protomaps style URL (GeoLibre's presets, Change 23's old default). */
export function hostedProtomapsFlavor(url: string | undefined): SwiftmapProtomapsFlavor | null {
  const match = url?.match(/^https:\/\/api\.protomaps\.com\/styles\/v\d+\/([a-z]+)\//);
  return match && isFlavor(match[1]) ? match[1] : null;
}

/** Which picker row the basemap is, or null for a custom or legacy basemap. */
export function currentChoice(url: string): BasemapChoiceId | null {
  if (url === BLANK_BASEMAP) return "none";
  if (url === DEFAULT_BASEMAP) return "liberty";
  const parsed = parseSwiftmapBasemap(url);
  if (parsed?.kind === "aerial") return "aerial";
  const flavor = parsed?.kind === "protomaps" ? parsed.flavor : hostedProtomapsFlavor(url);
  if (flavor === "light") return "light";
  if (flavor === "grayscale") return "grey";
  if (flavor === "dark") return "dark";
  return null;
}

/** The rows the picker lists: Protomaps' three need a key, Liberty stands in without one. */
export function pickerChoices(hasProtomapsKey: boolean): BasemapChoiceId[] {
  return hasProtomapsKey
    ? ["light", "grey", "dark", "aerial", "none"]
    : ["liberty", "aerial", "none"];
}

/** Whether Show labels can act on this basemap, and whether its labels are on. */
export function labelsState(
  url: string,
  hasProtomapsKey: boolean,
): { available: boolean; on: boolean } {
  const parsed = parseSwiftmapBasemap(url);
  if (parsed?.kind === "protomaps") return { available: hasProtomapsKey, on: parsed.labels };
  if (parsed?.kind === "aerial") return { available: hasProtomapsKey, on: parsed.labels };
  if (hostedProtomapsFlavor(url)) return { available: hasProtomapsKey, on: true };
  return { available: false, on: false };
}

/** The same basemap with labels on or off; unchanged where labels can't be switched. */
export function withLabels(url: string, on: boolean): string {
  const parsed = parseSwiftmapBasemap(url);
  if (parsed?.kind === "protomaps" || parsed?.kind === "aerial") {
    return swiftmapBasemapUrl({ ...parsed, labels: on });
  }
  const flavor = hostedProtomapsFlavor(url);
  if (flavor) return swiftmapBasemapUrl({ kind: "protomaps", flavor, labels: on });
  return url;
}

/** The URL a picker row applies, carrying the current Show labels setting over. */
export function choiceUrl(choice: BasemapChoiceId, labels: boolean): string {
  if (choice === "none") return BLANK_BASEMAP;
  if (choice === "liberty") return DEFAULT_BASEMAP;
  if (choice === "aerial") return swiftmapBasemapUrl({ kind: "aerial", labels });
  return swiftmapBasemapUrl({ kind: "protomaps", flavor: CHOICE_FLAVOR[choice], labels });
}

/** A link's service name: an ArcGIS service's own name, otherwise the host. */
function serviceName(link: string): string {
  try {
    const url = new URL(link);
    const segments = url.pathname.split("/").filter(Boolean);
    const server = segments.findIndex((segment) => /^(Map|Image)Server$/i.test(segment));
    if (server > 0) return decodeURIComponent(segments[server - 1]);
    return url.hostname;
  } catch {
    return link;
  }
}

/**
 * The name the card shows for a basemap that isn't a picker row: GeoLibre's
 * preset names, the service name of a link, or null when only a generic label
 * fits (an offline extract), which the caller translates.
 */
export function legacyBasemapName(url: string): string | null {
  // Named with the provider, so OpenFreeMap's "Dark" isn't read as Swiftmap's.
  const openFreeMap = OPENFREEMAP_BASEMAPS.find((basemap) => basemap.styleUrl === url);
  if (openFreeMap) return `${openFreeMap.name} (OpenFreeMap)`;
  const parsed = parseSwiftmapBasemap(url);
  if (parsed?.kind === "tiles") return serviceName(parsed.tileUrl);
  const flavor = parsed?.kind === "protomaps" ? parsed.flavor : hostedProtomapsFlavor(url);
  if (flavor) return PROTOMAPS_BASEMAPS.find((basemap) => basemap.flavor === flavor)?.name ?? null;
  const planetary = getPlanetaryBasemapByStyleUrl(url);
  if (planetary) return planetary.name;
  const regional = getRegionalBasemapByStyleUrl(url);
  if (regional) return regional.name;
  if (url.startsWith("geolibre://")) return null;
  return serviceName(url);
}

/**
 * Reads a "Use a tile link…" entry: an XYZ template (`{-y}` for TMS), an
 * ArcGIS MapServer link, or a MapLibre style JSON link. Null when it is none.
 */
export function parseTileLink(input: string): string | null {
  const text = input.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (/\{z\}/.test(text) && /\{x\}/.test(text) && /\{-?y\}/.test(text)) {
    const tms = text.includes("{-y}");
    return swiftmapBasemapUrl({
      kind: "tiles",
      tileUrl: text.replace("{-y}", "{y}"),
      scheme: tms ? "tms" : "xyz",
    });
  }
  if (/\/MapServer\/?$/i.test(url.pathname)) {
    const base = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
    return swiftmapBasemapUrl({
      kind: "tiles",
      tileUrl: `${base}/tile/{z}/{y}/{x}${url.search}`,
      scheme: "xyz",
    });
  }
  if (/\.json$/i.test(url.pathname)) return text;
  return null;
}

/** The link to prefill "Use a tile link…" with, for the basemap in use. */
export function tileLinkOf(url: string): string | null {
  const parsed = parseSwiftmapBasemap(url);
  if (parsed?.kind === "tiles") {
    return parsed.scheme === "tms" ? parsed.tileUrl.replace("{y}", "{-y}") : parsed.tileUrl;
  }
  if (/^https?:\/\//.test(url) && currentChoice(url) === null && !legacyPreset(url)) return url;
  return null;
}

function legacyPreset(url: string): boolean {
  return OPENFREEMAP_BASEMAPS.some((basemap) => basemap.styleUrl === url);
}
