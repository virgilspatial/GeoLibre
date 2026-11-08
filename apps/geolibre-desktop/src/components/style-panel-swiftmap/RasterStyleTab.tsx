import { DEFAULT_LAYER_STYLE, type GeoLibreLayer, type LayerStyle } from "@geolibre/core";
import type { MapEngine } from "@geolibre/map";
import { Slider } from "@geolibre/ui";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { isBelowLabels, setBelowLabels } from "./below-labels";
import { MoreSection, SwitchRow, fieldLabelClass } from "./fields";
import { isGreyscale } from "./style-model";
import { OpacityField, VisibleRange } from "./StyleTab";

// SWIFTMAP (Change 27): the Style tab for imagery: Opacity, Visible range and
// Greyscale (GeoLibre's saturation −1); brightness, contrast, saturation and
// "Draw below basemap labels" under More options.

type Patch = (patch: Partial<LayerStyle>) => void;

function RasterSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className={fieldLabelClass}>{label}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {Math.round(value * 100)}
        </span>
      </div>
      <Slider
        aria-label={label}
        min={min * 100}
        max={max * 100}
        step={5}
        value={[Math.round(value * 100)]}
        onValueChange={([next]: number[]) => onChange((next ?? 0) / 100)}
      />
    </div>
  );
}

export function RasterStyleTab({
  layer,
  style,
  engineRef,
  patch,
}: {
  layer: GeoLibreLayer;
  style: LayerStyle;
  engineRef: RefObject<MapEngine | null>;
  patch: Patch;
}) {
  const { t } = useTranslation();
  const greyscale = isGreyscale(style);
  return (
    <div className="flex flex-col gap-5">
      <OpacityField layer={layer} />
      <VisibleRange style={style} patch={patch} />
      <SwitchRow
        label={t("swiftmapStyle.raster.greyscale")}
        note={t("swiftmapStyle.raster.greyscaleNote")}
        checked={greyscale}
        onCheckedChange={(on) =>
          patch({ rasterSaturation: on ? -1 : DEFAULT_LAYER_STYLE.rasterSaturation })
        }
      />
      <MoreSection label={t("swiftmapStyle.moreOptions")}>
        {/* Brightness is GeoLibre's brightness range shifted as one: darker or lighter. */}
        <RasterSlider
          label={t("swiftmapStyle.raster.brightness")}
          value={
            style.rasterBrightnessMin > 0
              ? style.rasterBrightnessMin
              : style.rasterBrightnessMax - 1
          }
          min={-1}
          max={1}
          onChange={(value) =>
            patch(
              value >= 0
                ? { rasterBrightnessMin: value, rasterBrightnessMax: 1 }
                : { rasterBrightnessMin: 0, rasterBrightnessMax: 1 + value },
            )
          }
        />
        <RasterSlider
          label={t("swiftmapStyle.raster.contrast")}
          value={style.rasterContrast}
          min={-1}
          max={1}
          onChange={(rasterContrast) => patch({ rasterContrast })}
        />
        {greyscale ? null : (
          <RasterSlider
            label={t("swiftmapStyle.raster.saturation")}
            value={style.rasterSaturation}
            min={-1}
            max={1}
            onChange={(rasterSaturation) => patch({ rasterSaturation })}
          />
        )}
        <SwitchRow
          label={t("swiftmapStyle.belowLabels")}
          note={t("swiftmapStyle.belowLabelsNote")}
          checked={isBelowLabels(layer)}
          onCheckedChange={(on) => setBelowLabels(layer, on, engineRef.current)}
        />
      </MoreSection>
    </div>
  );
}
