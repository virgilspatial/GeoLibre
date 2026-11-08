import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import { createElement } from "react";
import { act, fireEvent, render, screen, waitFor } from "./helpers/dom";

// SWIFTMAP (Change 28, 7c review 1): the place search on the map. Hermetic: a
// lat/lon query resolves locally, with no geocoder call.

const { MapPlaceSearch } =
  await import("../apps/geolibre-desktop/src/components/map-search/MapPlaceSearch");

let pane: HTMLElement;

beforeEach(() => {
  // The primary map pane the search portals into, as DesktopShell lays it out.
  const column = document.createElement("div");
  column.setAttribute("data-map-column", "");
  pane = document.createElement("main");
  column.append(pane);
  document.body.append(column);
});

afterEach(() => {
  pane.parentElement?.remove();
});

function fakeEngine() {
  const flights: { center: [number, number]; zoom: number }[] = [];
  const engine = {
    kind: "maplibre",
    flyTo: (view: { center: [number, number]; zoom: number }) => flights.push(view),
    readView: () => ({ zoom: 10 }),
    showSearchResult: () => () => undefined,
    fitBounds: () => undefined,
    highlightFeature: () => undefined,
  };
  return { ref: { current: engine as never }, flights };
}

it("opens from its icon, flies to a typed coordinate on Enter, and collapses on Esc", async () => {
  const { ref, flights } = fakeEngine();
  render(createElement(MapPlaceSearch, { mapControllerRef: ref }));

  const icon = screen.getByRole("button", { name: "Find address or place" });
  assert.ok(pane.contains(icon), "renders inside the map pane");
  fireEvent.click(icon);

  const field = await screen.findByRole("combobox", { name: "Find address or place" });
  assert.equal(field.getAttribute("placeholder"), "Find address or place…");
  await waitFor(() => assert.equal(document.activeElement, field));

  fireEvent.change(field, { target: { value: "-32.9265, 151.779" } });
  const option = await screen.findByRole("option");
  assert.match(option.textContent ?? "", /-32\.9265/);

  fireEvent.keyDown(field, { key: "Enter" });
  assert.equal(flights.length, 1);
  assert.deepEqual(flights[0].center, [151.779, -32.9265]);
  assert.equal(flights[0].zoom, 12);

  fireEvent.keyDown(field, { key: "Escape" });
  await waitFor(() =>
    assert.equal(screen.queryByRole("combobox", { name: "Find address or place" }), null),
  );
  assert.ok(screen.getByRole("button", { name: "Find address or place" }));
});

it("opens on / outside a text field, but not while typing in one", async () => {
  const { ref } = fakeEngine();
  render(createElement(MapPlaceSearch, { mapControllerRef: ref }));
  const other = document.createElement("input");
  document.body.append(other);

  fireEvent.keyDown(other, { key: "/" });
  assert.equal(screen.queryByRole("combobox", { name: "Find address or place" }), null);

  await act(async () => {
    fireEvent.keyDown(document.body, { key: "/" });
  });
  assert.ok(await screen.findByRole("combobox", { name: "Find address or place" }));
  other.remove();
});

it("the × closes an empty search and clears a typed one", async () => {
  const { ref } = fakeEngine();
  render(createElement(MapPlaceSearch, { mapControllerRef: ref }));
  fireEvent.click(screen.getByRole("button", { name: "Find address or place" }));
  const field = await screen.findByRole("combobox", { name: "Find address or place" });

  fireEvent.change(field, { target: { value: "Newc" } });
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  assert.equal((field as HTMLInputElement).value, "");

  fireEvent.click(screen.getByRole("button", { name: "Close search" }));
  await waitFor(() =>
    assert.equal(screen.queryByRole("combobox", { name: "Find address or place" }), null),
  );
});
