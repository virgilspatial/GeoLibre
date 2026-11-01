import { useTranslation } from "react-i18next";
import { useAppStore } from "@geolibre/core";
import type { GeoLibreLayer } from "@geolibre/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@geolibre/ui";
import { unregisterPostgisConnection } from "../../../lib/postgis-connections";

interface RemoveLayerDialogProps {
  /** The layer awaiting confirmation, or null when the dialog is closed. */
  layer: GeoLibreLayer | null;
  /** Close the dialog (on cancel, dismiss, or after removing). */
  onClose: () => void;
}

/** Confirmation dialog shown before a layer is removed from the project. */
export function RemoveLayerDialog({ layer, onClose }: RemoveLayerDialogProps) {
  const { t } = useTranslation();
  const removeLayer = useAppStore((s) => s.removeLayer);
  return (
    <AlertDialog
      open={!!layer}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("layers.removeLayerAlertTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("layers.removeLayerAlertBody", {
              name: layer?.name ?? t("layers.thisLayerFallback"),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!layer) return;
              // Drop the removed layer's PostGIS session state (connection
              // string, baseline keys) so credentials don't outlive it.
              unregisterPostgisConnection(layer.id);
              removeLayer(layer.id);
            }}
          >
            {t("common.remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
