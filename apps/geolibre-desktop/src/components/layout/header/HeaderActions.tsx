import { Button, cn } from "@geolibre/ui";
import { Eye, Moon, Share, Sun, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ThemeMode } from "../../../hooks/useThemeMode";
import { EditHistoryButtons } from "./EditHistoryButtons";
import { HeaderIconButton } from "./HeaderIconButton";

interface HeaderActionsProps {
  /** Viewer mode: only the theme toggle shows. */
  readOnly: boolean;
  themeMode: ThemeMode;
  onToggleThemeMode: () => void;
  onSave: () => void;
}

/**
 * The header's right-hand actions (Change 15): edit history and save, the
 * Preview and Publish placeholders, Share and the theme toggle. Split out of
 * TopToolbar (Change 21) to keep it under the untested-module limit.
 */
export function HeaderActions({
  readOnly,
  themeMode,
  onToggleThemeMode,
  onSave,
}: HeaderActionsProps) {
  const { t } = useTranslation();
  return (
    <>
      {!readOnly ? (
        <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <EditHistoryButtons onSave={onSave} />
          {/* Preview and Publish arrive with branch 8 (Stage 1). */}
          <Button
            type="button"
            variant="outline"
            disabled
            className="hidden h-8 gap-1.5 rounded-lg border-input bg-transparent px-3 text-[13px] disabled:opacity-100 disabled:text-muted-foreground sm:inline-flex [&_svg]:size-[15px]"
          >
            <Eye aria-hidden />
            {t("header.preview")}
          </Button>
          <Button
            type="button"
            disabled
            className="hidden h-8 gap-1.5 rounded-lg px-3 text-[13px] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 sm:inline-flex [&_svg]:size-[15px]"
          >
            <Share aria-hidden />
            {t("header.publish")}
          </Button>
        </div>
      ) : null}
      <div className={cn("flex shrink-0 items-center gap-1.5 sm:gap-2.5", readOnly && "ms-auto")}>
        {!readOnly ? (
          // Swiftmap's Share dialog arrives with branch 8.
          <HeaderIconButton label={t("header.share")} unavailable>
            <UserPlus aria-hidden />
          </HeaderIconButton>
        ) : null}
        <HeaderIconButton
          label={
            themeMode === "dark"
              ? t("toolbar.command.switchToLight")
              : t("toolbar.command.switchToDark")
          }
          onClick={onToggleThemeMode}
        >
          {themeMode === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </HeaderIconButton>
      </div>
    </>
  );
}
