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

/** The longest dash pattern repeat drawn in the 18px swatch, so 1.5 repeats show. */
const MAX_DASH_PERIOD = 12;

/**
 * SWIFTMAP (Change 31): a dashed line as a repeating gradient. The map scales
 * dash lengths by the line width; the swatch does too, but shrinks a pattern
 * whose repeat would outgrow the swatch (a long dash would read as solid).
 */
export function dashedLineBackground(color: string, dash: readonly number[], width: number): string {
  const total = dash.reduce((sum, length) => sum + length, 0);
  const unit = Math.max(0.5, Math.min(width, MAX_DASH_PERIOD / total));
  const stops: string[] = [];
  let at = 0;
  dash.forEach((length, index) => {
    const end = at + length * unit;
    stops.push(`${index % 2 === 0 ? color : "transparent"} ${at}px ${end}px`);
    at = end;
  });
  return `repeating-linear-gradient(to right, ${stops.join(", ")})`;
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
  backing = null,
}: {
  swatch: Swatch;
  dimmed?: boolean;
  /** A category under a heading: its flat fill floor is 55%, a single layer's 45% (mockup). */
  category?: boolean;
  /**
   * Change 33: the basemap's land colour, drawn under a polygon's fill so it
   * blends as on the map; null keeps the panel behind it.
   */
  backing?: string | null;
}) {
  const opacity = dimmed ? 0.4 : 1;
  let style: CSSProperties;
  let dashedOutline: { color: string; dash: "dashed" | "dotted" } | null = null;
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
    // Line opacity fades the whole swatch, so any CSS colour works (Change 31).
    style = {
      width: 18,
      height: swatch.width,
      borderRadius: swatch.dash ? 0 : 2,
      background: swatch.dash
        ? dashedLineBackground(swatch.color, swatch.dash, swatch.width)
        : swatch.color,
      opacity: opacity * swatch.opacity,
    };
  } else {
    // A pattern replaces the fill on the map, so only the lines show, at the
    // fill opacity. A flat fill keeps a floor so pale fills still read.
    // A gradient, not a colour, so the basemap backing can sit underneath.
    const flat = rgba(swatch.fill, Math.max(swatch.fillOpacity, category ? 0.55 : 0.45));
    const fill = swatch.pattern
      ? patternBackground(
          swatch.pattern,
          rgba(swatch.patternColor, Math.max(swatch.fillOpacity, 0.6)),
        )
      : { backgroundImage: `linear-gradient(${flat}, ${flat})` };
    style = {
      width: 14,
      height: 14,
      margin: "0 2px",
      borderRadius: 3,
      ...fill,
      ...(backing ? { backgroundColor: backing } : {}),
      ...(swatch.outline && !swatch.outlineDash
        ? { boxShadow: `inset 0 0 0 1px ${outlineColor(swatch.outline, swatch.outlineOpacity)}` }
        : {}),
    };
    if (swatch.outline && swatch.outlineDash) {
      dashedOutline = {
        color: outlineColor(swatch.outline, swatch.outlineOpacity),
        dash: swatch.outlineDash,
      };
    }
  }
  return (
    <span
      aria-hidden="true"
      data-testid="legend-swatch"
      data-kind={swatch.kind}
      data-dash={dashKind(swatch) ?? undefined}
      className="relative block shrink-0"
      style={{ opacity, ...style }}
    >
      {dashedOutline ? <DashedSquare {...dashedOutline} /> : null}
    </span>
  );
}

/** The outline colour at the outline opacity. */
function outlineColor(outline: string, alpha: number): string {
  return alpha < 1 ? rgba(outline, alpha) : outline;
}

/**
 * SWIFTMAP (Change 31, review round 1): a dashed or dotted polygon outline as
 * an SVG square. A CSS dashed or dotted border on a 14px square showed only as
 * corners and specks, so the swatch looked plainly filled; a dash array sets
 * the spacing. 2px on whole pixels, so the dots stay crisp.
 */
function DashedSquare({ color, dash }: { color: string; dash: "dashed" | "dotted" }) {
  return (
    <svg className="absolute inset-0" width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      <rect
        x={1}
        y={1}
        width={12}
        height={12}
        rx={2}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dash === "dotted" ? "2 2" : "4 2"}
      />
    </svg>
  );
}

/** Whether the swatch draws a dash, for the tests and e2e (`data-dash`). */
function dashKind(swatch: Swatch): string | null {
  if (swatch.kind === "line") return swatch.dash ? "dashed" : null;
  if (swatch.kind === "polygon") return swatch.outline ? swatch.outlineDash : null;
  return null;
}
