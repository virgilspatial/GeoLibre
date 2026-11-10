import { act, fireEvent, render, screen, useAppStore, within } from "./helpers/dom";
import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { createElement, useEffect, useState } from "react";
import { geojsonLayer } from "./helpers/layer-fixtures";

// Loaded after the harness so its CSS imports and Vite globals are handled.
const { LayerPanel } = await import("../apps/geolibre-desktop/src/components/panels/LayerPanel");
const { useNotificationStore } = await import("../apps/geolibre-desktop/src/lib/notify");
const { SwiftmapStylePanel } =
  await import("../apps/geolibre-desktop/src/components/style-panel-swiftmap/SwiftmapStylePanel");
const { useLayerRefresh } =
  await import("../apps/geolibre-desktop/src/components/panels/layer-panel/useLayerRefresh");

const noop = () => {};

/** A COG drawn by GeoLibre's raster control: Undo can't redraw it (Change 40). */
const cogLayer = geojsonLayer({
  id: "dem",
  name: "Elevation",
  type: "cog",
  geojson: undefined,
  source: { url: "https://example.com/dem.tif" },
  metadata: { sourceKind: "maplibre-gl-raster", externalNativeLayer: true, customLayerType: "raster" },
});

/** Render the Layers panel with the same shell-owned refresh hook. */
function LayerPanelHarness() {
  const layers = useAppStore((state) => state.layers);
  const refresh = useLayerRefresh({ layers, isCollapsed: false });
  return createElement(LayerPanel, {
    themeMode: "light",
    mapControllerRef: { current: null },
    refresh,
    onResizeStart: noop,
    geometryEditLayerId: null,
    onToggleGeometryEdit: noop,
    onCancelGeometryEdit: noop,
    onMaterializeDuckDBLayer: noop,
    onOpenRasterStylePanel: noop,
    onOpenRasterSubset: noop,
  });
}

function renderLayerPanel() {
  return render(createElement(LayerPanelHarness));
}

/** The rendered layer rows, top to bottom, as their displayed names. */
function rowNames(): string[] {
  return screen
    .queryAllByTestId("layer-row")
    .map((row) => row.getAttribute("data-layer-name") ?? "");
}

/** The row element for the layer shown as `name`. */
function row(name: string): HTMLElement {
  const match = screen.getAllByTestId("layer-row").find((el) => el.dataset.layerName === name);
  assert.ok(match, `no layer row named ${name}`);
  return match;
}

function layer(id: string) {
  return useAppStore.getState().layers.find((entry) => entry.id === id);
}

/** Each row's top in the laid-out list: rows are 32px tall, the list starts at 100. */
const ROW_HEIGHT = 32;
const LIST_TOP = 100;
const rowTop = (index: number) => LIST_TOP + index * ROW_HEIGHT;

/**
 * SWIFTMAP (Change 18): whole-row drag. The non-layout DOM measures nothing,
 * so each child of the list is given a 32px slot in order; the scroll area and
 * the list itself are tall enough that no edge scrolling starts.
 */
function pointerDrag(t: TestContext) {
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    const list = this.closest("[data-layer-list]");
    const slot = list && this !== list ? this.closest("[data-layer-list] > *") : null;
    const top = slot && list ? rowTop([...list.children].indexOf(slot)) : 0;
    const height = slot ? ROW_HEIGHT : 1000;
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      width: 300,
      height,
      right: 300,
      bottom: top + height,
      toJSON: () => ({}),
    } as DOMRect;
  });
  const pointer = (type: string, target: Element | Window, y: number, x = 40) =>
    fireEvent(
      target,
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        pointerType: "mouse",
        clientX: x,
        clientY: y,
      }),
    );
  return {
    /** Press on a row's name, move through `ys`, and release (or not). */
    drag(name: string, ys: number[], options: { release?: boolean; x?: number } = {}) {
      const el = row(name);
      const start = rowTop([...(el.parentElement?.children ?? [])].indexOf(el)) + ROW_HEIGHT / 2;
      pointer("pointerdown", within(el).getByRole("button", { name }), start);
      for (const y of ys) pointer("pointermove", window, y, options.x);
      if (options.release !== false) pointer("pointerup", window, ys.at(-1) ?? start, options.x);
    },
    up: (y: number) => pointer("pointerup", window, y),
    cancel: () => fireEvent(window, new PointerEvent("pointercancel", { pointerId: 1 })),
  };
}

describe("LayerPanel", () => {
  it("turns all hover tips off and restores their saved choices from the header", () => {
    useAppStore.getState().newProject({ name: "Hover panel" });
    const id = useAppStore.getState().addGeoJsonLayer("Rivers", {
      type: "FeatureCollection",
      features: [],
    });
    useAppStore.getState().setLayerPopup(id, { hover: true });
    renderLayerPanel();

    const toggle = screen.getByRole("checkbox", { name: "Hover tooltips" });
    fireEvent.click(toggle);
    assert.equal(useAppStore.getState().hoverTooltipsEnabled, false);
    assert.equal(layer(id)?.popup?.hover, true);
    fireEvent.click(toggle);
    assert.equal(useAppStore.getState().hoverTooltipsEnabled, true);
    assert.equal(layer(id)?.popup?.hover, true);
  });

  it("hides the hover row when no layer shows hover tips", () => {
    useAppStore.getState().newProject({ name: "No hovers" });
    useAppStore.getState().addGeoJsonLayer("Rivers", { type: "FeatureCollection", features: [] });
    renderLayerPanel();
    assert.equal(screen.queryByText("Hover tooltips"), null);
  });

  it("lists the store's layers with the topmost map layer first", () => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
    });
    renderLayerPanel();

    // The store keeps draw order (last = top), the panel shows top first.
    assert.deepEqual(rowNames(), ["Parks", "Rivers"]);
  });

  // SWIFTMAP (Change 18): rows drag by their name line, with no handle.
  it("reorders by dragging a row in both directions", (t) => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
      layerGroups: [],
    });
    renderLayerPanel();
    const { drag } = pointerDrag(t);
    // Onto the upper half of Parks: above it.
    drag("Rivers", [rowTop(0) + 6]);
    assert.deepEqual(rowNames(), ["Rivers", "Parks"]);
    assert.deepEqual(
      useAppStore.getState().layers.map((entry) => entry.id),
      ["parks", "rivers"],
    );
    // Onto the lower half of Parks: below it.
    drag("Rivers", [rowTop(1) + 26]);
    assert.deepEqual(rowNames(), ["Parks", "Rivers"]);
  });

  it("does not reorder on a click, a cancelled drag, Esc, or a release away from the list", (t) => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
      layerGroups: [],
      selectedLayerId: null,
    });
    renderLayerPanel();
    const { drag, cancel, up } = pointerDrag(t);
    // A press that moves less than the threshold is a click, not a drag.
    drag("Rivers", [rowTop(1) + 14]);
    assert.deepEqual(rowNames(), ["Parks", "Rivers"]);
    drag("Rivers", [rowTop(0) + 6], { release: false });
    assert.ok(screen.getByTestId("layer-drop-line"));
    cancel();
    up(rowTop(0) + 6);
    assert.deepEqual(rowNames(), ["Parks", "Rivers"]);
    assert.equal(screen.queryByTestId("layer-drop-line"), null);
    drag("Rivers", [rowTop(0) + 6], { release: false });
    fireEvent.keyDown(window, { key: "Escape" });
    up(rowTop(0) + 6);
    assert.deepEqual(rowNames(), ["Parks", "Rivers"]);
    drag("Rivers", [rowTop(0) + 6, rowTop(0) + 6], { x: 2000 });
    assert.deepEqual(rowNames(), ["Parks", "Rivers"]);
    // Esc ended the drag only; nothing was selected along the way.
    assert.equal(useAppStore.getState().selectedLayerId, null);
  });

  it("does not select the row the click after a drag lands on", (t) => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
      layerGroups: [],
      selectedLayerId: null,
    });
    renderLayerPanel();
    const { drag } = pointerDrag(t);
    drag("Rivers", [rowTop(0) + 6]);
    fireEvent.click(within(row("Rivers")).getByRole("button", { name: "Rivers" }));
    assert.equal(useAppStore.getState().selectedLayerId, null);
  });

  it("drops into a collapsed group and back out below an ungrouped row", (t) => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
      layerGroups: [{ id: "group", name: "Folder", collapsed: true, visible: true, opacity: 1 }],
    });
    renderLayerPanel();
    const { drag } = pointerDrag(t);
    // The empty folder sits at the top; the middle of its row drops inside it.
    drag("Rivers", [rowTop(0) + 16]);
    assert.equal(layer("rivers")?.groupId, "group");
    assert.deepEqual(rowNames(), ["Parks"]);
    act(() => useAppStore.getState().toggleLayerGroupCollapsed("group"));
    assert.deepEqual(rowNames(), ["Rivers", "Parks"]);
    // Folder, Rivers, Parks: the lower half of Parks puts Rivers below it, ungrouped.
    drag("Rivers", [rowTop(2) + 26]);
    assert.equal(layer("rivers")?.groupId ?? null, null);
    assert.deepEqual(rowNames(), ["Parks", "Rivers"]);
  });

  // Reported in review: groups below layers and layers above groups, at the
  // top level and inside a group.
  it("drags a group below layers and a layer above a group, at every level", (t) => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "q", name: "Q", groupId: "p" }),
        geojsonLayer({ id: "pp", name: "PP", groupId: "p" }),
        geojsonLayer({ id: "h", name: "H", groupId: "s" }),
        geojsonLayer({ id: "b", name: "B" }),
        geojsonLayer({ id: "a", name: "A" }),
        geojsonLayer({ id: "x", name: "X", groupId: "g" }),
      ],
      layerGroups: [
        { id: "g", name: "G", collapsed: false, visible: true, opacity: 1 },
        { id: "p", name: "P", collapsed: false, visible: true, opacity: 1 },
        { id: "s", name: "S", collapsed: false, visible: true, opacity: 1, parentId: "p" },
      ],
    });
    renderLayerPanel();
    const order = () =>
      [...document.querySelectorAll<HTMLElement>("[data-layer-list] > [data-drag-key]")].map(
        (el) => `${el.getAttribute("aria-level")}:${el.dataset.layerName ?? el.dataset.groupName}`,
      );
    const slot = (name: string) =>
      order().findIndex((entry) => entry.endsWith(`:${name}`));
    assert.deepEqual(order(), ["1:G", "2:X", "1:A", "1:B", "1:P", "2:S", "3:H", "2:PP", "2:Q"]);
    const { drag } = pointerDrag(t);
    const groupRow = (name: string) =>
      screen.getAllByTestId("layer-group-header").find((el) => el.dataset.groupName === name)!;
    const dragGroup = (name: string, y: number) => {
      const el = groupRow(name);
      const start = rowTop(slot(name)) + ROW_HEIGHT / 2;
      const grip = el.querySelector("[data-drag-grip] [data-drag-ok]")!;
      for (const [type, at] of [["pointerdown", start], ["pointermove", y], ["pointerup", y]] as const) {
        fireEvent(
          type === "pointerdown" ? grip : window,
          new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse", clientX: 40, clientY: at }),
        );
      }
    };
    // Top level: B above G (the top of G's row).
    drag("B", [rowTop(slot("G")) + 4]);
    assert.deepEqual(order().slice(0, 4), ["1:B", "1:G", "2:X", "1:A"]);
    // Top level: G below A (the lower half of A).
    dragGroup("G", rowTop(slot("A")) + 26);
    assert.deepEqual(order().slice(0, 4), ["1:B", "1:A", "1:G", "2:X"]);
    // Inside P: S below P's own layers (the lower half of Q).
    dragGroup("S", rowTop(slot("Q")) + 26);
    assert.deepEqual(order().slice(-5), ["1:P", "2:PP", "2:Q", "2:S", "3:H"]);
    // Inside P: S back above them (the upper half of PP).
    dragGroup("S", rowTop(slot("PP")) + 4);
    assert.deepEqual(order().slice(-5), ["1:P", "2:S", "3:H", "2:PP", "2:Q"]);
  });

  it("does not drag while searching", (t) => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "River one" }),
        geojsonLayer({ id: "parks", name: "River two" }),
      ],
      layerGroups: [],
    });
    renderLayerPanel();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search layers" }), {
      target: { value: "river" },
    });
    const { drag } = pointerDrag(t);
    drag("River one", [rowTop(0) + 6]);
    assert.deepEqual(rowNames(), ["River two", "River one"]);
  });

  it("removes an empty group at once and asks first for a group with layers", () => {
    useAppStore.setState({
      layers: [geojsonLayer({ id: "parks", name: "Parks", groupId: "full" })],
      layerGroups: [
        { id: "empty", name: "Empty folder", collapsed: false, visible: true, opacity: 1 },
        { id: "full", name: "Full folder", collapsed: false, visible: true, opacity: 1 },
      ],
    });
    renderLayerPanel();
    const header = (name: string) =>
      screen.getAllByTestId("layer-group-header").find((el) => el.dataset.groupName === name);
    // No placeholder under an empty group (Change 22): its "0" count says so.
    assert.equal(header("Empty folder")?.textContent?.trim().endsWith("0"), true);
    assert.doesNotMatch(header("Empty folder")?.textContent ?? "", /Drag layers here/);

    // Delete on a group's row removes it, as the menu's "Remove group" does.
    fireEvent.keyDown(within(header("Empty folder")!).getByRole("button", { name: "Collapse group" }), {
      key: "Delete",
    });
    assert.equal(header("Empty folder"), undefined);

    fireEvent.keyDown(within(header("Full folder")!).getByRole("button", { name: "Collapse group" }), {
      key: "Delete",
    });
    const dialog = screen.getByRole("dialog", { name: "Remove group?" });
    assert.match(dialog.textContent ?? "", /Full folder and the layer in it/);
    assert.equal(layer("parks")?.name, "Parks");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    assert.equal(layer("parks"), undefined);
    assert.equal(useAppStore.getState().layerGroups.length, 0);
  });

  it("follows the store when a layer is added after the first render", () => {
    renderLayerPanel();
    assert.deepEqual(rowNames(), []);

    // A store write from outside React (a map event, a plugin) goes through
    // `act` so React flushes the re-render before the assertion.
    act(() => {
      useAppStore.setState({ layers: [geojsonLayer({ id: "roads", name: "Roads" })] });
    });

    assert.deepEqual(rowNames(), ["Roads"]);
  });

  it("toggles a layer's visibility in the store from its eye button", () => {
    useAppStore.setState({ layers: [geojsonLayer({ id: "parks", name: "Parks" })] });
    renderLayerPanel();

    // SWIFTMAP (Change 17): the eye is named after its layer, as in the mockup.
    fireEvent.click(within(row("Parks")).getByRole("button", { name: "Hide Parks" }));
    assert.equal(layer("parks")?.visible, false);

    // The button flips to the opposite action once the layer is hidden.
    fireEvent.click(within(row("Parks")).getByRole("button", { name: "Show Parks" }));
    assert.equal(layer("parks")?.visible, true);
  });

  it("renames a layer on double-click and Enter", () => {
    useAppStore.setState({ layers: [geojsonLayer({ id: "parks", name: "Parks" })] });
    renderLayerPanel();

    fireEvent.doubleClick(within(row("Parks")).getByText("Parks"));
    const input = screen.getByRole("textbox", { name: "Rename Parks" });
    fireEvent.change(input, { target: { value: "  City parks  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    assert.equal(layer("parks")?.name, "City parks");
    assert.deepEqual(rowNames(), ["City parks"]);
    assert.equal(screen.queryAllByRole("textbox", { name: /^Rename / }).length, 0);
  });

  it("starts a rename with F2 on the layer's name button", () => {
    useAppStore.setState({ layers: [geojsonLayer({ id: "parks", name: "Parks" })] });
    renderLayerPanel();

    fireEvent.keyDown(within(row("Parks")).getByRole("button", { name: "Parks" }), { key: "F2" });

    assert.ok(screen.getByRole("textbox", { name: "Rename Parks" }));
  });

  it("keeps the old name when a rename is cancelled with Escape", () => {
    useAppStore.setState({ layers: [geojsonLayer({ id: "parks", name: "Parks" })] });
    renderLayerPanel();

    fireEvent.doubleClick(within(row("Parks")).getByText("Parks"));
    const input = screen.getByRole("textbox", { name: "Rename Parks" });
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.keyDown(input, { key: "Escape" });

    assert.equal(layer("parks")?.name, "Parks");
    assert.deepEqual(rowNames(), ["Parks"]);
  });

  it("ignores a rename to a blank name", () => {
    useAppStore.setState({ layers: [geojsonLayer({ id: "parks", name: "Parks" })] });
    renderLayerPanel();

    fireEvent.doubleClick(within(row("Parks")).getByText("Parks"));
    const input = screen.getByRole("textbox", { name: "Rename Parks" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    assert.equal(layer("parks")?.name, "Parks");
  });

  it("selects a layer in the store when its row is clicked", () => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
    });
    renderLayerPanel();

    // SWIFTMAP (Change 17): the row's name line is what selects it; clicking a
    // selected row again deselects it.
    fireEvent.click(within(row("Rivers")).getByText("Rivers"));

    assert.equal(useAppStore.getState().selectedLayerId, "rivers");
    // The selection state lives on the row's name button, not the card: the
    // card holds the row's other controls, so it must not be a button too.
    const selectButton = (name: string) => within(row(name)).getByRole("button", { name });
    assert.equal(selectButton("Rivers").getAttribute("aria-pressed"), "true");
    assert.equal(selectButton("Parks").getAttribute("aria-pressed"), "false");
    assert.equal(row("Rivers").getAttribute("role"), "listitem");
    assert.equal(row("Rivers").hasAttribute("tabindex"), false);

    fireEvent.click(within(row("Rivers")).getByText("Rivers"));
    assert.equal(useAppStore.getState().selectedLayerId, null);
  });

  it("selects a layer from its name button, the row's keyboard target", () => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
    });
    renderLayerPanel();

    // Enter or Space on a native button dispatches this click.
    fireEvent.click(within(row("Parks")).getByRole("button", { name: "Parks" }));

    assert.equal(useAppStore.getState().selectedLayerId, "parks");
    assert.equal(
      within(row("Parks")).getByRole("button", { name: "Parks" }).getAttribute("aria-pressed"),
      "true",
    );
  });

  it("labels each row with its depth in the layer list", () => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers", groupId: "water" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
      layerGroups: [
        {
          id: "water",
          name: "Water",
          visible: true,
          opacity: 1,
          collapsed: false,
        },
      ],
    });
    renderLayerPanel();

    assert.ok(screen.getByRole("list", { name: "Layers" }));
    assert.equal(row("Parks").getAttribute("aria-level"), "1");
    assert.equal(row("Rivers").getAttribute("aria-level"), "2");
    const header = screen.getByTestId("layer-group-header");
    assert.equal(header.getAttribute("role"), "listitem");
    assert.equal(header.getAttribute("aria-level"), "1");
  });

  it("moves a layer up the draw order", () => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
    });
    renderLayerPanel();

    // SWIFTMAP (Change 17): Move up is in the ⋯ menu, and Alt/Option+Up on the
    // selected layer.
    const name = within(row("Rivers")).getByRole("button", { name: "Rivers" });
    fireEvent.click(name);
    fireEvent.keyDown(name, { key: "ArrowUp", altKey: true });

    assert.deepEqual(
      useAppStore.getState().layers.map((entry) => entry.id),
      ["parks", "rivers"],
    );
    assert.deepEqual(rowNames(), ["Rivers", "Parks"]);
  });

  // SWIFTMAP (Change 40): layers Undo restores go at once, with a message.
  it("removes a GeoJSON layer from the toolbar's bin at once, with Undo in a message", () => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
      selectedLayerId: "parks",
    });
    renderLayerPanel();

    const toolbar = within(row("Parks")).getByRole("toolbar");
    const buttons = within(toolbar).getAllByRole("button");
    // Zoom, Identify and Style, then the bin and the ⋯ on the right.
    assert.equal(buttons.length, 5);
    assert.deepEqual(
      buttons.slice(3).map((button) => button.getAttribute("aria-label")),
      ["Remove layer", "Layer actions"],
    );
    fireEvent.click(within(toolbar).getByRole("button", { name: "Remove layer" }));

    assert.equal(layer("parks"), undefined);
    assert.equal(screen.queryByRole("dialog", { name: "Remove layer?" }), null);
    const message = useNotificationStore.getState().notifications.at(-1);
    assert.equal(message?.message, "Removed “Parks”.");
    act(() => message?.action?.onClick());
    assert.equal(layer("parks")?.name, "Parks");
    assert.equal(useAppStore.getState().selectedLayerId, "parks");
  });

  it("removes a GeoJSON layer with Delete and from the ⋯ menu without the prompt", async () => {
    useAppStore.setState({
      layers: [
        geojsonLayer({ id: "rivers", name: "Rivers" }),
        geojsonLayer({ id: "parks", name: "Parks" }),
      ],
      selectedLayerId: "parks",
    });
    renderLayerPanel();

    fireEvent.keyDown(within(row("Parks")).getByRole("button", { name: "Parks" }), {
      key: "Delete",
    });
    assert.equal(layer("parks"), undefined);
    assert.equal(screen.queryByRole("dialog", { name: "Remove layer?" }), null);

    fireEvent.click(within(row("Rivers")).getByRole("button", { name: "Rivers" }));
    fireEvent.keyDown(within(row("Rivers")).getByRole("button", { name: "Layer actions" }), {
      key: "Enter",
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Remove layer/ }));
    assert.equal(layer("rivers"), undefined);
    assert.equal(screen.queryByRole("dialog", { name: "Remove layer?" }), null);
  });

  it("asks first before removing a layer Undo can't restore, from the bin, Delete or the ⋯ menu", async () => {
    useAppStore.setState({ layers: [cogLayer], selectedLayerId: "dem" });
    renderLayerPanel();
    const dialog = () => screen.queryByRole("dialog", { name: "Remove layer?" });
    const cancel = () => fireEvent.click(within(dialog()!).getByRole("button", { name: "Cancel" }));

    fireEvent.click(within(row("Elevation")).getByRole("button", { name: "Remove layer" }));
    assert.ok(dialog());
    cancel();
    fireEvent.keyDown(within(row("Elevation")).getByRole("button", { name: "Elevation" }), {
      key: "Delete",
    });
    assert.ok(dialog());
    cancel();
    fireEvent.keyDown(within(row("Elevation")).getByRole("button", { name: "Layer actions" }), {
      key: "Enter",
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Remove layer/ }));
    assert.ok(dialog());
    assert.equal(layer("dem")?.name, "Elevation");
    assert.equal(useNotificationStore.getState().notifications.length, 0);
  });

  it("shows the bin to editors only", () => {
    useAppStore.setState({
      layers: [geojsonLayer({ id: "parks", name: "Parks" })],
      selectedLayerId: "parks",
      collaboration: {
        ...useAppStore.getState().collaboration,
        isActive: true,
        clientId: null,
        role: "guest",
        mode: "view-only",
      },
    });
    renderLayerPanel();

    const toolbar = within(row("Parks")).getByRole("toolbar");
    assert.equal(within(toolbar).queryByRole("button", { name: "Remove layer" }), null);
    assert.ok(within(toolbar).getByRole("button", { name: "Layer actions" }));
  });

  it("deletes the active layer with Delete and confirms the removal prompt with Delete", () => {
    useAppStore.setState({ layers: [cogLayer], selectedLayerId: "dem" });
    renderLayerPanel();

    fireEvent.keyDown(within(row("Elevation")).getByRole("button", { name: "Elevation" }), {
      key: "Delete",
    });
    const dialog = screen.getByRole("dialog", { name: "Remove layer?" });
    assert.equal(layer("dem")?.name, "Elevation");
    assert.equal(document.activeElement, within(dialog).getByRole("button", { name: "Remove" }));

    fireEvent.keyDown(within(dialog).getByRole("button", { name: "Remove" }), { key: "Delete" });
    assert.equal(layer("dem"), undefined);
    assert.equal(screen.queryByRole("dialog", { name: "Remove layer?" }), null);
  });

  it("requires an unmodified, non-repeating Delete to confirm layer removal", () => {
    useAppStore.setState({ layers: [cogLayer], selectedLayerId: "dem" });
    renderLayerPanel();

    fireEvent.keyDown(within(row("Elevation")).getByRole("button", { name: "Elevation" }), {
      key: "Delete",
    });
    const dialog = screen.getByRole("dialog", { name: "Remove layer?" });
    const remove = within(dialog).getByRole("button", { name: "Remove" });

    fireEvent.keyDown(remove, { key: "Delete", repeat: true });
    fireEvent.keyDown(remove, { key: "Delete", shiftKey: true });
    fireEvent.keyDown(within(dialog).getByRole("button", { name: "Cancel" }), { key: "Delete" });
    fireEvent.keyDown(dialog, { key: "Delete" });
    assert.equal(layer("dem")?.name, "Elevation");

    fireEvent.keyDown(remove, { key: "Delete" });
    assert.equal(layer("dem"), undefined);
  });

  // SWIFTMAP (Change 40): with no dialog in the way, Delete must only act on
  // a layer row, never while typing or working in another panel.
  describe("Delete removes a layer only from its row", () => {
    const seedParks = () => {
      useAppStore.setState({
        layers: [
          geojsonLayer({ id: "rivers", name: "Rivers" }),
          geojsonLayer({ id: "parks", name: "Parks" }),
        ],
        selectedLayerId: "parks",
      });
    };

    it("removes from the selected row's name and from its toolbar", () => {
      seedParks();
      renderLayerPanel();
      fireEvent.keyDown(within(row("Parks")).getByRole("button", { name: "Parks" }), {
        key: "Delete",
      });
      assert.equal(layer("parks"), undefined);

      fireEvent.click(within(row("Rivers")).getByRole("button", { name: "Rivers" }));
      fireEvent.keyDown(within(row("Rivers")).getByRole("button", { name: "Zoom to layer" }), {
        key: "Delete",
      });
      assert.equal(layer("rivers"), undefined);
    });

    it("never removes from the search box", () => {
      seedParks();
      renderLayerPanel();
      const search = screen.getByRole("searchbox");
      fireEvent.change(search, { target: { value: "Par" } });
      fireEvent.keyDown(search, { key: "Delete" });
      assert.equal(layer("parks")?.name, "Parks");
    });

    it("never removes from the rename field", () => {
      seedParks();
      renderLayerPanel();
      fireEvent.doubleClick(within(row("Parks")).getByRole("button", { name: "Parks" }));
      const field = within(row("Parks")).getByRole("textbox", { name: "Rename Parks" });
      fireEvent.keyDown(field, { key: "Delete" });
      assert.equal(layer("parks")?.name, "Parks");
    });

    it("never removes from the Style panel", () => {
      seedParks();
      // The Style panel opens when its request changes after mounting, as the
      // toolbar's palette does it.
      function WithStylePanel() {
        const [request, setRequest] = useState(0);
        useEffect(() => setRequest(1), []);
        return createElement(
          "div",
          null,
          createElement(LayerPanelHarness),
          createElement(SwiftmapStylePanel, { mapControllerRef: { current: null }, openRequest: request }),
        );
      }
      render(createElement(WithStylePanel));
      const stylePanel = screen.getByTestId("swiftmap-style-panel");
      const targets = within(stylePanel).queryAllByRole("button");
      assert.ok(targets.length > 0, "the Style panel has controls to press Delete on");
      for (const target of [...targets, ...within(stylePanel).queryAllByRole("slider")]) {
        fireEvent.keyDown(target, { key: "Delete" });
      }
      assert.equal(layer("parks")?.name, "Parks");
    });

    it("never removes from the panel header or another layer's row", () => {
      seedParks();
      renderLayerPanel();
      fireEvent.keyDown(screen.getByRole("button", { name: "New group" }), { key: "Delete" });
      fireEvent.keyDown(within(row("Rivers")).getByRole("button", { name: "Rivers" }), {
        key: "Delete",
      });
      assert.equal(layer("parks")?.name, "Parks");
      assert.equal(layer("rivers")?.name, "Rivers");
    });
  });

  it("ignores Delete pressed outside the layer panel", () => {
    useAppStore.setState({
      layers: [geojsonLayer({ id: "parks", name: "Parks" })],
      selectedLayerId: "parks",
    });
    renderLayerPanel();

    fireEvent.keyDown(document.body, { key: "Delete" });

    assert.equal(screen.queryByRole("dialog", { name: "Remove layer?" }), null);
    assert.equal(layer("parks")?.name, "Parks");
  });

  it("does not open the removal prompt while typing in a text field", () => {
    useAppStore.setState({
      layers: [geojsonLayer({ id: "parks", name: "Parks" })],
      selectedLayerId: "parks",
    });
    renderLayerPanel();
    const input = document.createElement("input");
    document.body.append(input);

    fireEvent.keyDown(input, { key: "Delete" });

    assert.equal(screen.queryByRole("dialog", { name: "Remove layer?" }), null);
    input.remove();
  });

  // SWIFTMAP (Change 17): GeoLibre's Metadata dialog was dropped (item 20);
  // the read-only Properties card took its place and must stay just as live.
  it("keeps the Properties card in step with the live layer", () => {
    const point = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [151, -33] },
      properties: {},
    };
    const features = (n: number) => ({
      type: "FeatureCollection" as const,
      features: Array.from({ length: n }, () => point),
    });
    useAppStore.setState({
      layers: [geojsonLayer({ id: "parks", name: "Parks", geojson: features(3) })],
      selectedLayerId: "parks",
    });
    renderLayerPanel();

    fireEvent.keyDown(within(row("Parks")).getByRole("button", { name: "Parks" }), { key: "i" });
    const card = () => row(useAppStore.getState().layers[0]?.name ?? "").querySelector("dl");
    assert.ok(card());
    assert.match(card()?.textContent ?? "", /Features3/);

    // A rename and new features made while the card is open show up in it.
    act(() => {
      useAppStore.getState().updateLayer("parks", { name: "City parks", geojson: features(5) });
    });
    assert.match(card()?.textContent ?? "", /Features5/);

    // Removing the layer takes the card with it.
    act(() => {
      useAppStore.getState().removeLayer("parks");
    });
    assert.equal(document.querySelectorAll("dl").length, 0);
  });
});
