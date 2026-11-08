import * as React from "react";
import { cn } from "../lib/utils";
import { Switch as SwitchPrimitive } from "radix-ui";

// SWIFTMAP (Change 29): "off" is an outlined track with a muted-foreground
// thumb, so its edge reaches 3:1 in light and dark (the old bg-input track was
// about 1.3:1). A disabled switch, by `disabled` or by `aria-disabled` (kept
// focusable for a tooltip), is dimmed but keeps that outline.
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:border-transparent data-[state=checked]:bg-primary data-[state=unchecked]:border-muted-foreground data-[state=unchecked]:bg-transparent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-2.5 data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-muted-foreground data-[state=checked]:bg-background group-data-[size=default]/switch:data-[state=checked]:translate-x-3.5 group-data-[size=sm]/switch:data-[state=checked]:translate-x-2.5 rtl:data-[state=unchecked]:-translate-x-0.5 rtl:group-data-[size=default]/switch:data-[state=checked]:-translate-x-3.5 rtl:group-data-[size=sm]/switch:data-[state=checked]:-translate-x-2.5 dark:data-[state=checked]:bg-primary-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
