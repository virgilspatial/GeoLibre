import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from "@geolibre/ui";
import { forwardRef, type ComponentPropsWithoutRef, type SVGProps } from "react";

/**
 * Swiftmap rail button chrome (Change 16): 40px, 10px corners, a 20px icon.
 * Hover is the accent grey; a selected item (a shown panel, or an open menu) is
 * the muted grey with a 1px inset border line, and stays so under the pointer.
 */
const railButtonClass =
  "size-10 shrink-0 rounded-[10px] p-0 text-foreground hover:bg-accent hover:text-foreground [&_svg]:size-5 " +
  "aria-pressed:bg-muted aria-pressed:shadow-[inset_0_0_0_1px_hsl(var(--border))] aria-pressed:hover:bg-muted " +
  "aria-expanded:bg-muted aria-expanded:shadow-[inset_0_0_0_1px_hsl(var(--border))] aria-expanded:hover:bg-muted";


interface RailButtonProps extends Omit<ComponentPropsWithoutRef<typeof Button>, "title"> {
  /** Accessible name and tooltip text. */
  label: string;
}

/**
 * A rail icon button with a dark tooltip to its right. Forwards its ref and
 * props, so a menu can use it as its trigger (`DropdownMenuTrigger asChild`).
 */
export const RailButton = forwardRef<HTMLButtonElement, RailButtonProps>(
  ({ label, className, children, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          aria-label={label}
          className={cn(railButtonClass, className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      {/* The header's stock 12px tooltip (Change 25), the header's 6px from the
          button (Change 34), so both sit the same distance away. */}
      <TooltipContent side="right" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  ),
);
RailButton.displayName = "RailButton";

const iconProps: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

/** Legend: two swatches, each with two equal lines (`ui-handoff.md`, Rail). */
export function LegendIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="4" width="6" height="6" rx="1.5" />
      <path d="M13 4.3h8M13 9.7h8" />
      <rect x="3" y="14" width="6" height="6" rx="1.5" />
      <path d="M13 14.3h8M13 19.7h8" />
    </svg>
  );
}

/** Analysis: a dot inside a ring with four small gaps on the diagonals (a buffer). */
export function BufferRingIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="9.75" strokeDasharray="11.565 3.75" strokeDashoffset="5.78" />
    </svg>
  );
}

/** Lucide icon props matching the rail's 1.75 stroke. */
export const railLucideProps = { strokeWidth: 1.75, "aria-hidden": true } as const;
