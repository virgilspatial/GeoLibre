// SWIFTMAP (Change 39): whether the map's bottom-right corner (scale bar, then
// the attribution (i)) fits as one row or falls back to a stack.

/** The space between the scale bar and the (i), and between the row and anything to its left. */
export const BOTTOM_ROW_GAP_PX = 6;
/** MapLibre's inset for its corner controls, kept for the row. */
export const BOTTOM_ROW_INSET_PX = 10;
/** The scale bar's width at its longest (GeoLibre's 120px, borders included). */
export const SCALE_BOX_MAX_WIDTH_PX = 120;

/** A horizontal extent in viewport pixels. */
export interface Span {
  left: number;
  right: number;
}

export interface BottomRowInput {
  /** The map pane's extent. */
  map: Span;
  /**
   * The widths of the row's controls other than the scale bar, as shown now
   * (the attribution, wider when expanded); the scale bar is counted at its
   * longest so zooming never flips the layout.
   */
  otherWidths: number[];
  /** Whether the scale bar is on. */
  scale: boolean;
  /** Whatever sits in the bottom left (the floating legend, bottom-left controls). */
  bottomLeft: Span[];
}

/** The row's widest extent: every control side by side, the scale bar at its longest. */
export function bottomRowWidth({ otherWidths, scale }: Pick<BottomRowInput, "otherWidths" | "scale">): number {
  const widths = [...(scale ? [SCALE_BOX_MAX_WIDTH_PX] : []), ...otherWidths.filter((w) => w > 0)];
  if (widths.length === 0) return 0;
  return widths.reduce((sum, w) => sum + w, 0) + BOTTOM_ROW_GAP_PX * (widths.length - 1);
}

/**
 * Whether the corner should stack.
 *
 * @returns True when the row would reach anything in the bottom left (with the
 *   gap kept clear), or doesn't fit inside the map's insets at all.
 */
export function shouldStack(input: BottomRowInput): boolean {
  const width = bottomRowWidth(input);
  if (width === 0) return false;
  const rowLeft = input.map.right - BOTTOM_ROW_INSET_PX - width;
  if (rowLeft < input.map.left + BOTTOM_ROW_INSET_PX) return true;
  return input.bottomLeft.some(
    (box) => box.right > box.left && box.right + BOTTOM_ROW_GAP_PX > rowLeft,
  );
}
