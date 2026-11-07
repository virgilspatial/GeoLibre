import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layerTypeForUrl } from "../apps/geolibre-desktop/src/components/layout/add-data-dialog/arcgis-layer-type";
import { detectLink } from "../apps/geolibre-desktop/src/components/layout/add-data-dialog/link-detection";
import {
  fileExtension,
  formatFileSize,
  summariseGeoJson,
  uploadAccept,
  uploadFormatFor,
} from "../apps/geolibre-desktop/src/components/layout/add-data-dialog/upload-formats";

// SWIFTMAP (Change 24): the Add Data dialog's link and file detection.

const kindOf = (url: string) => {
  const result = detectLink(url);
  return result && result !== "unknown" ? result.kind : result;
};

describe("Add Data link detection", () => {
  it("is null for an empty field and unknown for text that isn't a link", () => {
    assert.equal(detectLink(""), null);
    assert.equal(detectLink("   "), null);
    assert.equal(detectLink("parcels"), "unknown");
    assert.equal(detectLink("ftp://example.com/data.geojson"), "unknown");
    assert.equal(detectLink("https://data.example.com/services/parcels"), "unknown");
  });

  it("detects the dialog's example links", () => {
    assert.equal(
      kindOf("https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer"),
      "arcgis",
    );
    assert.equal(
      kindOf("https://services.ga.gov.au/gis/rest/services/NationalBaseMap/MapServer/tile/{z}/{y}/{x}"),
      "xyz",
    );
    assert.equal(kindOf("https://explorer.dea.ga.gov.au/stac"), "stac");
    assert.equal(
      kindOf(
        "https://dea-public-data.s3.ap-southeast-2.amazonaws.com/derivative/ga_ls_wo_fq_cyear_3/2-0-0/x64/y32/2020--P1Y/ga_ls_wo_fq_cyear_3_x64y32_2020--P1Y_final_frequency.tif",
      ),
      "cog",
    );
  });

  it("reads OGC services from the query string before the path", () => {
    assert.equal(kindOf("https://example.com/geoserver/ows?service=WMS&request=GetCapabilities"), "wms");
    assert.equal(kindOf("https://example.com/geoserver/ows?SERVICE=wfs"), "wfs");
    assert.equal(kindOf("https://example.com/maps/wms?service=WMTS"), "wmts");
    assert.equal(kindOf("https://example.com/geoserver/wms"), "wms");
    assert.equal(kindOf("https://example.com/geoserver/gwc/service/wmts"), "wmts");
  });

  it("detects ArcGIS map, feature and image services", () => {
    assert.equal(kindOf("https://host/arcgis/rest/services/Roads/FeatureServer/0"), "arcgis");
    assert.equal(kindOf("https://host/server/rest/services/Imagery/ImageServer"), "arcgis");
  });

  it("detects cloud files by their extension", () => {
    assert.equal(kindOf("https://host/a/parcels.pmtiles"), "pmtiles");
    assert.equal(kindOf("https://host/a/dem.TIF"), "cog");
    assert.equal(kindOf("https://host/a/buildings.parquet"), "geoparquet");
    assert.equal(kindOf("https://host/a/roads.fgb"), "flatgeobuf");
    assert.equal(kindOf("https://host/a/sites.geojson?download=1"), "geojson");
    assert.equal(kindOf("https://host/a/sites.kmz"), "kml");
  });

  it("detects OGC API - Features collections", () => {
    assert.equal(kindOf("https://ogc.a11y.test/collections/cities"), "ogc-features");
  });

  it("keeps a STAC item's JSON as STAC, not GeoJSON", () => {
    assert.equal(kindOf("https://host/stac/collections/s2/items/abc.json"), "stac");
  });
});

describe("Add Data upload formats", () => {
  it("knows the confirmed formats and nothing else", () => {
    assert.equal(uploadFormatFor("site.GeoJSON")?.label, "GeoJSON");
    assert.equal(uploadFormatFor("sites.zip")?.label, "Shapefile (.zip)");
    assert.equal(uploadFormatFor("assets.gpkg")?.family, "vector");
    assert.equal(uploadFormatFor("dem.tif")?.family, "raster");
    assert.equal(uploadFormatFor("scan.laz")?.family, "pointCloud");
    assert.equal(uploadFormatFor("quay.JPG")?.label, "Geotagged photos (.jpg)");
    assert.equal(uploadFormatFor("quay.jpeg")?.geometry, "Point");
    // Not confirmed in the browser build (Change 24): DWG never loads, and a
    // projected DXF draws nothing without the CAD form's coordinate system.
    assert.equal(uploadFormatFor("plan.dwg"), null);
    assert.equal(uploadFormatFor("plan.dxf"), null);
    assert.equal(uploadFormatFor("notes.txt"), null);
    assert.equal(uploadFormatFor("README"), null);
  });

  it("limits a viewer's file picker to the viewer formats", () => {
    assert.equal(uploadAccept(true), ".geojson,.json,.zip,.kml,.kmz,.gpx,.csv");
    assert.ok(uploadAccept(false).includes(".gpkg"));
  });

  it("reads extensions and sizes for the file card", () => {
    assert.equal(fileExtension("a.b.KML"), "kml");
    assert.equal(fileExtension(".hidden"), "");
    assert.equal(formatFileSize(512), "512 B");
    assert.equal(formatFileSize(48 * 1024), "48 KB");
    assert.equal(formatFileSize(1.1 * 1024 * 1024), "1.1 MB");
    assert.equal(formatFileSize(25 * 1024 * 1024), "25 MB");
  });

  it("summarises GeoJSON for the card", () => {
    const polygon = { type: "Polygon", coordinates: [] };
    assert.deepEqual(
      summariseGeoJson(
        JSON.stringify({
          type: "FeatureCollection",
          features: [1, 2, 3].map(() => ({ type: "Feature", geometry: polygon, properties: {} })),
        }),
      ),
      { featureCount: 3, geometry: "Polygon" },
    );
    assert.deepEqual(
      summariseGeoJson(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } },
            { type: "Feature", geometry: { type: "MultiLineString", coordinates: [] } },
          ],
        }),
      ),
      { featureCount: 2, geometry: "Mixed" },
    );
    assert.deepEqual(summariseGeoJson(JSON.stringify({ type: "Feature", geometry: null })), {
      featureCount: 1,
      geometry: null,
    });
    assert.equal(summariseGeoJson("not json"), null);
    assert.equal(summariseGeoJson(JSON.stringify({ type: "Topology" })), null);
  });
});

describe("Add Data ArcGIS layer type", () => {
  it("opens GeoLibre's ArcGIS form on the type the URL names", () => {
    assert.equal(
      layerTypeForUrl("https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer"),
      "map-service",
    );
    assert.equal(layerTypeForUrl("https://host/rest/services/Roads/MapServer/"), "map-service");
    assert.equal(layerTypeForUrl("https://host/rest/services/Roads/MapServer/3"), "feature");
    assert.equal(layerTypeForUrl("https://host/rest/services/Roads/FeatureServer/0"), "feature");
    assert.equal(layerTypeForUrl("https://host/rest/services/Dem/ImageServer?f=json"), "image-service");
    assert.equal(
      layerTypeForUrl("https://host/rest/services/Hosted/Base/VectorTileServer"),
      "vector-tile",
    );
    assert.equal(layerTypeForUrl(""), "feature");
  });
});
