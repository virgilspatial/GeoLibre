import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@geolibre/ui";
import { useRef, useState } from "react";

/** As the Layers panel's group names: the full text after about 450ms, only when cut off. */
const FULL_TEXT_DELAY = 450;

/**
 * SWIFTMAP (Change 25): one line of legend text with an ellipsis, and the full
 * text in a tooltip only when it is cut off (the pattern of `LayerGroupHeader`).
 */
export function TruncatedText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      open={open}
      delayDuration={FULL_TEXT_DELAY}
      onOpenChange={(next) => {
        const element = ref.current;
        setOpen(next && !!element && element.scrollWidth > element.clientWidth);
      }}
    >
      <TooltipTrigger asChild>
        <span ref={ref} className={cn("block min-w-0 truncate", className)}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
