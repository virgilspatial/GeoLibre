import { expect, test } from "./test";
import { dropGeoJson, layerRow, railButton, selectLayerRow, waitForMap } from "./helpers";

// SWIFTMAP (Change 27): Swiftmap's Style panel. It opens from the layer
// toolbar's palette icon, applies changes live (Show as Categories with an
// edited label, kept as rules), closes with its × leaving no right-hand rail,
// and quick filters open from the layer ⋯ menu instead. Hermetic: a small
// inline GeoJSON layer.

const ZONES = JSON.stringify({
  type: "FeatureCollection",
  features: ["R2", "B4", "R2", "IN1"].map((zone, i) => ({
    type: "Feature",
    properties: { zone, area: 100 + i * 50 },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [i, 0],
          [i + 0.8, 0],
          [i + 0.8, 0.8],
          [i, 0.8],
          [i, 0],
        ],
      ],
    },
  })),
});

test("styles a layer live, by category, and closes without a rail", async ({ page }) => {
  await waitForMap(page);
  await dropGeoJson(page, "zoning", ZONES);
  await selectLayerRow(page, "zoning");
  await layerRow(page, "zoning").getByRole("button", { name: "Open style panel" }).click();

  const panel = page.getByRole("complementary", { name: "Layer style", exact: true });
  await expect(panel.getByRole("heading", { name: "zoning" })).toBeVisible();
  await expect(panel.getByText("Polygon layer · Single symbol")).toBeVisible();
  await expect(panel.getByRole("tab", { name: "Labels" })).toBeVisible();

  // Show as Categories applies at once: one row per zone, labels editable.
  await panel.getByRole("radio", { name: "Categories" }).click();
  await expect(panel.getByText("Polygon layer · Categories")).toBeVisible();
  const label = panel.getByRole("textbox", { name: "Label for R2" });
  await expect(label).toHaveValue("R2");
  await label.fill("Low density residential");
  await label.press("Enter");
  await expect(label).toHaveValue("Low density residential");
  // The category's own outline sits behind its swatch.
  await panel.getByRole("button", { name: "Symbol for Low density residential" }).click();
  await expect(page.getByRole("spinbutton", { name: "Outline width" })).toBeVisible();
  await page.keyboard.press("Escape");

  // × closes it, and GeoLibre's collapsed "STYLE" rail is gone.
  await panel.getByRole("button", { name: "Close style panel" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: /Layer style \(collapsed\)/ })).toHaveCount(0);

  // Reopened, the edit is still there (it went to the layer, not the panel).
  await layerRow(page, "zoning").getByRole("button", { name: "Open style panel" }).click();
  await expect(panel.getByRole("textbox", { name: "Label for R2" })).toHaveValue(
    "Low density residential",
  );
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // Quick filters open from the layer's ⋯ menu.
  await selectLayerRow(page, "zoning");
  await layerRow(page, "zoning").getByRole("button", { name: "Layer actions" }).click();
  await page.getByRole("menuitem", { name: "Filter", exact: true }).click();
  await expect(page.getByTestId("layer-filter-card")).toBeVisible();
});

// SWIFTMAP (Change 31): line style (GeoLibre #3360) sits beside Width, and the
// legend's swatch draws the dash.
const ROADS = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Track" },
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 0.5],
          [2, 0],
        ],
      },
    },
  ],
});

test("dashes a line from the Style panel, and the legend shows the dash", async ({ page }) => {
  await waitForMap(page);
  await dropGeoJson(page, "tracks", ROADS);
  await selectLayerRow(page, "tracks");
  await layerRow(page, "tracks").getByRole("button", { name: "Open style panel" }).click();
  const panel = page.getByRole("complementary", { name: "Layer style", exact: true });
  await expect(panel.getByText("Line layer · Single symbol")).toBeVisible();

  const lineStyle = panel.getByRole("combobox", { name: "Line style" });
  await expect(lineStyle).toHaveValue("solid");
  await lineStyle.selectOption("dashed");
  await expect(lineStyle).toHaveValue("dashed");
  // No Custom choice while the pattern is a preset.
  await expect(lineStyle.locator("option")).toHaveCount(5);

  // Blur sits under More options.
  await panel.getByRole("button", { name: "More options" }).click();
  await expect(panel.getByRole("spinbutton", { name: "Line blur (px)" })).toHaveValue("0");

  await railButton(page, "Legend").click();
  const legend = page.getByTestId("legend-panel");
  await legend.getByRole("radio", { name: "All" }).click();
  const row = legend.locator('[data-testid="legend-layer"][data-layer-name="tracks"]');
  await expect(row.getByTestId("legend-swatch")).toHaveAttribute("data-dash", "dashed");
});

// 7b review round 4: settings popovers apply live and end with Done; Enter in
// a text box closes them too. The last ticked pop-up field stays ticked, with
// a hint instead of a silently refused click.
test("edits a pop-up field in a popover with Done, and keeps one field ticked", async ({
  page,
}) => {
  await waitForMap(page);
  await dropGeoJson(page, "zoning", ZONES);
  await selectLayerRow(page, "zoning");
  await layerRow(page, "zoning").getByRole("button", { name: "Open style panel" }).click();
  const panel = page.getByRole("complementary", { name: "Layer style", exact: true });
  await panel.getByRole("tab", { name: "Pop-up" }).click();

  // Renaming applies as typed; Enter closes, and the preview has the new label.
  await panel.getByRole("button", { name: "More for zone" }).click();
  const label = page.getByRole("textbox", { name: "Label", exact: true });
  await label.fill("Zone code");
  await label.press("Enter");
  await expect(label).toHaveCount(0);
  await expect(panel.getByTestId("swiftmap-popup-preview")).toContainText("Zone code");

  // Done only closes; the label stays.
  await panel.getByRole("button", { name: "More for zone" }).click();
  await expect(label).toHaveValue("Zone code");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(label).toHaveCount(0);

  // The last ticked field can't be unticked; a hint says why.
  await panel.getByRole("checkbox", { name: "Show area" }).click();
  const zone = panel.getByRole("checkbox", { name: "Show zone" });
  await zone.click();
  await expect(zone).toBeChecked();
  await expect(panel.getByRole("status")).toHaveText(
    "A pop-up needs at least one field. To hide pop-ups, turn off Show pop-ups.",
  );
  await panel.getByRole("checkbox", { name: "Show area" }).click();
  await expect(panel.getByRole("status")).toHaveText("");
});
