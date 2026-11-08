import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

// SWIFTMAP (Change 24): the mockup's backdrop, rgba(9, 9, 11, 0.45) in both themes,
// instead of GeoLibre's black at 80%.
export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[rgba(9,9,11,0.45)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** A field someone types into: what a dialog with a form should focus first. */
const TEXT_FIELD =
  'input:not([type="button"],[type="submit"],[type="reset"],[type="checkbox"],[type="radio"],[type="range"],[type="color"],[type="file"],[type="hidden"],[disabled]),textarea:not([disabled]),[contenteditable="true"]';

/**
 * SWIFTMAP (Change 27, round 2): a dialog with only buttons focuses itself on
 * open, not its first button, so no button shows a focus ring and Enter can't
 * press one (such as Discard) by accident. Tab still reaches the buttons; Esc
 * and × still close it. A dialog with a text field keeps Radix's default
 * (its first focusable element, the field in Swiftmap's forms).
 */
function focusDialogWithoutTextField(event: Event): void {
  const content = event.currentTarget;
  if (!(content instanceof HTMLElement) || content.querySelector(TEXT_FIELD)) return;
  event.preventDefault();
  content.focus({ preventScroll: true });
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    bodyClassName?: string;
    /** Optional node rendered as a sibling of the body (e.g. a resize grip),
     * positioned by the caller relative to the content box. */
    resizeHandle?: React.ReactNode;
  }
>(({ className, bodyClassName, resizeHandle, children, onOpenAutoFocus, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        if (!event.defaultPrevented) focusDialogWithoutTextField(event);
      }}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 flex outline-none max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden border bg-popover text-popover-foreground shadow-xl duration-200 supports-[not_(max-height:1dvh)]:max-h-[calc(100vh-1rem)] sm:rounded-lg",
        className,
      )}
      {...props}
    >
      <div className={cn("grid min-h-0 flex-1 gap-4 overflow-auto", bodyClassName ?? "p-4 sm:p-6")}>
        {children}
      </div>
      {/* ring-offset matches the popover surface this sits on, not --background.
          Inert today (no ring-offset width utility is applied, so the offset
          colour never paints) but wrong the moment one is added. */}
      <DialogPrimitive.Close className="absolute end-4 top-4 rounded-sm opacity-70 ring-offset-popover transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
      {resizeHandle}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-start", className)}
    {...props}
  />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
