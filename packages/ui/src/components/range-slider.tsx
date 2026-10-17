import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "../lib/utils";

export interface RangeSliderProps extends Omit<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
  "aria-label"
> {
  /** Accessible name for the lower thumb. */
  minLabel: string;
  /** Accessible name for the upper thumb. */
  maxLabel: string;
}

/**
 * Two-thumb slider for choosing a closed interval.
 *
 * Radix puts `role="slider"` on each Thumb, so each thumb carries its own
 * accessible name rather than the Root carrying one for both — otherwise a
 * screen reader announces the same label twice and the two ends are
 * indistinguishable. For a single value use {@link Slider} instead.
 */
export const RangeSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  RangeSliderProps
>(({ className, minLabel, maxLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
      className,
    )}
    minStepsBetweenThumbs={0}
    {...props}
  >
    {/* Swiftmap (UI_CUSTOMISATION.md, Change 06): shadcn's "Range" slider look,
        the same track and thumb classes as `Slider`. */}
    <SliderPrimitive.Track
      data-slot="slider-track"
      className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted select-none"
    >
      <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb data-slot="slider-thumb" aria-label={minLabel} className={THUMB_CLASS} />
    <SliderPrimitive.Thumb data-slot="slider-thumb" aria-label={maxLabel} className={THUMB_CLASS} />
  </SliderPrimitive.Root>
));

const THUMB_CLASS =
  "relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 data-[disabled]:pointer-events-none";
RangeSlider.displayName = "RangeSlider";
