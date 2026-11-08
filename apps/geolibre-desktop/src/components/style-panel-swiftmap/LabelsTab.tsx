import {
  DEFAULT_LAYER_STYLE,
  type GeoLibreLayer,
  type LabelAnchor,
  type LabelDedupe,
  type LabelStyle,
  type LabelTransform,
  type LayerStyle,
} from "@geolibre/core";
import { useTranslation } from "react-i18next";
import {
  ColorSwatchField,
  FieldPair,
  MoreSection,
  SelectField,
  StepperField,
  SwitchRow,
} from "./fields";
import { layerFields } from "./layer-fields";
import type { GeometryKind } from "./style-model";

// SWIFTMAP (Change 27): the Labels tab. Writes GeoLibre's `style.labels`; the
// expression and data-defined overrides are left unused.

const ANCHORS: readonly LabelAnchor[] = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
const TRANSFORMS: readonly LabelTransform[] = ["none", "uppercase", "lowercase"];
const DEDUPES: readonly LabelDedupe[] = ["off", "unique", "concatenate"];
/** The field labels start with: the first text field (a name or lot), else the first field. */
function defaultLabelField(layer: GeoLibreLayer, fields: readonly string[]): string {
  const sample = layer.geojson?.features[0]?.properties ?? {};
  return fields.find((field) => typeof sample[field] === "string") ?? fields[0] ?? "";
}

/** The halo's width when it's switched back on with none set. */
const DEFAULT_HALO_WIDTH = 1.5;

export function LabelsTab({
  layer,
  style,
  geometry,
  patch,
}: {
  layer: GeoLibreLayer;
  style: LayerStyle;
  geometry: GeometryKind;
  patch: (patch: Partial<LayerStyle>) => void;
}) {
  const { t } = useTranslation();
  const labels: LabelStyle = { ...DEFAULT_LAYER_STYLE.labels, ...style.labels };
  const update = (change: Partial<LabelStyle>) => patch({ labels: { ...labels, ...change } });
  const fields = layerFields(layer);
  const halo = labels.haloWidth > 0;

  return (
    <div className="flex flex-col gap-5">
      <SwitchRow
        label={t("swiftmapStyle.labels.show")}
        note={t("swiftmapStyle.labels.showNote")}
        checked={labels.enabled}
        onCheckedChange={(enabled) =>
          update(enabled && !labels.field ? { enabled, field: defaultLabelField(layer, fields) } : { enabled })
        }
      />
      {labels.enabled ? (
        <>
          <SelectField
            label={t("swiftmapStyle.labels.field")}
            value={labels.field}
            onChange={(field) => update({ field })}
            options={
              fields.length > 0
                ? fields.map((field) => ({ value: field, label: field }))
                : [{ value: "", label: t("swiftmapStyle.noFields") }]
            }
          />
          <FieldPair>
            <StepperField
              label={t("swiftmapStyle.labels.size")}
              value={labels.size}
              onChange={(size) => update({ size })}
              min={6}
              max={48}
            />
            <StepperField
              label={t("swiftmapStyle.labels.showFrom")}
              value={labels.minZoom}
              onChange={(minZoom) => update({ minZoom })}
              min={0}
              max={24}
            />
          </FieldPair>
          <ColorSwatchField
            label={t("swiftmapStyle.labels.colour")}
            color={labels.color}
            onChange={(color) => update({ color })}
          />
          <SwitchRow
            label={t("swiftmapStyle.labels.halo")}
            note={t("swiftmapStyle.labels.haloNote")}
            checked={halo}
            onCheckedChange={(on) => update({ haloWidth: on ? DEFAULT_HALO_WIDTH : 0 })}
          />
          {halo ? (
            <ColorSwatchField
              label={t("swiftmapStyle.labels.haloColour")}
              color={labels.haloColor}
              onChange={(haloColor) => update({ haloColor })}
            />
          ) : null}
          <MoreSection label={t("swiftmapStyle.labels.more")}>
            <FieldPair>
              <SelectField
                label={t("swiftmapStyle.labels.placement")}
                value={labels.placement}
                onChange={(placement) => update({ placement: placement as LabelStyle["placement"] })}
                options={[
                  { value: "point", label: t("swiftmapStyle.labels.placementPoint") },
                  {
                    value: "line",
                    label: t(
                      geometry === "polygon"
                        ? "swiftmapStyle.labels.placementEdge"
                        : "swiftmapStyle.labels.placementLine",
                    ),
                  },
                ]}
              />
              <SelectField
                label={t("swiftmapStyle.labels.anchor")}
                value={labels.anchor}
                onChange={(anchor) => update({ anchor: anchor as LabelAnchor })}
                options={ANCHORS.map((value) => ({
                  value,
                  label: t(`swiftmapStyle.labels.anchors.${value}`),
                }))}
              />
            </FieldPair>
            <FieldPair>
              <StepperField
                label={t("swiftmapStyle.labels.offsetX")}
                value={labels.offsetX}
                onChange={(offsetX) => update({ offsetX })}
                min={-10}
                max={10}
                step={0.5}
              />
              <StepperField
                label={t("swiftmapStyle.labels.offsetY")}
                value={labels.offsetY}
                onChange={(offsetY) => update({ offsetY })}
                min={-10}
                max={10}
                step={0.5}
              />
            </FieldPair>
            <FieldPair>
              <StepperField
                label={t("swiftmapStyle.labels.rotation")}
                value={labels.rotation}
                onChange={(rotation) => update({ rotation })}
                min={-180}
                max={180}
                step={5}
              />
              <StepperField
                label={t("swiftmapStyle.labels.wrapWidth")}
                value={labels.maxWidth}
                onChange={(maxWidth) => update({ maxWidth })}
                min={1}
                max={50}
              />
            </FieldPair>
            <FieldPair>
              <SelectField
                label={t("swiftmapStyle.labels.case")}
                value={labels.transform}
                onChange={(transform) => update({ transform: transform as LabelTransform })}
                options={TRANSFORMS.map((value) => ({
                  value,
                  label: t(`swiftmapStyle.labels.cases.${value}`),
                }))}
              />
              <SelectField
                label={t("swiftmapStyle.labels.duplicates")}
                value={labels.dedupe}
                onChange={(dedupe) => update({ dedupe: dedupe as LabelDedupe })}
                options={DEDUPES.map((value) => ({
                  value,
                  label: t(`swiftmapStyle.labels.dedupe.${value}`),
                }))}
              />
            </FieldPair>
            <SwitchRow
              label={t("swiftmapStyle.labels.numberFormat")}
              note={t("swiftmapStyle.labels.numberFormatNote")}
              checked={labels.numberFormatEnabled}
              onCheckedChange={(numberFormatEnabled) => update({ numberFormatEnabled })}
            />
            {labels.numberFormatEnabled ? (
              <StepperField
                label={t("swiftmapStyle.labels.decimals")}
                value={labels.numberDecimals}
                onChange={(numberDecimals) => update({ numberDecimals })}
                min={0}
                max={6}
              />
            ) : null}
            <SwitchRow
              label={t("swiftmapStyle.labels.overlap")}
              note={t("swiftmapStyle.labels.overlapNote")}
              checked={labels.allowOverlap}
              onCheckedChange={(allowOverlap) => update({ allowOverlap })}
            />
            <FieldPair>
              {halo ? (
                <StepperField
                  label={t("swiftmapStyle.labels.haloWidth")}
                  value={labels.haloWidth}
                  onChange={(haloWidth) => update({ haloWidth })}
                  min={0.5}
                  max={6}
                  step={0.5}
                />
              ) : null}
              <StepperField
                label={t("swiftmapStyle.labels.maxZoom")}
                value={labels.maxZoom}
                onChange={(maxZoom) => update({ maxZoom })}
                min={0}
                max={24}
              />
            </FieldPair>
          </MoreSection>
        </>
      ) : null}
    </div>
  );
}
