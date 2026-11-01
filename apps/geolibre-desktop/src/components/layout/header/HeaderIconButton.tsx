import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from "@geolibre/ui";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

/**
 * Swiftmap header button chrome (Change 15): 32px, a grey `--input` outline that
 * never changes, a 15px icon. Only the icon colour shows state: foreground when
 * the action is available, muted when not.
 */
export const headerIconButtonClass =
  "size-8 shrink-0 rounded-lg border-input bg-transparent p-0 text-foreground hover:bg-accent [&_svg]:size-[15px]";

/** The muted icon and inert click of an unavailable header button. */
export const headerUnavailableClass =
  "text-muted-foreground hover:bg-transparent hover:text-muted-foreground cursor-default";

interface HeaderTooltipProps {
  content: ReactNode;
  children: ReactNode;
}

/** A dark tooltip below a header control, as in the mockup. */
export function HeaderTooltip({ content, children }: HeaderTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

interface HeaderIconButtonProps extends Omit<ComponentPropsWithoutRef<typeof Button>, "title"> {
  label: string;
  /** Tooltip text; defaults to the label. */
  tooltip?: ReactNode;
  /**
   * Shown but not actionable. Uses `aria-disabled` rather than `disabled` so the
   * button stays focusable and its tooltip can still explain why.
   */
  unavailable?: boolean;
}

export const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(
  ({ label, tooltip, unavailable = false, className, onClick, children, ...props }, ref) => (
    <HeaderTooltip content={tooltip ?? label}>
      <Button
        ref={ref}
        type="button"
        variant="outline"
        aria-label={label}
        aria-disabled={unavailable || undefined}
        className={cn(headerIconButtonClass, unavailable && headerUnavailableClass, className)}
        onClick={(event) => {
          if (unavailable) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        {...props}
      >
        {children}
      </Button>
    </HeaderTooltip>
  ),
);
HeaderIconButton.displayName = "HeaderIconButton";
