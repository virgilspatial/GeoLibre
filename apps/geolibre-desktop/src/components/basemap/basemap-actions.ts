import { useAppStore } from "@geolibre/core";

// SWIFTMAP (Change 28): applying a basemap from the card or the picker.

/**
 * Applies a basemap. Every Swiftmap basemap is Earth, so this also returns a
 * project that was on the Moon or Mars to Earth's ellipsoid. The eye and the
 * opacity slider are gone, so a basemap an old project saved hidden or faded
 * is shown in full again.
 *
 * A viewer's choice lasts for the visit only: `quiet` writes it without an
 * Undo step and leaves `isDirty` as it was, so there is nothing to save.
 */
export function applyBasemap(url: string, options: { quiet?: boolean } = {}): void {
  const run = () => {
    const state = useAppStore.getState();
    if (!state.basemapVisible) state.setBasemapVisible(true);
    if (state.basemapOpacity !== 1) state.setBasemapOpacity(1);
    state.restoreEarthBasemap(url);
  };
  if (!options.quiet) {
    run();
    return;
  }
  const dirty = useAppStore.getState().isDirty;
  const history = useAppStore.temporal.getState();
  history.pause();
  try {
    run();
    useAppStore.setState({ isDirty: dirty });
  } finally {
    history.resume();
  }
}
