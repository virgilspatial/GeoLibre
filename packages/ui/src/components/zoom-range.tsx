import { InfoIcon } from "lucide-react";
import * as React from "react";
import { Label } from "./label";
import { NumberStepper } from "./number-stepper";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// Ported from Swiftmap's Map Portal Components (Change 14). User-facing text
// comes in through `labels` so callers can pass translated strings.

export type ZoomRange = { minZoom: number; maxZoom: number };

export type ZoomRangeLabels = {
  minZoom: string;
  /** Tooltip, e.g. "Lowest zoom the layer draws at. 0 shows the whole world." */
  minZoomHint: string;
  increaseMinZoom: string;
  decreaseMinZoom: string;
  maxZoom: string;
  /** Tooltip, e.g. "Highest zoom the layer draws at. 24 is building detail." */
  maxZoomHint: string;
  increaseMaxZoom: string;
  decreaseMaxZoom: string;
};

export type ZoomRangeInputProps = {
  value: ZoomRange;
  onChange: (value: ZoomRange) => void;
  labels: ZoomRangeLabels;
};

const ZOOM_MIN = 0;
const ZOOM_MAX = 24;

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={text}
        className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <InfoIcon className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export function ZoomRangeInput({ value, onChange, labels }: ZoomRangeInputProps) {
  const id = React.useId();
  const minId = `${id}-min`;
  const maxId = `${id}-max`;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="grid gap-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={minId}>{labels.minZoom}</Label>
          <InfoTip text={labels.minZoomHint} />
        </div>
        <NumberStepper
          id={minId}
          increaseLabel={labels.increaseMinZoom}
          decreaseLabel={labels.decreaseMinZoom}
          min={ZOOM_MIN}
          max={value.maxZoom}
          value={value.minZoom}
          onChange={(minZoom) => onChange({ ...value, minZoom })}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={maxId}>{labels.maxZoom}</Label>
          <InfoTip text={labels.maxZoomHint} />
        </div>
        <NumberStepper
          id={maxId}
          increaseLabel={labels.increaseMaxZoom}
          decreaseLabel={labels.decreaseMaxZoom}
          min={value.minZoom}
          max={ZOOM_MAX}
          value={value.maxZoom}
          onChange={(maxZoom) => onChange({ ...value, maxZoom })}
        />
      </div>
    </div>
  );
}
