import { fireEvent, render, screen, useAppStore } from "./helpers/dom";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";

// SWIFTMAP (Change 28): the New Project dialog no longer offers GeoLibre's
// basemap list (OpenFreeMap, Protomaps, Regional, Moon, Mars, Blank, Custom
// URL). New projects start on Swiftmap's default basemap, and the Layers
// panel's Basemap card changes it. Replaces upstream's double-click tests,
// whose buttons are gone.

// Loaded after the harness so its CSS imports and Vite globals are handled.
const { NewProjectDialog } =
  await import("../apps/geolibre-desktop/src/components/layout/NewProjectDialog");
const { swiftmapDefaultBasemapUrl } =
  await import("../apps/geolibre-desktop/src/components/map/swiftmap-basemap");

function renderDialog() {
  const calls = { created: 0 };
  render(
    createElement(NewProjectDialog, {
      open: true,
      onOpenChange: () => undefined,
      onSaveCurrentProject: async () => true,
      onProjectCreated: () => {
        calls.created += 1;
      },
    }),
  );
  return calls;
}

describe("NewProjectDialog basemap (Swiftmap)", () => {
  it("offers no basemap choices", async () => {
    renderDialog();
    await screen.findByRole("button", { name: "Create" });
    for (const name of ["Liberty", "Positron", "Blank", "Custom URL"]) {
      assert.equal(screen.queryByRole("button", { name }), null, name);
    }
    assert.ok(screen.getByText(/change the basemap afterwards in the Layers panel/));
  });

  it("creates the project on Swiftmap's default basemap", async () => {
    const calls = renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));
    assert.equal(calls.created, 1);
    assert.equal(useAppStore.getState().basemapStyleUrl, swiftmapDefaultBasemapUrl());
  });
});
