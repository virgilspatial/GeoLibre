import { expect, test, type Page } from "./test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dropGeoJson as dropLayer, layerRow, openLayerActions, openMenuBarMenu } from "./helpers";

const FIXTURE_PATH = join(__dirname, "fixtures", "smoke.geojson");
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, "utf8");

/** Waits for MapLibre to mount its WebGL canvas — the app's "map ready" signal. */
async function waitForMap(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("map-canvas")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({
    timeout: 30_000,
  });
}

/** Drops a GeoJSON file onto the map, exercising the real drag-and-drop path. */
async function dropGeoJson(page: Page, name: string, text: string): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    ({ contents, fileName }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([contents], fileName, { type: "application/geo+json" }));
      return dt;
    },
    { contents: text, fileName: `${name}.geojson` },
  );
  for (const type of ["dragenter", "dragover", "drop"]) {
    await page.dispatchEvent('[data-testid="map-canvas"]', type, {
      dataTransfer,
    });
  }
  await dataTransfer.dispose();
  await expect(page.locator(`[data-testid="layer-row"][data-layer-name="${name}"]`)).toBeVisible();
}

/**
 * Verifies issue #311: a layer can be placed in a folder, the group's
 * collapse/visibility controls work, and the group structure survives a
 * save -> reload -> reopen round trip (group + each child's `groupId` are
 * serialized into the `.geolibre.json` project).
 */
test("groups a layer and persists the folder across save and reopen", async ({ page }) => {
  // SWIFTMAP: two app loads plus a save on a software-rendered CI runner took
  // about 62s on PR #10, mostly waiting for menus to settle; nothing hung.
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
  });

  await waitForMap(page);

  // 1. Add a layer, then group it from the layer's actions menu.
  await dropGeoJson(page, "smoke", FIXTURE_TEXT);
  const row = page.locator('[data-testid="layer-row"][data-layer-name="smoke"]');
  // SWIFTMAP (Change 17): the ⋯ menu is on the selected row's toolbar, and
  // "New group from layer" is the mockup's "Add to new group".
  await openLayerActions(page, "smoke");
  await page.getByRole("menuitem", { name: "Add to new group" }).click();
  await page.keyboard.press("Escape"); // close the actions menu

  const header = page.getByTestId("layer-group-header").first();
  await expect(header).toBeVisible();

  // 2. Collapsing the group hides its child layer; expanding restores it.
  await header.locator('button[aria-label="Collapse group"]').click();
  await expect(row).toBeHidden();
  await header.locator('button[aria-label="Expand group"]').click();
  await expect(row).toBeVisible();

  // SWIFTMAP (Change 17): group opacity is in the group's ⋯ menu, opening the
  // same Opacity card layers use (no slider on the row).
  await expect(header.getByRole("slider")).toHaveCount(0);
  await header.hover();
  await header.getByRole("button", { name: "Group actions" }).click();
  await page.getByRole("menuitem", { name: "Opacity", exact: true }).click();
  const groupOpacity = header.getByRole("slider");
  await expect(groupOpacity).toBeVisible();
  await groupOpacity.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(header).toContainText("95%");

  // 3. Save the project and assert the group + membership are serialized.
  const downloadPromise = page.waitForEvent("download");
  await openMenuBarMenu(page, "Project");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  // Browsers without the File System Access picker (deleted above) prompt for a
  // file name before downloading; accept the pre-filled default and confirm.
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const saved = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    layers?: { groupId?: string }[];
    layerGroups?: { id: string }[];
  };
  expect(saved.layerGroups?.length).toBe(1);
  const groupId = saved.layerGroups?.[0]?.id;
  expect(groupId).toBeTruthy();
  expect(saved.layers?.[0]?.groupId).toBe(groupId);

  const dir = await mkdtemp(join(tmpdir(), "geolibre-groups-"));
  try {
    const savedPath = join(dir, "groups.geolibre.json");
    await writeFile(savedPath, Buffer.concat(chunks));

    // 4. Reload to a fresh store, reopen the project, and confirm the folder is
    //    rebuilt with the layer still nested inside it.
    await waitForMap(page);
    const chooserPromise = page.waitForEvent("filechooser");
    await openMenuBarMenu(page, "Project");
    await page.getByRole("menuitem", { name: "Open from" }).click();
    await page.getByRole("menuitem", { name: "File…" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(savedPath);

    await expect(page.getByTestId("layer-group-header").first()).toBeVisible();
    await expect(page.locator('[data-testid="layer-row"][data-layer-name="smoke"]')).toBeVisible();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


/**
 * SWIFTMAP (Change 18): rows drag by their name line with no handle. A drag
 * starts only after the pointer moves, so a click still selects and a
 * double-click still renames; a group takes a layer dropped on its middle;
 * a group moves with what it holds; and groups stop at three levels.
 */
test("drags layers and groups and stops nesting at three levels", async ({ page }) => {
  // Took about 51s of the default 60s on a CI runner (PR #10).
  test.setTimeout(120_000);
  await waitForMap(page);
  for (const name of ["aaa", "bbb", "ccc"]) await dropLayer(page, name, FIXTURE_TEXT);
  await page.keyboard.press("Escape"); // new layers arrive selected

  // An empty group from the header; its name opens for editing.
  await page.getByRole("button", { name: "New group" }).click();
  await page.keyboard.press("Enter");
  const header = page.locator('[data-testid="layer-group-header"][data-group-name="New group"]');
  // No placeholder under an empty group (Change 22): its "0" count says so.
  await expect(header).toContainText("0");
  await expect(header).not.toContainText("Drag layers here");

  const rows = () =>
    page
      .locator("[data-layer-list] > [data-drag-key]")
      .evaluateAll((els) =>
        els.map((r) => `${r.getAttribute("aria-level")}:${r.getAttribute("data-layer-name") ?? "group"}`),
      );
  const grab = async (locator: ReturnType<typeof page.locator>) => {
    // Rows slide into place for about 180ms after a drop; measure once they stop.
    await page.waitForFunction(() =>
      [...document.querySelectorAll<HTMLElement>("[data-layer-list] > *")].every(
        (el) => getComputedStyle(el).transform === "none",
      ),
    );
    const box = await locator.boundingBox();
    if (!box) throw new Error("not visible");
    return { x: box.x + 30, y: box.y + box.height / 2, height: box.height };
  };
  const nameOf = (name: string) => layerRow(page, name).locator("[data-layer-select]");
  const dragTo = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 6, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
  };
  /** The lower half of a row, where a drop goes below it. */
  const below = async (name: string) => {
    const at = await grab(layerRow(page, name));
    return { x: at.x, y: at.y + at.height / 4 };
  };

  // A layer dropped on the middle of a group's row goes inside it.
  await dragTo(await grab(nameOf("aaa")), await grab(header.locator("[data-drag-grip]")));
  await expect.poll(rows).toEqual(["1:group", "2:aaa", "1:ccc", "1:bbb"]);
  await expect(header).toContainText("1");

  // A layer dropped on the lower half of another goes below it.
  await dragTo(await grab(nameOf("ccc")), await below("bbb"));
  await expect.poll(rows).toEqual(["1:group", "2:aaa", "1:bbb", "1:ccc"]);

  // A group drags with what it holds.
  await dragTo(await grab(header.locator("[data-drag-grip]")), await below("ccc"));
  await expect.poll(rows).toEqual(["1:bbb", "1:ccc", "1:group", "2:aaa"]);

  // A click still selects and a double-click still renames.
  await nameOf("bbb").click();
  await expect(nameOf("bbb")).toHaveAttribute("aria-pressed", "true");
  await nameOf("bbb").dblclick();
  await expect(page.getByRole("textbox", { name: /Rename/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Add subgroup twice makes three levels; a fourth is refused.
  const addSubgroup = async (level: number) => {
    const row = page.locator(`[data-testid="layer-group-header"][aria-level="${level}"]`).first();
    await row.hover();
    await row.getByRole("button", { name: "Group actions" }).click();
    await page.getByRole("menuitem", { name: "Add subgroup" }).click();
  };
  await addSubgroup(1);
  await expect(page.locator('[data-testid="layer-group-header"][aria-level="2"]')).toHaveCount(1);
  await addSubgroup(2);
  await expect(page.locator('[data-testid="layer-group-header"][aria-level="3"]')).toHaveCount(1);
  await addSubgroup(3);
  await expect(page.getByText("Groups can be nested up to 3 levels")).toBeVisible();
  await expect(page.locator('[data-testid="layer-group-header"][aria-level="4"]')).toHaveCount(0);
});
