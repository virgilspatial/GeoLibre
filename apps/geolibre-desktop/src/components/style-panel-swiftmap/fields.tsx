import {
  Button,
  ColorPicker,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  NumberStepper,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Select,
  Switch,
  cn,
  type ColorPickerLabels,
} from "@geolibre/ui";
import { ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

// SWIFTMAP (Change 27): the Style panel's form pieces, in the mockup's look:
// 13px/500 field labels, 36px controls with 8px corners, switch rows with a
// muted note, and the ported NumberStepper and colour picker for every number
// and colour.

/** The panel's start side, towards the map (left in left-to-right languages). */
export function startSide(): "left" | "right" {
  return typeof document !== "undefined" && document.documentElement.dir === "rtl"
    ? "right"
    : "left";
}

/** The transparency checkerboard behind a swatch (as in `packages/ui`'s picker). */
const CHECKERBOARD = "repeating-conic-gradient(#d9dde1 0 25%, #fff 0 50%) 0 0 / 8px 8px";

export const fieldLabelClass = "text-[13px] font-medium";
export const noteClass = "text-xs text-muted-foreground";

/** A labelled field: the label above its control. */
export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className={fieldLabelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Two fields side by side. */
export function FieldPair({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

/** The mockup's switch row: label and note on the start side, the switch on the end. */
export function SwitchRow({
  label,
  note,
  checked,
  onCheckedChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
        <span className={fieldLabelClass}>{label}</span>
        {note ? <span className={noteClass}>{note}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/**
 * The Done button that ends a settings popover (7b review round 4). It only
 * closes: the popover's changes are already live, and Undo reverses them.
 */
export function PopoverDone() {
  const { t } = useTranslation();
  return (
    <PopoverClose asChild>
      <Button type="button" size="sm" className="self-end">
        {t("common.done")}
      </Button>
    </PopoverClose>
  );
}

/** A labelled NumberStepper. */
export function StepperField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <NumberStepper
        id={id}
        value={value}
        onChange={(next) => onChange(roundToStep(next, step))}
        min={min}
        max={max}
        step={step}
        increaseLabel={t("swiftmapStyle.increase", { name: label })}
        decreaseLabel={t("swiftmapStyle.decrease", { name: label })}
      />
    </Field>
  );
}

/** Keeps stepped decimals tidy (0.1 + 0.2 shows 0.3, not 0.30000000000000004). */
function roundToStep(value: number, step: number): number {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number(value.toFixed(Math.min(decimals + 1, 6)));
}

/** A labelled native select (GeoLibre's styled `Select`). */
export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** The colour picker's labels, translated. */
export function useColorPickerLabels(): ColorPickerLabels {
  const { t } = useTranslation();
  return {
    saturationBrightness: t("swiftmapStyle.colour.saturationBrightness"),
    saturationBrightnessValue: (saturation, brightness) =>
      t("swiftmapStyle.colour.saturationBrightnessValue", { saturation, brightness }),
    hue: t("swiftmapStyle.colour.hue"),
    opacity: t("swiftmapStyle.colour.opacity"),
    pickFromScreen: t("swiftmapStyle.colour.pickFromScreen"),
    format: t("swiftmapStyle.colour.format"),
    formatValue: (format) => t("swiftmapStyle.colour.formatValue", { format }),
    opacityPercent: t("swiftmapStyle.colour.opacityPercent"),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** A colour as the picker's `#rrggbb`, falling back to black. */
function pickerHex(color: string): string {
  if (HEX.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("")}`.toLowerCase();
  }
  return "#000000";
}

/**
 * The mockup's colour field: a swatch button with the hex beside it, opening
 * the ported colour picker. "None" sits inside the picker when the colour can
 * be switched off; `alpha` adds the picker's opacity (fill opacity) when given.
 */
export function ColorSwatchField({
  label,
  color,
  onChange,
  alpha,
  onAlphaChange,
  none,
  onNoneChange,
  compact = false,
}: {
  label: string;
  color: string;
  onChange: (color: string) => void;
  alpha?: number;
  onAlphaChange?: (alpha: number) => void;
  /** Whether the colour is switched off ("None"). Omit when it can't be. */
  none?: boolean;
  onNoneChange?: (none: boolean) => void;
  /** The 28px swatch alone, for category rows. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const labels = useColorPickerLabels();
  const hex = pickerHex(color);
  const showAlpha = alpha !== undefined && onAlphaChange !== undefined;
  const isNone = none === true;
  const swatch = isNone
    ? `linear-gradient(to top right, transparent calc(50% - 1px), hsl(var(--destructive)) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)), ${CHECKERBOARD}`
    : `linear-gradient(${hexWithAlpha(hex, showAlpha ? alpha : 1)}, ${hexWithAlpha(hex, showAlpha ? alpha : 1)}), ${CHECKERBOARD}`;
  const spoken = isNone ? t("swiftmapStyle.colour.none") : hex;
  const trigger = (
    <PopoverTrigger
      aria-label={t("swiftmapStyle.colour.fieldValue", { name: label, value: spoken })}
      className={cn(
        "shrink-0 rounded-lg border border-input p-[5px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "size-7 p-[3px] rounded-md" : "h-9 w-[140px]",
      )}
    >
      <span
        className="block size-full rounded-[4px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]"
        style={{ background: swatch }}
      />
    </PopoverTrigger>
  );
  const picker = (
    <PopoverContent align="start" className="w-auto p-3">
      <ColorPicker
        value={{ hex, alpha: showAlpha ? alpha : 1 }}
        showAlpha={showAlpha}
        labels={labels}
        onChange={(next) => {
          if (isNone) onNoneChange?.(false);
          if (next.hex !== hex) onChange(next.hex);
          if (showAlpha && next.alpha !== alpha) onAlphaChange(next.alpha);
        }}
      />
      {onNoneChange ? (
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 border-t pt-3">
          <span className={fieldLabelClass}>{t("swiftmapStyle.colour.none")}</span>
          <Switch checked={isNone} onCheckedChange={onNoneChange} />
        </label>
      ) : null}
    </PopoverContent>
  );
  if (compact) {
    return (
      <Popover>
        {trigger}
        {picker}
      </Popover>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={fieldLabelClass}>{label}</span>
      <div className="flex items-center gap-2">
        <Popover>
          {trigger}
          {picker}
        </Popover>
        <span className="font-mono text-xs text-muted-foreground">
          {isNone ? t("swiftmapStyle.colour.none") : hex}
          {showAlpha && !isNone && alpha < 1 ? ` · ${Math.round(alpha * 100)}%` : ""}
        </span>
      </div>
    </div>
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A collapsed section ("More options", "More") with a chevron trigger. */
export function MoreSection({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-4 border-t pt-3">
      <CollapsibleTrigger className="-mx-1 flex items-center gap-1.5 rounded-md px-1 py-1 text-[13px] font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-4 text-muted-foreground transition-transform rtl:rotate-180",
            open && "rotate-90 rtl:rotate-90",
          )}
        />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** The mockup's segmented control (tabs and "Show as"): a muted track, the chosen half raised. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-lg bg-muted p-[3px] text-[13px] font-medium"
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 min-w-0 flex-auto truncate rounded-md px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              checked
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
