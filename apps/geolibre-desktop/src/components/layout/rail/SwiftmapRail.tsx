import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BufferRingIcon, LegendIcon, RailButton, railLucideProps } from "./RailButton";
import { useSidePanelStore, type SidePanelId } from "./sidePanelStore";

interface SwiftmapRailProps {
  /** The Add Data menu, with a rail button as its trigger. Null when hidden. */
  addData: ReactNode;
  /** The Tools menu (GeoLibre's plugins), with a rail button as its trigger. */
  tools: ReactNode;
  /** The Settings menu, pinned to the bottom of the rail. */
  settings: ReactNode;
}

/**
 * SWIFTMAP: the rail (Change 16). Layers, Legend and Analysis switch the side
 * panel, and clicking the one shown closes it. Add Data, Tools and Settings open
 * GeoLibre's menus beside the rail until branches 5 and 6 replace them.
 *
 * Below `md` the rail is a row above the map, with Settings at its end.
 */
export function SwiftmapRail({ addData, tools, settings }: SwiftmapRailProps) {
  const { t } = useTranslation();
  const active = useSidePanelStore((state) => state.active);
  const toggle = useSidePanelStore((state) => state.toggle);

  const panelButton = (id: SidePanelId, label: string, icon: ReactNode) => (
    <RailButton label={label} aria-pressed={active === id} onClick={() => toggle(id)}>
      {icon}
    </RailButton>
  );

  return (
    <nav
      aria-label={t("rail.label")}
      data-testid="swiftmap-rail"
      className="flex w-full shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-sidebar px-3 py-1.5 md:h-auto md:w-16 md:flex-col md:overflow-visible md:border-e md:border-b-0 md:px-0 md:py-3"
    >
      {panelButton("layers", t("rail.layers"), <Layers {...railLucideProps} />)}
      {panelButton("legend", t("rail.legend"), <LegendIcon />)}
      {addData}
      {panelButton("analysis", t("rail.analysis"), <BufferRingIcon />)}
      {tools}
      {settings ? <div className="ms-auto flex md:ms-0 md:mt-auto">{settings}</div> : null}
    </nav>
  );
}
