import { expect, test, type Page } from "./test";
import { bindMapLibreMap, waitForMap } from "./helpers";

// SWIFTMAP (Change 28): the Basemap card and picker that replaced GeoLibre's
// Background row. The e2e build has no Protomaps key (as on CI), so the list
// is Liberty, Aerial and None until a test sets a runtime key. Hermetic: tile
// and style hosts are blocked, and only the chosen basemap is asserted (read
// from GeoLibre's last-basemap memory), never what the tiles draw.

const LAST_BASEMAP = "geolibre.lastBasemap";
const SWIFTMAP = "geolibre://offline-basemap/swiftmap/";

test.beforeEach(async ({ page }) => {
  for (const host of [
    "https://api.protomaps.com/**",
    "https://protomaps.github.io/**",
    "https://portal.spatial.nsw.gov.au/**",
    "https://tiles.openfreemap.org/**",
  ]) {
    await page.route(host, (route) => route.abort());
  }
});

function rememberedBasemap(page: Page): Promise<string> {
  return page.evaluate((key) => localStorage.getItem(key) ?? "", LAST_BASEMAP);
}

function basemapCard(page: Page) {
  return page.getByRole("button", { name: /^Basemap/ });
}

function picker(page: Page) {
  return page.getByRole("dialog", { name: "Basemap" });
}

test("the Basemap card picks basemaps and tile links", async ({ page }) => {
  await waitForMap(page);
  const panel = page.getByRole("complementary", { name: "Layers" });
  const card = basemapCard(page);

  // No key: Liberty. The card is one row; Show labels is in the picker.
  await expect(card).toContainText("Liberty");
  await expect(panel.getByRole("switch")).toHaveCount(0);
  await expect(panel.getByText("Background", { exact: true })).toHaveCount(0);
  // A short list doesn't scroll beneath the card, so there's no line above it.
  await expect(page.locator("[data-divider]")).toHaveCount(0);

  // The picker opens on the current row; picks apply and leave it open.
  await card.click();
  const list = picker(page);
  await expect(list).toBeVisible();
  // Liberty's labels can't be switched.
  const labels = list.getByRole("switch", { name: "Show labels" });
  // Disabled with no text line; the reason is a tooltip on hover and focus.
  await expect(labels).toBeDisabled();
  await expect(list.getByText("No labels available")).toHaveCount(0);
  await labels.hover();
  await expect(page.getByRole("tooltip")).toContainText("No labels available");
  const liberty = list.getByRole("button", { name: "Liberty" });
  await expect(liberty).toHaveAttribute("aria-pressed", "true");
  await expect(liberty).toBeFocused();
  for (const gone of ["Positron", "White", "Black", "Moon", "Mars"]) {
    await expect(list.getByRole("button", { name: new RegExp(gone) })).toHaveCount(0);
  }

  const aerial = list.getByRole("button", { name: /^Aerial/ });
  await aerial.click();
  await expect(list).toBeVisible();
  await expect(aerial).toHaveAttribute("aria-pressed", "true");
  await expect(card).toContainText("Aerial (NSW)");
  await expect(card).not.toContainText("NSW only");
  await expect.poll(() => rememberedBasemap(page)).toBe(`${SWIFTMAP}aerial`);
  // Aerial's labels come from Protomaps, so without a key there are none.
  await expect(labels).toBeDisabled();

  await list.getByRole("button", { name: "None" }).click();
  await expect(card).toContainText("None");
  await expect.poll(() => rememberedBasemap(page)).toBe("");

  // A tile link: a wrong one says what's accepted, an ArcGIS one is named.
  await list.getByRole("button", { name: "Use a tile link…" }).click();
  const link = list.getByRole("textbox", { name: "Tile link" });
  await link.fill("https://example.com/not-tiles");
  await list.getByRole("button", { name: "Add" }).click();
  await expect(list.getByRole("alert")).toContainText("Enter an XYZ tile link");
  await link.fill("https://example.com/arcgis/rest/services/SiteImagery/MapServer");
  await list.getByRole("button", { name: "Add" }).click();
  await expect(card).toContainText("SiteImagery");
  // The custom basemap is listed, ringed, while the picker stays open.
  await expect(list.getByRole("button", { name: "SiteImagery" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Esc closes it and gives focus back to the card.
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(card).toBeFocused();
});

test("with a Protomaps key: Light by default, and Show labels switches labels", async ({
  page,
}) => {
  await waitForMap(page);
  await page.evaluate(() => {
    window.__GEOLIBRE_RUNTIME_ENV__ = {
      ...window.__GEOLIBRE_RUNTIME_ENV__,
      VITE_PROTOMAPS_API_KEY: "e2e-placeholder",
    };
    window.dispatchEvent(new CustomEvent("geolibre:runtime-env-change"));
  });
  const card = basemapCard(page);
  // An untouched first map moves to Swiftmap's Light (Change 23's default).
  await expect(card).toContainText("Light");
  await expect(card).not.toContainText("No labels");
  await expect.poll(() => rememberedBasemap(page)).toBe(`${SWIFTMAP}light`);

  await card.click();
  const list = picker(page);
  const labels = list.getByRole("switch", { name: "Show labels" });
  await expect(labels).toBeChecked();
  await labels.click();
  await expect(labels).not.toBeChecked();
  await expect.poll(() => rememberedBasemap(page)).toBe(`${SWIFTMAP}light?labels=off`);
  await expect(card).toContainText("Basemap · No labelsLight");

  // A pick keeps the setting; Aerial's hybrid labels follow the same switch.
  for (const name of ["Light", "Grey", "Dark", "Aerial", "None"]) {
    await expect(list.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(list.getByRole("button", { name: "Liberty" })).toHaveCount(0);
  await list.getByRole("button", { name: /^Aerial/ }).click();
  await expect.poll(() => rememberedBasemap(page)).toBe(`${SWIFTMAP}aerial?labels=off`);
  await expect(card).toContainText("Basemap · No labelsAerial (NSW)");
  await labels.click();
  await expect.poll(() => rememberedBasemap(page)).toBe(`${SWIFTMAP}aerial`);
  await expect(card).toContainText("BasemapAerial (NSW)");
  await page.keyboard.press("Escape");
});

// SWIFTMAP (Change 33): Auto is Light in light mode and Dark in dark mode. The
// theme toggle swaps the drawn style without changing the saved basemap.
test("Auto follows the theme without changing the saved basemap", async ({ page }) => {
  await waitForMap(page);
  await page.evaluate(() => {
    window.__GEOLIBRE_RUNTIME_ENV__ = {
      ...window.__GEOLIBRE_RUNTIME_ENV__,
      VITE_PROTOMAPS_API_KEY: "e2e-placeholder",
    };
    window.dispatchEvent(new CustomEvent("geolibre:runtime-env-change"));
  });
  await bindMapLibreMap(page);
  const background = () =>
    page.evaluate(() => {
      type Styled = { getStyle(): { layers: { type: string; paint?: Record<string, unknown> }[] } };
      const map = window.__geolibreTestMap as unknown as Styled | undefined;
      const layer = map?.getStyle().layers.find((item) => item.type === "background");
      return String(layer?.paint?.["background-color"] ?? "");
    });
  const card = basemapCard(page);
  await card.click();
  await picker(page).getByRole("button", { name: "Auto", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card).toContainText("Auto");
  await expect.poll(() => rememberedBasemap(page)).toBe(`${SWIFTMAP}auto`);
  const light = await background();

  // Playwright starts in light mode.
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect.poll(background).not.toBe(light);
  await expect(card).toContainText("Auto");
  expect(await rememberedBasemap(page)).toBe(`${SWIFTMAP}auto`);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect.poll(background).toBe(light);
});

test("viewers get the card too", async ({ page }) => {
  await waitForMap(page, "/?layout=viewer");
  const card = basemapCard(page);
  await expect(card).toBeVisible();
  await card.click();
  await picker(page).getByRole("button", { name: "None" }).click();
  await expect(card).toContainText("None");
});

// SWIFTMAP (Change 28, 7c review 1): place search on the map. Hermetic: a
// lat/lon query resolves locally, with no geocoder call.
test("the map's place search opens, finds a coordinate and collapses", async ({ page }) => {
  await waitForMap(page);
  // The Layers panel keeps only its layer search.
  await expect(
    page.getByRole("complementary", { name: "Layers" }).getByRole("combobox"),
  ).toHaveCount(0);
  const icon = page.getByRole("button", { name: "Find address or place" });
  await expect(icon).toBeVisible();

  // `/` opens it with the cursor in the field.
  await page.locator(".maplibregl-canvas").click({ position: { x: 400, y: 400 } });
  await page.keyboard.press("/");
  const field = page.getByRole("combobox", { name: "Find address or place" });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("placeholder", "Find address or place…");

  // Enter picks the first result.
  await field.fill("-32.9265, 151.779");
  const results = page.getByRole("listbox", { name: "Find address or place" });
  await expect(results.getByRole("option").first()).toContainText("-32.9265");
  await field.press("Enter");
  await expect(results).toBeHidden();

  // Esc clears and collapses back to the icon.
  await field.press("Escape");
  await expect(field).toBeHidden();
  await expect(icon).toBeFocused();

  // Clicking away with nothing typed collapses it too.
  await icon.click();
  await expect(field).toBeFocused();
  await page.locator(".maplibregl-canvas").click({ position: { x: 600, y: 500 } });
  await expect(field).toBeHidden();
  await expect(icon).toBeVisible();
});

test("viewers get the place search too", async ({ page }) => {
  await waitForMap(page, "/?layout=viewer");
  await expect(page.getByRole("button", { name: "Find address or place" })).toBeVisible();
});
