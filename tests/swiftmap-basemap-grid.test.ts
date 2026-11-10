import { act, fireEvent, render, screen, useAppStore, waitFor, within } from "./helpers/dom";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";

// SWIFTMAP: the basemap picker as a grid (Change 42).
const { BasemapCard } = await import("../apps/geolibre-desktop/src/components/basemap/BasemapCard");
const { nextGridIndex } = await import(
  "../apps/geolibre-desktop/src/components/basemap/basemap-grid-keys"
);

describe("nextGridIndex", () => {
  it("moves one tile left and right, and stops at the ends", () => {
    assert.equal(nextGridIndex("ArrowRight", 0, 6), 1);
    assert.equal(nextGridIndex("ArrowLeft", 1, 6), 0);
    assert.equal(nextGridIndex("ArrowLeft", 0, 6), 0);
    assert.equal(nextGridIndex("ArrowRight", 5, 6), 5);
  });

  it("moves a row up and down, and stays put with no row there", () => {
    assert.equal(nextGridIndex("ArrowDown", 1, 6), 4);
    assert.equal(nextGridIndex("ArrowUp", 4, 6), 1);
    assert.equal(nextGridIndex("ArrowUp", 1, 6), 1);
    // A seventh tile (a custom basemap) sits alone on the third row.
    assert.equal(nextGridIndex("ArrowDown", 3, 7), 6);
    assert.equal(nextGridIndex("ArrowDown", 4, 7), 4);
  });

  it("goes to the first and last with Home and End, mirrors left and right in RTL, ignores other keys", () => {
    assert.equal(nextGridIndex("Home", 4, 6), 0);
    assert.equal(nextGridIndex("End", 1, 6), 5);
    assert.equal(nextGridIndex("ArrowRight", 2, 6, true), 1);
    assert.equal(nextGridIndex("ArrowLeft", 2, 6, true), 3);
    assert.equal(nextGridIndex("Enter", 2, 6), null);
    assert.equal(nextGridIndex("ArrowRight", 0, 0), null);
  });
});

describe("BasemapCard grid", () => {
  const openPicker = () => {
    render(createElement(BasemapCard));
    const card = screen.getByRole("button", { name: /Basemap/ });
    fireEvent.click(card);
    return card;
  };
  const tiles = () => screen.getAllByTestId("basemap-tile");

  it("shows a Basemap heading over a radio group of tiles, one checked, with focus on it", () => {
    const card = openPicker();
    const group = screen.getByRole("radiogroup", { name: "Basemap" });
    const radios = within(group).getAllByRole("radio");
    assert.equal(radios.length, tiles().length);
    const checked = radios.filter((radio) => radio.getAttribute("aria-checked") === "true");
    assert.equal(checked.length, 1);
    assert.equal(document.activeElement === checked[0], true, "focus on the checked tile");
    // Only the checked tile is in the tab order.
    assert.deepEqual(
      radios.map((radio) => radio.tabIndex),
      radios.map((radio) => (radio === checked[0] ? 0 : -1)),
    );
    // The selected thumbnail has the ring and a bold name, no check mark
    // (round 1); the card's chevron is up/down.
    // Round 3: the two-tone ring is inside the edge, on the overlay above the image.
    assert.match(checked[0].querySelector("span")!.className, /shadow-\[inset_0_0_0_2px_hsl\(var\(--foreground\)\),inset_0_0_0_3px_hsl\(var\(--popover\)\)\]/);
    assert.doesNotMatch(checked[0].querySelector("span")!.className, /ring-offset/);
    // Just the thumbnail and the name: no check mark beside it.
    assert.equal(checked[0].children.length, 2);
    assert.equal(checked[0].lastElementChild!.querySelector("svg") === null, true, "no check mark");
    assert.match(checked[0].lastElementChild!.className, /font-semibold/);
    // Hover is the pointer and nothing else (round 3).
    for (const radio of radios) {
      assert.match(radio.className, /cursor-pointer/);
      assert.doesNotMatch(radio.className, /hover:/);
      assert.doesNotMatch(radio.querySelector("span")!.className, /hover/);
    }
    // Three equal columns, filling the popover (round 2: no cap).
    assert.match(group.className, /\bgrid-cols-3\b/);
    assert.ok(card.querySelector("svg.lucide-chevrons-up-down"));
  });

  it("moves focus with the arrow keys without applying, and applies with Enter or Space", () => {
    openPicker();
    const before = useAppStore.getState().basemapStyleUrl;
    const start = tiles().findIndex((tile) => tile.getAttribute("aria-checked") === "true");
    const target = start === 0 ? 1 : 0;
    fireEvent.keyDown(tiles()[start], { key: target > start ? "ArrowRight" : "ArrowLeft" });
    assert.equal(document.activeElement === tiles()[target], true, "focus moved");
    assert.equal(useAppStore.getState().basemapStyleUrl, before, "focus alone applies nothing");

    // A button's Enter and Space are its click.
    act(() => tiles()[target].click());
    assert.notEqual(useAppStore.getState().basemapStyleUrl, before);
    assert.equal(tiles()[target].getAttribute("aria-checked"), "true");
    assert.ok(screen.getByRole("radiogroup"), "the picker stays open to compare");
  });

  it("keeps Show labels and Use a tile link below the grid, and Esc closes back to the card", async () => {
    const card = openPicker();
    const group = screen.getByRole("radiogroup");
    const dialog = group.closest<HTMLElement>("[role='dialog']")!;
    const label = within(dialog).getByText("Show labels");
    const link = within(dialog).getByText(/Use a tile link/);
    // Both come after the grid in the popover.
    assert.ok(group.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(label.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    assert.equal(screen.queryByRole("radiogroup") === null, true, "closed");
    // Radix hands focus back to the trigger once the popover has unmounted.
    await waitFor(() =>
      assert.equal(document.activeElement === card, true, `focus back on the card, not ${document.activeElement?.tagName}`),
    );
  });

  it("fills None with the rail's colour and nothing on it", () => {
    openPicker();
    const none = screen.getByRole("radio", { name: "None" });
    const thumb = none.querySelector("span")!;
    assert.match(thumb.className, /bg-sidebar/);
    assert.equal(thumb.querySelector("svg, img") === null, true, "nothing on None");
  });

  it("leaves the tile link form with Cancel, or with a first Esc that keeps the picker open", async () => {
    openPicker();
    const openForm = () =>
      fireEvent.click(screen.getByRole("button", { name: /Use a tile link/ }));
    openForm();
    assert.ok(screen.getByRole("textbox", { name: "Tile link" }));
    assert.match(screen.getByText("XYZ tiles, ArcGIS MapServer or style link.").className, /text-pretty/);
    // Stacked (round 2): the field, the help line, then Cancel and Add, in that order.
    const field = screen.getByRole("textbox", { name: "Tile link" });
    const help = screen.getByText("XYZ tiles, ArcGIS MapServer or style link.");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const add = screen.getByRole("button", { name: "Add" });
    assert.ok(field.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(help.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(cancel.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(cancel.parentElement === add.parentElement, true, "one row");
    assert.match(cancel.parentElement!.className, /justify-end/);
    fireEvent.click(cancel);
    assert.equal(screen.queryByRole("textbox", { name: "Tile link" }), null);
    assert.ok(screen.getByRole("radiogroup"));

    openForm();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Tile link" }), { key: "Escape" });
    assert.equal(screen.queryByRole("textbox", { name: "Tile link" }) === null, true, "form closed");
    assert.ok(screen.getByRole("radiogroup"), "the picker stays open");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => assert.equal(screen.queryByRole("radiogroup") === null, true, "picker closed"));
  });
});
