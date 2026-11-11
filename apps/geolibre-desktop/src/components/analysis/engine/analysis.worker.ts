/// <reference lib="webworker" />
import { AnalysisError } from "./common";
import type { AnalysisResponse } from "./run-in-worker";
import { runTool, type AnalysisRequest } from "./run-tool";

/**
 * SWIFTMAP (Change 37): runs analysis tools off the main thread, so the map
 * stays responsive. One request per worker; cancelling terminates it.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  let response: AnalysisResponse;
  try {
    response = { ok: true, result: runTool(event.data) };
  } catch (error) {
    response = {
      ok: false,
      code: error instanceof AnalysisError ? error.code : "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  scope.postMessage(response);
};
