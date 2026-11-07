import { Badge, Button, cn } from "@geolibre/ui";
import { Link2, X } from "lucide-react";
import type { ParseKeys } from "i18next";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { detectLink, LINK_KINDS, type LinkKind } from "./link-detection";

/**
 * Example links shown under the field. Each was checked to load for real in the
 * browser build (Change 24); all are Australian public services.
 */
export const LINK_EXAMPLES: readonly { nameKey: ParseKeys; url: string }[] = [
  {
    nameKey: "addDataDialog.link.example.nswCadastre",
    url: "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer",
  },
  {
    nameKey: "addDataDialog.link.example.gaBaseMap",
    url: "https://services.ga.gov.au/gis/rest/services/NationalBaseMap/MapServer/tile/{z}/{y}/{x}",
  },
  {
    nameKey: "addDataDialog.link.example.dea",
    url: "https://explorer.dea.ga.gov.au/stac",
  },
  {
    nameKey: "addDataDialog.link.example.cog",
    url: "https://dea-public-data.s3.ap-southeast-2.amazonaws.com/derivative/ga_ls_wo_fq_cyear_3/2-0-0/x64/y32/2020--P1Y/ga_ls_wo_fq_cyear_3_x64y32_2020--P1Y_final_frequency.tif",
  },
];

interface LinkTabProps {
  onAddLink: (url: string, kind: LinkKind) => Promise<string | null>;
  /** The layer was added straight away. */
  onAdded: () => void;
  /** GeoLibre's own form for the type took over (it adds the layer itself). */
  onHandedOff: () => void;
}

/**
 * SWIFTMAP (Change 24): the From a link tab. One URL field that detects the
 * type as you type. No "Save this connection" switch until 5b (Vault).
 */
export function LinkTab({ onAddLink, onAdded, onHandedOff }: LinkTabProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [manualKind, setManualKind] = useState<LinkKind | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detected = detectLink(url);
  const kind = manualKind ?? (detected && detected !== "unknown" ? detected.kind : null);

  const setLink = (next: string) => {
    setUrl(next);
    setManualKind(null);
    setChoosing(false);
    setError(null);
  };

  const add = async () => {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      const name = await onAddLink(url.trim(), kind);
      if (name === null) onHandedOff();
      else onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      <label
        htmlFor={inputId}
        className="flex h-[38px] cursor-text items-center gap-2 rounded-lg border border-input px-3 text-[13px] text-muted-foreground focus-within:ring-2 focus-within:ring-ring"
      >
        <Link2 className="size-[15px] shrink-0" aria-hidden="true" />
        <input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-label={t("addDataDialog.link.fieldLabel")}
          placeholder={t("addDataDialog.link.placeholder")}
          value={url}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && kind && !busy) void add();
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        {url ? (
          <button
            type="button"
            aria-label={t("addDataDialog.link.clear")}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            onClick={() => setLink("")}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </label>

      <div className="mt-3 flex min-h-8 items-center gap-2.5 text-[13px]" aria-live="polite">
        {detected === null ? (
          <span className="leading-normal text-muted-foreground">{t("addDataDialog.link.worksWith")}</span>
        ) : kind ? (
          <>
            <Badge variant="secondary" className="px-2.5 py-[3px] text-[11.5px]">
              {t(`addDataDialog.link.kind.${kind}.label`)}
            </Badge>
            <span className="min-w-0 flex-1 text-muted-foreground">
              {manualKind
                ? t(`addDataDialog.link.kind.${kind}.description`)
                : t("addDataDialog.link.detected", {
                    description: t(`addDataDialog.link.kind.${kind}.description`),
                  })}
            </span>
            <Button className="h-8 px-3.5 text-[13px]" disabled={busy} onClick={() => void add()}>
              {busy ? t("addDataDialog.adding") : t("addDataDialog.addLayer")}
            </Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">{t("addDataDialog.link.unknown")}</span>
            <button
              type="button"
              aria-expanded={choosing}
              className="text-foreground underline underline-offset-[3px]"
              onClick={() => setChoosing((value) => !value)}
            >
              {t("addDataDialog.link.chooseManually")}
            </button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {t("addDataDialog.link.failed", { message: error })}
        </p>
      ) : null}

      {choosing && !kind ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("addDataDialog.link.chooseManually")}>
          {LINK_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              className="h-7 rounded-full border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent"
              onClick={() => {
                setManualKind(option);
                setChoosing(false);
              }}
            >
              {t(`addDataDialog.link.kind.${option}.label`)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-1.5 mt-[18px] text-xs font-medium text-muted-foreground">
        {t("addDataDialog.link.examples")}
      </div>
      <ul className="flex flex-col gap-0.5">
        {LINK_EXAMPLES.map((example) => (
          <li key={example.url}>
            <button
              type="button"
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-start hover:bg-accent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={() => setLink(example.url)}
            >
              <span className="text-[13px] font-medium text-foreground">{t(example.nameKey)}</span>
              <span className="max-w-full truncate font-mono text-[11.5px] text-muted-foreground">
                {example.url}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
