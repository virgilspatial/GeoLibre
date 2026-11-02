import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@geolibre/ui";
import { FolderPlus, Plus } from "lucide-react";
import { useSidePanelStore } from "../../layout/rail/sidePanelStore";

interface LayerPanelHeaderProps {
  onCreateGroup: () => void;
  /** Whether Add Data is offered (the rail shows it to editors only). */
  canAddData: boolean;
}

/** SWIFTMAP: the rail's tooltip size (Change 16), opening below the button. */
const headerTooltipClass = "rounded-[10px] px-3.5 py-2 text-sm font-medium";

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8} className={headerTooltipClass}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * SWIFTMAP: the Layers panel title bar (Change 17): "Layers", then New group
 * and a + that opens the rail's Add Data menu. GeoLibre's eight header icons
 * (planet switcher, Basemaps, GeoEditor, Compact view, Show/hide all, Identify
 * visible layers, Collapse) were dropped by the user; their engine code stays.
 */
export function LayerPanelHeader({ onCreateGroup, canAddData }: LayerPanelHeaderProps) {
  const { t } = useTranslation();
  const setAddDataMenuOpen = useSidePanelStore((s) => s.setAddDataMenuOpen);
  return (
    <div className="flex items-center justify-between pb-2 ps-1.5">
      <h2 className="text-sm font-semibold">{t("layerPanel.title")}</h2>
      <div className="flex items-center gap-0.5">
        <HeaderButton label={t("layerPanel.newGroup")} onClick={onCreateGroup}>
          <FolderPlus className="h-4 w-4" strokeWidth={1.75} />
        </HeaderButton>
        {canAddData ? (
          <HeaderButton label={t("layerPanel.addData")} onClick={() => setAddDataMenuOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
          </HeaderButton>
        ) : null}
      </div>
    </div>
  );
}
