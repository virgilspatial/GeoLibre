import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GeoLibreLayer } from "@geolibre/core";
import { Slider } from "@geolibre/ui";
import { readRasterInfo, type RasterInfo } from "../../../lib/raster-info";
import { rasterInfoUrl } from "./layer-panel-utils";
import { layerPropertyRows } from "./layer-properties";

const cardClass = "mx-2 mb-2 rounded-lg border bg-background";

/**
 * SWIFTMAP: the opacity card of the selected layer or a group (Change 17):
 * 0–100% in 5% steps, live on the map. A layer's is the same value as the
 * Style panel's opacity slider.
 */
export function LayerOpacityCard({
  name,
  opacity,
  onChange,
}: {
  name: string;
  opacity: number;
  onChange: (opacity: number) => void;
}) {
  const { t } = useTranslation();
  const percent = Math.round(opacity * 100);
  return (
    <div className={`${cardClass} flex items-center gap-2.5 px-3 py-2`}>
      <span className="text-xs font-medium">{t("layerPanel.opacity")}</span>
      <Slider
        aria-label={t("layerPanel.opacityFor", { name })}
        className="min-w-0 flex-1"
        min={0}
        max={100}
        step={5}
        value={[percent]}
        onValueChange={([value]: number[]) => onChange((value ?? percent) / 100)}
      />
      <span className="w-9 text-end font-mono text-[11.5px] text-muted-foreground tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

/**
 * SWIFTMAP: the selected layer's Properties card (Change 17): what GeoLibre
 * already knows about the layer, labels in a narrow column with values beside
 * them. A raster's CRS comes from its GeoTIFF header, read when the card opens.
 */
export function LayerPropertiesCard({ layer }: { layer: GeoLibreLayer }) {
  const { t, i18n } = useTranslation();
  const url = rasterInfoUrl(layer);
  const [raster, setRaster] = useState<RasterInfo | "loading" | null>(null);
  useEffect(() => {
    if (!url) {
      setRaster(null);
      return;
    }
    let cancelled = false;
    setRaster("loading");
    readRasterInfo(url)
      .then((info) => {
        if (!cancelled) setRaster(info);
      })
      .catch((error: unknown) => {
        console.warn("[Swiftmap] Could not read the raster header for Properties", error);
        if (!cancelled) setRaster(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const rows = layerPropertyRows(layer, t, i18n.language, raster);
  return (
    <dl
      className={`${cardClass} grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 px-3 py-2.5 text-xs`}
    >
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="break-words font-mono text-[11.5px]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
