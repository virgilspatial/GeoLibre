import { PipetteIcon } from "lucide-react";
import * as React from "react";
import {
  type HSV,
  type RGB,
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
} from "../lib/color-utils";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Select } from "./select";

// Ported from Swiftmap's Map Portal Components (Change 14), on the existing
// native Select rather than shadcn's native-select. User-facing text comes in
// through `labels` so callers can pass translated strings.
//
// The saturation square and the hue and opacity tracks stay left-to-right in
// RTL locales, like other colour pickers: the gradients, pointer maths and
// thumb positions are all physical.

export type ColorValue = { hex: string; alpha: number };
export type ColorFormat = "hex" | "rgb" | "hsl";

export type ColorPickerLabels = {
  /** Accessible name of the saturation and brightness square. */
  saturationBrightness: string;
  /** Spoken value of the square, e.g. "Saturation 80%, brightness 60%". */
  saturationBrightnessValue: (saturation: number, brightness: number) => string;
  hue: string;
  opacity: string;
  pickFromScreen: string;
  format: string;
  /** Accessible name of the text field, e.g. "HEX value". */
  formatValue: (format: string) => string;
  opacityPercent: string;
};

export type ColorPickerProps = {
  value: ColorValue;
  onChange: (value: ColorValue) => void;
  labels: ColorPickerLabels;
  className?: string;
  /**
   * SWIFTMAP (Change 27): false hides the opacity track and percentage, for
   * colours that carry no transparency (outlines, label text). Default true.
   */
  showAlpha?: boolean;
};

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/** The browser's EyeDropper, where supported (Chromium only at the moment). */
export function getEyeDropper(): EyeDropperCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
}

/** Opens the eyedropper; resolves to null when unsupported or cancelled. */
export async function pickColorFromScreen(): Promise<RGB | null> {
  const EyeDropper = getEyeDropper();
  if (!EyeDropper) return null;
  try {
    const { sRGBHex } = await new EyeDropper().open();
    return hexToRgb(sRGBHex);
  } catch {
    return null; // user pressed Escape
  }
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

/** Checkerboard behind transparent colours. A pattern, not a theme colour. */
export const CHECKERBOARD = "repeating-conic-gradient(#d9dde1 0 25%, #fff 0 50%) 0 0 / 8px 8px";

const THUMB =
  "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]";

function dragHandlers(onMove: (x: number, y: number) => void) {
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMove(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height));
  };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      at(e);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e);
    },
  };
}

function arrowKeys(step: number, apply: (dx: number, dy: number) => void) {
  return (e: React.KeyboardEvent) => {
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const s = e.shiftKey ? step * 10 : step;
    apply(d[0] * s, d[1] * s);
  };
}

function formatColor(hsv: HSV, format: ColorFormat) {
  const rgb = hsvToRgb(hsv);
  if (format === "hex") return rgbToHex(rgb);
  if (format === "rgb") return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  const { h, s, l } = rgbToHsl(rgb);
  return `${h}, ${s}%, ${l}%`;
}

function parseColor(text: string, format: ColorFormat) {
  if (format === "hex") return hexToRgb(text);
  const n = text.match(/\d+(\.\d+)?/g)?.map(Number);
  if (!n || n.length < 3) return null;
  if (format === "rgb") {
    if (n.slice(0, 3).some((v) => v > 255)) return null;
    return { r: Math.round(n[0]), g: Math.round(n[1]), b: Math.round(n[2]) };
  }
  if (n[0] > 360 || n[1] > 100 || n[2] > 100) return null;
  return hslToRgb(n[0], n[1], n[2]);
}

function Track({
  label,
  now,
  max,
  position,
  background,
  ...props
}: {
  label: string;
  now: number;
  max: number;
  position: number;
  background: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      tabIndex={0}
      className="relative h-3 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{ background }}
      {...props}
    >
      <span
        className={cn(THUMB, "top-1/2 size-[18px] border-0 bg-white")}
        style={{ left: `${position * 100}%` }}
      />
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
  labels,
  className,
  showAlpha = true,
}: ColorPickerProps) {
  const [hsv, setHsv] = React.useState<HSV>(() =>
    rgbToHsv(hexToRgb(value.hex) ?? { r: 0, g: 0, b: 0 }),
  );
  const [format, setFormat] = React.useState<ColorFormat>("hex");
  const [draft, setDraft] = React.useState<string | null>(null);
  const [alphaDraft, setAlphaDraft] = React.useState<string | null>(null);
  const [canPick, setCanPick] = React.useState(false);
  React.useEffect(() => setCanPick(getEyeDropper() !== undefined), []);

  const hex = rgbToHex(hsvToRgb(hsv));
  const hueColor = `hsl(${hsv.h} 100% 50%)`;

  // Follow changes made outside the picker (e.g. the field's own eyedropper)
  React.useEffect(() => {
    const rgb = hexToRgb(value.hex);
    if (rgb && rgbToHex(rgb) !== hex) setHsv(rgbToHsv(rgb));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.hex]);

  const update = (next: HSV) => {
    setHsv(next);
    onChange({ hex: rgbToHex(hsvToRgb(next)), alpha: value.alpha });
  };
  // Greys have no hue, so keep the current one instead of snapping to red
  const fromRgb = (rgb: RGB) => {
    const next = rgbToHsv(rgb);
    update(next.s === 0 ? { ...next, h: hsv.h } : next);
  };
  const setAlpha = (alpha: number) =>
    onChange({ hex, alpha: Math.round(clamp(alpha) * 100) / 100 });

  const commitText = () => {
    const rgb = draft === null ? null : parseColor(draft, format);
    if (rgb) fromRgb(rgb);
    setDraft(null);
  };
  const commitAlpha = () => {
    const n = alphaDraft === null ? NaN : parseFloat(alphaDraft);
    if (!Number.isNaN(n)) setAlpha(n / 100);
    setAlphaDraft(null);
  };

  return (
    <div className={cn("flex w-72 max-w-full flex-col gap-3.5", className)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={labels.saturationBrightness}
        aria-valuetext={labels.saturationBrightnessValue(
          Math.round(hsv.s * 100),
          Math.round(hsv.v * 100),
        )}
        className="relative h-[170px] cursor-crosshair touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueColor}`,
        }}
        {...dragHandlers((x, y) => update({ ...hsv, s: x, v: 1 - y }))}
        onKeyDown={arrowKeys(0.01, (dx, dy) =>
          update({ ...hsv, s: clamp(hsv.s + dx), v: clamp(hsv.v + dy) }),
        )}
      >
        <span
          className={cn(THUMB, "size-4")}
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <Track
        label={labels.hue}
        now={Math.round(hsv.h)}
        max={360}
        position={hsv.h / 360}
        background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
        {...dragHandlers((x) => update({ ...hsv, h: x * 360 }))}
        onKeyDown={arrowKeys(1, (dx, dy) => update({ ...hsv, h: clamp(hsv.h + dx + dy, 0, 360) }))}
      />
      {showAlpha && (
      <Track
        label={labels.opacity}
        now={Math.round(value.alpha * 100)}
        max={100}
        position={value.alpha}
        background={`linear-gradient(to right, transparent, ${hex}), ${CHECKERBOARD}`}
        {...dragHandlers((x) => setAlpha(x))}
        onKeyDown={arrowKeys(0.01, (dx, dy) => setAlpha(value.alpha + dx + dy))}
      />
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={labels.pickFromScreen}
          disabled={!canPick}
          onClick={async () => {
            const rgb = await pickColorFromScreen();
            if (rgb) fromRgb(rgb);
          }}
        >
          <PipetteIcon aria-hidden="true" />
        </Button>
        <Select
          aria-label={labels.format}
          className="w-[78px] shrink-0"
          value={format}
          onChange={(e) => setFormat(e.target.value as ColorFormat)}
        >
          <option value="hex">HEX</option>
          <option value="rgb">RGB</option>
          <option value="hsl">HSL</option>
        </Select>
        <div className="flex min-w-0 flex-1">
          <input
            aria-label={labels.formatValue(format.toUpperCase())}
            spellCheck={false}
            dir="ltr"
            className="h-9 min-w-0 flex-1 rounded-s-md border border-input last:rounded-e-md bg-transparent px-2 text-sm tabular-nums outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring"
            value={draft ?? formatColor(hsv, format)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => e.key === "Enter" && commitText()}
          />
          {showAlpha && (
          <input
            aria-label={labels.opacityPercent}
            dir="ltr"
            className="h-9 w-[52px] rounded-e-md border border-s-0 border-input bg-transparent text-center text-sm tabular-nums outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring"
            value={alphaDraft ?? `${Math.round(value.alpha * 100)}%`}
            onChange={(e) => setAlphaDraft(e.target.value)}
            onBlur={commitAlpha}
            onKeyDown={(e) => e.key === "Enter" && commitAlpha()}
          />
          )}
        </div>
      </div>
    </div>
  );
}
