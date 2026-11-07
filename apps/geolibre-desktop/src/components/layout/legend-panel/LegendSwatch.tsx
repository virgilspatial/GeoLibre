import type { CSSProperties } from "react";
import type { LegendPattern, LegendSwatch as Swatch } from "./legend-model";

/** `#rrggbb` at an opacity, as `rgba()`. */
function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  if (!Number.isFinite(value)) return hex;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** The pattern lines as CSS backgrounds, like GeoLibre's sprite tiles but at swatch scale. */
function patternBackground(pattern: LegendPattern, color: string): CSSProperties {
  const line = `${color} 0 1.25px, transparent 1.25px 4px`;
  switch (pattern) {
    case "hatch":
      return { backgroundImage: `repeating-linear-gradient(-45deg, ${line})` };
    case "cross-hatch":
      return {
        backgroundImage: `repeating-linear-gradient(-45deg, ${line}), repeating-linear-gradient(45deg, ${line})`,
      };
    case "horizontal":
      return { backgroundImage: `repeating-linear-gradient(0deg, ${line})` };
    case "vertical":
      return { backgroundImage: `repeating-linear-gradient(90deg, ${line})` };
    case "dots":
      return {
        backgroundImage: `radial-gradient(circle, ${color} 0 1px, transparent 1.25px)`,
        backgroundSize: "4px 4px",
      };
  }
}

/**
 * SWIFTMAP (Change 25): a legend swatch in the 18px column. Polygons are 14px
 * rounded squares, points 12px dots with a thin dark outline, lines the full
 * width. A dimmed row fades only its swatch, to 40%.
 */
export function LegendSwatch({
  swatch,
  dimmed = false,
  category = false,
}: {
  swatch: Swatch;
  dimmed?: boolean;
  /** A category under a heading: its flat fill floor is 55%, a single layer's 45% (mockup). */
  category?: boolean;
}) {
  const opacity = dimmed ? 0.4 : 1;
  let style: CSSProperties;
  if (swatch.kind === "point") {
    style = {
      width: 12,
      height: 12,
      margin: "0 3px",
      borderRadius: "50%",
      background: swatch.color,
      boxShadow: "inset 0 0 0 1px rgba(9, 9, 11, 0.2)",
    };
  } else if (swatch.kind === "line") {
    style = { width: 18, height: swatch.width, borderRadius: 2, background: swatch.color };
  } else {
    // A pattern replaces the fill on the map, so only the lines show, at the
    // fill opacity. A flat fill keeps a floor so pale fills still read.
    const fill = swatch.pattern
      ? patternBackground(
          swatch.pattern,
          rgba(swatch.patternColor, Math.max(swatch.fillOpacity, 0.6)),
        )
      : { background: rgba(swatch.fill, Math.max(swatch.fillOpacity, category ? 0.55 : 0.45)) };
    style = {
      width: 14,
      height: 14,
      margin: "0 2px",
      borderRadius: 3,
      ...fill,
      ...(swatch.outline ? { boxShadow: `inset 0 0 0 1px ${swatch.outline}` } : {}),
    };
  }
  return (
    <span
      aria-hidden="true"
      data-testid="legend-swatch"
      data-kind={swatch.kind}
      className="block shrink-0"
      style={{ ...style, opacity }}
    />
  );
}
