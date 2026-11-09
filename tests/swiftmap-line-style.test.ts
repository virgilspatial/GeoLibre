import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LAYER_STYLE, STROKE_DASH_PRESETS, type LayerStyle } from "@geolibre/core";
import {
  LINE_STYLES,
  dashPatternOf,
  lineBlurOf,
  lineStyleChoices,
  lineStyleOf,
  lineStylePatch,
  strokeOpacityPatch,
  strokeOpacityPercent,
} from "../apps/geolibre-desktop/src/components/style-panel-swiftmap/line-style";

// SWIFTMAP (Change 31): the Style panel's line opacity, dashes and blur
// (GeoLibre #3360).

const style = (patch: Partial<LayerStyle> = {}): LayerStyle => ({
  ...DEFAULT_LAYER_STYLE,
  ...patch,
});

describe("line style choices", () => {
  it("offers GeoLibre's presets, solid first", () => {
    assert.deepEqual(LINE_STYLES, ["solid", "dashed", "dotted", "dash-dot", "long-dash"]);
    for (const name of LINE_STYLES) assert.ok(name in STROKE_DASH_PRESETS, name);
  });

  it("reads a new layer as solid, and each preset by its pattern", () => {
    assert.equal(lineStyleOf(style()), "solid");
    assert.equal(lineStyleOf(style({ strokeDash: [4, 2] })), "dashed");
    assert.equal(lineStyleOf(style({ strokeDash: [1, 2] })), "dotted");
    assert.equal(lineStyleOf(style({ strokeDash: [4, 2, 1, 2] })), "dash-dot");
    assert.equal(lineStyleOf(style({ strokeDash: [8, 3] })), "long-dash");
  });

  it("reads an unusable pattern (an old or hand-edited file) as solid", () => {
    assert.equal(lineStyleOf(style({ strokeDash: [0, 0] })), "solid");
    assert.equal(lineStyleOf(style({ strokeDash: undefined as unknown as number[] })), "solid");
  });

  it("lists Custom only while the layer has a pattern no preset matches", () => {
    assert.equal(lineStyleChoices(style()).includes("custom"), false);
    const imported = style({ strokeDash: [3, 1, 3] });
    assert.equal(lineStyleOf(imported), "custom");
    assert.deepEqual(lineStyleChoices(imported), [...LINE_STYLES, "custom"]);
  });

  it("writes a preset's pattern, an empty one for solid, and nothing for Custom", () => {
    assert.deepEqual(lineStylePatch("dashed"), { strokeDash: [4, 2] });
    assert.deepEqual(lineStylePatch("solid"), { strokeDash: [] });
    assert.deepEqual(lineStylePatch("custom"), {});
    // A copy: editing the patch must not change GeoLibre's preset.
    const patch = lineStylePatch("dotted");
    patch.strokeDash!.push(9);
    assert.deepEqual([...STROKE_DASH_PRESETS.dotted], [1, 2]);
  });

  it("gives the dash pattern, or null when solid", () => {
    assert.equal(dashPatternOf(style()), null);
    assert.deepEqual(dashPatternOf(style({ strokeDash: [4, 2] })), [4, 2]);
  });
});

describe("line opacity and blur", () => {
  it("shows opacity as a whole percentage, a missing value as 100", () => {
    assert.equal(strokeOpacityPercent(style()), 100);
    assert.equal(strokeOpacityPercent(style({ strokeOpacity: 0.456 })), 46);
    assert.equal(strokeOpacityPercent(style({ strokeOpacity: undefined as unknown as number })), 100);
  });

  it("writes a percentage as 0..1, clamped", () => {
    assert.deepEqual(strokeOpacityPatch(60), { strokeOpacity: 0.6 });
    assert.deepEqual(strokeOpacityPatch(140), { strokeOpacity: 1 });
    assert.deepEqual(strokeOpacityPatch(-5), { strokeOpacity: 0 });
  });

  it("reads blur in px, a negative value as 0", () => {
    assert.equal(lineBlurOf(style()), 0);
    assert.equal(lineBlurOf(style({ strokeBlur: 2.5 })), 2.5);
    assert.equal(lineBlurOf(style({ strokeBlur: -1 })), 0);
  });
});
