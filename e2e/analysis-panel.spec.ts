import { expect, test } from "./test";
import {
  dropGeoJson,
  layerRow,
  openLayerActions,
  railButton,
  readFixture,
  waitForMap,
} from "./helpers";

// SWIFTMAP (Change 37): the Analysis panel and Buffer, run in the real worker.
// Hermetic: the input is the local smoke fixture (three US cities), which
// measures in UTM 14N and reaches far outside it, so the 1° warning shows.
// Clip, Intersect and Dissolve since Change 43, on small layers near Sydney.

test("runs Buffer in a worker and adds the result with its origin", async ({ page }) => {
  await waitForMap(page);
  await dropGeoJson(page, "smoke", readFixture("smoke.geojson"));

  await railButton(page, "Analysis").click();
  const panel = page.getByTestId("analysis-panel");
  await expect(panel.getByRole("heading", { name: "Analysis" })).toBeVisible();
  await expect(panel.getByPlaceholder("Search analysis tools…")).toBeVisible();
  await expect(panel.getByTestId("analysis-tool-areaByZone")).toBeDisabled();
  await expect(panel.getByTestId("analysis-tool-areaByZone")).toContainText("Coming soon");

  await panel.getByTestId("analysis-tool-buffer").click();
  await expect(panel.getByRole("heading", { name: "Buffer" })).toBeVisible();
  await expect(panel.getByTestId("buffer-name")).toHaveValue("smoke buffer 100 m");
  await expect(panel.getByTestId("analysis-status")).toContainText(
    "reaches more than 1° outside UTM 14N",
  );
  await panel.getByTestId("buffer-distance").fill("5");
  await panel.getByTestId("buffer-unit").selectOption("km");
  await panel.getByTestId("buffer-run").click();
  await expect(panel.getByTestId("analysis-result")).toContainText(
    "3 features added as “smoke buffer 5 km”.",
  );

  // Show in Layers selects the result, at the top, and Properties shows its origin.
  await panel.getByTestId("analysis-show-in-layers").click();
  const rows = page.getByTestId("layer-row");
  await expect(rows.first()).toHaveAttribute("data-layer-name", "smoke buffer 5 km");
  await openLayerActions(page, "smoke buffer 5 km");
  await page.getByRole("menuitem", { name: /^Properties/ }).click();
  const row = layerRow(page, "smoke buffer 5 km");
  await expect(row.getByText("Created with", { exact: true })).toBeVisible();
  await expect(row.getByText("5 km", { exact: true })).toBeVisible();
  await expect(row.getByText("WGS 84 / UTM zone 14N (EPSG:32614)", { exact: true })).toBeVisible();

  // Recent lists Buffer after the run.
  await railButton(page, "Analysis").click();
  await panel.getByTestId("analysis-back").click();
  await expect(panel.getByTestId("analysis-recent")).toContainText("Buffer");
});

const square = (west: number, properties: Record<string, unknown>, size = 0.05) => ({
  type: "Feature",
  properties,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [west, -34],
        [west + size, -34],
        [west + size, -34 + size],
        [west, -34 + size],
        [west, -34],
      ],
    ],
  },
});
const layer = (...features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });

test("runs Clip, Intersect and Dissolve in the worker", async ({ page }) => {
  await waitForMap(page);
  await dropGeoJson(
    page,
    "Parcels",
    layer(
      square(151, { name: "Lot 1", zone: "R2" }),
      square(151.05, { name: "Lot 2", zone: "R2" }),
      square(151.2, { name: "Lot 3", zone: "B4" }),
    ),
  );
  await expect(layerRow(page, "Parcels")).toBeVisible();
  await dropGeoJson(page, "Site", layer(square(151, { name: "Site" }, 0.1)));
  await expect(layerRow(page, "Site")).toBeVisible();
  await dropGeoJson(
    page,
    "Pipes",
    layer({
      type: "Feature",
      properties: { name: "Main" },
      geometry: {
        type: "LineString",
        coordinates: [
          [150.95, -33.975],
          [151.3, -33.975],
        ],
      },
    }),
  );
  await expect(layerRow(page, "Pipes")).toBeVisible();

  await railButton(page, "Analysis").click();
  const panel = page.getByTestId("analysis-panel");

  // Clip: the line cut to the site.
  await panel.getByTestId("analysis-tool-clip").click();
  await expect(panel.getByRole("heading", { name: "Clip" })).toBeVisible();
  await expect(panel.getByTestId("clip-name")).toHaveValue("Pipes clipped to Site");
  await panel.getByTestId("clip-run").click();
  await expect(panel.getByTestId("analysis-result")).toContainText(
    "1 feature added as “Pipes clipped to Site”.",
  );

  // Intersect: one piece per parcel the line crosses.
  await panel.getByTestId("analysis-back").click();
  await panel.getByTestId("analysis-tool-intersect").click();
  // The clip result is now the top layer, so it's the default input.
  await panel.getByTestId("intersect-input").selectOption({ label: "Pipes" });
  await panel.getByTestId("intersect-second").selectOption({ label: "Parcels" });
  await expect(panel.getByTestId("intersect-name")).toHaveValue("Pipes intersected with Parcels");
  await panel.getByTestId("intersect-run").click();
  await expect(panel.getByTestId("analysis-result")).toContainText(
    "3 features added as “Pipes intersected with Parcels”.",
  );

  // Dissolve: parcels merged by zone.
  await panel.getByTestId("analysis-back").click();
  await panel.getByTestId("analysis-tool-dissolve").click();
  await panel.getByTestId("dissolve-input").selectOption({ label: "Parcels" });
  await panel.getByTestId("dissolve-field").selectOption("zone");
  await expect(panel.getByTestId("dissolve-name")).toHaveValue("Parcels dissolved by zone");
  await panel.getByTestId("dissolve-run").click();
  await expect(panel.getByTestId("analysis-result")).toContainText(
    "2 features added as “Parcels dissolved by zone”.",
  );

  const rows = page.getByTestId("layer-row");
  await panel.getByTestId("analysis-show-in-layers").click();
  await expect(rows.first()).toHaveAttribute("data-layer-name", "Parcels dissolved by zone");
});
