import type { GeoLibreLayer, LayerStyle } from "@geolibre/core";
import { Input, Popover, PopoverContent, PopoverTrigger, cn } from "@geolibre/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ColorSwatchField, PopoverDone, StepperField, startSide } from "./fields";
import { layerFields } from "./layer-fields";
import { categoriesStylePatch, newRuleId } from "./style-actions";
import {
  categoriesPatch,
  type CategoriesView,
  type Category,
  type GeometryKind,
} from "./style-model";
import {
  FieldSelect,
  LineStyleBlock,
  RampField,
  TRANSPARENT,
  isNone,
  type Patch,
} from "./SymbolEditors";

// SWIFTMAP (Change 27): the Categories editor, saved as GeoLibre rule-based
// rules (one per value) so each category keeps its own outline.

/**
 * Categories: the field, the colour ramp, then one row per value with its
 * swatch, an editable label and the value. The swatch opens that category's
 * own fill, outline colour and outline width (saved as rule-based rules).
 */
export function CategoriesEditor({
  layer,
  style,
  view,
  geometry,
  patch,
  strokeOptions = true,
}: {
  layer: GeoLibreLayer;
  style: LayerStyle;
  view: CategoriesView;
  geometry: GeometryKind;
  patch: Patch;
  /** Line style and opacity under the list (Change 31); off for control-painted layers. */
  strokeOptions?: boolean;
}) {
  const { t } = useTranslation();
  const fields = layerFields(layer);
  const ramp = style.vectorStyleColorRamp || "viridis";
  const otherLabel = t("swiftmapStyle.other");

  const save = (next: CategoriesView) => patch(categoriesPatch(next, newRuleId, style.vectorRules));
  const rebuild = (field: string, nextRamp: string) =>
    patch(categoriesStylePatch(layer, style, field, nextRamp, otherLabel, style.vectorRules));
  const updateRow = (index: number, change: Partial<Category>) =>
    save({
      ...view,
      categories: view.categories.map((row, i) => (i === index ? { ...row, ...change } : row)),
    });
  const updateOther = (change: Partial<Category>) =>
    view.other && save({ ...view, other: { ...view.other, ...change } });

  return (
    <div className="flex flex-col gap-4">
      <FieldSelect
        label={t("swiftmapStyle.field")}
        value={view.field}
        fields={fields}
        onChange={(field) => rebuild(field, ramp)}
      />
      <RampField value={ramp} onChange={(next) => rebuild(view.field, next)} />
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,0.7fr)] gap-2 text-xs text-muted-foreground">
          <span />
          <span>{t("swiftmapStyle.label")}</span>
          <span>{t("swiftmapStyle.value")}</span>
        </div>
        {view.categories.map((row, index) => (
          <CategoryRow
            key={`${String(row.value)}-${index}`}
            row={row}
            style={style}
            geometry={geometry}
            valueText={String(row.value)}
            onChange={(change) => updateRow(index, change)}
          />
        ))}
        {view.other ? (
          <CategoryRow
            row={view.other}
            style={style}
            geometry={geometry}
            valueText={t("swiftmapStyle.otherValue")}
            onChange={updateOther}
          />
        ) : null}
      </div>
      {strokeOptions ? <LineStyleBlock style={style} geometry={geometry} patch={patch} /> : null}
    </div>
  );
}

function CategoryRow({
  row,
  style,
  geometry,
  valueText,
  onChange,
}: {
  row: Category;
  style: LayerStyle;
  geometry: GeometryKind;
  valueText: string;
  onChange: (change: Partial<Category>) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const outline = row.strokeColor ?? style.strokeColor;
  const width = row.strokeWidth ?? style.strokeWidth;
  const line = geometry === "line";
  const swatchFill = isNone(row.color) ? "transparent" : row.color;
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,0.7fr)] items-center gap-2">
      <Popover>
        <PopoverTrigger
          aria-label={t("swiftmapStyle.categorySymbol", { name: row.label || valueText })}
          className="flex size-7 items-center justify-center rounded-md border border-input outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {line ? (
            <span
              className="block h-[3px] w-[18px] rounded-full"
              style={{ background: swatchFill }}
            />
          ) : (
            <span
              className="block size-[18px] rounded-[3px]"
              style={{
                background: swatchFill,
                boxShadow:
                  width > 0 && !isNone(outline)
                    ? `inset 0 0 0 ${Math.min(2, Math.max(1, width))}px ${outline}`
                    : undefined,
              }}
            />
          )}
        </PopoverTrigger>
        {/* Opens beside its swatch over the map, clear of the rows (7b review round 1):
            the swatch sits 18px inside the panel, so 26px puts the card 8px outside it. */}
        <PopoverContent
          side={startSide()}
          align="start"
          sideOffset={26}
          className="flex w-64 flex-col gap-4 p-4"
        >
          <span className="text-sm font-semibold">{row.label || valueText}</span>
          <ColorSwatchField
            label={t(line ? "swiftmapStyle.colour.line" : "swiftmapStyle.colour.fill")}
            color={row.color}
            onChange={(color) => onChange({ color })}
          />
          {line ? null : (
            <ColorSwatchField
              label={t("swiftmapStyle.colour.outline")}
              color={isNone(outline) ? "#000000" : outline}
              none={isNone(outline)}
              onNoneChange={(none) =>
                onChange({ strokeColor: none ? TRANSPARENT : style.strokeColor })
              }
              onChange={(strokeColor) => onChange({ strokeColor })}
            />
          )}
          <StepperField
            label={t(line ? "swiftmapStyle.lineWidth" : "swiftmapStyle.outlineWidth")}
            value={width}
            onChange={(strokeWidth) => onChange({ strokeWidth })}
            min={0}
            max={line ? 30 : 20}
            step={0.5}
          />
          <PopoverDone />
        </PopoverContent>
      </Popover>
      <Input
        aria-label={t("swiftmapStyle.categoryLabel", { value: valueText })}
        className="h-8 text-[13px]"
        value={draft ?? row.label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== row.label) onChange({ label: draft });
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(null);
        }}
      />
      <span className={cn("truncate font-mono text-xs text-muted-foreground")} title={valueText}>
        {valueText}
      </span>
    </div>
  );
}
