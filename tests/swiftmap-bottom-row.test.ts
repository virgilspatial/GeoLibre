import assert from "node:assert/strict";
import { describe, it } from "node:test";

// SWIFTMAP: the bottom-right row of scale bar and attribution (i) (Change 39).
const { bottomRowWidth, shouldStack, SCALE_BOX_MAX_WIDTH_PX, BOTTOM_ROW_GAP_PX } = await import(
  "../apps/geolibre-desktop/src/components/map-overlays/bottom-row-layout"
);

describe("bottom row layout", () => {
  const map = { left: 364, right: 1440 };
  // The collapsed (i).
  const otherWidths = [24];

  it("counts the scale bar at its longest, so zooming never flips the layout", () => {
    assert.equal(bottomRowWidth({ otherWidths, scale: true }), SCALE_BOX_MAX_WIDTH_PX + BOTTOM_ROW_GAP_PX + 24);
    assert.equal(bottomRowWidth({ otherWidths, scale: false }), 24);
    assert.equal(bottomRowWidth({ otherWidths: [0], scale: false }), 0);
  });

  it("stays a row on a wide map, even with something in the bottom left", () => {
    assert.equal(shouldStack({ map, otherWidths, scale: true, bottomLeft: [] }), false);
    assert.equal(
      shouldStack({ map, otherWidths, scale: true, bottomLeft: [{ left: 374, right: 630 }] }),
      false,
    );
  });

  it("stacks when the row would come within the gap of the bottom left", () => {
    const narrow = { left: 364, right: 700 };
    // Row: 120 + 6 + 24 = 150px, so it starts at 700 - 10 - 150 = 540.
    assert.equal(
      shouldStack({ map: narrow, otherWidths, scale: true, bottomLeft: [{ left: 374, right: 534 }] }),
      false,
    );
    assert.equal(
      shouldStack({ map: narrow, otherWidths, scale: true, bottomLeft: [{ left: 374, right: 535 }] }),
      true,
    );
    // Empty boxes (a hidden control) don't count.
    assert.equal(
      shouldStack({ map: narrow, otherWidths, scale: true, bottomLeft: [{ left: 600, right: 600 }] }),
      false,
    );
  });

  it("stacks when an expanded attribution makes the row reach the bottom left", () => {
    const narrow = { left: 364, right: 900 };
    const legend = [{ left: 374, right: 630 }];
    assert.equal(shouldStack({ map: narrow, otherWidths, scale: true, bottomLeft: legend }), false);
    assert.equal(shouldStack({ map: narrow, otherWidths: [260], scale: true, bottomLeft: legend }), true);
  });

  it("stacks when the row doesn't fit the map at all", () => {
    assert.equal(
      shouldStack({ map: { left: 0, right: 150 }, otherWidths, scale: true, bottomLeft: [] }),
      true,
    );
  });
});
