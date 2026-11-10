import { act, fireEvent, render, screen, useAppStore, waitFor } from "./helpers/dom";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import type { Feature, FeatureCollection } from "geojson";
import { geojsonLayer } from "./helpers/layer-fixtures";

// SWIFTMAP (Change 37): the Analysis panel and the Buffer form, with the real
// engine behind a fake worker.

// Loaded after the harness so its CSS imports and Vite globals are handled.
const { AnalysisPanel } =
  await import("../apps/geolibre-desktop/src/components/analysis/AnalysisPanel");
const { DEFAULT_BUFFER_FORM, setAnalysisWorkerFactory, useAnalysisStore } =
  await import("../apps/geolibre-desktop/src/components/analysis/analysisStore");
const { runBuffer } =
  await import("../apps/geolibre-desktop/src/components/analysis/engine/buffer");
const { originOf } = await import("../apps/geolibre-desktop/src/components/analysis/origin");
const { setHistoryCoalesceMs, undo } = await import("@geolibre/core");
const { useSidePanelStore } =
  await import("../apps/geolibre-desktop/src/components/layout/rail/sidePanelStore");

const points = (count: number): FeatureCollection => ({
  type: "FeatureCollection",
  features: Array.from({ length: count }, (_, index): Feature => ({
    type: "Feature",
    properties: { index },
    geometry: { type: "Point", coordinates: [151 + index * 0.01, -34] },
  })),
});

/** A worker that runs the tool in this thread; `hold` keeps it from answering. */
function fakeWorker(options: { hold?: boolean } = {}) {
  const worker = {
    terminated: false,
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage(request: { input: FeatureCollection; settings: Parameters<typeof runBuffer>[1] }) {
      if (options.hold) return;
      queueMicrotask(() =>
        worker.onmessage?.({
          data: { ok: true, result: runBuffer(request.input, request.settings) },
        } as MessageEvent),
      );
    },
    terminate() {
      worker.terminated = true;
    },
  };
  return worker;
}

const setLayers = (...layers: ReturnType<typeof geojsonLayer>[]) =>
  act(() => useAppStore.setState({ layers }));

describe("Analysis panel", () => {
  beforeEach(() => {
    useAppStore.getState().newProject();
    useAnalysisStore.setState({
      tool: null,
      query: "",
      recent: [],
      buffer: DEFAULT_BUFFER_FORM,
      run: { status: "idle" },
    });
  });
  afterEach(() => setAnalysisWorkerFactory(undefined));

  it("lists the Screening toolkit with only Buffer available, and no Recent at first", () => {
    render(createElement(AnalysisPanel));
    assert.ok(screen.getByPlaceholderText("Search analysis tools…"));
    assert.equal(screen.queryByTestId("analysis-recent"), null);
    assert.equal((screen.getByTestId("analysis-tool-buffer") as HTMLButtonElement).disabled, false);
    for (const id of ["clip", "intersect", "constraintSummary", "areaByZone", "dissolve"]) {
      const row = screen.getByTestId(`analysis-tool-${id}`) as HTMLButtonElement;
      assert.equal(row.disabled, true);
      assert.match(row.textContent ?? "", /Coming soon/);
    }
    assert.equal(screen.queryByText("Analysis history"), null);
  });

  it("searches tools and says when nothing matches", () => {
    render(createElement(AnalysisPanel));
    const search = screen.getByPlaceholderText("Search analysis tools…");
    fireEvent.change(search, { target: { value: "buf" } });
    assert.ok(screen.getByText("1 result"));
    fireEvent.change(search, { target: { value: "zzz" } });
    assert.ok(screen.getByText("No tools match “zzz”."));
    fireEvent.keyDown(search, { key: "Escape" });
    assert.equal((search as HTMLInputElement).value, "");
  });

  it("opens Buffer with a back arrow and an auto-filled name", () => {
    setLayers(geojsonLayer({ id: "sites", name: "Sites", geojson: points(2) }));
    render(createElement(AnalysisPanel));
    fireEvent.click(screen.getByTestId("analysis-tool-buffer"));
    assert.equal(
      (screen.getByTestId("buffer-name") as HTMLInputElement).value,
      "Sites buffer 100 m",
    );
    fireEvent.change(screen.getByTestId("buffer-distance"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("buffer-unit"), { target: { value: "km" } });
    assert.equal(
      (screen.getByTestId("buffer-name") as HTMLInputElement).value,
      "Sites buffer 2 km",
    );
    fireEvent.click(screen.getByTestId("analysis-back"));
    assert.ok(screen.getByTestId("analysis-tool-buffer"));
  });

  it("shows the size-limit lines and refuses partial and tile inputs", () => {
    setLayers(geojsonLayer({ id: "big", name: "Big", geojson: points(2500) }));
    useAnalysisStore.setState({ tool: "buffer" });
    render(createElement(AnalysisPanel));
    assert.ok(screen.getByText("This may take a minute."));
    assert.equal((screen.getByTestId("buffer-run") as HTMLButtonElement).disabled, false);

    setLayers(geojsonLayer({ id: "huge", name: "Huge", geojson: points(10_001) }));
    assert.ok(screen.getByText("Too large to analyse in the browser."));
    assert.equal((screen.getByTestId("buffer-run") as HTMLButtonElement).disabled, true);

    setLayers(
      geojsonLayer({ id: "part", name: "Part", geojson: points(3), metadata: { truncated: true } }),
    );
    assert.ok(screen.getByText("Only part of this layer is loaded, so it can’t be analysed."));
    assert.equal((screen.getByTestId("buffer-run") as HTMLButtonElement).disabled, true);

    setLayers(
      geojsonLayer({ id: "tiles", name: "Tiles", type: "vector-tiles", geojson: undefined }),
    );
    assert.match(screen.getByTestId("analysis-status").textContent ?? "", /drawn from map tiles/);
  });

  it("runs Buffer, adds the result at the top with its origin, and shows it in Layers", async () => {
    setAnalysisWorkerFactory(() => fakeWorker() as unknown as Worker);
    setLayers(geojsonLayer({ id: "sites", name: "Sites", geojson: points(2) }));
    useAnalysisStore.setState({ tool: "buffer" });
    render(createElement(AnalysisPanel));
    fireEvent.click(screen.getByTestId("buffer-run"));
    await waitFor(() => assert.ok(screen.getByTestId("analysis-result")));
    assert.match(
      screen.getByTestId("analysis-result").textContent ?? "",
      /2 features added as “Sites buffer 100 m”\./,
    );
    const layers = useAppStore.getState().layers;
    const result = layers[layers.length - 1]!;
    assert.equal(result.name, "Sites buffer 100 m");
    assert.equal(result.geojson?.features.length, 2);
    assert.equal(originOf(result)?.crs.label, "MGA 56");
    assert.equal(originOf(result)?.inputs[0]?.name, "Sites");
    assert.ok("Area m² (MGA 56)" in (result.geojson!.features[0]!.properties ?? {}));
    // Always "Run" (Change 37 review).
    assert.equal(screen.getByTestId("buffer-run").textContent, "Run");
    // The input stays the one used, though the result is now the top layer.
    assert.equal((screen.getByTestId("buffer-input") as HTMLSelectElement).value, "sites");
    // The name stays as it is, no " (2)".
    assert.equal(
      (screen.getByTestId("buffer-name") as HTMLInputElement).value,
      "Sites buffer 100 m",
    );
    assert.deepEqual(useAnalysisStore.getState().recent.slice(0, 1), ["buffer"]);

    fireEvent.click(screen.getByTestId("analysis-show-in-layers"));
    assert.equal(useSidePanelStore.getState().active, "layers");
    assert.equal(useAppStore.getState().selectedLayerId, result.id);
  });

  it("overwrites a result of the same name in place, and Undo restores it in one step", async () => {
    // One history entry per action: by default GeoLibre merges changes made
    // within 400 ms (slider drags), and this test acts within milliseconds.
    setHistoryCoalesceMs(0);
    setAnalysisWorkerFactory(() => fakeWorker() as unknown as Worker);
    setLayers(geojsonLayer({ id: "sites", name: "Sites", geojson: points(2) }));
    useAnalysisStore.setState({ tool: "buffer" });
    render(createElement(AnalysisPanel));
    fireEvent.click(screen.getByTestId("buffer-run"));
    await waitFor(() => assert.ok(screen.getByTestId("analysis-result")));
    const first = useAppStore.getState().layers.at(-1)!;
    // The result is hidden, restyled, and another layer goes above it.
    act(() => {
      useAppStore.getState().setLayerVisibility(first.id, false);
      useAppStore.getState().setLayerOpacity(first.id, 0.4);
      useAppStore
        .getState()
        .addLayer(geojsonLayer({ id: "above", name: "Above", geojson: points(1) }));
    });

    // Only Dissolve changes: the default name is the same, so the run will replace.
    fireEvent.click(screen.getByRole("switch", { name: "Dissolve overlapping areas" }));
    assert.ok(screen.getByText("Replaces the existing “Sites buffer 100 m”."));
    fireEvent.click(screen.getByTestId("buffer-run"));
    await waitFor(() =>
      assert.match(
        screen.getByTestId("analysis-result").textContent ?? "",
        /1 feature replaced “Sites buffer 100 m”\./,
      ),
    );
    assert.equal(screen.queryByText("Replaces the existing “Sites buffer 100 m”."), null);
    const layers = useAppStore.getState().layers;
    assert.deepEqual(
      layers.map((layer) => layer.id),
      ["sites", first.id, "above"],
    );
    const replaced = layers[1]!;
    assert.equal(replaced.name, "Sites buffer 100 m");
    assert.equal(replaced.visible, false);
    assert.equal(replaced.opacity, 0.4);
    assert.deepEqual(replaced.style, first.style);
    assert.equal(replaced.geojson?.features.length, 1);
    assert.equal(originOf(replaced)?.settings.dissolve, true);

    act(() => undo());
    const restored = useAppStore.getState().layers.find((layer) => layer.id === first.id)!;
    assert.equal(restored.geojson?.features.length, 2);
    assert.equal(originOf(restored)?.settings.dissolve, false);
    assert.equal(restored.opacity, 0.4);
    assert.equal(useAppStore.getState().layers.length, 3);
  });

  it("disables Run when the name belongs to a layer that isn't a result, or to the input", () => {
    setLayers(
      geojsonLayer({ id: "sites", name: "Sites", geojson: points(2) }),
      geojsonLayer({ id: "upload", name: "Sites buffer 100 m", geojson: points(1) }),
    );
    useAnalysisStore.setState({
      tool: "buffer",
      buffer: { ...DEFAULT_BUFFER_FORM, inputLayerId: "sites" },
    });
    render(createElement(AnalysisPanel));
    const clash = "A layer called “Sites buffer 100 m” already exists. Choose another name.";
    assert.ok(screen.getByText(clash));
    assert.equal((screen.getByTestId("buffer-run") as HTMLButtonElement).disabled, true);
    fireEvent.change(screen.getByTestId("buffer-name"), { target: { value: "Sites" } });
    assert.ok(screen.getByText("A layer called “Sites” already exists. Choose another name."));
    fireEvent.change(screen.getByTestId("buffer-name"), { target: { value: "Sites 100 m" } });
    assert.equal((screen.getByTestId("buffer-run") as HTMLButtonElement).disabled, false);
  });

  it("matches the output name regardless of capitals: overwrite and clash", async () => {
    setAnalysisWorkerFactory(() => fakeWorker() as unknown as Worker);
    setLayers(
      geojsonLayer({ id: "collars", name: "GeotechCollar - 1", geojson: points(2) }),
      geojsonLayer({ id: "upload", name: "Boreholes", geojson: points(1) }),
    );
    useAnalysisStore.setState({
      tool: "buffer",
      buffer: { ...DEFAULT_BUFFER_FORM, inputLayerId: "collars" },
    });
    render(createElement(AnalysisPanel));
    fireEvent.click(screen.getByTestId("buffer-run"));
    await waitFor(() => assert.ok(screen.getByTestId("analysis-result")));
    const first = useAppStore.getState().layers.at(-1)!;
    assert.equal(first.name, "GeotechCollar - 1 buffer 100 m");

    fireEvent.change(screen.getByTestId("buffer-name"), {
      target: { value: " geotechcollar - 1 buffer 100 m " },
    });
    assert.ok(screen.getByText("Replaces the existing “GeotechCollar - 1 buffer 100 m”."));
    fireEvent.click(screen.getByRole("switch", { name: "Dissolve overlapping areas" }));
    fireEvent.click(screen.getByTestId("buffer-run"));
    await waitFor(() =>
      assert.match(
        screen.getByTestId("analysis-result").textContent ?? "",
        /1 feature replaced “GeotechCollar - 1 buffer 100 m”\./,
      ),
    );
    const layers = useAppStore.getState().layers;
    assert.equal(layers.length, 3);
    // The replaced layer keeps its own name and id.
    assert.equal(layers.at(-1)!.id, first.id);
    assert.equal(layers.at(-1)!.name, "GeotechCollar - 1 buffer 100 m");

    fireEvent.change(screen.getByTestId("buffer-name"), { target: { value: "BOREHOLES" } });
    assert.ok(screen.getByText("A layer called “BOREHOLES” already exists. Choose another name."));
    assert.equal((screen.getByTestId("buffer-run") as HTMLButtonElement).disabled, true);
  });

  it("cancels a run: the worker stops and nothing is added", async () => {
    const worker = fakeWorker({ hold: true });
    setAnalysisWorkerFactory(() => worker as unknown as Worker);
    setLayers(geojsonLayer({ id: "sites", name: "Sites", geojson: points(2) }));
    useAnalysisStore.setState({ tool: "buffer" });
    render(createElement(AnalysisPanel));
    fireEvent.click(screen.getByTestId("buffer-run"));
    await waitFor(() => assert.equal(screen.getByTestId("buffer-run").textContent, "Running…"));
    fireEvent.click(screen.getByTestId("buffer-cancel"));
    await waitFor(() => assert.ok(screen.getByText("Cancelled. Nothing was added.")));
    assert.equal(worker.terminated, true);
    assert.equal(useAppStore.getState().layers.length, 1);
  });
});
