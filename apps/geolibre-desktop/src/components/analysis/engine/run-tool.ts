import type { FeatureCollection } from "geojson";
import { runBuffer, type BufferSettings } from "./buffer";
import type { ToolResult } from "./common";
import { runClip, runDissolve, runIntersect, type DissolveSettings } from "./overlay";
import { precisionFallbackUsed, resetPrecisionFallback } from "./polygon-ops";

/**
 * SWIFTMAP (Change 43): one request per run, answered by the matching tool.
 * The worker calls this; tests call it in place of a worker.
 */
export type AnalysisRequest =
  | { tool: "buffer"; input: FeatureCollection; settings: BufferSettings }
  | { tool: "clip"; input: FeatureCollection; clip: FeatureCollection }
  | { tool: "intersect"; input: FeatureCollection; overlay: FeatureCollection }
  | { tool: "dissolve"; input: FeatureCollection; settings: DissolveSettings };

export function runTool(request: AnalysisRequest): ToolResult {
  resetPrecisionFallback();
  const result = dispatch(request);
  return precisionFallbackUsed() ? { ...result, precisionFallback: "1 mm" } : result;
}

function dispatch(request: AnalysisRequest): ToolResult {
  switch (request.tool) {
    case "buffer":
      return runBuffer(request.input, request.settings);
    case "clip":
      return runClip(request.input, request.clip);
    case "intersect":
      return runIntersect(request.input, request.overlay);
    case "dissolve":
      return runDissolve(request.input, request.settings);
  }
}
