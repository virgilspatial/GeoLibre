import { useAppStore } from "@geolibre/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { notify } from "../../lib/notify";
import { DRAW_ORDER_HINT_FLAG, isDrawOrderByShapeOn, reorderLeftMapUnchanged } from "./draw-order";

function hintShown(): boolean {
  try {
    return globalThis.localStorage?.getItem(DRAW_ORDER_HINT_FLAG) === "1";
  } catch {
    return true;
  }
}

function markHintShown(): void {
  try {
    globalThis.localStorage?.setItem(DRAW_ORDER_HINT_FLAG, "1");
  } catch {
    // Without storage the hint may show again next session; harmless.
  }
}

/**
 * SWIFTMAP (Change 36): the first time an editor reorders layers (a drag, or
 * Move up/down) and the map draws them the same way because of "Draw points
 * above lines and polygons", one message says why and where to turn it off.
 * Once per browser.
 */
export function useDrawOrderHint(): void {
  const { t } = useTranslation();
  useEffect(() => {
    if (hintShown()) return;
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (state.layers === previous.layers) return;
      if (!isDrawOrderByShapeOn(state.metadata)) return;
      if (!reorderLeftMapUnchanged(previous.layers, state.layers)) return;
      if (hintShown()) return;
      markHintShown();
      notify.info(t("swiftmapDrawOrder.hint"), { durationMs: 10000 });
      unsubscribe();
    });
    return unsubscribe;
  }, [t]);
}
