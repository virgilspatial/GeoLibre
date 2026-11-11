import type { AnalysisErrorCode, ToolResult } from "./common";
import type { AnalysisRequest } from "./run-tool";

export type { AnalysisRequest } from "./run-tool";

/**
 * SWIFTMAP (Change 37): starting an analysis run in its own worker, and
 * cancelling it. Each run gets a fresh worker, terminated when it settles or is
 * cancelled, so a cancelled run can never add anything.
 */
export type AnalysisResponse =
  | { ok: true; result: ToolResult }
  | { ok: false; code: AnalysisErrorCode | "failed"; message: string };

export class AnalysisCancelled extends Error {
  constructor() {
    super("The analysis was cancelled.");
    this.name = "AnalysisCancelled";
  }
}

export interface AnalysisRun {
  /** Settles with the tool's answer; rejects with {@link AnalysisCancelled} when cancelled. */
  done: Promise<AnalysisResponse>;
  cancel: () => void;
}

/** Spawns the worker. Replaced in tests. */
export type WorkerFactory = () => Worker;

const defaultFactory: WorkerFactory = () =>
  new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });

export function runInWorker(
  request: AnalysisRequest,
  createWorker: WorkerFactory = defaultFactory,
): AnalysisRun {
  const worker = createWorker();
  let settle: ((response: AnalysisResponse) => void) | null = null;
  let fail: ((error: Error) => void) | null = null;
  const done = new Promise<AnalysisResponse>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  const finish = () => {
    settle = null;
    fail = null;
    worker.terminate();
  };
  worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
    const resolve = settle;
    finish();
    resolve?.(event.data);
  };
  worker.onerror = (event: ErrorEvent) => {
    event.preventDefault();
    const resolve = settle;
    finish();
    resolve?.({ ok: false, code: "failed", message: event.message || "The analysis stopped." });
  };
  worker.postMessage(request);
  return {
    done,
    cancel: () => {
      const reject = fail;
      finish();
      reject?.(new AnalysisCancelled());
    },
  };
}
