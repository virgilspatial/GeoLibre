import { PipetteIcon } from "lucide-react";
import * as React from "react";
import { hexToRgb, rgbToHex } from "../lib/color-utils";
import { cn } from "../lib/utils";
import { Button, buttonVariants } from "./button";
import { Checkbox } from "./checkbox";
import {
  CHECKERBOARD,
  ColorPicker,
  type ColorPickerLabels,
  type ColorValue,
  getEyeDropper,
  pickColorFromScreen,
} from "./color-picker";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

// Ported from Swiftmap's Map Portal Components (Change 14). User-facing text
// comes in through `labels` so callers can pass translated strings.

export type Fill = ColorValue & { transparent: boolean };

export type FillColorFieldLabels = {
  /** Field label, e.g. "Fill color". */
  label: string;
  /** Checkbox label, and the swatch's spoken value when transparent. */
  transparent: string;
  /** Accessible name of the eyedropper button, e.g. "Pick fill color from the screen". */
  pickFromScreen: string;
  picker: ColorPickerLabels;
};

export type FillColorFieldProps = {
  value: Fill;
  onChange: (value: Fill) => void;
  labels: FillColorFieldLabels;
};

/** CSS colour for map styles, e.g. rgba(59, 130, 246, 1) or "transparent" */
export function fillToCss(fill: Fill) {
  if (fill.transparent) return "transparent";
  const { r, g, b } = hexToRgb(fill.hex) ?? { r: 0, g: 0, b: 0 };
  return `rgba(${r}, ${g}, ${b}, ${fill.alpha})`;
}

export function FillColorField({ value, onChange, labels }: FillColorFieldProps) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const checkboxId = `${id}-transparent`;
  const [canPick, setCanPick] = React.useState(false);
  React.useEffect(() => setCanPick(getEyeDropper() !== undefined), []);

  const css = fillToCss(value);
  const swatch = value.transparent
    ? `linear-gradient(to top right, transparent calc(50% - 1px), hsl(var(--destructive)) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)), ${CHECKERBOARD}`
    : `linear-gradient(${css}, ${css}), ${CHECKERBOARD}`;

  const pickFromScreen = async () => {
    const rgb = await pickColorFromScreen();
    if (rgb) onChange({ ...value, hex: rgbToHex(rgb), transparent: false });
  };

  return (
    <div role="group" aria-labelledby={labelId} className="grid gap-2">
      <Label id={labelId}>{labels.label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger
            aria-label={`${labels.label}: ${value.transparent ? labels.transparent : value.hex}`}
            className={cn(buttonVariants({ variant: "outline" }), "h-9 w-[150px] p-[5px]")}
          >
            <span
              className="block size-full rounded-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]"
              style={{ background: swatch }}
            />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3">
            <ColorPicker
              value={value}
              onChange={(c) => onChange({ ...c, transparent: false })}
              labels={labels.picker}
            />
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={labels.pickFromScreen}
          disabled={!canPick}
          onClick={pickFromScreen}
        >
          <PipetteIcon aria-hidden="true" />
        </Button>

        <div className="flex items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={value.transparent}
            onCheckedChange={(checked) => onChange({ ...value, transparent: checked === true })}
          />
          <Label htmlFor={checkboxId} className="font-normal">
            {labels.transparent}
          </Label>
        </div>
      </div>
    </div>
  );
}
