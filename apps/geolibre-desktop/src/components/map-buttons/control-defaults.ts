import { readControlPreference, writeControlPreference } from "../../lib/control-preferences";

// SWIFTMAP (Change 26): Swiftmap's first-run map buttons. GeoLibre keeps each
// device's Controls menu choices in local storage and falls back to its own
// defaults (Zoom off, Globe on) for a control the user has never switched.
// Seeding the missing entries at startup gives a new device Swiftmap's
// defaults without editing the engine's table; a choice already made stays.

/** The defaults that differ from GeoLibre's. */
export const SWIFTMAP_FIRST_RUN_CONTROLS: Readonly<Record<string, boolean>> = {
  navigation: true,
  globe: false,
};

type Read = (key: string, fallback: boolean) => boolean;
type Write = (key: string, visible: boolean) => void;

/**
 * Writes Swiftmap's default for each control this device has no choice for.
 *
 * @param read - Reads a stored choice, or the fallback when there is none.
 * @param write - Stores a choice.
 * @returns The controls that were seeded.
 */
export function seedSwiftmapControlDefaults(
  read: Read = readControlPreference,
  write: Write = writeControlPreference,
): string[] {
  const seeded: string[] = [];
  for (const [key, visible] of Object.entries(SWIFTMAP_FIRST_RUN_CONTROLS)) {
    // A stored choice reads the same whatever the fallback; a missing one doesn't.
    const missing = read(key, true) !== read(key, false);
    if (!missing) continue;
    write(key, visible);
    seeded.push(key);
  }
  return seeded;
}
