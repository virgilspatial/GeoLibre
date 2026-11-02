import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TFunction } from "i18next";
import en from "../apps/geolibre-desktop/src/i18n/locales/en.json" with { type: "json" };
import { geojsonLayer } from "./helpers/layer-fixtures";
import { layerPropertyRows } from "../apps/geolibre-desktop/src/components/panels/layer-panel/layer-properties";

// SWIFTMAP: the Layers panel's Properties card (Change 17).
const t = ((key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      en,
    )) as unknown as TFunction;

const rows = (...args: Parameters<typeof layerPropertyRows>) =>
  Object.fromEntries(layerPropertyRows(...args).map((row) => [row.label, row.value]));

describe("layerPropertyRows", () => {
  it("names a local file, its format, the feature count and WGS 84", () => {
    const layer = geojsonLayer({
      sourcePath: "C:\\data\\Heritage items.gpkg",
      geojson: {
        type: "FeatureCollection",
        features: Array.from({ length: 1204 }, () => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [151, -33] },
          properties: {},
        })),
      },
    });
    assert.deepEqual(rows(layer, t, "en"), {
      Source: "Heritage items.gpkg",
      Format: "GeoPackage",
      Features: "1,204",
      CRS: "WGS 84 (EPSG:4326)",
    });
  });

  it("never shows a server address", () => {
    const layer = geojsonLayer({
      type: "wms",
      geojson: undefined,
      source: { type: "raster", url: "https://secret.example.com/wms?token=abc" },
    });
    const values = layerPropertyRows(layer, t, "en").map((row) => row.value);
    assert.equal(values.some((value) => value.includes("example.com")), false);
    assert.equal(rows(layer, t, "en").Source, "Web map service");
    assert.equal(rows(layer, t, "en").Format, "WMS");
  });

  it("says a layer with no source was created in the map, and leaves out unknown rows", () => {
    const layer = geojsonLayer({ type: "image", geojson: undefined });
    assert.deepEqual(rows(layer, t, "en"), { Source: "Created in this map", Format: "Image" });
  });

  it("uses the raster header for CRS, without repeating the code", () => {
    const layer = geojsonLayer({ type: "cog", geojson: undefined });
    const info = { crs: "EPSG:28356", epsg: 28356 } as Parameters<typeof layerPropertyRows>[3];
    assert.equal(rows(layer, t, "en", info).CRS, "EPSG:28356");
    assert.equal(rows(layer, t, "en", "loading").CRS, "Reading…");
  });

  it("shows when a connected layer last updated", () => {
    const layer = geojsonLayer({
      connection: {
        layerId: "layer-a",
        lastSyncedAt: "2026-11-02T03:04:00Z",
      } as unknown as NonNullable<Parameters<typeof layerPropertyRows>[0]["connection"]>,
    });
    assert.match(rows(layer, t, "en").Updated ?? "", /2026/);
  });
});
