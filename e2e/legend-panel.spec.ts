import { expect, test } from "./test";
import { dropGeoJson, railButton, readFixture, setViewAndSettle, waitForMap } from "./helpers";

// SWIFTMAP (Change 25): the Legend panel. Hermetic: the layer is a local GeoJSON
// fixture, and In view asks the map what it draws (no basemap needed).

test("lists what the map draws, In view or All, with the single empty line", async ({ page }) => {
  await waitForMap(page);
  await railButton(page, "Legend").click();
  const panel = page.getByTestId("legend-panel");
  await expect(panel.getByRole("heading", { name: "Legend" })).toBeVisible();
  await expect(panel.getByTestId("legend-empty")).toHaveText("No layers yet.");
  const inView = panel.getByRole("radio", { name: "In view" });
  const all = panel.getByRole("radio", { name: "All" });
  await expect(inView).toHaveAttribute("aria-checked", "true");

  await dropGeoJson(page, "smoke", readFixture("smoke.geojson"));
  const row = panel.locator('[data-testid="legend-layer"][data-layer-name="smoke"]');
  await expect(row).toBeVisible();
  await expect(row.getByTestId("legend-swatch")).toHaveAttribute("data-kind", "point");

  // Somewhere with none of the layer's features: In view leaves the layer out
  // and says so in one line; All still lists it.
  await setViewAndSettle(page, 135, -25, 6);
  await expect(panel.getByTestId("legend-empty")).toHaveText("Nothing in this area.");
  await expect(row).toHaveCount(0);
  await all.click();
  await expect(all).toHaveAttribute("aria-checked", "true");
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAttribute("data-out-of-range", /.+/);

  // The toggle is a radio group: arrow keys move between its halves.
  await all.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(inView).toHaveAttribute("aria-checked", "true");
  await expect(inView).toBeFocused();
});
