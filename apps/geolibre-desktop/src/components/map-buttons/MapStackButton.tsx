import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@geolibre/ui";
import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";

// SWIFTMAP (Change 26): the mockup's 34px map button and its icons.

/** The 34px button face shared by every button in the stack. */
export const mapButtonFaceClass =
  "flex size-[34px] shrink-0 cursor-pointer items-center justify-center bg-background p-0 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A free-standing button: its own 1px border and 8px corners. */
export const mapButtonClass = cn(
  mapButtonFaceClass,
  "rounded-[8px] border border-border focus-visible:ring-offset-1 focus-visible:ring-offset-background",
);

/** The side towards the map, away from its edge: where tooltips and the menu open. */
export function startSide(): "left" | "right" {
  return typeof document !== "undefined" && document.documentElement.dir === "rtl"
    ? "right"
    : "left";
}

interface MapButtonTooltipProps {
  label: string;
  /** Hides the tooltip, e.g. while the button's menu is open. */
  suppressed?: boolean;
  children: ReactNode;
}

/** The dark stock tooltip, 6px to the start side of a map button (Change 35). */
export function MapButtonTooltip({ label, suppressed = false, children }: MapButtonTooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open && !suppressed} onOpenChange={setOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={startSide()} sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface MapStackButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "aria-label"> {
  label: string;
  /** Tooltip text; defaults to the label. */
  tooltip?: string;
  /** Drop the button's own border and corners (inside the joined zoom box). */
  joined?: boolean;
  suppressTooltip?: boolean;
}

/** A 34px map button with its tooltip. Forwards its ref and props (menu triggers). */
export const MapStackButton = forwardRef<HTMLButtonElement, MapStackButtonProps>(
  ({ label, tooltip, joined = false, suppressTooltip, className, children, ...props }, ref) => (
    <MapButtonTooltip label={tooltip ?? label} suppressed={suppressTooltip}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          joined ? cn(mapButtonFaceClass, "focus-visible:ring-inset") : mapButtonClass,
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </MapButtonTooltip>
  ),
);
MapStackButton.displayName = "MapStackButton";

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function ZoomInIcon() {
  return (
    <svg width={14} height={14} {...svgProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ZoomOutIcon() {
  return (
    <svg width={14} height={14} {...svgProps}>
      <path d="M5 12h14" />
    </svg>
  );
}

/** The navigation arrow; `rotation` turns it so it keeps pointing north. */
export function CompassIcon({ rotation }: { rotation: number }) {
  return (
    <svg
      width={16}
      height={16}
      {...svgProps}
      style={{ transform: `rotate(${rotation}deg)` }}
      data-rotation={rotation}
    >
      <path d="m12 2 5 18-5-4-5 4z" />
    </svg>
  );
}

export function MyLocationIcon() {
  return (
    <svg width={16} height={16} {...svgProps}>
      <path d="M2 12h3M19 12h3M12 2v3M12 19v3" />
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function FullScreenIcon() {
  return (
    <svg width={16} height={16} {...svgProps}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function MapControlsIcon() {
  return (
    <svg width={16} height={16} {...svgProps}>
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="16" x2="16" y1="18" y2="22" />
    </svg>
  );
}
