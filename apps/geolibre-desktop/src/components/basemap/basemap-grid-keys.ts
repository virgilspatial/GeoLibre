/**
 * SWIFTMAP (Change 42): arrow keys in the basemap picker's grid. Focus moves
 * between tiles like a radio group's, but only Enter, Space or a click applies
 * a basemap: each one is a network load, so it doesn't follow focus.
 */

/** Tiles per row in the picker. */
export const BASEMAP_GRID_COLUMNS = 3;

/**
 * The tile a key moves focus to, or null when the key isn't a grid key.
 * ←/→ move one tile (mirrored right to left), ↑/↓ one row, Home/End to the
 * first and last. Moves stop at the edges rather than wrapping.
 *
 * @param key - `KeyboardEvent.key`.
 * @param index - The focused tile.
 * @param count - How many tiles there are.
 * @param rtl - Right to left.
 * @returns The tile to focus, or null.
 */
export function nextGridIndex(key: string, index: number, count: number, rtl = false): number | null {
  if (count === 0) return null;
  const last = count - 1;
  const clamp = (value: number) => Math.min(last, Math.max(0, value));
  switch (key) {
    case "ArrowRight":
      return clamp(index + (rtl ? -1 : 1));
    case "ArrowLeft":
      return clamp(index + (rtl ? 1 : -1));
    case "ArrowDown":
      return index + BASEMAP_GRID_COLUMNS <= last ? index + BASEMAP_GRID_COLUMNS : index;
    case "ArrowUp":
      return index - BASEMAP_GRID_COLUMNS >= 0 ? index - BASEMAP_GRID_COLUMNS : index;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}
