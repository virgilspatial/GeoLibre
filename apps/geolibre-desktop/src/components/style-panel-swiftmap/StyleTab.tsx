import { useAppStore, type FillPattern, type GeoLibreLayer, type LayerStyle } from "@geolibre/core";
import type { MapEngine } from "@geolibre/map";
import { Slider, ZoomRangeInput } from "@geolibre/ui";
import { X } from "lucide-react";
import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { StyleSuggestion } from "../../lib/style-suggestions";
import { isNumericProperty } from "../../lib/vector-style-classification";
import {
  isControlPaintedVectorLayer,
  supportsExtrusionControls,
} from "../panels/style-panel/layer-capabilities";
import { isBelowLabels, setBelowLabels } from "./below-labels";
import {
  ColorSwatchField,
  FieldPair,
  MoreSection,
  Segmented,
  SelectField,
  StepperField,
  SwitchRow,
  fieldLabelClass,
} from "./fields";
import {
  categoriesStylePatch,
  defaultCategoryField,
  defaultGraduatedField,
  DEFAULT_CLASS_COUNT,
  DEFAULT_GRADUATED_SCHEME,
  graduatedStylePatch,
  singleStylePatch,
} from "./style-actions";
import { layerFields, numericFields } from "./layer-fields";
import { lineBlurOf } from "./line-style";
import {
  ARROW_NEUTRAL,
  categoriesOf,
  directionArrowsPatch,
  type GeometryKind,
  type ShowAs,
} from "./style-model";
import { CategoriesEditor } from "./CategoriesEditor";
import {
  CustomStyleNote,
  GraduatedEditor,
  SingleSymbolEditor,
} from "./SymbolEditors";

// SWIFTMAP (Change 27): the Style tab for vector layers.

type Patch = (patch: Partial<LayerStyle>) => void;
type Choice = "single" | "categories" | "graduated";

const FILL_PATTERNS = [
  "none",
  "hatch",
  "cross-hatch",
  "horizontal",
  "vertical",
  "dots",
] as const satisfies readonly FillPattern[];

export function StyleTab({
  layer,
  style,
  geometry,
  showAs,
  suggestions,
  engineRef,
  patch,
}: {
  layer: GeoLibreLayer;
  style: LayerStyle;
  geometry: GeometryKind;
  showAs: ShowAs;
  suggestions: readonly StyleSuggestion[];
  engineRef: RefObject<MapEngine | null>;
  patch: Patch;
}) {
  const { t } = useTranslation();
  const otherLabel = t("swiftmapStyle.other");
  const ramp = style.vectorStyleColorRamp || "viridis";
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  const choose = (choice: Choice, field?: string) => {
    if (choice === "single") patch(singleStylePatch());
    else if (choice === "categories")
      patch(
        categoriesStylePatch(
          layer,
          style,
          defaultCategoryField(layer, layerFields(layer), field),
          ramp,
          otherLabel,
          style.vectorRules,
        ),
      );
    else
      patch(
        graduatedStylePatch(
          layer,
          defaultGraduatedField(layer, numericFields(layer), field),
          style.vectorStyleClassCount || DEFAULT_CLASS_COUNT,
          ramp,
          DEFAULT_GRADUATED_SCHEME,
        ),
      );
  };

  const chips = suggestions.filter(
    (s): s is StyleSuggestion & { kind: "categorized" | "graduated"; property: string } =>
      // "Categories by" only for text fields (7b review round 1).
      ((s.kind === "categorized" && Boolean(s.property) && !isNumericProperty(layer, s.property!)) ||
        (s.kind === "graduated" && Boolean(s.property))) &&
      !dismissed.has(`${s.kind}:${s.property}`),
  );
  const categories = showAs === "categories" ? categoriesOf(style) : null;
  const extrusionAvailable = geometry !== "line" && geometry !== "point" && supportsExtrusionControls(layer);
  // A map control that paints its own layers takes no line opacity, dash or blur.
  const strokeOptions = !isControlPaintedVectorLayer(layer);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className={fieldLabelClass}>{t("swiftmapStyle.showAsLabel")}</span>
        <Segmented<Choice>
          label={t("swiftmapStyle.showAsLabel")}
          value={showAs as Choice}
          onChange={(choice) => choose(choice)}
          options={[
            { value: "single", label: t("swiftmapStyle.showAs.single") },
            { value: "categories", label: t("swiftmapStyle.showAs.categories") },
            { value: "graduated", label: t("swiftmapStyle.showAs.graduated") },
          ]}
        />
        {chips.length > 0 && showAs === "single" ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const key = `${chip.kind}:${chip.property}`;
              const text = t(
                chip.kind === "categorized"
                  ? "swiftmapStyle.suggestCategories"
                  : "swiftmapStyle.suggestGraduated",
                { field: chip.property },
              );
              return (
                <span
                  key={key}
                  className="inline-flex max-w-full items-center rounded-full border bg-background text-xs"
                >
                  <button
                    type="button"
                    className="truncate rounded-s-full py-1 ps-2.5 pe-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      choose(chip.kind === "categorized" ? "categories" : "graduated", chip.property)
                    }
                  >
                    {text}
                  </button>
                  <button
                    type="button"
                    aria-label={t("swiftmapStyle.dismissSuggestion", { name: text })}
                    className="rounded-e-full py-1 ps-1 pe-2 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setDismissed((current) => new Set(current).add(key))}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      {showAs === "single" ? (
        <SingleSymbolEditor
          style={style}
          geometry={geometry}
          patch={patch}
          strokeOptions={strokeOptions}
        />
      ) : showAs === "categories" && categories ? (
        <CategoriesEditor
          layer={layer}
          style={style}
          view={categories}
          geometry={geometry}
          patch={patch}
          strokeOptions={strokeOptions}
        />
      ) : showAs === "graduated" ? (
        <GraduatedEditor
          layer={layer}
          style={style}
          geometry={geometry}
          patch={patch}
          strokeOptions={strokeOptions}
        />
      ) : (
        <CustomStyleNote kind={showAs === "heatmap" || showAs === "clusters" ? showAs : "custom"} />
      )}

      <OpacityField layer={layer} />
      <VisibleRange style={style} patch={patch} />

      {extrusionAvailable ? <ExtrusionSection layer={layer} style={style} patch={patch} /> : null}

      <MoreSection label={t("swiftmapStyle.moreOptions")}>
        {geometry === "polygon" || geometry === "mixed" ? (
          <FieldPair>
            <SelectField
              label={t("swiftmapStyle.fillPattern")}
              value={style.fillPattern === "svg" ? "none" : style.fillPattern}
              onChange={(value) => patch({ fillPattern: value as FillPattern })}
              options={FILL_PATTERNS.map((value) => ({
                value,
                label: t(`swiftmapStyle.patterns.${value}`),
              }))}
            />
            {style.fillPattern !== "none" && style.fillPattern !== "svg" ? (
              <ColorSwatchField
                label={t("swiftmapStyle.patternColour")}
                color={style.fillPatternColor}
                onChange={(fillPatternColor) => patch({ fillPatternColor })}
              />
            ) : null}
          </FieldPair>
        ) : null}
        {strokeOptions && geometry !== "point" ? (
          <StepperField
            label={t(geometry === "line" ? "swiftmapStyle.lineBlur" : "swiftmapStyle.outlineBlur")}
            value={lineBlurOf(style)}
            onChange={(strokeBlur) => patch({ strokeBlur })}
            min={0}
            max={20}
            step={0.5}
          />
        ) : null}
        {geometry === "line" ? <DirectionArrows style={style} patch={patch} /> : null}
        <SwitchRow
          label={t("swiftmapStyle.belowLabels")}
          note={t("swiftmapStyle.belowLabelsNote")}
          checked={isBelowLabels(layer)}
          onCheckedChange={(on) => setBelowLabels(layer, on, engineRef.current)}
        />
        {(geometry === "polygon" || geometry === "mixed") && layer.type === "geojson" ? (
          <SwitchRow
            label={t("swiftmapStyle.dimOutside")}
            note={t("swiftmapStyle.dimOutsideNote")}
            checked={style.invertedFillEnabled}
            onCheckedChange={(invertedFillEnabled) => patch({ invertedFillEnabled })}
          />
        ) : null}
      </MoreSection>
    </div>
  );
}

/** Opacity, the same value as the layer row's Opacity card. */
export function OpacityField({ layer }: { layer: GeoLibreLayer }) {
  const { t } = useTranslation();
  const setLayerOpacity = useAppStore((s) => s.setLayerOpacity);
  const percent = Math.round(layer.opacity * 100);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className={fieldLabelClass}>{t("swiftmapStyle.opacity")}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{percent}%</span>
      </div>
      <Slider
        aria-label={t("swiftmapStyle.opacityFor", { name: layer.name })}
        min={0}
        max={100}
        step={5}
        value={[percent]}
        onValueChange={([value]: number[]) => setLayerOpacity(layer.id, (value ?? percent) / 100)}
      />
    </div>
  );
}

/** Visible range: the zoom levels the layer draws at. */
export function VisibleRange({ style, patch }: { style: LayerStyle; patch: Patch }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <span className={fieldLabelClass}>{t("swiftmapStyle.visibleRange")}</span>
      <ZoomRangeInput
        value={{ minZoom: style.minZoom, maxZoom: style.maxZoom }}
        onChange={({ minZoom, maxZoom }) => patch({ minZoom, maxZoom })}
        labels={{
          minZoom: t("swiftmapStyle.minZoom"),
          minZoomHint: t("swiftmapStyle.minZoomHint"),
          increaseMinZoom: t("swiftmapStyle.increase", { name: t("swiftmapStyle.minZoom") }),
          decreaseMinZoom: t("swiftmapStyle.decrease", { name: t("swiftmapStyle.minZoom") }),
          maxZoom: t("swiftmapStyle.maxZoom"),
          maxZoomHint: t("swiftmapStyle.maxZoomHint"),
          increaseMaxZoom: t("swiftmapStyle.increase", { name: t("swiftmapStyle.maxZoom") }),
          decreaseMaxZoom: t("swiftmapStyle.decrease", { name: t("swiftmapStyle.maxZoom") }),
        }}
      />
    </div>
  );
}

/** The height field 3D starts with: the current one if the data has it, else a height-like number field. */
function heightFieldFor(fields: readonly string[], current: string): string {
  if (fields.includes(current)) return current;
  return fields.find((field) => /height|storey|stories|level|elev/i.test(field)) ?? fields[0] ?? "";
}

function ExtrusionSection({
  layer,
  style,
  patch,
}: {
  layer: GeoLibreLayer;
  style: LayerStyle;
  patch: Patch;
}) {
  const { t } = useTranslation();
  const fields = numericFields(layer);
  const on = style.extrusionEnabled;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className={fieldLabelClass}>{t("swiftmapStyle.view")}</span>
        <Segmented<"2d" | "3d">
          label={t("swiftmapStyle.view")}
          value={on ? "3d" : "2d"}
          onChange={(value) =>
            patch(
              value === "3d"
                ? {
                    extrusionEnabled: true,
                    elevation3dEnabled: false,
                    extrusionAdvancedStyleEnabled: false,
                    extrusionHeightProperty: heightFieldFor(fields, style.extrusionHeightProperty),
                  }
                : { extrusionEnabled: false },
            )
          }
          options={[
            { value: "2d", label: t("swiftmapStyle.view2d") },
            { value: "3d", label: t("swiftmapStyle.view3d") },
          ]}
        />
      </div>
      {on ? (
        <>
          <SelectField
            label={t("swiftmapStyle.heightField")}
            value={style.extrusionHeightProperty}
            onChange={(extrusionHeightProperty) => patch({ extrusionHeightProperty })}
            options={[
              { value: "", label: t("swiftmapStyle.noHeightField") },
              ...(style.extrusionHeightProperty && !fields.includes(style.extrusionHeightProperty)
                ? [style.extrusionHeightProperty]
                : []
              ).concat(fields).map((field) => ({ value: field, label: field })),
            ]}
          />
          <FieldPair>
            <StepperField
              label={t("swiftmapStyle.heightScale")}
              value={style.extrusionHeightScale}
              onChange={(extrusionHeightScale) => patch({ extrusionHeightScale })}
              min={0}
              max={1000}
              step={0.5}
            />
            <StepperField
              label={t("swiftmapStyle.baseHeight")}
              value={style.extrusionBase}
              onChange={(extrusionBase) => patch({ extrusionBase })}
              min={0}
              max={10000}
              step={1}
            />
          </FieldPair>
          <ColorSwatchField
            label={t("swiftmapStyle.extrusionColour")}
            color={style.extrusionColor}
            onChange={(extrusionColor) => patch({ extrusionColor })}
            alpha={style.extrusionOpacity}
            onAlphaChange={(extrusionOpacity) => patch({ extrusionOpacity })}
          />
        </>
      ) : null}
    </div>
  );
}

function DirectionArrows({ style, patch }: { style: LayerStyle; patch: Patch }) {
  const { t } = useTranslation();
  const on = style.lineDecoration !== "none";
  const multiColour = style.vectorStyleMode !== "single";
  return (
    <div className="flex flex-col gap-4">
      <SwitchRow
        label={t("swiftmapStyle.arrows")}
        note={t(multiColour ? "swiftmapStyle.arrowsNoteMulti" : "swiftmapStyle.arrowsNote")}
        checked={on}
        onCheckedChange={(checked) => patch(directionArrowsPatch(style, checked))}
      />
      {on ? (
        <>
          <FieldPair>
            <StepperField
              label={t("swiftmapStyle.arrowSize")}
              value={style.lineDecorationSize}
              onChange={(lineDecorationSize) => patch({ lineDecorationSize })}
              min={4}
              max={40}
            />
            <StepperField
              label={t("swiftmapStyle.arrowSpacing")}
              value={style.lineDecorationSpacing}
              onChange={(lineDecorationSpacing) => patch({ lineDecorationSpacing })}
              min={10}
              max={500}
              step={10}
            />
          </FieldPair>
          {multiColour ? (
            <ColorSwatchField
              label={t("swiftmapStyle.arrowColour")}
              color={style.lineDecorationColor || ARROW_NEUTRAL}
              onChange={(lineDecorationColor) => patch({ lineDecorationColor })}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
