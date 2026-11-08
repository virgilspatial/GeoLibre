import { expect, test } from "./test";
import * as XLSX from "@e965/xlsx";
import {
  dropGeoJson,
  layerRow,
  openLayerActions,
  readFixture,
  selectLayerRow,
  waitForMap,
} from "./helpers";

// SWIFTMAP (Change 27): skipped, joins have no entry point in Swiftmap's Style panel (engine code kept).
test.skip(true, "SWIFTMAP: joins have no entry point in Swiftmap's Style panel");

for (const format of ["csv", "xlsx"]) {
  test(`joins a local ${format} table without coordinates`, async ({ page }) => {
    await waitForMap(page);
    await dropGeoJson(page, "target", readFixture("smoke.geojson"));
    // SWIFTMAP (Change 17): Style is on the selected row's toolbar.
    await selectLayerRow(page, "target");
    await layerRow(page, "target").getByRole("button", { name: "Open style panel" }).click();
    const joins = page.getByTestId("layer-joins-section");
    await expect(joins.getByRole("button", { name: "Add join", exact: true })).toBeEnabled();
    await joins.getByRole("button", { name: "Add join", exact: true }).click();
    const chooser = page.waitForEvent("filechooser");
    await joins.getByRole("button", { name: "Choose file" }).click();
    let buffer = Buffer.from("key,population\nAlpha,100\nCharlie,300\n");
    if (format === "xlsx") {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([["wrong"], ["ignore"]]),
        "Other",
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ["key", "population"],
          ["Alpha", 100],
          ["Charlie", 300],
        ]),
        "Population",
      );
      buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    }
    await (
      await chooser
    ).setFiles({
      name: `population.${format}`,
      mimeType: "application/octet-stream",
      buffer,
    });
    if (format === "xlsx")
      await joins.getByLabel("Worksheet", { exact: true }).selectOption("Population");
    await joins.getByRole("button", { name: "Add layer", exact: true }).click();
    await joins.getByLabel("Join field", { exact: true }).selectOption("key");
    await joins.getByLabel("Target field", { exact: true }).selectOption("name");
    await joins.getByRole("button", { name: "Add", exact: true }).click();
    await expect(joins).toContainText("2 of 3 features matched");
    // SWIFTMAP (Change 17): menu items carry their shortcut after the label.
    await openLayerActions(page, "target");
    await page.getByRole("menuitem", { name: /^Open attribute table/ }).click();
    const table = page.getByTestId("attribute-table");
    await expect(table).toContainText("population");
    await expect(table.locator("tbody tr").filter({ hasText: "Alpha" })).toContainText("100");
    await expect(table.locator("tbody tr").filter({ hasText: "Charlie" })).toContainText("300");
  });
}
