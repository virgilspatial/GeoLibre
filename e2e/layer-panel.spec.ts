import { expect, test, type Page } from "./test";
import {
  dropGeoJson,
  layerRow,
  openLayerActions,
  readFixture,
  selectLayerRow,
  waitForMap,
} from "./helpers";

const FIXTURE_TEXT = readFixture("smoke.geojson");

/** Ordered `data-layer-name` values of the layer rows currently in the panel. */
async function layerOrder(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="layer-row"]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-layer-name") ?? ""));
}

/**
 * The layer panel is one of the highest-churn surfaces yet only its visibility
 * toggle and attribute-table entry were covered (smoke.spec). This exercises the
 * two remaining destructive/reordering interactions — Move up reordering and the
 * confirm-gated Remove — against two real layers, so a regression in reorder
 * math or in the removal confirm flow is caught.
 *
 * SWIFTMAP (Change 17): both actions are in the selected row's ⋯ menu now.
 */
test("reorders layers and removes one through the confirm dialog", async ({ page }) => {
  await waitForMap(page);

  // Two layers so reorder has something to swap.
  await dropGeoJson(page, "aaa", FIXTURE_TEXT);
  await expect(layerRow(page, "aaa")).toBeVisible();
  await dropGeoJson(page, "bbb", FIXTURE_TEXT);
  await expect(layerRow(page, "bbb")).toBeVisible();

  // Reorder: moving the lower of the two up must flip their relative order.
  const initial = (await layerOrder(page)).filter((n) => ["aaa", "bbb"].includes(n));
  expect(initial).toHaveLength(2);
  const [top, bottom] = initial;

  await openLayerActions(page, bottom);
  await page.getByRole("menuitem", { name: /^Move up/ }).click();

  await expect
    .poll(async () => (await layerOrder(page)).filter((n) => ["aaa", "bbb"].includes(n)))
    .toEqual([bottom, top]);

  // SWIFTMAP (Change 40): Undo restores a dropped GeoJSON layer in full, so
  // the ⋯ menu's Remove layer takes it at once and says so, with Undo.
  await openLayerActions(page, "aaa");
  await page.getByRole("menuitem", { name: /^Remove layer/ }).click();
  await expect(page.getByRole("dialog", { name: "Remove layer?" })).toHaveCount(0);
  await expect(layerRow(page, "aaa")).toHaveCount(0);
  await expect(layerRow(page, "bbb")).toBeVisible();
  const removed = page.getByText("Removed “aaa”.");
  await expect(removed).toBeVisible();
  await page
    .getByTestId("notification-region")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(layerRow(page, "aaa")).toBeVisible();
  await expect(removed).toHaveCount(0);

  // The toolbar's bin does the same.
  await layerRow(page, "aaa").getByRole("button", { name: "Remove layer", exact: true }).click();
  await expect(layerRow(page, "aaa")).toHaveCount(0);
  await expect(layerRow(page, "bbb")).toBeVisible();
});

test("long layer names truncate without widening the layer panel", async ({ page }) => {
  await waitForMap(page);
  await dropGeoJson(page, "short-name", FIXTURE_TEXT);

  const row = layerRow(page, "short-name");
  const panel = page.getByRole("complementary", { name: "Layers" });
  const panelBoxBefore = await panel.boundingBox();
  expect(panelBoxBefore).not.toBeNull();
  await row.locator("[data-layer-select]").dblclick();
  const renameInput = page.getByRole("textbox", { name: "Rename short-name" });
  await renameInput.fill(
    "This is an exceptionally long vector layer name that should truncate cleanly",
  );
  await renameInput.press("Enter");

  const longName = "This is an exceptionally long vector layer name that should truncate cleanly";
  const renamedRow = layerRow(page, longName);
  const select = renamedRow.locator("[data-layer-select]");
  const name = select.getByText(longName, { exact: true });
  const eye = renamedRow.getByRole("button", { name: new RegExp(`^(Hide|Show) ${longName}`) });

  await expect(renamedRow).toBeVisible();
  await expect(name).toHaveCSS("text-overflow", "ellipsis");
  // The truncated name stays readable in full from the tooltip.
  await expect(select).toHaveAttribute("title", longName);
  // SWIFTMAP (Change 17): the opacity slider is in the selected row's Opacity card.
  await selectLayerRow(page, longName);
  await select.focus();
  await page.keyboard.press("o");
  const opacitySlider = renamedRow.getByRole("slider");
  await expect(opacitySlider).toBeVisible();
  await expect
    .poll(async () => {
      const [rowBox, panelBox, eyeBox, opacitySliderBox, viewportWidth] = await Promise.all([
        renamedRow.boundingBox(),
        panel.boundingBox(),
        eye.boundingBox(),
        opacitySlider.boundingBox(),
        page.evaluate(() => window.innerWidth),
      ]);
      return Boolean(
        rowBox &&
        panelBox &&
        eyeBox &&
        opacitySliderBox &&
        panelBoxBefore &&
        panelBox.x === panelBoxBefore.x &&
        panelBox.width === panelBoxBefore.width &&
        panelBox.x >= 0 &&
        panelBox.x + panelBox.width <= viewportWidth &&
        rowBox.x >= panelBox.x &&
        rowBox.x + rowBox.width <= panelBox.x + panelBox.width &&
        eyeBox.x >= rowBox.x &&
        eyeBox.x + eyeBox.width <= rowBox.x + rowBox.width &&
        opacitySliderBox.x >= rowBox.x &&
        opacitySliderBox.x + opacitySliderBox.width <= rowBox.x + rowBox.width,
      );
    })
    .toBe(true);
  await expect
    .poll(() => name.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true);
});

test("opens the selected layer in the Style panel from its toolbar", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 720 });
  await waitForMap(page);
  await dropGeoJson(page, "first", FIXTURE_TEXT);
  await expect(layerRow(page, "first")).toBeVisible();
  await dropGeoJson(page, "second", FIXTURE_TEXT);
  await expect(layerRow(page, "second")).toBeVisible();

  // Exact, so the collapsed rail ("Layer style (collapsed)") cannot satisfy the
  // default substring match.
  const stylePanel = page.getByRole("complementary", { name: "Layer style", exact: true });
  await expect(stylePanel).toHaveCount(0);

  await selectLayerRow(page, "first");
  await layerRow(page, "first").getByRole("button", { name: "Open style panel" }).click();

  await expect(stylePanel).toBeVisible();
  // SWIFTMAP (Change 27): Swiftmap's Style panel is headed by the layer name.
  await expect(stylePanel.getByRole("heading", { name: "first", exact: true })).toBeVisible();
});

test("opens the Style panel from the layer toolbar by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 720 });
  await waitForMap(page);
  await dropGeoJson(page, "first", FIXTURE_TEXT);
  await expect(layerRow(page, "first")).toBeVisible();
  await dropGeoJson(page, "second", FIXTURE_TEXT);
  await expect(layerRow(page, "second")).toBeVisible();

  const stylePanel = page.getByRole("complementary", { name: "Layer style", exact: true });
  const styleButton = (name: string) =>
    layerRow(page, name).getByRole("button", { name: "Open style panel" });

  // Each toolbar button must activate from the keyboard on its own.
  await selectLayerRow(page, "first");
  await styleButton("first").focus();
  await page.keyboard.press("Enter");
  await expect(stylePanel).toBeVisible();
  // SWIFTMAP (Change 27): Swiftmap's Style panel is headed by the layer name.
  await expect(stylePanel.getByRole("heading", { name: "first", exact: true })).toBeVisible();

  await selectLayerRow(page, "second");
  await styleButton("second").focus();
  await page.keyboard.press("Space");
  await expect(stylePanel.getByRole("heading", { name: "second", exact: true })).toBeVisible();
});

// SWIFTMAP (Change 17): the rebuilt panel's search, selection, cards and shortcuts.
test("searches, selects, shows cards and duplicates from the keyboard", async ({ page }) => {
  await waitForMap(page);
  await dropGeoJson(page, "Heritage items", FIXTURE_TEXT);
  await expect(layerRow(page, "Heritage items")).toBeVisible();
  await dropGeoJson(page, "Land zoning", FIXTURE_TEXT);
  await expect(layerRow(page, "Land zoning")).toBeVisible();

  const panel = page.getByRole("complementary", { name: "Layers" });
  const search = panel.getByRole("searchbox", { name: "Search layers" });
  await expect(panel.getByText("2 layers", { exact: true })).toBeVisible();

  // Search keeps only matching rows and counts them; Esc clears it.
  await search.fill("herit");
  await expect(panel.getByText("1 of 2", { exact: true })).toBeVisible();
  await expect(layerRow(page, "Land zoning")).toHaveCount(0);
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(layerRow(page, "Land zoning")).toBeVisible();

  // One selected row at a time, with the toolbar; Esc in the panel deselects.
  await selectLayerRow(page, "Heritage items");
  const select = layerRow(page, "Heritage items").locator("[data-layer-select]");
  await expect(panel.getByRole("toolbar", { name: "Layer tools" })).toHaveCount(1);
  await select.focus();
  await page.keyboard.press("Escape");
  await expect(select).toHaveAttribute("aria-pressed", "false");
  await expect(panel.getByRole("toolbar", { name: "Layer tools" })).toHaveCount(0);

  // Properties from the ⋯ menu, then the I and O shortcuts swap the cards.
  await openLayerActions(page, "Heritage items");
  await page.getByRole("menuitem", { name: /^Properties/ }).click();
  const row = layerRow(page, "Heritage items");
  await expect(row.getByText("Source", { exact: true })).toBeVisible();
  await expect(row.getByText("Heritage items.geojson", { exact: true })).toBeVisible();
  await select.focus();
  await page.keyboard.press("o");
  await expect(row.getByText("Source", { exact: true })).toHaveCount(0);
  await expect(row.getByRole("slider", { name: "Layer opacity of Heritage items" })).toBeVisible();

  // Duplicate (Ctrl/Cmd+D) puts the copy directly above the original.
  await select.focus();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(layerRow(page, "Heritage items copy")).toBeVisible();
  const order = await layerOrder(page);
  expect(order.indexOf("Heritage items copy")).toBe(order.indexOf("Heritage items") - 1);
});

/** Bottom-to-top index of each layer's lowest style layer on the live map, by layer id. */
async function drawIndex(page: Page, layerIds: string[]): Promise<number[]> {
  return page.evaluate((ids) => {
    const container = document.querySelector("main .maplibregl-map");
    if (!container) return [];
    const key = Object.keys(container).find((k) => k.startsWith("__reactFiber"));
    type Hook = { memoizedState?: { current?: unknown }; next?: Hook };
    type Fiber = { return?: Fiber; alternate?: Fiber; memoizedState?: Hook };
    let fiber = key ? (container as unknown as Record<string, Fiber>)[key] : undefined;
    let style: { layers: { id: string }[] } | null = null;
    while (fiber && !style) {
      for (const side of [fiber, fiber.alternate]) {
        let hook = side?.memoizedState;
        while (hook && !style) {
          const held = hook.memoizedState?.current as { getMap?: () => { getStyle(): typeof style } } | undefined;
          if (typeof held?.getMap === "function" && held.getMap()) style = held.getMap().getStyle();
          hook = hook.next;
        }
      }
      fiber = fiber.return;
    }
    const order = style?.layers.map((l) => l.id) ?? [];
    return ids.map((id) => order.findIndex((styleId) => styleId.includes(id)));
  }, layerIds);
}

/**
 * SWIFTMAP (Change 36): "Draw points above lines and polygons", on by default,
 * draws a point layer above a polygon layer the panel puts on top; the switch
 * in Layer options (⋯ in the Layers header) brings back the panel's order.
 */
test("draws points above polygons until Layer options turns it off", async ({ page }) => {
  await waitForMap(page);
  const point = JSON.stringify({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [151.2, -33.9] } }],
  });
  const polygon = JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[[151, -34], [151.4, -34], [151.4, -33.8], [151, -33.8], [151, -34]]] },
      },
    ],
  });
  await dropGeoJson(page, "sites", point);
  await expect(layerRow(page, "sites")).toBeVisible();
  await dropGeoJson(page, "zones", polygon);
  await expect(layerRow(page, "zones")).toBeVisible();
  // The panel puts the polygon on top.
  expect(await layerOrder(page)).toEqual(["zones", "sites"]);
  const ids = await Promise.all(
    ["zones", "sites"].map((name) => layerRow(page, name).getAttribute("data-layer-id")),
  );
  const layerIds = ids.map((id) => id ?? "");

  await expect
    .poll(async () => {
      const [zones, sites] = await drawIndex(page, layerIds);
      return zones >= 0 && sites > zones;
    })
    .toBe(true);

  await page.getByRole("button", { name: "Layer options", exact: true }).click();
  const item = page.getByRole("menuitemcheckbox", { name: "Draw points above lines and polygons" });
  await expect(item).toHaveAttribute("aria-checked", "true");
  await item.click();
  await expect(item).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  await expect
    .poll(async () => {
      const [zones, sites] = await drawIndex(page, layerIds);
      return sites >= 0 && zones > sites;
    })
    .toBe(true);
});
