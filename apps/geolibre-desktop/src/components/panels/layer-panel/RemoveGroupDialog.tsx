import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@geolibre/core";
import type { LayerGroup } from "@geolibre/core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@geolibre/ui";
import { unregisterPostgisConnection } from "../../../lib/postgis-connections";

interface RemoveGroupDialogProps {
  /** The group awaiting confirmation, or null when the dialog is closed. */
  group: LayerGroup | null;
  /** How many layers removing it removes (its subgroups' included). */
  layerCount: number;
  onClose: () => void;
}

/**
 * Remove a group and every layer and subgroup in it.
 */
export function removeGroupAndContents(groupId: string): void {
  const { layers, layerGroups, removeLayerGroup } = useAppStore.getState();
  const groupIds = new Set([groupId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const group of layerGroups) {
      if (group.parentId && groupIds.has(group.parentId) && !groupIds.has(group.id)) {
        groupIds.add(group.id);
        grew = true;
      }
    }
  }
  // Drop the removed layers' PostGIS session state, as Remove layer does.
  for (const layer of layers) {
    if (layer.groupId && groupIds.has(layer.groupId)) unregisterPostgisConnection(layer.id);
  }
  removeLayerGroup(groupId, { removeChildren: true });
}

/**
 * SWIFTMAP: confirmation before a group with layers is removed (Change 18, G6).
 * The mockup offers Undo instead; GeoLibre's Undo can't bring back every layer
 * type in full, so the confirmation stays, as for Remove layer (Change 17).
 */
export function RemoveGroupDialog({ group, layerCount, onClose }: RemoveGroupDialogProps) {
  const { t } = useTranslation();
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const handleRemove = () => {
    if (!group) return;
    removeGroupAndContents(group.id);
    onClose();
  };
  return (
    <Dialog
      open={!!group}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          if (!removeButtonRef.current) return;
          event.preventDefault();
          removeButtonRef.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("layerPanel.removeGroupConfirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("layerPanel.removeGroupConfirmBody", {
              name: group?.name ?? "",
              count: layerCount,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button ref={removeButtonRef} type="button" variant="destructive" onClick={handleRemove}>
            {t("common.remove")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
