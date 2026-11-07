// SWIFTMAP (Change 26): the map button stack's rules, kept free of React so
// they can be unit tested.

/** The stack's buttons, in the mockup's order (Map controls is always last). */
export type MapButtonId = "zoom" | "compass" | "geolocate" | "fullscreen";

/** The built-in GeoLibre control behind each stack button. */
export const MAP_BUTTON_CONTROLS = {
  zoom: "navigation",
  compass: "compass",
  geolocate: "geolocate",
  fullscreen: "fullscreen",
} as const satisfies Record<MapButtonId, string>;

const ORDER: MapButtonId[] = ["zoom", "compass", "geolocate", "fullscreen"];

/**
 * The stack buttons to draw, in order. Each follows its Controls menu entry, so
 * switching an entry off there removes the button.
 *
 * @param controlsVisible - The Controls menu's checkmarks, keyed by control id.
 * @returns The buttons that are switched on.
 */
export function visibleMapButtons(
  controlsVisible: Partial<Record<string, boolean>>,
): MapButtonId[] {
  return ORDER.filter((id) => controlsVisible[MAP_BUTTON_CONTROLS[id]] === true);
}

/**
 * The compass needle's rotation, so it points at north on screen.
 *
 * @param bearing - The map's bearing in degrees (clockwise from north).
 * @returns The CSS rotation in degrees, normalised to (-180, 180].
 */
export function needleRotation(bearing: number): number {
  if (!Number.isFinite(bearing)) return 0;
  const turned = -bearing % 360;
  const normalised = turned > 180 ? turned - 360 : turned <= -180 ? turned + 360 : turned;
  return normalised === 0 ? 0 : normalised;
}

/** The stack's distance from the map's top edge, in px. */
export const STACK_INSET = 16;
/** The gap between the stack's buttons, and below the stack. */
export const STACK_GAP = 8;
/** MapLibre's own margin around each control in a corner. */
export const NATIVE_CONTROL_MARGIN = 10;

/**
 * Where the map's own top-right corner must start so the controls GeoLibre and
 * plugins put there (Globe, Layer Control, Terrain, plugin buttons) sit below
 * the stack, one gap under it, instead of under the buttons.
 *
 * @param stackHeight - The stack's rendered height in px.
 * @returns The corner's `top` in px.
 */
export function nativeCornerTop(stackHeight: number): number {
  if (!(stackHeight > 0)) return STACK_INSET - NATIVE_CONTROL_MARGIN;
  return STACK_INSET + stackHeight + STACK_GAP - NATIVE_CONTROL_MARGIN;
}
