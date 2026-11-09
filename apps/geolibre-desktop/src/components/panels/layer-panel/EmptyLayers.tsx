import { Button } from "@geolibre/ui";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSidePanelStore } from "../../layout/rail/sidePanelStore";

/**
 * SWIFTMAP (Change 34): the Layers panel with no layers. Add Data left the
 * rail, so editors who can add data get an "Add data" button here, with a
 * reminder that dropping files on the map works too. Anyone else gets one
 * muted line.
 */
export function EmptyLayers({ canAddData }: { canAddData: boolean }) {
  const { t } = useTranslation();
  const setAddDataOpen = useSidePanelStore((s) => s.setAddDataOpen);
  if (!canAddData) {
    return <p className="px-4 pb-2 pt-4 text-xs text-muted-foreground">{t("swiftmapLayers.empty")}</p>;
  }
  return (
    <div data-testid="layers-empty" className="flex flex-col items-center gap-2 px-4 pb-4 pt-6 text-center">
      <Button type="button" size="sm" onClick={() => setAddDataOpen(true)}>
        <Plus aria-hidden="true" className="size-4" />
        {t("swiftmapLayers.addData")}
      </Button>
      <span className="text-xs text-muted-foreground">{t("swiftmapLayers.dropHint")}</span>
    </div>
  );
}
