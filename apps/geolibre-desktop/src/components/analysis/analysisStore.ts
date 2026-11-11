import { useAppStore, type GeoLibreLayer } from "@geolibre/core";
import type { FeatureCollection } from "geojson";
import { create } from "zustand";
import { readRecent, rememberRecent } from "./analysis-tools";
import { matchOutputName } from "./form-model";
import { BUFFER_QUADRANT_SEGMENTS, type DistanceUnit } from "./engine/buffer";
import {
  AnalysisCancelled,
  runInWorker,
  type AnalysisRequest,
  type AnalysisRun,
  type WorkerFactory,
} from "./engine/run-in-worker";
import {
  buildOrigin,
  resultMetadata,
  type AnalysisToolId,
  type OriginInput,
  type OriginSettings,
} from "./origin";

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

export interface ClipForm {
  inputLayerId: string | null;
  /** The polygon layer to clip by, or null for the default (the top one that isn't the input). */
  clipLayerId: string | null;
  name: string | null;
}

export interface IntersectForm {
  inputLayerId: string | null;
  overlayLayerId: string | null;
  name: string | null;
}

export interface DissolveForm {
  inputLayerId: string | null;
  /** The field to dissolve by, or null for none (everything into one feature). */
  field: string | null;
  name: string | null;
}

/** The tools with a form (Change 43); Constraint summary and Area by zone come in 6b3. */
export type FormToolId = "buffer" | "clip" | "intersect" | "dissolve";

/** Every state but `idle` names the tool it belongs to, so only that form shows it. */
export type RunState =
  | { status: "idle" }
  | { status: "running"; tool?: FormToolId }
  /** `replaced`: the run overwrote an earlier analysis result of the same name. */
  | {
      status: "done";
      tool?: FormToolId;
      layerId: string;
      name: string;
      count: number;
      replaced: boolean;
    }
  | { status: "cancelled"; tool?: FormToolId }
  /** `code` picks the message: an engine error code, "noFeatures", or "failed" with `message`. */
  | { status: "failed"; tool?: FormToolId; code: string; message: string };

/** Whether a run state belongs to a tool's form (states without a tool belong to Buffer). */
export const runBelongsTo = (run: RunState, tool: FormToolId) =>
  run.status !== "idle" && (run.tool ?? "buffer") === tool;

interface RunInput {
  layerId: string;
  role?: OriginInput["role"];
}

interface AnalysisState {
  /** The tool whose form is open, or null for the list. */
  tool: AnalysisToolId | null;
  query: string;
  recent: AnalysisToolId[];
  buffer: BufferForm;
  clip: ClipForm;
  intersect: IntersectForm;
  dissolve: DissolveForm;
  run: RunState;
  openTool: (tool: AnalysisToolId) => void;
  back: () => void;
  setQuery: (query: string) => void;
  /** Changes a form; that tool's finished line clears, as it no longer matches. */
  updateBuffer: (patch: Partial<BufferForm>) => void;
  updateClip: (patch: Partial<ClipForm>) => void;
  updateIntersect: (patch: Partial<IntersectForm>) => void;
  updateDissolve: (patch: Partial<DissolveForm>) => void;
  runBuffer: (options: { inputLayerId: string; name: string }) => Promise<void>;
  runClip: (options: { inputLayerId: string; clipLayerId: string; name: string }) => Promise<void>;
  runIntersect: (options: {
    inputLayerId: string;
    overlayLayerId: string;
    name: string;
  }) => Promise<void>;
  runDissolve: (options: {
    inputLayerId: string;
    field: string | null;
    name: string;
  }) => Promise<void>;
  cancel: () => void;
}

export const DEFAULT_BUFFER_FORM: BufferForm = {
  inputLayerId: null,
  distance: "100",
  unit: "m",
  dissolve: false,
  name: null,
};
export const DEFAULT_CLIP_FORM: ClipForm = { inputLayerId: null, clipLayerId: null, name: null };
export const DEFAULT_INTERSECT_FORM: IntersectForm = {
  inputLayerId: null,
  overlayLayerId: null,
  name: null,
};
export const DEFAULT_DISSOLVE_FORM: DissolveForm = { inputLayerId: null, field: null, name: null };

let activeRun: AnalysisRun | null = null;
let workerFactory: WorkerFactory | undefined;

/** Replaces the worker in tests. */
export function setAnalysisWorkerFactory(factory: WorkerFactory | undefined): void {
  workerFactory = factory;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => {
  /** A form change clears that tool's finished line, never a run in progress. */
  const clearedRun = (state: AnalysisState, tool: FormToolId): RunState =>
    state.run.status !== "running" && runBelongsTo(state.run, tool)
      ? { status: "idle" }
      : state.run;

  /**
   * Runs a tool in a worker and adds or replaces its result layer. One run at
   * a time, across all tools.
   */
  const start = async (options: {
    tool: FormToolId;
    inputs: RunInput[];
    name: string;
    request: (collections: FeatureCollection[]) => AnalysisRequest;
    settings: OriginSettings;
    /** Keeps the inputs that were used in the form after a run. */
    keepInputs: (state: AnalysisState) => Partial<AnalysisState>;
  }) => {
    if (activeRun) return;
    const { tool, name } = options;
    const all = useAppStore.getState().layers;
    const layers = options.inputs.map((input) => all.find((layer) => layer.id === input.layerId));
    if (layers.some((layer) => !layer?.geojson)) return;
    const inputLayers = layers as GeoLibreLayer[];
    const collections = inputLayers.map((layer) => layer.geojson!);
    set({ run: { status: "running", tool } });
    const run = runInWorker(options.request(collections), workerFactory);
    activeRun = run;
    try {
      const response = await run.done;
      if (!response.ok) {
        set({ run: { status: "failed", tool, code: response.code, message: response.message } });
        return;
      }
      const { collection, zone, zoneWarning, precisionFallback } = response.result;
      if (collection.features.length === 0) {
        set({ run: { status: "failed", tool, code: "noFeatures", message: "" } });
        return;
      }
      const origin = buildOrigin({
        tool,
        inputs: inputLayers.map((layer, index) => {
          const role = options.inputs[index]!.role;
          return {
            layerId: layer.id,
            name: layer.name,
            featureCount: layer.geojson!.features.length,
            ...(role ? { role } : {}),
          };
        }),
        settings: options.settings,
        zone,
        zoneWarning,
        precisionFallback,
      });
      // The output name decides (Change 37 review): an analysis result of the
      // same name is overwritten in place, keeping its place, group,
      // visibility and style; one store update, so one Undo step. Matched
      // again now, as the layers may have changed during the run.
      const app = useAppStore.getState();
      const match = matchOutputName(
        name,
        app.layers,
        inputLayers.map((layer) => layer.id),
      );
      if (match.kind === "taken") {
        set({ run: { status: "failed", tool, code: "nameTaken", message: name } });
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
          tool,
          layerId,
          name: match.kind === "replace" ? match.layer.name : name,
          count: collection.features.length,
          replaced: match.kind === "replace",
        },
        recent: rememberRecent(tool, state.recent),
        // A new result is now the top layer; keep the inputs that were used.
        // The name stays as it is.
        ...options.keepInputs(state),
      }));
    } catch (error) {
      if (error instanceof AnalysisCancelled) set({ run: { status: "cancelled", tool } });
      else set({ run: { status: "failed", tool, code: "failed", message: String(error) } });
    } finally {
      activeRun = null;
    }
  };

  return {
    tool: null,
    query: "",
    recent: readRecent(),
    buffer: DEFAULT_BUFFER_FORM,
    clip: DEFAULT_CLIP_FORM,
    intersect: DEFAULT_INTERSECT_FORM,
    dissolve: DEFAULT_DISSOLVE_FORM,
    run: { status: "idle" },
    openTool: (tool) => set({ tool }),
    back: () => set({ tool: null }),
    setQuery: (query) => set({ query }),
    updateBuffer: (patch) =>
      set((state) => ({
        buffer: { ...state.buffer, ...patch },
        run: clearedRun(state, "buffer"),
      })),
    updateClip: (patch) =>
      set((state) => ({ clip: { ...state.clip, ...patch }, run: clearedRun(state, "clip") })),
    updateIntersect: (patch) =>
      set((state) => ({
        intersect: { ...state.intersect, ...patch },
        run: clearedRun(state, "intersect"),
      })),
    updateDissolve: (patch) =>
      set((state) => ({
        dissolve: { ...state.dissolve, ...patch },
        run: clearedRun(state, "dissolve"),
      })),
    runBuffer: ({ inputLayerId, name }) => {
      const form = get().buffer;
      const settings = { distance: Number(form.distance), unit: form.unit, dissolve: form.dissolve };
      return start({
        tool: "buffer",
        inputs: [{ layerId: inputLayerId }],
        name,
        request: ([input]) => ({ tool: "buffer", input: input!, settings }),
        settings: { ...settings, segments: BUFFER_QUADRANT_SEGMENTS },
        keepInputs: (state) => ({ buffer: { ...state.buffer, inputLayerId } }),
      });
    },
    runClip: ({ inputLayerId, clipLayerId, name }) =>
      start({
        tool: "clip",
        inputs: [
          { layerId: inputLayerId, role: "input" },
          { layerId: clipLayerId, role: "clip" },
        ],
        name,
        request: ([input, clip]) => ({ tool: "clip", input: input!, clip: clip! }),
        settings: {},
        keepInputs: (state) => ({ clip: { ...state.clip, inputLayerId, clipLayerId } }),
      }),
    runIntersect: ({ inputLayerId, overlayLayerId, name }) =>
      start({
        tool: "intersect",
        inputs: [
          { layerId: inputLayerId, role: "input" },
          { layerId: overlayLayerId, role: "overlay" },
        ],
        name,
        request: ([input, overlay]) => ({ tool: "intersect", input: input!, overlay: overlay! }),
        settings: {},
        keepInputs: (state) => ({
          intersect: { ...state.intersect, inputLayerId, overlayLayerId },
        }),
      }),
    runDissolve: ({ inputLayerId, field, name }) => {
      const settings = { field };
      return start({
        tool: "dissolve",
        inputs: [{ layerId: inputLayerId }],
        name,
        request: ([input]) => ({ tool: "dissolve", input: input!, settings }),
        settings,
        keepInputs: (state) => ({ dissolve: { ...state.dissolve, inputLayerId } }),
      });
    },
    cancel: () => activeRun?.cancel(),
  };
});
