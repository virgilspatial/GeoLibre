import type { GeoLibreLayer } from "@geolibre/core";
import type { FeatureCollection } from "geojson";
import type { AnalysisInput } from "./analysis-inputs";
import { inputsZone, toolFormStatus, type FormStatus } from "./form-model";

/**
 * SWIFTMAP (Change 37): what the Buffer form shows and allows, worked out from
 * its fields. Pure, for tests; the form only renders it. The shared rules
 * (inputs, size, zone, output name) are in `form-model.ts` since Change 43.
 */
export {
  matchOutputName,
  type FormStatus,
  type NameMatch,
  type RunBlock,
} from "./form-model";

/** "Heritage items buffer 100 m": the mockup's pattern. */
export function autoOutputName(inputName: string, distance: string, unitLabel: string): string {
  return `${inputName} buffer ${distance.trim() || "0"} ${unitLabel}`;
}

/** The typed distance as a number more than 0, or null. */
export function parseDistance(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The zone for an input. */
export function inputZone(collection: FeatureCollection): FormStatus["zone"] {
  return inputsZone([collection]);
}

export function bufferFormStatus(options: {
  input: AnalysisInput | null;
  distance: string;
  name: string;
  layers: readonly GeoLibreLayer[];
}): FormStatus {
  return toolFormStatus({
    inputs: [{ input: options.input }],
    name: options.name,
    layers: options.layers,
    check: () => (parseDistance(options.distance) === null ? "badDistance" : null),
  });
}
