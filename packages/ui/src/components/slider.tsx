import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "../lib/utils";

/* Swiftmap (UI_CUSTOMISATION.md, Change 06): classes follow the current shadcn
   Slider, translated from its Base UI attributes to Radix ones. Radix already
   keeps the thumb inside the track, which Base UI needs thumbAlignment="edge" for. */
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(
  (
    {
      className,
      // The accessible name belongs on the thumb (it carries role="slider"),
      // not on the Root, so pull these out and forward them to the Thumb.
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledby,
      ...props
    },
    ref,
  ) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      {/* data-slot names match shadcn's, so a caller can restyle a part from its
          own className, e.g. `[&_[data-slot=slider-track]]:bg-…`. */}
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-full bg-muted select-none data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {/* Single-thumb only. For a closed interval use `RangeSlider`, which
          renders one Thumb per value with its own aria-label. */}
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 data-[disabled]:pointer-events-none"
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = SliderPrimitive.Root.displayName;
