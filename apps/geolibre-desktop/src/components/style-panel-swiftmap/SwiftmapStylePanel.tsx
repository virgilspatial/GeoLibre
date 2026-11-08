import {
  DEFAULT_LAYER_STYLE,
  isCesiumKmlLayer,
  isCzmlLayer,
  pluginOwnsPaint,
  useAppStore,
  useLayer,
  type GeoLibreLayer,
  type LayerStyle,
} from "@geolibre/core";
import { arcgisVectorStyle, type MapEngine } from "@geolibre/map";
import { TIME_SLIDER_SOURCE_KIND } from "@geolibre/plugins";
import { Button, ScrollArea, cn } from "@geolibre/ui";
import { X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
  hasExternalDeckLayer,
  hasExternalNativeLayers,
  isRasterPaintLayer,
} from "../panels/style-panel/layer-capabilities";
import { useLayerFeatureScans } from "../panels/style-panel/useLayerFeatureScans";
import { useBelowLabelsSync } from "./below-labels";
import { noteClass } from "./fields";
import { usePopupDefaults } from "./popup-defaults";
import { LabelsTab } from "./LabelsTab";
import { PopupTab } from "./PopupTab";
import { RasterStyleTab } from "./RasterStyleTab";
import { resetStyle } from "./style-actions";
import { geometryKindOf, showAsOf, type GeometryKind, type ShowAs } from "./style-model";
import { OpacityField, StyleTab, VisibleRange } from "./StyleTab";

// SWIFTMAP (Change 27): Swiftmap's Style panel, replacing GeoLibre's
// standalone Style panel and its collapsed right-hand rail. It opens from the
// layer toolbar's palette icon (`openRequest`), follows the selected layer, and
// closes with its × or Esc, leaving nothing behind. Changes apply live through
// GeoLibre's layer store; the header's Save keeps them.

type PanelKind = "vector" | "raster" | "reduced" | "none";
type Tab = "style" | "labels" | "popup";

interface SwiftmapStylePanelProps {
  mapControllerRef: RefObject<MapEngine | null>;
  mapReadyGeneration?: number;
  /** Kept for the shell's call site; the panel has the mockup's fixed width. */
  onResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** Incremented when the layer toolbar's palette icon asks for the panel. */
  openRequest?: number;
  /** Hides the panel while the notebook or a story presentation needs the room. */
  autoCollapse?: boolean;
}

/** Which panel a layer gets, by the same tests as GeoLibre's own Style panel. */
function panelKindOf(layer: GeoLibreLayer): PanelKind {
  const isDeckRaster =
    layer.metadata.sourceKind === "cog-url" ||
    layer.metadata.sourceKind === "geotiff-url" ||
    layer.metadata.sourceKind === "maplibre-gl-raster" ||
    layer.metadata.sourceKind === "stac-search-cog" ||
    (layer.metadata.sourceKind === TIME_SLIDER_SOURCE_KIND &&
      layer.metadata.clientRenderedRaster === true);
  const isRasterTile = layer.metadata.tileType === "raster";
  const isThreeDTiles = layer.type === "3d-tiles";
  const pluginPainted = pluginOwnsPaint(layer);
  const serviceStyled = layer.type === "arcgis" && arcgisVectorStyle(layer) !== null;
  if (pluginPainted || serviceStyled) return "reduced";
  if (isRasterPaintLayer(layer.type) || isRasterTile || isDeckRaster) return "raster";
  const vector =
    !isThreeDTiles &&
    !isCzmlLayer(layer) &&
    !isCesiumKmlLayer(layer) &&
    (layer.type === "geojson" ||
      layer.type === "vector-tiles" ||
      layer.type === "mbtiles" ||
      hasExternalNativeLayers(layer) ||
      hasExternalDeckLayer(layer));
  return vector ? "vector" : "none";
}

export function SwiftmapStylePanel({
  mapControllerRef,
  mapReadyGeneration,
  openRequest = 0,
  autoCollapse = false,
}: SwiftmapStylePanelProps) {
  const selectedLayerId = useAppStore((s) => s.selectedLayerId);
  const layer = useLayer(selectedLayerId);
  const [open, setOpen] = useState(false);
  const firstRequest = useRef(openRequest);

  useBelowLabelsSync(mapControllerRef, mapReadyGeneration);
  usePopupDefaults();

  useEffect(() => {
    if (openRequest !== firstRequest.current) setOpen(true);
  }, [openRequest]);
  useEffect(() => {
    if (!selectedLayerId) setOpen(false);
  }, [selectedLayerId]);

  if (!open || autoCollapse || !layer) return null;
  return (
    <StylePanelBody
      key={layer.id}
      layer={layer}
      engineRef={mapControllerRef}
      onClose={() => setOpen(false)}
    />
  );
}

function StylePanelBody({
  layer,
  engineRef,
  onClose,
}: {
  layer: GeoLibreLayer;
  engineRef: RefObject<MapEngine | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const setLayerStyle = useAppStore((s) => s.setLayerStyle);
  const asideRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<Tab>("style");
  const { geometryFlags, isPointOnly, styleSuggestions } = useLayerFeatureScans(layer);
  const style: LayerStyle = { ...DEFAULT_LAYER_STYLE, ...layer.style };
  const kind = panelKindOf(layer);
  const geometry: GeometryKind = isPointOnly ? "point" : geometryKindOf(geometryFlags);
  const showAs: ShowAs = showAsOf(style, geometry === "point");
  const patch = (change: Partial<LayerStyle>) => setLayerStyle(layer.id, change);
  const tabs: Tab[] = kind === "vector" ? ["style", "labels", "popup"] : ["style"];
  const activeTab = tabs.includes(tab) ? tab : "style";

  const subtitle =
    kind === "raster"
      ? t("swiftmapStyle.subtitle.imagery")
      : kind === "vector"
        ? t("swiftmapStyle.subtitle.vector", {
            geometry: t(`swiftmapStyle.geometry.${geometry}`),
            style: t(`swiftmapStyle.showAs.${showAs}`),
          })
        : t("swiftmapStyle.subtitle.other");

  const reset = () => {
    if (kind === "vector") {
      useAppStore.getState().setLayerStyle(layer.id, resetStyle(layer, style));
    } else {
      patch({
        minZoom: DEFAULT_LAYER_STYLE.minZoom,
        maxZoom: DEFAULT_LAYER_STYLE.maxZoom,
        rasterBrightnessMin: DEFAULT_LAYER_STYLE.rasterBrightnessMin,
        rasterBrightnessMax: DEFAULT_LAYER_STYLE.rasterBrightnessMax,
        rasterContrast: DEFAULT_LAYER_STYLE.rasterContrast,
        rasterSaturation: DEFAULT_LAYER_STYLE.rasterSaturation,
        rasterHueRotate: DEFAULT_LAYER_STYLE.rasterHueRotate,
      });
    }
  };

  return (
    <aside
      ref={asideRef}
      aria-label={t("swiftmapStyle.panelLabel")}
      data-testid="swiftmap-style-panel"
      className="relative flex h-[min(24rem,42vh)] w-full shrink-0 flex-col border-t bg-background text-foreground max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:shadow-xl md:h-auto md:w-[330px] md:border-s md:border-t-0"
      onKeyDown={(event) => {
        // Esc inside a popover belongs to the popover (it renders outside this aside).
        if (
          event.key === "Escape" &&
          asideRef.current?.contains(event.target as Node) &&
          !event.defaultPrevented
        ) {
          // Handled here: the app's own Esc would also clear the layer selection.
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex flex-col gap-4 px-[18px] pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-[19px] leading-tight font-medium tracking-[-0.01em]" title={layer.name}>
              {layer.name}
            </h2>
            <span className={noteClass}>{subtitle}</span>
          </div>
          <button
            type="button"
            aria-label={t("swiftmapStyle.close")}
            onClick={onClose}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        {tabs.length > 1 ? (
          <div
            role="tablist"
            aria-label={t("swiftmapStyle.tabsLabel")}
            className="grid grid-cols-3 rounded-lg bg-muted p-[3px] text-[13px] font-medium"
          >
            {tabs.map((id) => (
              <button
                key={id}
                id={`swiftmap-style-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                aria-controls="swiftmap-style-tabpanel"
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(event) => {
                  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                  if (!step) return;
                  event.preventDefault();
                  const rtl = document.documentElement.dir === "rtl" ? -1 : 1;
                  const next = tabs[(tabs.indexOf(activeTab) + step * rtl + tabs.length) % tabs.length]!;
                  setTab(next);
                  document.getElementById(`swiftmap-style-tab-${next}`)?.focus();
                }}
                className={cn(
                  "h-7 rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  activeTab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`swiftmapStyle.tabs.${id}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <ScrollArea variant="thin" className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div
          id="swiftmap-style-tabpanel"
          role={tabs.length > 1 ? "tabpanel" : undefined}
          aria-labelledby={tabs.length > 1 ? `swiftmap-style-tab-${activeTab}` : undefined}
          className="px-[18px] pt-1 pb-5"
        >
          {kind === "vector" && activeTab === "style" ? (
            <StyleTab
              layer={layer}
              style={style}
              geometry={geometry}
              showAs={showAs}
              suggestions={styleSuggestions}
              engineRef={engineRef}
              patch={patch}
            />
          ) : kind === "vector" && activeTab === "labels" ? (
            <LabelsTab layer={layer} style={style} geometry={geometry} patch={patch} />
          ) : kind === "vector" && activeTab === "popup" ? (
            <PopupTab layer={layer} />
          ) : kind === "raster" ? (
            <RasterStyleTab layer={layer} style={style} engineRef={engineRef} patch={patch} />
          ) : kind === "reduced" ? (
            <div className="flex flex-col gap-5">
              <OpacityField layer={layer} />
              <VisibleRange style={style} patch={patch} />
            </div>
          ) : (
            <p className={noteClass}>{t("swiftmapStyle.notAvailable")}</p>
          )}
        </div>
      </ScrollArea>
      <div className="flex items-center justify-between gap-2 border-t px-[18px] py-3">
        <span className={cn(noteClass, "whitespace-nowrap")}>{t("swiftmapStyle.saveHint")}</span>
        {kind === "none" ? null : (
          <Button type="button" variant="outline" className="h-9 px-3.5 text-[13px]" onClick={reset}>
            {t("swiftmapStyle.reset")}
          </Button>
        )}
      </div>
    </aside>
  );
}
