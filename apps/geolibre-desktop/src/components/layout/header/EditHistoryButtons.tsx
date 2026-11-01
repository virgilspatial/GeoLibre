import {
  canRedoProjectRestore,
  canUndoProjectRestore,
  redo,
  subscribeProjectRestoreHistory,
  undo,
  useAppStore,
} from "@geolibre/core";
import { Button, cn } from "@geolibre/ui";
import { Redo2, Save, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { formatShortcut, isMacPlatform } from "../../../lib/commands";
import {
  HeaderIconButton,
  HeaderTooltip,
  headerUnavailableClass,
} from "./HeaderIconButton";

const UNDO_SHORTCUT = { key: "z", mod: true };
const REDO_SHORTCUT = { key: "z", mod: true, shift: true };
const SAVE_SHORTCUT = { key: "s", mod: true };

/**
 * Whether undo/redo has anything to apply: GeoLibre's temporal store history
 * plus its project-restore history, as the Edit menu reads them.
 */
function useUndoRedoAvailability() {
  const temporalCanUndo = useStore(useAppStore.temporal, (s) => s.pastStates.length > 0);
  const temporalCanRedo = useStore(useAppStore.temporal, (s) => s.futureStates.length > 0);
  const canUndoRestore = useSyncExternalStore(
    subscribeProjectRestoreHistory,
    canUndoProjectRestore,
    canUndoProjectRestore,
  );
  const canRedoRestore = useSyncExternalStore(
    subscribeProjectRestoreHistory,
    canRedoProjectRestore,
    canRedoProjectRestore,
  );
  return { canUndo: temporalCanUndo || canUndoRestore, canRedo: temporalCanRedo || canRedoRestore };
}

/**
 * When the open project was last saved, or null before its first save. The
 * store keeps no timestamp, so this records the moment `isDirty` clears within
 * one project (a save). Opening another project resets it.
 */
function useLastSavedAt(): number | null {
  const isDirty = useAppStore((s) => s.isDirty);
  const projectGeneration = useAppStore((s) => s.projectGeneration);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const previous = useRef({ isDirty, projectGeneration });
  useEffect(() => {
    const before = previous.current;
    previous.current = { isDirty, projectGeneration };
    if (before.projectGeneration !== projectGeneration) {
      setSavedAt(null);
      return;
    }
    if (before.isDirty && !isDirty) setSavedAt(Date.now());
  }, [isDirty, projectGeneration]);
  return savedAt;
}

/** "All changes saved", with how long ago when the time is known. */
function SavedTooltipText({ savedAt }: { savedAt: number | null }) {
  const { t } = useTranslation();
  if (savedAt === null) return <>{t("header.allSaved")}</>;
  // Read the clock when the tooltip opens, so the age is current without a timer.
  const minutes = Math.floor((Date.now() - savedAt) / 60_000);
  if (minutes < 1) return <>{t("header.allSavedJustNow")}</>;
  if (minutes < 60) return <>{t("header.allSavedMinutesAgo", { count: minutes })}</>;
  return <>{t("header.allSavedHoursAgo", { count: Math.floor(minutes / 60) })}</>;
}

interface EditHistoryButtonsProps {
  onSave: () => void;
}

/**
 * The header's Undo and Redo (a joined pair) and Save (Change 15). They drive
 * GeoLibre's own history and project save; the shortcuts are GeoLibre's global
 * ones, shown in the tooltips.
 */
export function EditHistoryButtons({ onSave }: EditHistoryButtonsProps) {
  const { t } = useTranslation();
  const { canUndo, canRedo } = useUndoRedoAvailability();
  const isDirty = useAppStore((s) => s.isDirty);
  const savedAt = useLastSavedAt();
  const isMac = useMemo(() => isMacPlatform(), []);

  const pairButtonClass =
    "h-[30px] w-8 rounded-none bg-transparent p-0 text-foreground hover:bg-accent [&_svg]:size-[15px]";

  return (
    <>
      <div
        role="group"
        aria-label={t("header.editHistory")}
        className="flex h-8 shrink-0 overflow-hidden rounded-lg border border-input"
      >
        <HeaderTooltip
          content={
            canUndo
              ? t("header.undoWithShortcut", { shortcut: formatShortcut(UNDO_SHORTCUT, isMac) })
              : t("header.nothingToUndo")
          }
        >
          <Button
            type="button"
            variant="ghost"
            aria-label={t("toolbar.item.undo")}
            aria-disabled={!canUndo || undefined}
            className={cn(pairButtonClass, "rounded-s-[7px]", !canUndo && headerUnavailableClass)}
            onClick={() => {
              if (canUndo) undo();
            }}
          >
            <Undo2 aria-hidden />
          </Button>
        </HeaderTooltip>
        <span aria-hidden className="w-px bg-input" />
        <HeaderTooltip
          content={
            canRedo
              ? t("header.redoWithShortcut", { shortcut: formatShortcut(REDO_SHORTCUT, isMac) })
              : t("header.nothingToRedo")
          }
        >
          <Button
            type="button"
            variant="ghost"
            aria-label={t("toolbar.item.redo")}
            aria-disabled={!canRedo || undefined}
            className={cn(pairButtonClass, "rounded-e-[7px]", !canRedo && headerUnavailableClass)}
            onClick={() => {
              if (canRedo) redo();
            }}
          >
            <Redo2 aria-hidden />
          </Button>
        </HeaderTooltip>
      </div>
      <HeaderIconButton
        label={t("common.save")}
        tooltip={
          isDirty ? (
            t("header.saveWithShortcut", { shortcut: formatShortcut(SAVE_SHORTCUT, isMac) })
          ) : (
            <SavedTooltipText savedAt={savedAt} />
          )
        }
        unavailable={!isDirty}
        onClick={onSave}
      >
        <Save aria-hidden />
      </HeaderIconButton>
    </>
  );
}
