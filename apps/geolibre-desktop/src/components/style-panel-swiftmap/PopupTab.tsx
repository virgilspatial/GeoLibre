import {
  documentLocale,
  formatPopupValue,
  useAppStore,
  type GeoLibreLayer,
  type LayerPopupConfig,
  type PopupFieldConfig,
  type PopupFieldKind,
} from "@geolibre/core";
import { Checkbox, Input, Popover, PopoverContent, PopoverTrigger, cn } from "@geolibre/ui";
import { GripVertical, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Field,
  PopoverDone,
  SelectField,
  StepperField,
  SwitchRow,
  fieldLabelClass,
  noteClass,
} from "./fields";
import { layerFields } from "./layer-fields";
import { popupSamples } from "./popup-defaults";
import {
  defaultPopupFields,
  hasPopupFieldList,
  kindForFormat,
  moveItem,
  popupPreview,
  popupWithDefaults,
} from "./style-model";

// SWIFTMAP (Change 27): the Pop-up tab. Writes GeoLibre's `layer.popup`:
// whether a click opens a pop-up, its title field, and which fields it shows
// in which order, each with an optional label, value type and number format.
// Expressions and sizes are left as GeoLibre has them. The preview renders
// with GeoLibre's own pop-up functions, so it shows exactly what the map shows
// (7b review round 3).

const KINDS: readonly PopupFieldKind[] = ["auto", "text", "number", "date", "link", "image"];

/**
 * The fields shown: the saved list, or Swiftmap's defaults when none is saved
 * yet (system fields unticked, decimals rounded to 2; 7b review round 1).
 */
function shownFields(
  popup: LayerPopupConfig | undefined,
  fields: readonly string[],
  samples: readonly Record<string, unknown>[],
): PopupFieldConfig[] {
  return popup?.fields && hasPopupFieldList(popup)
    ? popup.fields
    : defaultPopupFields(fields, samples);
}

/** A sample value for the field list, formatted the way the pop-up will. */
function formatSample(value: unknown, config: PopupFieldConfig): string {
  return formatPopupValue(value, config, { locale: documentLocale() }) || "—";
}

export function PopupTab({ layer }: { layer: GeoLibreLayer }) {
  const { t } = useTranslation();
  const setLayerPopup = useAppStore((s) => s.setLayerPopup);
  const popup = layer.popup;
  const fields = layerFields(layer);
  const sample = (layer.geojson?.features[0]?.properties ?? {}) as Record<string, unknown>;
  const samples = popupSamples(layer);
  const shown = shownFields(popup, fields, samples);
  const preview = popupPreview(
    layer.name,
    sample,
    popupWithDefaults(popup, fields, samples) ?? popup,
    layer.fieldVisibility,
  );
  const shownNames = new Set(shown.map((f) => f.field));
  const hidden = fields.filter((field) => !shownNames.has(field));
  const enabled = popup?.click !== false;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Shown after trying to untick the last field (7b review round 4).
  const [lastFieldHint, setLastFieldHint] = useState(false);
  useEffect(() => {
    if (shown.length > 1) setLastFieldHint(false);
  }, [shown.length]);

  const save = (change: Partial<LayerPopupConfig>) =>
    setLayerPopup(layer.id, { ...popup, ...change });
  const saveFields = (next: PopupFieldConfig[]) => save({ fields: next });
  // A field ticked on gets its default format (numbers with decimals to 2 places).
  const toggle = (field: string, on: boolean) => {
    // GeoLibre reads an empty field list as "every field", so one stays ticked.
    if (!on && shown.length === 1) {
      setLastFieldHint(true);
      return;
    }
    saveFields(
      on
        ? [...shown, ...defaultPopupFields([field], samples)]
        : shown.filter((f) => f.field !== field),
    );
  };
  const move = (from: number, to: number) => saveFields(moveItem(shown, from, to));
  const updateField = (index: number, change: Partial<PopupFieldConfig>) =>
    saveFields(shown.map((f, i) => (i === index ? { ...f, ...change } : f)));

  const titleField = popup?.titleField ?? "";
  const hintId = useId();

  return (
    <div className="flex flex-col gap-5">
      <SwitchRow
        label={t("swiftmapStyle.popup.show")}
        note={t("swiftmapStyle.popup.showNote")}
        checked={enabled}
        onCheckedChange={(click) => save({ click })}
      />
      {enabled ? (
        <>
          <SelectField
            label={t("swiftmapStyle.popup.title")}
            value={titleField}
            onChange={(value) => save({ titleField: value || undefined })}
            options={[
              { value: "", label: t("swiftmapStyle.popup.titleLayerName") },
              ...fields.map((field) => ({ value: field, label: field })),
            ]}
          />
          <div className="flex flex-col gap-1">
            <span className={fieldLabelClass}>{t("swiftmapStyle.popup.fields")}</span>
            <span className={cn(noteClass, "mb-1")}>{t("swiftmapStyle.popup.fieldsNote")}</span>
            <ul className="flex flex-col">
              {shown.map((config, index) => (
                <li
                  key={config.field}
                  onDragOver={(event) => {
                    if (dragIndex !== null) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex !== null) move(dragIndex, index);
                    setDragIndex(null);
                  }}
                  className={cn(
                    "-mx-2 flex h-9 items-center gap-1.5 rounded-md px-1 hover:bg-accent/60",
                    dragIndex === index && "opacity-50",
                  )}
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      setDragIndex(index);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" && index > 0) {
                        event.preventDefault();
                        move(index, index - 1);
                      } else if (event.key === "ArrowDown" && index < shown.length - 1) {
                        event.preventDefault();
                        move(index, index + 1);
                      }
                    }}
                    aria-label={t("swiftmapStyle.popup.reorder", {
                      name: config.label || config.field,
                    })}
                    className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <GripVertical className="size-3.5" aria-hidden="true" />
                  </button>
                  <Checkbox
                    checked
                    aria-describedby={lastFieldHint ? hintId : undefined}
                    aria-label={t("swiftmapStyle.popup.showField", { name: config.field })}
                    onCheckedChange={() => toggle(config.field, false)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={config.field}>
                    {config.label || config.field}
                  </span>
                  <span
                    className="max-w-[90px] truncate text-xs text-muted-foreground"
                    title={String(sample[config.field] ?? "")}
                  >
                    {formatSample(sample[config.field], config)}
                  </span>
                  <FieldMore
                    config={config}
                    sample={sample[config.field]}
                    onChange={(change) => updateField(index, change)}
                  />
                </li>
              ))}
              {hidden.map((field) => (
                <li
                  key={field}
                  className="-mx-2 flex h-9 items-center gap-1.5 rounded-md px-1 hover:bg-accent/60"
                >
                  <span className="size-6 shrink-0" />
                  <Checkbox
                    checked={false}
                    aria-label={t("swiftmapStyle.popup.showField", { name: field })}
                    onCheckedChange={() => toggle(field, true)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                    {field}
                  </span>
                </li>
              ))}
            </ul>
            <span id={hintId} role="status" className={cn(noteClass, "text-foreground")}>
              {lastFieldHint ? t("swiftmapStyle.popup.lastFieldHint") : null}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("swiftmapStyle.popup.preview")}
            </span>
            <div className="flex flex-col gap-2 rounded-[10px] border px-3.5 py-3 shadow-[0_4px_14px_rgba(9,9,11,0.08)]">
              <span className="truncate text-sm font-semibold">{preview.title}</span>
              {preview.rows.length > 0 ? (
                <div
                  data-testid="swiftmap-popup-preview"
                  className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs"
                >
                  {preview.rows.map((row) => (
                    <div key={row.field} className="contents">
                      <span className="truncate text-muted-foreground">{row.label}</span>
                      <span className="truncate">{row.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className={noteClass}>{t("swiftmapStyle.popup.noFields")}</span>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** A field's "More": its label, value type, decimals and prefix/suffix. */
function FieldMore({
  config,
  sample,
  onChange,
}: {
  config: PopupFieldConfig;
  /** The first feature's value, to pick Number or Text when a format is set. */
  sample: unknown;
  onChange: (change: Partial<PopupFieldConfig>) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const kind = config.kind ?? "auto";
  const format = config.format ?? {};
  // A format only shows on the map under a set value type (7b review round 3).
  const setFormat = (change: Partial<NonNullable<PopupFieldConfig["format"]>>) =>
    onChange({ kind: kindForFormat(config.kind, sample), format: { ...format, ...change } });
  // Changes are live; Enter in a text box just closes, like Done (7b review round 4).
  const closeOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("swiftmapStyle.popup.fieldMore", { name: config.field })}
        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-4 p-4">
        <span className="truncate text-sm font-semibold">{config.field}</span>
        <Field label={t("swiftmapStyle.popup.fieldLabel")} htmlFor={`${id}-label`}>
          <Input
            id={`${id}-label`}
            className="h-9 text-[13px]"
            placeholder={config.field}
            value={config.label ?? ""}
            onChange={(event) => onChange({ label: event.target.value || undefined })}
            onKeyDown={closeOnEnter}
          />
        </Field>
        <SelectField
          label={t("swiftmapStyle.popup.valueType")}
          value={kind}
          onChange={(value) => onChange({ kind: value as PopupFieldKind })}
          options={KINDS.map((value) => ({
            value,
            label: t(`swiftmapStyle.popup.kinds.${value}`),
          }))}
        />
        {kind === "number" || kind === "auto" ? (
          <StepperField
            label={t("swiftmapStyle.popup.decimals")}
            value={format.decimals ?? 0}
            onChange={(decimals) => setFormat({ decimals })}
            min={0}
            max={6}
          />
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("swiftmapStyle.popup.prefix")} htmlFor={`${id}-prefix`}>
            <Input
              id={`${id}-prefix`}
              className="h-9 text-[13px]"
              value={format.prefix ?? ""}
              onChange={(event) => setFormat({ prefix: event.target.value || undefined })}
              onKeyDown={closeOnEnter}
            />
          </Field>
          <Field label={t("swiftmapStyle.popup.suffix")} htmlFor={`${id}-suffix`}>
            <Input
              id={`${id}-suffix`}
              className="h-9 text-[13px]"
              value={format.suffix ?? ""}
              onChange={(event) => setFormat({ suffix: event.target.value || undefined })}
              onKeyDown={closeOnEnter}
            />
          </Field>
        </div>
        <PopoverDone />
      </PopoverContent>
    </Popover>
  );
}
