import { useEffect } from "react";
import { applySwiftmapDefaultBasemap } from "./swiftmap-basemap";

/**
 * SWIFTMAP (Change 23): apply the Protomaps Light default once the runtime
 * environment is known, and again when it changes, so a key set in Settings →
 * Environment variables reaches an untouched startup map. Call it after
 * `useRuntimeEnvironmentVariables()`, whose effect sets the environment first.
 */
export function useSwiftmapDefaultBasemap(): void {
  useEffect(() => {
    const apply = () => {
      applySwiftmapDefaultBasemap();
    };
    apply();
    window.addEventListener("geolibre:runtime-env-change", apply);
    return () => window.removeEventListener("geolibre:runtime-env-change", apply);
  }, []);
}
