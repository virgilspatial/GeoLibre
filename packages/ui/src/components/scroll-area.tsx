import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as React from "react";
import { cn } from "../lib/utils";

export type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  /**
   * Ref to the scrollable viewport element. Exposed so consumers (e.g. a
   * virtualized list) can use it as their scroll container. Typed as a
   * RefObject because that is what scroll-container consumers need (a callback
   * ref would not give them a stable element to read).
   */
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * SWIFTMAP (Change 25): `thin` is Swiftmap's scrollbar (ui-handoff
   * "Scrollbars"): a thin rounded thumb in the border grey, no track, slightly
   * darker on hover.
   */
  variant?: "default" | "thin";
};

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, viewportRef, variant = "default", ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport ref={viewportRef} className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar variant={variant} />
    <ScrollBar variant={variant} orientation="horizontal" />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> & {
    variant?: "default" | "thin";
  }
>(({ className, orientation = "vertical", variant = "default", ...props }, ref) => {
  const thin = variant === "thin";
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        thin
          ? "z-30 flex touch-none select-none p-0.5"
          : "group z-30 flex touch-none select-none rounded-full bg-muted/70 transition-colors hover:bg-muted",
        !thin && orientation === "vertical" && "h-full w-3.5 border-s border-border/60 p-0.5",
        !thin && orientation === "horizontal" && "h-3.5 flex-col border-t border-border/60 p-0.5",
        thin && orientation === "vertical" && "h-full w-2.5",
        thin && orientation === "horizontal" && "h-2.5 flex-col",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        className={
          thin
            ? "relative flex-1 rounded-full bg-border transition-colors hover:bg-muted-foreground/40"
            : "relative flex-1 rounded-full bg-muted-foreground/45 transition-colors hover:bg-muted-foreground/70 active:bg-primary group-hover:bg-muted-foreground/60"
        }
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
});
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;
