import { fireEvent, render, screen } from "./helpers/dom";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createElement } from "react";

// SWIFTMAP (Change 34): Add Data left the rail, so the empty Layers panel
// offers it to editors who can add data.

// Loaded after the harness so its CSS imports and Vite globals are handled.
const { EmptyLayers } =
  await import("../apps/geolibre-desktop/src/components/panels/layer-panel/EmptyLayers");
const { useSidePanelStore } =
  await import("../apps/geolibre-desktop/src/components/layout/rail/sidePanelStore");

describe("Empty Layers panel", () => {
  afterEach(() => useSidePanelStore.getState().setAddDataOpen(false));

  it("offers Add data, and says files can be dropped on the map", () => {
    render(createElement(EmptyLayers, { canAddData: true }));
    assert.ok(screen.getByText("or drop files on the map"));
    fireEvent.click(screen.getByRole("button", { name: "Add data" }));
    assert.equal(useSidePanelStore.getState().addDataOpen, true);
  });

  it("is one muted line for anyone who can't add data", () => {
    render(createElement(EmptyLayers, { canAddData: false }));
    assert.ok(screen.getByText("No layers yet."));
    assert.equal(screen.queryByRole("button", { name: "Add data" }), null);
  });
});
