import { getProtomapsApiKey, useAppStore } from "@geolibre/core";
import {
  Button,
  cn,
  Input,
  Label,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geolibre/ui";
import { Check, ChevronRight, Link2, Map as MapIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAutoFlavor } from "./auto-flavor";
import { applyBasemap } from "./basemap-actions";
import {
  choiceUrl,
  currentChoice,
  labelsState,
  legacyBasemapName,
  OFFLINE_SENTINEL_PREFIX,
  parseSwiftmapBasemap,
  parseTileLink,
  pickerChoices,
  tileLinkOf,
  withLabels,
  type BasemapChoiceId,
} from "./basemap-catalog";
import aerialThumb from "./thumbnails/aerial.webp";
import darkThumb from "./thumbnails/dark.webp";
import greyThumb from "./thumbnails/grey.webp";
import libertyThumb from "./thumbnails/liberty.webp";
import lightThumb from "./thumbnails/light.webp";

// SWIFTMAP (Change 28): the Basemap card at the bottom of the Layers panel and
// its picker popover. Replaces GeoLibre's Background row and its Change
// background dialog; viewers get the same card, and their choice isn't saved.

/** Swiftmap's own renders of each style over Newcastle, without labels. */
const THUMBNAILS: Partial<Record<BasemapChoiceId, string>> = {
  light: lightThumb,
  grey: greyThumb,
  dark: darkThumb,
  aerial: aerialThumb,
  liberty: libertyThumb,
};

/** The last link used in "Use a tile link…", to prefill it next time. */
const TILE_LINK_STORAGE_KEY = "swiftmap.basemap.tileLink";

function readStoredTileLink(): string {
  try {
    return localStorage.getItem(TILE_LINK_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Whether a Protomaps key is set, following Settings → Environment variables. */
function useHasProtomapsKey(): boolean {
  const [hasKey, setHasKey] = useState(() => Boolean(getProtomapsApiKey()));
  useEffect(() => {
    const refresh = () => setHasKey(Boolean(getProtomapsApiKey()));
    refresh();
    window.addEventListener("geolibre:runtime-env-change", refresh);
    return () => window.removeEventListener("geolibre:runtime-env-change", refresh);
  }, []);
  return hasKey;
}

interface BasemapInfo {
  /** The picker row it is, or null for a custom or legacy basemap. */
  choice: BasemapChoiceId | null;
  name: string;
}

function useDescribe(hasKey: boolean): (url: string) => BasemapInfo {
  const { t } = useTranslation();
  return (url) => {
    // Without a key a Swiftmap Protomaps basemap can't be built, and the map
    // falls back to Liberty, so say what is actually drawn.
    const parsed = parseSwiftmapBasemap(url);
    const choice =
      !hasKey && (parsed?.kind === "protomaps" || parsed?.kind === "auto")
        ? "liberty"
        : currentChoice(url);
    if (choice) return { choice, name: t(`swiftmapBasemap.${choice}`) };
    const name =
      legacyBasemapName(url) ??
      (url.startsWith(OFFLINE_SENTINEL_PREFIX)
        ? t("swiftmapBasemap.offline")
        : t("swiftmapBasemap.custom"));
    return { choice: null, name };
  };
}

/**
 * A 40px thumbnail with a plain 1px grey border, drawn inside the box over the
 * image. The current basemap is marked on its whole row, not here.
 */
function Thumbnail({ choice }: { choice: BasemapChoiceId | null }) {
  if (choice === "auto") return <AutoThumbnail />;
  return <PlainThumbnail choice={choice} />;
}

/**
 * Change 33 (review round 2): the card shows what's drawn, so Auto shows
 * Light's or Dark's thumbnail by the theme; the picker keeps the split one.
 */
function CardThumbnail({ choice }: { choice: BasemapChoiceId | null }) {
  const flavor = useAutoFlavor();
  return <PlainThumbnail choice={choice === "auto" ? flavor : choice} />;
}

function PlainThumbnail({ choice }: { choice: BasemapChoiceId | null }) {
  const src = choice ? THUMBNAILS[choice] : undefined;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md",
        src ? undefined : choice === "none" ? "bg-background" : "bg-muted",
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : choice === "none" ? null : (
        <MapIcon className="size-4 text-muted-foreground" />
      )}
      <span className="pointer-events-none absolute inset-0 rounded-md border border-border" />
    </span>
  );
}

/**
 * Change 33: Auto's picker thumbnail, split corner to corner: Light at the top
 * left, Dark at the bottom right, a hard edge. Both are the same map area.
 */
function AutoThumbnail() {
  return (
    <span aria-hidden="true" className="relative flex size-10 shrink-0 overflow-hidden rounded-md">
      <img src={lightThumb} alt="" className="size-full object-cover" />
      <img
        src={darkThumb}
        alt=""
        className="absolute inset-0 size-full object-cover [clip-path:polygon(100%_0,100%_100%,0_100%)]"
      />
      <span className="pointer-events-none absolute inset-0 rounded-md border border-border" />
    </span>
  );
}

interface BasemapCardProps {
  /** A viewer's pick lasts for the visit: it isn't saved and adds no Undo step. */
  viewer?: boolean;
  /** The layer list scrolls beneath the card: draw the line above it. */
  divider?: boolean;
  className?: string;
}

/**
 * The Basemap card: one row of a thumbnail, two lines of text ("Basemap", or
 * "Basemap · No labels", over the name) and a chevron. It opens the picker
 * beside the panel, which holds Show labels.
 */
export function BasemapCard({ viewer = false, divider = false, className }: BasemapCardProps) {
  const { t } = useTranslation();
  const url = useAppStore((s) => s.basemapStyleUrl);
  const hasKey = useHasProtomapsKey();
  const describe = useDescribe(hasKey);
  const info = describe(url);
  const labels = labelsState(url, hasKey);
  const [open, setOpen] = useState(false);
  // A custom or legacy basemap in use when the picker opened stays listed
  // until it closes, so it can be picked again while comparing.
  const [openedWith, setOpenedWith] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState(false);
  const currentRef = useRef<HTMLButtonElement>(null);
  const switchId = useId();
  const linkId = useId();

  const choices = pickerChoices(hasKey);
  const apply = (next: string) => {
    if (next !== useAppStore.getState().basemapStyleUrl) applyBasemap(next, { quiet: viewer });
  };
  // A pick keeps the Show labels setting; from a basemap without
  // labels, the next one starts with them on.
  const carryLabels = labels.available ? labels.on : true;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      const current = describe(url).choice;
      setOpenedWith(current && choices.includes(current) ? null : url);
      setLink(tileLinkOf(url) ?? readStoredTileLink());
      setLinkOpen(false);
      setLinkError(false);
    }
  };

  const submitLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = parseTileLink(link);
    if (!next) {
      setLinkError(true);
      return;
    }
    setLinkError(false);
    try {
      localStorage.setItem(TILE_LINK_STORAGE_KEY, link.trim());
    } catch {
      // Best-effort, like GeoLibre's picker.
    }
    setOpenedWith(next);
    apply(next);
  };

  const rows: { key: string; url: string; info: BasemapInfo }[] = choices.map((choice) => {
    const rowUrl = choiceUrl(choice, carryLabels);
    return { key: choice, url: rowUrl, info: describe(rowUrl) };
  });
  if (openedWith !== null)
    rows.push({ key: "current", url: openedWith, info: describe(openedWith) });
  const labelsOff = labels.available && !labels.on;
  const isSelected = (rowUrl: string, rowInfo: BasemapInfo) =>
    rowInfo.choice !== null && info.choice !== null
      ? rowInfo.choice === info.choice
      : rowUrl === url;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {/* The panel's shared 12px inset on every side: the outlined box has
          the same edges as the search box and row highlights, and the same
          gap above the status bar. The line above shows only while the
          list scrolls beneath the card. */}
      <PopoverAnchor asChild>
        <div
          data-divider={divider || undefined}
          className={cn(
            "border-t p-3 transition-colors duration-150",
            divider ? "border-border" : "border-transparent",
            className,
          )}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              // The same outline as the "Search layers..." box (token, 1px,
              // radius); hover and open fill inside it. The thumbnail has
              // even padding at its top, bottom and start; the chevron sits
              // in the layer rows' eye column.
              className="flex w-full items-center gap-2.5 rounded-lg border border-input py-1.5 ps-1.5 pe-2.25 text-start transition-colors hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-row-hover"
            >
              <CardThumbnail choice={info.choice} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-muted-foreground">
                  {labelsOff ? t("swiftmapBasemap.captionNoLabels") : t("swiftmapBasemap.basemap")}
                </span>
                <span className="block truncate text-[13px] font-medium">{info.name}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="end"
        // 8px clear of the panel's 1px border, and the same 8px above the
        // status bar.
        sideOffset={9}
        alignOffset={8}
        collisionPadding={8}
        className="w-62 p-1.5"
        aria-label={t("swiftmapBasemap.basemap")}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          currentRef.current?.focus();
        }}
      >
        <p className="px-1.5 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">
          {t("swiftmapBasemap.basemap")}
        </p>
        <div className="flex flex-col gap-0.5">
          {rows.map((row) => {
            const selected = isSelected(row.url, row.info);
            return (
              <button
                key={row.key}
                ref={selected ? currentRef : undefined}
                type="button"
                aria-pressed={selected}
                // Every row, the current one included, only gets the hover
                // fill; the current one has a check and a bold name.
                className="flex w-full items-center gap-2.5 rounded-[10px] p-1.5 text-start transition-colors hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => apply(row.url)}
              >
                <Thumbnail choice={row.info.choice} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    selected ? "font-semibold" : "font-medium",
                  )}
                >
                  {row.info.name}
                </span>
                {/* On every row, shown only on the current one, so names
                    never shift. Its end lines up with the switch below. */}
                <Check
                  aria-hidden="true"
                  className={cn("size-4 shrink-0 text-foreground", !selected && "invisible")}
                />
              </button>
            );
          })}
        </div>
        <Separator className="my-1.5" />
        <div className="flex items-center justify-between gap-2 px-1.5 py-1">
          <Label
            htmlFor={switchId}
            className={cn("text-[13px] font-normal", !labels.available && "opacity-50")}
          >
            {t("swiftmapBasemap.showLabels")}
          </Label>
          {labels.available ? (
            <Switch
              id={switchId}
              checked={labels.on}
              onCheckedChange={(on) => apply(withLabels(url, on))}
            />
          ) : (
            // No text line, so the popover keeps its size: the reason is a
            // tooltip. aria-disabled (not disabled) keeps hover and focus.
            // The trigger is a wrapper: as the Switch itself it would
            // overwrite the switch's data-state, and with it the off styling.
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Switch
                    id={switchId}
                    checked={false}
                    aria-disabled="true"
                    onClick={(event) => event.preventDefault()}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                {t("swiftmapBasemap.noLabels")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <Separator className="my-1.5" />
        {linkOpen ? (
          <form className="space-y-1.5 px-1.5 pb-1" onSubmit={submitLink} noValidate>
            <Label htmlFor={linkId} className="text-xs">
              {t("swiftmapBasemap.tileLink")}
            </Label>
            <div className="flex gap-1.5">
              <Input
                id={linkId}
                autoFocus
                type="text"
                inputMode="url"
                className="h-8 text-xs"
                placeholder={t("swiftmapBasemap.tileLinkPlaceholder")}
                value={link}
                aria-invalid={linkError || undefined}
                aria-describedby={`${linkId}-hint`}
                onChange={(event) => {
                  setLink(event.target.value);
                  setLinkError(false);
                }}
              />
              <Button type="submit" size="sm" className="h-8" disabled={!link.trim()}>
                {t("swiftmapBasemap.add")}
              </Button>
            </div>
            <p
              id={`${linkId}-hint`}
              className={cn(
                "text-[11px]",
                linkError ? "text-destructive" : "text-muted-foreground",
              )}
              role={linkError ? "alert" : undefined}
            >
              {linkError ? t("swiftmapBasemap.tileLinkInvalid") : t("swiftmapBasemap.tileLinkHint")}
            </p>
          </form>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-start text-[13px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setLinkOpen(true)}
          >
            <Link2 className="size-4 text-muted-foreground" />
            {t("swiftmapBasemap.useTileLink")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
