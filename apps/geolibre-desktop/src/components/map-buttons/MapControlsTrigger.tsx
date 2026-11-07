import { DropdownMenuTrigger } from "@geolibre/ui";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MapControlsIcon, MapStackButton, startSide } from "./MapStackButton";
import { useMapControlsMenuStore } from "./mapControlsMenuStore";

// SWIFTMAP (Change 26), a stopgap until branch 6c: GeoLibre's Controls menu
// opens from the Map controls button at the bottom of the map's button stack.

/**
 * Props for the Controls menu's `DropdownMenu` and `DropdownMenuContent`: the
 * open state the stack's button shows, and the menu placed beside that button.
 */
export function useMapControlsMenu() {
  const anchor = useMapControlsMenuStore((s) => s.anchor);
  const open = useMapControlsMenuStore((s) => s.open);
  const setOpen = useMapControlsMenuStore((s) => s.setOpen);
  return {
    root: { open, onOpenChange: setOpen },
    content: anchor
      ? { side: startSide(), align: "start" as const, sideOffset: 8 }
      : { align: "start" as const },
  };
}

/**
 * The Controls menu's trigger. While the stack is on the map it is the stack's
 * Map controls button; otherwise (no stack, e.g. a map-only embed) it is the
 * menu's original header button, passed as `children`.
 */
export function MapControlsTrigger({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const anchor = useMapControlsMenuStore((s) => s.anchor);
  const open = useMapControlsMenuStore((s) => s.open);
  if (!anchor) return <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>;
  return createPortal(
    <DropdownMenuTrigger asChild>
      <MapStackButton
        label={t("swiftmapMapButtons.mapControls")}
        suppressTooltip={open}
        className="data-[state=open]:bg-muted"
      >
        <MapControlsIcon />
      </MapStackButton>
    </DropdownMenuTrigger>,
    anchor,
  );
}
