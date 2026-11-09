import { getRegionalBasemapByStyleUrl, useAppStore } from "@geolibre/core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@geolibre/ui";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { notify } from "../../lib/notify";
import { applySwiftmapFallback } from "./regional-fallback";

/**
 * Asks before an opened project's regional basemap (tiles served from mainland
 * China) is loaded, and tells the user when the deployment refused one.
 *
 * The store does the gating: `loadProject` applies the default basemap and
 * records the requested one in `regionalBasemapHold`. This component only
 * renders that hold, so the map is never blocked on an answer: it keeps showing
 * the default basemap until the user picks Load. Closing the dialog any other
 * way keeps the default basemap for now, without remembering an answer.
 */
export function RegionalBasemapPrompt() {
  const { t } = useTranslation();
  const hold = useAppStore((s) => s.regionalBasemapHold);
  const resolveRegionalBasemapHold = useAppStore((s) => s.resolveRegionalBasemapHold);
  // SWIFTMAP (Change 32): every way out that doesn't load the regional
  // basemap leaves Swiftmap's default (Light), not GeoLibre's fallback.
  const resolveHold = useCallback(
    (load: boolean, options?: { remember?: boolean }) => {
      resolveRegionalBasemapHold(load, options);
      if (!load) applySwiftmapFallback();
    },
    [resolveRegionalBasemapHold],
  );
  const basemap = hold ? getRegionalBasemapByStyleUrl(hold.styleUrl) : undefined;

  // A deployment block needs no answer: say why the basemap differs, once.
  useEffect(() => {
    if (hold?.reason !== "blocked") return;
    notify.info(t("regionalBasemap.blockedNotice"), { dedupeKey: "regional-basemap-blocked" });
    resolveHold(false);
  }, [hold, resolveHold, t]);

  const open = hold?.reason === "prompt" && basemap !== undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        // Escape or a click outside closes the dialog without answering, so
        // the same basemap asks again next time instead of being refused
        // quietly for the rest of the session.
        if (!next) resolveHold(false, { remember: false });
      }}
    >
      <DialogContent className="max-w-md" data-testid="regional-basemap-prompt">
        <DialogHeader>
          <DialogTitle>{t("regionalBasemap.promptTitle")}</DialogTitle>
          <DialogDescription>
            {t("regionalBasemap.promptDescription", {
              provider: basemap?.provider ?? "",
              name: basemap?.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => resolveHold(false)}>
            {t("regionalBasemap.useDefault")}
          </Button>
          <Button type="button" onClick={() => resolveHold(true)}>
            {t("regionalBasemap.load")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
