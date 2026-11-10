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

test("runs Buffer in a worker and adds the result with its origin", async ({ page }) => {
  await waitForMap(page);
  await dropGeoJson(page, "smoke", readFixture("smoke.geojson"));

  await railButton(page, "Analysis").click();
  const panel = page.getByTestId("analysis-panel");
  await expect(panel.getByRole("heading", { name: "Analysis" })).toBeVisible();
  await expect(panel.getByPlaceholder("Search analysis tools…")).toBeVisible();
  await expect(panel.getByTestId("analysis-tool-clip")).toBeDisabled();
  await expect(panel.getByTestId("analysis-tool-clip")).toContainText("Coming soon");

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
