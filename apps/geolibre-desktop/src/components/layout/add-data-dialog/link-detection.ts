/**
 * SWIFTMAP (Change 24): works out what a pasted URL points at, for the Add Data
 * dialog's From a link tab. Pure, so it runs under the unit tests.
 */

/** Every link type the From a link tab can add. */
export type LinkKind =
  | "xyz"
  | "arcgis"
  | "wmts"
  | "wfs"
  | "wms"
  | "stac"
  | "ogc-features"
  | "pmtiles"
  | "cog"
  | "geoparquet"
  | "flatgeobuf"
  | "geojson"
  | "kml";

export interface DetectedLink {
  kind: LinkKind;
}

/** The order "Choose it manually" lists the types in. */
export const LINK_KINDS: readonly LinkKind[] = [
  "arcgis",
  "wms",
  "wmts",
  "wfs",
  "ogc-features",
  "xyz",
  "stac",
  "pmtiles",
  "cog",
  "geoparquet",
  "flatgeobuf",
  "geojson",
  "kml",
];

/** The `service=` query parameter of an OGC URL, lower-cased, or "". */
function ogcServiceParam(url: URL): string {
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === "service") return value.toLowerCase();
  }
  return "";
}

/**
 * Detect the link type of a URL as the user types it.
 *
 * @param input - The text in the URL field.
 * @returns null for an empty field, `"unknown"` for text that isn't a
 *   recognisable http(s) link, or the detected type.
 */
export function detectLink(input: string): DetectedLink | "unknown" | null {
  const text = input.trim();
  if (!text) return null;
  // A tile template isn't a valid URL until its placeholders are filled in.
  if (/\{z\}/i.test(text) && /\{x\}/i.test(text) && /\{y\}/i.test(text)) {
    return /^https?:\/\//i.test(text) ? { kind: "xyz" } : "unknown";
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "unknown";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "unknown";

  const path = url.pathname.toLowerCase();
  const service = ogcServiceParam(url);

  // A service named in the query string wins over anything in the path.
  if (service === "wmts") return { kind: "wmts" };
  if (service === "wfs") return { kind: "wfs" };
  if (service === "wms") return { kind: "wms" };

  if (/\/rest\/services\//.test(path) && /\/(mapserver|featureserver|imageserver)(\/|$)/.test(path))
    return { kind: "arcgis" };
  if (/\.pmtiles$/.test(path)) return { kind: "pmtiles" };
  if (/\.(tif|tiff|cog)$/.test(path)) return { kind: "cog" };
  if (/\.(parquet|geoparquet)$/.test(path)) return { kind: "geoparquet" };
  if (/\.fgb$/.test(path)) return { kind: "flatgeobuf" };
  if (/\.(geojson|json)$/.test(path) && !/\/stac(\/|$)/.test(path)) return { kind: "geojson" };
  if (/\.(kml|kmz)$/.test(path)) return { kind: "kml" };
  if (/wmts/.test(path)) return { kind: "wmts" };
  if (/(^|[/_.-])wfs([/_.-]|$)/.test(path)) return { kind: "wfs" };
  if (/(^|[/_.-])wms([/_.-]|$)/.test(path)) return { kind: "wms" };
  if (/(^|\/)stac(\/|$)/.test(path) || /(^|[.-])stac[.-]/.test(url.hostname))
    return { kind: "stac" };
  if (/\/collections(\/|$)/.test(path)) return { kind: "ogc-features" };
  return "unknown";
}
