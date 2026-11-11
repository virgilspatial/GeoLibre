import { intersection, union } from "polyclip-ts";
import { AnalysisError } from "./common";
import type { MultiPoly } from "./geometry-parts";

/**
 * SWIFTMAP (Change 43): polygon union and intersection with `polyclip-ts`
 * (declared by the desktop app, user 11 Nov 2026), the library behind Turf 7
 * and GeoLibre's own Clip. It works on plain coordinates, so it runs in the
 * analysis zone's metres.
 */

function failure(what: string, error: unknown): AnalysisError {
  const reason = error instanceof Error ? error.message : String(error);
  return new AnalysisError("badGeometry", `${what} couldn't be processed: ${reason}`);
}

/** Retried at this grid, in metres, when the overlay fails on near-coincident edges. */
const RETRY_GRID = 1e-3;

/**
 * Whether a retry was needed since the last reset. Module state is safe here:
 * each worker answers one request, and the tools run synchronously.
 */
let retried = false;

/** Clears the retry flag; `runTool` calls it before each run. */
export function resetPrecisionFallback(): void {
  retried = false;
}

/** Whether any overlay since the last reset only succeeded at the 1 mm grid. */
export function precisionFallbackUsed(): boolean {
  return retried;
}

const snapAll = (polygons: MultiPoly): MultiPoly =>
  polygons.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, y]) => [
        Math.round(x / RETRY_GRID) * RETRY_GRID,
        Math.round(y / RETRY_GRID) * RETRY_GRID,
      ]),
    ),
  );

/**
 * Runs an overlay; if polyclip fails (it can on edges a hair apart), once more
 * with the coordinates snapped to a millimetre, then reports the failure.
 * Exported for tests.
 */
export function withRetry(
  what: string,
  polygons: MultiPoly[],
  run: (...sets: MultiPoly[]) => MultiPoly,
): MultiPoly {
  try {
    return run(...polygons);
  } catch {
    try {
      const result = run(...polygons.map(snapAll));
      retried = true;
      return result;
    } catch (error) {
      throw failure(what, error);
    }
  }
}

/** All the polygons merged; separate ones stay separate polygons of the result. */
export function unionPolygons(polygons: MultiPoly, what = "The polygons"): MultiPoly {
  if (polygons.length === 0) return [];
  return withRetry(what, [polygons], (all) => union(all[0]!, ...all.slice(1)));
}

/** Where two sets of polygons overlap; touching edges alone give nothing. */
export function intersectPolygons(a: MultiPoly, b: MultiPoly, what: string): MultiPoly {
  if (a.length === 0 || b.length === 0) return [];
  return withRetry(what, [a, b], (first, second) => intersection(first!, second!));
}
