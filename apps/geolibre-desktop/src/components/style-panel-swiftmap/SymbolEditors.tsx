import { VECTOR_COLOR_RAMPS, type GeoLibreLayer, type LayerStyle, type MarkerShape } from "@geolibre/core";
import { ColorRampSelect, Input } from "@geolibre/ui";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ColorSwatchField,
  Field,
  FieldPair,
  SelectField,
  StepperField,
  fieldLabelClass,
  noteClass,
} from "./fields";
import { DEFAULT_CLASS_COUNT, GRADUATED_SCHEMES, graduatedStylePatch } from "./style-actions";
import { numericFields } from "./layer-fields";
import {
  lineStyleChoices,
  lineStyleOf,
  lineStylePatch,
  strokeOpacityPercent,
  strokeOpacityPatch,
  type LineStyleChoice,
} from "./line-style";
import { classRanges, formatBreak, type GeometryKind } from "./style-model";

// SWIFTMAP (Change 27): the Style tab's symbol editors for each "Show as".
// Every change writes straight to GeoLibre's layer style (no Apply); the
// store's undo history merges quick bursts.

export const TRANSPARENT = "transparent";
export const isNone = (color: string) => color.trim().toLowerCase() === TRANSPARENT;

export type Patch = (patch: Partial<LayerStyle>) => void;

const MARKER_SHAPES = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "star",
  "cross",
  "pin",
] as const satisfies readonly MarkerShape[];

/** Remembers a colour switched to None so switching back restores it. */
function useLastColor(color: string, fallback: string) {
  const [last, setLast] = useState(isNone(color) ? fallback : color);
  return {
    last: isNone(color) ? last : color,
    remember: (value: string) => {
      if (!isNone(value)) setLast(value);
    },
  };
}

/**
 * Line style (Change 31): a dash preset, plus "Custom" while the layer has a
 * pattern set elsewhere. Layer-wide in the engine, like stroke opacity and blur.
 */
export function LineStyleField({
  label,
  style,
  patch,
}: {
  label: string;
  style: LayerStyle;
  patch: Patch;
}) {
  const { t } = useTranslation();
  return (
    <SelectField
      label={label}
      value={lineStyleOf(style)}
      onChange={(value) => patch(lineStylePatch(value as LineStyleChoice))}
      options={lineStyleChoices(style).map((value) => ({
        value,
        label: t(`swiftmapStyle.lineStyles.${value}`),
      }))}
    />
  );
}

/**
 * Categories and Graduated colour each class, but line style and opacity are
 * layer-wide, so they sit once under the class list. Points take opacity only.
 */
export function LineStyleBlock({
  style,
  geometry,
  patch,
}: {
  style: LayerStyle;
  geometry: GeometryKind;
  patch: Patch;
}) {
  const { t } = useTranslation();
  const line = geometry === "line";
  const opacity = (
    <StepperField
      label={t(line ? "swiftmapStyle.lineOpacity" : "swiftmapStyle.outlineOpacity")}
      value={strokeOpacityPercent(style)}
      onChange={(percent) => patch(strokeOpacityPatch(percent))}
      min={0}
      max={100}
      step={5}
    />
  );
  if (geometry === "point") return opacity;
  return (
    <FieldPair>
      <LineStyleField
        label={t(line ? "swiftmapStyle.lineStyle" : "swiftmapStyle.outlineStyle")}
        style={style}
        patch={patch}
      />
      {opacity}
    </FieldPair>
  );
}

export function SingleSymbolEditor({
  style,
  geometry,
  patch,
  strokeOptions = true,
}: {
  style: LayerStyle;
  geometry: GeometryKind;
  patch: Patch;
  /** Line opacity and style (Change 31); off for layers a map control paints. */
  strokeOptions?: boolean;
}) {
  const { t } = useTranslation();
  const fill = useLastColor(style.fillColor, "#3b82f6");
  const stroke = useLastColor(style.strokeColor, "#1e3a8a");
  // Stroke opacity is the colour picker's opacity, as fill opacity is.
  const strokeAlpha = strokeOptions
    ? {
        alpha: strokeOpacityPercent(style) / 100,
        onAlphaChange: (alpha: number) => patch(strokeOpacityPatch(Math.round(alpha * 100))),
      }
    : {};
  // Width on the start side, the line style beside it (points have none).
  const withLineStyle = (width: ReactNode, label: string) =>
    strokeOptions && geometry !== "point" ? (
      <FieldPair>
        {width}
        <LineStyleField label={label} style={style} patch={patch} />
      </FieldPair>
    ) : (
      width
    );

  if (geometry === "line") {
    return (
      <div className="flex flex-col gap-4">
        <ColorSwatchField
          label={t("swiftmapStyle.colour.line")}
          color={stroke.last}
          onChange={(strokeColor) => patch({ strokeColor })}
          {...strokeAlpha}
        />
        {withLineStyle(
          <StepperField
            label={t("swiftmapStyle.lineWidth")}
            value={style.strokeWidth}
            onChange={(strokeWidth) => patch({ strokeWidth })}
            min={0}
            max={30}
            step={0.5}
          />,
          t("swiftmapStyle.lineStyle"),
        )}
      </div>
    );
  }

  const fillField = (
    <ColorSwatchField
      label={t(geometry === "point" ? "swiftmapStyle.colour.point" : "swiftmapStyle.colour.fill")}
      color={fill.last}
      none={isNone(style.fillColor)}
      onNoneChange={(none) => {
        fill.remember(style.fillColor);
        patch(none ? { fillColor: TRANSPARENT } : { fillColor: fill.last });
      }}
      onChange={(fillColor) =>
        patch(style.markerEnabled ? { fillColor, markerColor: fillColor } : { fillColor })
      }
      alpha={style.fillOpacity}
      onAlphaChange={(fillOpacity) => patch({ fillOpacity })}
    />
  );
  const outlineFields = (
    <>
      <ColorSwatchField
        label={t("swiftmapStyle.colour.outline")}
        color={stroke.last}
        none={isNone(style.strokeColor)}
        onNoneChange={(none) => {
          stroke.remember(style.strokeColor);
          patch(none ? { strokeColor: TRANSPARENT } : { strokeColor: stroke.last });
        }}
        onChange={(strokeColor) => patch({ strokeColor })}
        {...strokeAlpha}
      />
      {withLineStyle(
        <StepperField
          label={t("swiftmapStyle.outlineWidth")}
          value={style.strokeWidth}
          onChange={(strokeWidth) => patch({ strokeWidth })}
          min={0}
          max={20}
          step={0.5}
        />,
        t("swiftmapStyle.outlineStyle"),
      )}
    </>
  );

  if (geometry === "point") {
    const shape: MarkerShape = style.markerEnabled ? style.markerShape : "circle";
    return (
      <div className="flex flex-col gap-4">
        {fillField}
        <FieldPair>
          <StepperField
            label={t("swiftmapStyle.pointSize")}
            value={style.circleRadius}
            onChange={(circleRadius) =>
              patch(
                style.markerEnabled
                  ? { circleRadius, markerSize: circleRadius * 2 }
                  : { circleRadius },
              )
            }
            min={1}
            max={40}
          />
          <SelectField
            label={t("swiftmapStyle.markerShape")}
            value={shape}
            onChange={(value) =>
              patch(
                value === "circle"
                  ? { markerEnabled: false, markerShape: "circle" }
                  : {
                      markerEnabled: true,
                      markerShape: value as MarkerShape,
                      markerColor: style.fillColor,
                      markerSize: style.circleRadius * 2,
                    },
              )
            }
            options={MARKER_SHAPES.map((value) => ({
              value,
              label: t(`swiftmapStyle.shapes.${value}`),
            }))}
          />
        </FieldPair>
        {outlineFields}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {fillField}
      {outlineFields}
    </div>
  );
}

export function FieldSelect({
  label,
  value,
  fields,
  onChange,
}: {
  label: string;
  value: string;
  fields: readonly string[];
  onChange: (field: string) => void;
}) {
  const { t } = useTranslation();
  const options = fields.includes(value) || !value ? fields : [value, ...fields];
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={
        options.length > 0
          ? options.map((field) => ({ value: field, label: field }))
          : [{ value: "", label: t("swiftmapStyle.noFields") }]
      }
    />
  );
}

export function RampField({ value, onChange }: { value: string; onChange: (ramp: string) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Field label={t("swiftmapStyle.colourRamp")} htmlFor={id}>
      <ColorRampSelect id={id} value={value} onValueChange={onChange} ramps={VECTOR_COLOR_RAMPS} />
    </Field>
  );
}

/** Graduated: field, method, classes, ramp, then the class rows. */
export function GraduatedEditor({
  layer,
  style,
  geometry,
  patch,
  strokeOptions = true,
}: {
  layer: GeoLibreLayer;
  style: LayerStyle;
  geometry: GeometryKind;
  patch: Patch;
  strokeOptions?: boolean;
}) {
  const { t } = useTranslation();
  const fields = numericFields(layer);
  const field = style.vectorStyleProperty;
  const scheme = (GRADUATED_SCHEMES as readonly string[]).includes(
    style.vectorStyleClassificationScheme,
  )
    ? style.vectorStyleClassificationScheme
    : style.vectorStyleClassificationScheme
      ? "manual"
      : "natural-breaks";
  const classCount = style.vectorStyleClassCount || DEFAULT_CLASS_COUNT;
  const ramp = style.vectorStyleColorRamp || "viridis";
  const rebuild = (change: { field?: string; count?: number; ramp?: string; scheme?: string }) =>
    patch(
      graduatedStylePatch(
        layer,
        change.field ?? field,
        change.count ?? classCount,
        change.ramp ?? ramp,
        change.scheme ?? (scheme === "manual" ? "natural-breaks" : scheme),
      ),
    );
  const ranges = classRanges(style.vectorStyleStops);
  const manual = scheme === "manual";

  const setStop = (index: number, change: { color?: string; value?: number }) =>
    patch({
      vectorStyleStops: style.vectorStyleStops.map((stop, i) =>
        i === index ? { ...stop, ...change } : stop,
      ),
      ...(change.value !== undefined ? { vectorStyleClassificationScheme: "manual" } : {}),
    });

  return (
    <div className="flex flex-col gap-4">
      <FieldSelect
        label={t("swiftmapStyle.field")}
        value={field}
        fields={fields}
        onChange={(next) => rebuild({ field: next })}
      />
      <FieldPair>
        <SelectField
          label={t("swiftmapStyle.method")}
          value={scheme}
          onChange={(next) =>
            next === "manual"
              ? patch({ vectorStyleClassificationScheme: "manual" })
              : rebuild({ scheme: next })
          }
          options={GRADUATED_SCHEMES.map((value) => ({
            value,
            label: t(`swiftmapStyle.methods.${value}`),
          }))}
        />
        <StepperField
          label={t("swiftmapStyle.classes")}
          value={classCount}
          onChange={(count) => rebuild({ count })}
          min={2}
          max={12}
        />
      </FieldPair>
      <RampField value={ramp} onChange={(next) => rebuild({ ramp: next })} />
      <div className="flex flex-col gap-1">
        {style.vectorStyleStops.map((stop, index) => {
          const range = ranges[index];
          return (
            <div
              key={index}
              className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2 text-[13px]"
            >
              <ColorSwatchField
                compact
                label={t("swiftmapStyle.classColour", { index: index + 1 })}
                color={stop.color}
                onChange={(color) => setStop(index, { color })}
              />
              {manual ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    aria-label={t("swiftmapStyle.classBreak", { index: index + 1 })}
                    className="h-8 w-24 text-[13px] tabular-nums"
                    defaultValue={Number(stop.value)}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value !== Number(stop.value)) {
                        setStop(index, { value });
                      }
                    }}
                  />
                  <span className={noteClass}>
                    {range?.to === null || range?.to === undefined
                      ? t("swiftmapStyle.andAbove")
                      : t("swiftmapStyle.upTo", { value: formatBreak(range.to) })}
                  </span>
                </div>
              ) : (
                <span className="tabular-nums">
                  {range && range.to !== null
                    ? `${formatBreak(range.from)} – ${formatBreak(range.to)}`
                    : t("swiftmapStyle.orMore", { value: formatBreak(range?.from ?? Number.NaN) })}
                </span>
              )}
            </div>
          );
        })}
        {style.vectorStyleStops.length === 0 ? (
          <span className={noteClass}>{t("swiftmapStyle.noClasses")}</span>
        ) : null}
      </div>
      {strokeOptions ? <LineStyleBlock style={style} geometry={geometry} patch={patch} /> : null}
    </div>
  );
}

/** The note for styles the panel can't edit (Custom rules, Heatmap, Clusters). */
export function CustomStyleNote({ kind }: { kind: "custom" | "heatmap" | "clusters" }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed px-3 py-2.5">
      <span className={fieldLabelClass}>{t(`swiftmapStyle.showAs.${kind}`)}</span>
      <span className={noteClass}>{t("swiftmapStyle.customNote")}</span>
    </div>
  );
}
