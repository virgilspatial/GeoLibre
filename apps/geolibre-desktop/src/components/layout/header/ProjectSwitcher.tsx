import { DEFAULT_PROJECT_NAME, useAppStore } from "@geolibre/core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@geolibre/ui";
import { ChevronsUpDown, History } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

/** How many recent projects the switcher lists below the current one. */
const RECENT_LIMIT = 5;

interface ProjectSwitcherProps {
  /** Viewers see the name only, with no menu. */
  readOnly?: boolean;
  onOpenRecent: (path: string) => void;
  /** "All projects": GeoLibre's Open project until a projects page exists. */
  onOpenAllProjects: () => void;
}

/**
 * The header's project name and switcher menu (Change 15): the current project,
 * recent projects, Rename project…, All projects and Version history (disabled
 * until Stage 1).
 */
export function ProjectSwitcher({
  readOnly = false,
  onOpenRecent,
  onOpenAllProjects,
}: ProjectSwitcherProps) {
  const { t } = useTranslation();
  const projectName = useAppStore((s) => s.projectName);
  const projectPath = useAppStore((s) => s.projectPath);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const [renameOpen, setRenameOpen] = useState(false);
  const openingDialogRef = useRef(false);
  const displayName = projectName.trim() || DEFAULT_PROJECT_NAME;

  if (readOnly) {
    return <span className="min-w-0 truncate text-sm font-medium">{displayName}</span>;
  }

  const others = recentProjects
    .filter((project) => project.path !== projectPath)
    .slice(0, RECENT_LIMIT);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={t("header.switchProject", { name: displayName })}
            className="-ms-2 h-8 min-w-0 gap-2 rounded-md px-2 text-sm font-medium data-[state=open]:bg-muted"
          >
            <span className="min-w-0 truncate">{displayName}</span>
            <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          // The mockup lines the menu up under the slash, not the name.
          alignOffset={-18}
          className="w-[280px]"
          // Opening the rename dialog must keep its focus: don't hand it back to
          // the trigger as the menu closes.
          onCloseAutoFocus={(event) => {
            if (openingDialogRef.current) event.preventDefault();
            openingDialogRef.current = false;
          }}
        >
          <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("header.projects")}
          </DropdownMenuLabel>
          <DropdownMenuItem className="justify-between gap-3 bg-muted" aria-current="true">
            <span className="min-w-0 truncate">{displayName}</span>
            <span className="text-xs text-muted-foreground">{t("header.current")}</span>
          </DropdownMenuItem>
          {others.map((project) => (
            <DropdownMenuItem
              key={project.path}
              title={project.path}
              onSelect={() => onOpenRecent(project.path)}
            >
              <span className="min-w-0 truncate">{project.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              openingDialogRef.current = true;
              setRenameOpen(true);
            }}
          >
            {t("header.renameProjectEllipsis")}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-muted-foreground" onSelect={onOpenAllProjects}>
            {t("header.allProjects")}
          </DropdownMenuItem>
          {/* Disabled until Stage 1 (ui-handoff.md, 3a). GeoLibre's project
              history stays in the overflow's Project menu until 3b. */}
          <DropdownMenuItem disabled>
            <History aria-hidden className="me-2 size-3.5" />
            {t("header.versionHistory")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renameOpen ? (
        <RenameProjectDialog currentName={projectName} onClose={() => setRenameOpen(false)} />
      ) : null}
    </>
  );
}

interface RenameProjectDialogProps {
  currentName: string;
  onClose: () => void;
}

/** Renames the open project. A blank name falls back to the default name. */
function RenameProjectDialog({ currentName, onClose }: RenameProjectDialogProps) {
  const { t } = useTranslation();
  const setProjectName = useAppStore((s) => s.setProjectName);
  const [value, setValue] = useState(currentName);
  const composingRef = useRef(false);
  const inputId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (composingRef.current) return;
    const next = value.trim();
    // Persist the canonical, locale-independent default, as the old header's
    // name field did, so a translated string is never written into the file.
    const name = next || DEFAULT_PROJECT_NAME;
    if (name !== currentName) setProjectName(name);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("header.renameTitle")}</DialogTitle>
          <DialogDescription>{t("header.renameDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>{t("header.renameLabel")}</Label>
            <Input
              id={inputId}
              value={value}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setValue(event.target.value)}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{t("common.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
