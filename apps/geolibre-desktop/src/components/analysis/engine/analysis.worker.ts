/// <reference lib="webworker" />
import { AnalysisError, runBuffer } from "./buffer";
import type { AnalysisRequest, AnalysisResponse } from "./run-in-worker";

/**
 * SWIFTMAP (Change 37): runs analysis tools off the main thread, so the map
 * stays responsive. One request per worker; cancelling terminates it.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data;
  let response: AnalysisResponse;
  try {
    switch (request.tool) {
      case "buffer":
        response = { ok: true, result: runBuffer(request.input, request.settings) };
        break;
    }
  } catch (error) {
    response = {
      ok: false,
      code: error instanceof AnalysisError ? error.code : "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  scope.postMessage(response);
};
