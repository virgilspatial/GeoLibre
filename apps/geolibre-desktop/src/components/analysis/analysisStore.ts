import { useAppStore } from "@geolibre/core";
import { create } from "zustand";
import { readRecent, rememberRecent } from "./analysis-tools";
import { matchOutputName } from "./buffer-form-model";
import { BUFFER_QUADRANT_SEGMENTS, type DistanceUnit } from "./engine/buffer";
import {
  AnalysisCancelled,
  runInWorker,
  type AnalysisRun,
  type WorkerFactory,
} from "./engine/run-in-worker";
import { buildOrigin, resultMetadata, type AnalysisToolId } from "./origin";

/**
 * SWIFTMAP (Change 37): the Analysis panel's state. It lives outside the panel,
 * so a run keeps going, and the form keeps its values, while another side panel
 * is shown. Never saved.
 */

export interface BufferForm {
  /** The chosen input layer, or null for the default (the top listed layer). */
  inputLayerId: string | null;
  /** As typed, so an empty or partial number can be edited. */
  distance: string;
  unit: DistanceUnit;
  dissolve: boolean;
  /** The output name as edited, or null while it follows the settings. */
  name: string | null;
}

export type RunState =
  | { status: "idle" }
  | { status: "running" }
  /** `replaced`: the run overwrote an earlier analysis result of the same name. */
  | { status: "done"; layerId: string; name: string; count: number; replaced: boolean }
  | { status: "cancelled" }
  /** `code` picks the message: an engine error code, "noFeatures", or "failed" with `message`. */
  | { status: "failed"; code: string; message: string };

interface AnalysisState {
  /** The tool whose form is open, or null for the list. */
  tool: AnalysisToolId | null;
  query: string;
  recent: AnalysisToolId[];
  buffer: BufferForm;
  run: RunState;
  openTool: (tool: AnalysisToolId) => void;
  back: () => void;
  setQuery: (query: string) => void;
  /** Changes the form; a finished run's line clears, as it no longer matches. */
  updateBuffer: (patch: Partial<BufferForm>) => void;
  runBuffer: (options: { inputLayerId: string; name: string }) => Promise<void>;
  cancel: () => void;
}

export const DEFAULT_BUFFER_FORM: BufferForm = {
  inputLayerId: null,
  distance: "100",
  unit: "m",
  dissolve: false,
  name: null,
};

let activeRun: AnalysisRun | null = null;
let workerFactory: WorkerFactory | undefined;

/** Replaces the worker in tests. */
export function setAnalysisWorkerFactory(factory: WorkerFactory | undefined): void {
  workerFactory = factory;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  tool: null,
  query: "",
  recent: readRecent(),
  buffer: DEFAULT_BUFFER_FORM,
  run: { status: "idle" },
  openTool: (tool) => set({ tool }),
  back: () => set({ tool: null }),
  setQuery: (query) => set({ query }),
  updateBuffer: (patch) =>
    set((state) => ({
      buffer: { ...state.buffer, ...patch },
      run: state.run.status === "running" ? state.run : { status: "idle" },
    })),
  runBuffer: async ({ inputLayerId, name }) => {
    if (activeRun) return;
    const layer = useAppStore.getState().layers.find((item) => item.id === inputLayerId);
    const input = layer?.geojson;
    const form = get().buffer;
    const distance = Number(form.distance);
    if (!layer || !input) return;
    const settings = { distance, unit: form.unit, dissolve: form.dissolve };
    set({ run: { status: "running" } });
    const run = runInWorker({ tool: "buffer", input, settings }, workerFactory);
    activeRun = run;
    try {
      const response = await run.done;
      if (!response.ok) {
        set({ run: { status: "failed", code: response.code, message: response.message } });
        return;
      }
      const { collection, zone, zoneWarning } = response.result;
      if (collection.features.length === 0) {
        set({ run: { status: "failed", code: "noFeatures", message: "" } });
        return;
      }
      const origin = buildOrigin({
        tool: "buffer",
        inputs: [{ layerId: layer.id, name: layer.name, featureCount: input.features.length }],
        settings: { ...settings, segments: BUFFER_QUADRANT_SEGMENTS },
        zone,
        zoneWarning,
      });
      // The output name decides (Change 37 review): an analysis result of the
      // same name is overwritten in place, keeping its place, group,
      // visibility and style; one store update, so one Undo step. Matched
      // again now, as the layers may have changed during the run.
      const app = useAppStore.getState();
      const match = matchOutputName(name, app.layers, layer.id);
      if (match.kind === "taken") {
        set({ run: { status: "failed", code: "nameTaken", message: name } });
        return;
      }
      let layerId: string;
      if (match.kind === "replace") {
        layerId = match.layer.id;
        app.updateLayer(layerId, {
          geojson: collection,
          metadata: { ...match.layer.metadata, ...resultMetadata(origin) },
        });
      } else {
        layerId = app.addGeoJsonLayer(name, collection, undefined, null, {
          metadata: resultMetadata(origin),
        });
      }
      set((state) => ({
        run: {
          status: "done",
          layerId,
          name: match.kind === "replace" ? match.layer.name : name,
          count: collection.features.length,
          replaced: match.kind === "replace",
        },
        recent: rememberRecent("buffer", state.recent),
        // A new result is now the top layer; keep the input that was used.
        // The name stays as it is.
        buffer: { ...state.buffer, inputLayerId },
      }));
    } catch (error) {
      if (error instanceof AnalysisCancelled) set({ run: { status: "cancelled" } });
      else set({ run: { status: "failed", code: "failed", message: String(error) } });
    } finally {
      activeRun = null;
    }
  },
  cancel: () => activeRun?.cancel(),
}));
