import { useAppStore } from "@geolibre/core";
import { Badge, Button, cn } from "@geolibre/ui";
import { Database, File as FileIcon, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { canImportFiles, importFiles } from "./file-import-bridge";
import {
  formatFileSize,
  GEOJSON_SUMMARY_MAX_BYTES,
  summariseGeoJson,
  UPLOAD_FORMATS,
  uploadAccept,
  uploadFormatFor,
  VIEWER_UPLOAD_EXTENSIONS,
  VIEWER_UPLOAD_MAX_BYTES,
  fileExtension,
  type GeoJsonSummary,
  type GeometryFamily,
  type UploadFamily,
} from "./upload-formats";

interface UploadTabProps {
  viewer: boolean;
  /** Called after a file was added. */
  onAdded: () => void;
  /** Called when the last waiting file was added, to close the dialog. */
  onAllAdded: () => void;
}

type CardProblem = "unsupported" | "tooLarge" | "nothingAdded";

interface FileCard {
  id: number;
  file: File;
  formatLabel: string | null;
  family: UploadFamily | null;
  geometry: GeometryFamily | null;
  summary: GeoJsonSummary | null;
  problem: CardProblem | null;
  busy: boolean;
}

const FAMILY_KEYS = {
  vector: "addDataDialog.upload.family.vector",
  raster: "addDataDialog.upload.family.raster",
  pointCloud: "addDataDialog.upload.family.pointCloud",
} as const;

const GEOMETRY_KEYS = {
  Point: "addDataDialog.upload.geometry.point",
  Line: "addDataDialog.upload.geometry.line",
  Polygon: "addDataDialog.upload.geometry.polygon",
  Mixed: "addDataDialog.upload.geometry.mixed",
} as const;

let nextCardId = 1;

/**
 * SWIFTMAP (Change 24): the Upload tab. Files are dropped or browsed, shown as
 * cards, and added through the map's own drop pipeline (see
 * file-import-bridge.ts), so they load exactly as if dropped on the map.
 */
export function UploadTab({ viewer, onAdded, onAllAdded }: UploadTabProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cards, setCards] = useState<FileCard[]>([]);
  const [dragging, setDragging] = useState(false);
  const [showAllTypes, setShowAllTypes] = useState(false);

  const describe = async (file: File): Promise<FileCard> => {
    const format = uploadFormatFor(file.name);
    const allowed =
      format !== null && (!viewer || VIEWER_UPLOAD_EXTENSIONS.includes(fileExtension(file.name)));
    let summary: GeoJsonSummary | null = null;
    if (allowed && format.label === "GeoJSON" && file.size <= GEOJSON_SUMMARY_MAX_BYTES) {
      summary = summariseGeoJson(await file.text());
    }
    return {
      id: nextCardId++,
      file,
      formatLabel: format?.label ?? null,
      family: format?.family ?? null,
      geometry: summary?.geometry ?? format?.geometry ?? null,
      summary,
      problem: !allowed
        ? "unsupported"
        : viewer && file.size > VIEWER_UPLOAD_MAX_BYTES
          ? "tooLarge"
          : null,
      busy: false,
    };
  };

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const described = await Promise.all(files.map(describe));
    setCards((current) => [...current, ...described]);
  };

  const updateCard = (id: number, patch: Partial<FileCard>) =>
    setCards((current) => current.map((card) => (card.id === id ? { ...card, ...patch } : card)));

  const addCard = async (card: FileCard) => {
    updateCard(card.id, { busy: true, problem: null });
    const before = useAppStore.getState().layers.length;
    try {
      await importFiles([card.file]);
    } catch {
      updateCard(card.id, { busy: false, problem: "nothingAdded" });
      return;
    }
    // The pipeline reports its own errors on the map; only whether a layer
    // arrived matters here.
    if (useAppStore.getState().layers.length <= before) {
      updateCard(card.id, { busy: false, problem: "nothingAdded" });
      return;
    }
    onAdded();
    const remaining = cards.filter((item) => item.id !== card.id && item.problem === null);
    setCards((current) => current.filter((item) => item.id !== card.id));
    if (remaining.length === 0) onAllAdded();
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };

  const shortList = viewer ? t("addDataDialog.upload.viewerFormats") : t("addDataDialog.upload.formats");
  const allTypes = UPLOAD_FORMATS.map((format) => format.label).join(", ");

  return (
    <div className="flex flex-col">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={uploadAccept(viewer)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="add-data-file-input"
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        data-testid="add-data-drop-zone"
        disabled={!canImportFiles()}
        className={cn(
          "flex h-[230px] w-full flex-col items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-input bg-sidebar text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
          dragging && "border-ring bg-accent",
        )}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="flex size-[46px] items-center justify-center rounded-full bg-muted">
          <Upload className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="text-sm font-medium">
          {t("addDataDialog.upload.dropPrefix")}{" "}
          <span className="underline underline-offset-[3px]">{t("addDataDialog.upload.browse")}</span>
        </span>
        <span className="text-xs text-muted-foreground">{t("addDataDialog.upload.detected")}</span>
      </button>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {shortList}
        {viewer ? null : (
          <>
            {" "}
            <button
              type="button"
              aria-expanded={showAllTypes}
              className="text-foreground underline underline-offset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setShowAllTypes((value) => !value)}
            >
              {showAllTypes
                ? t("addDataDialog.upload.hideAllTypes")
                : t("addDataDialog.upload.seeAllTypes")}
            </button>
          </>
        )}
      </p>
      {showAllTypes && !viewer ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground" data-testid="add-data-all-types">
          {t("addDataDialog.upload.allTypes", { types: allTypes })}
        </p>
      ) : null}

      {viewer ? null : (
        <div
          role="note"
          aria-disabled="true"
          className="mt-3 flex cursor-not-allowed select-none items-center gap-3 rounded-[10px] border px-3 py-2.5"
        >
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-muted opacity-50">
            <Database className="size-[15px]" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-medium opacity-50">
            {t("addDataDialog.upload.gdb")}
          </span>
          <span className="text-xs text-muted-foreground">{t("addDataDialog.upload.gdbNote")}</span>
        </div>
      )}

      {cards.length > 0 ? (
        <ul className="mt-[18px] flex flex-col gap-2" aria-label={t("addDataDialog.upload.filesLabel")}>
          {cards.map((card) => (
            <FileCardRow key={card.id} card={card} onAdd={() => void addCard(card)} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FileCardRow({ card, onAdd }: { card: FileCard; onAdd: () => void }) {
  const { t } = useTranslation();
  const meta = [formatFileSize(card.file.size)];
  if (card.formatLabel) meta.push(card.formatLabel);
  if (card.summary) {
    meta.push(t("addDataDialog.upload.features", { count: card.summary.featureCount }));
  }
  const badge = card.family
    ? card.geometry
      ? `${t(FAMILY_KEYS[card.family])} · ${t(GEOMETRY_KEYS[card.geometry])}`
      : t(FAMILY_KEYS[card.family])
    : null;
  const problem =
    card.problem === "unsupported"
      ? t("addDataDialog.upload.unsupported")
      : card.problem === "tooLarge"
        ? t("addDataDialog.upload.tooLarge")
        : card.problem === "nothingAdded"
          ? t("addDataDialog.upload.nothingAdded")
          : null;
  const blocked = card.problem === "unsupported" || card.problem === "tooLarge";

  return (
    <li
      data-testid="add-data-file-card"
      className="flex items-center gap-3 rounded-[10px] border py-3 pe-3 ps-3.5"
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-muted">
        <FileIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">{card.file.name}</span>
        <span className={cn("text-xs", problem ? "text-destructive" : "text-muted-foreground")}>
          {problem ?? meta.join(" · ")}
        </span>
      </span>
      {badge && !blocked ? (
        <Badge variant="secondary" className="px-2.5 py-[3px] text-[11.5px]">
          {badge}
        </Badge>
      ) : null}
      {blocked ? null : (
        <Button className="h-8 px-3.5 text-[13px]" disabled={card.busy} onClick={onAdd}>
          {card.busy ? t("addDataDialog.adding") : t("addDataDialog.addLayer")}
        </Button>
      )}
    </li>
  );
}
