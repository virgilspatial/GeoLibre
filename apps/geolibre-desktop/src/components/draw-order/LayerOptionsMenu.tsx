import { useAppStore } from "@geolibre/core";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@geolibre/ui";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LAYER_MENU_COLLISION_PADDING } from "../panels/layer-panel/LayerActionsMenu";
import { isDrawOrderByShapeOn, setDrawOrderByShape } from "./draw-order";

/** A switch drawn inside a menu item, which is itself the control (role menuitemcheckbox). */
function SwitchGlyph({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border transition-colors",
        on ? "border-transparent bg-primary" : "border-muted-foreground bg-transparent",
      )}
    >
      <span
        className={cn(
          "block size-3.5 rounded-full transition-transform",
          on
            ? "translate-x-3.5 bg-background rtl:-translate-x-3.5 dark:bg-primary-foreground"
            : "translate-x-0.5 bg-muted-foreground rtl:-translate-x-0.5",
        )}
      />
    </span>
  );
}

/**
 * SWIFTMAP (Change 36): the Layers header's ⋯ "Layer options", after the +.
 * Holds "Draw points above lines and polygons", a saved map setting, so it is
 * in the editor's Layers panel only (viewers have their own panel).
 */
export function LayerOptionsMenu() {
  const { t } = useTranslation();
  const on = useAppStore((state) => isDrawOrderByShapeOn(state.metadata));
  const [open, setOpen] = useState(false);
  const label = t("swiftmapDrawOrder.options");
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              className={cn(
                "h-7 w-7 rounded-md",
                open && "bg-foreground text-background hover:bg-foreground/90 hover:text-background",
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        collisionPadding={LAYER_MENU_COLLISION_PADDING}
        className="min-w-[210px] rounded-[10px]"
      >
        <DropdownMenuItem
          role="menuitemcheckbox"
          aria-checked={on}
          className="h-8 gap-3 rounded-md px-2.5 text-[13px]"
          onSelect={(event) => {
            // Stays open, so the switch is seen to change.
            event.preventDefault();
            setDrawOrderByShape(!on);
          }}
        >
          <span className="min-w-0 flex-1">{t("swiftmapDrawOrder.byShape")}</span>
          <SwitchGlyph on={on} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
