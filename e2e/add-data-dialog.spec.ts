import { expect, test } from "./test";
import { addDataButton, layerRow, railButton, readFixture, waitForMap } from "./helpers";

// SWIFTMAP (Change 24): the Add Data dialog, Stage 0. Hermetic: the upload is a
// local GeoJSON fixture and the link checks need no network.

// Change 34: Add Data left the rail; the Layers panel's + and its empty state open it.
test("the Layers panel's + and empty state open Add Data; Esc closes it", async ({ page }) => {
  await waitForMap(page);
  const dialog = page.getByRole("dialog", { name: "Add Data" });
  await expect(railButton(page, "Add Data")).toHaveCount(0);

  await addDataButton(page).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab")).toHaveText(["Upload", "From a link", "More sources"]);
  await expect(dialog.getByText("File Geodatabase (.gdb)")).toBeVisible();
  await expect(dialog.getByText("Available once your Vault is set up.")).toBeVisible();
  // Stage 0: no Vault tab and no promise of storage.
  await expect(dialog.getByText(/saved to Vault/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const empty = page.getByTestId("layers-empty");
  await expect(empty).toContainText("or drop files on the map");
  await empty.getByRole("button", { name: "Add data", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Upload shows a file card and adds the layer at the top of Layers", async ({ page }) => {
  await waitForMap(page);
  await addDataButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Add Data" });
  await page.getByTestId("add-data-file-input").setInputFiles({
    name: "site_boundary.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(readFixture("smoke.geojson")),
  });
  const card = dialog.getByTestId("add-data-file-card");
  await expect(card).toContainText("site_boundary.geojson");
  await expect(card).toContainText("GeoJSON");
  await expect(card).toContainText(/\d+ features?/);
  await card.getByRole("button", { name: "Add layer" }).click();

  // The last waiting file was added, so the dialog closes.
  await expect(dialog).toHaveCount(0);
  await expect(layerRow(page, "site_boundary")).toBeVisible();
  await expect(page.getByTestId("layer-row").first()).toHaveAttribute(
    "data-layer-name",
    "site_boundary",
  );
});

test("Upload refuses file types it can't add", async ({ page }) => {
  await waitForMap(page);
  await addDataButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Add Data" });
  await page.getByTestId("add-data-file-input").setInputFiles({
    name: "plan.dwg",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("AC1015"),
  });
  const card = dialog.getByTestId("add-data-file-card");
  await expect(card).toContainText("This file type can't be added here.");
  await expect(card.getByRole("button", { name: "Add layer" })).toHaveCount(0);
});

test("From a link detects the type, or offers to choose it", async ({ page }) => {
  await waitForMap(page);
  await addDataButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Add Data" });
  await dialog.getByRole("tab", { name: "From a link" }).click();
  const field = dialog.getByRole("textbox", { name: "Service or file URL" });

  await dialog.getByRole("button", { name: /^NSW Cadastre \(ArcGIS REST\)/ }).click();
  await expect(field).toHaveValue(/NSW_Cadastre\/MapServer$/);
  await expect(dialog.getByText("Map or feature service, detected from the URL")).toBeVisible();

  await field.fill("https://data.example.com/services/parcels");
  await expect(dialog.getByText("Couldn't work out the service type.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add layer" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Choose it manually" }).click();
  await dialog.getByRole("button", { name: "WMS", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Add layer" })).toBeVisible();

  // Every example is Australian and real: no placeholder hosts.
  const examples = await dialog.locator("ul button").allInnerTexts();
  expect(examples).toHaveLength(4);
  for (const text of examples) {
    expect(text).not.toMatch(/example\.com|openstreetmap\.org/);
  }
});

test("More sources lists the Stage 0 groups without search", async ({ page }) => {
  await waitForMap(page);
  await addDataButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Add Data" });
  await dialog.getByRole("tab", { name: "More sources" }).click();
  await expect(dialog.getByRole("heading")).toHaveText([
    "Add Data",
    "Cloud formats",
    "3D layers",
    "CAD",
    "Databases",
    "Reference",
  ]);
  await expect(dialog.getByRole("searchbox")).toHaveCount(0);
  for (const name of [
    "CAD drawing (DXF)",
    "LandXML",
    "Historical imagery",
    "Overture Maps",
    "LiDAR",
    "DuckDB",
  ]) {
    await expect(dialog.getByRole("button", { name, exact: true })).toBeVisible();
  }
  // Desktop-only and unconfirmed sources stay out of the browser build, and
  // KML / KMZ is left to Upload and From a link (Change 35).
  for (const name of [/PostgreSQL/, /SQL Server/, /Iceberg/, /MBTiles/, /Gaussian/, /DWG/, /KML/]) {
    await expect(dialog.getByRole("button", { name })).toHaveCount(0);
  }
});
