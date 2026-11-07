import { useAppStore, type GeoLibreLayer } from "@geolibre/core";
import { nativeLayerIdPrefix } from "@geolibre/map";
import { ScrollArea, cn } from "@geolibre/ui";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  legendLayer,
  legendView,
  listedLayers,
  type InViewResult,
  type LegendLayer,
  type LegendMode,
  type LegendRow,
} from "./legend-model";
import { queryInView } from "./legend-in-view";
import { LegendSwatch } from "./LegendSwatch";
import { TruncatedText } from "./TruncatedText";
import { useLegendStore } from "./legendStore";

/** Legend entries are rebuilt only when a layer object changes (the store replaces it on edit). */
const legendCache = new WeakMap<GeoLibreLayer, LegendLayer>();
function cachedLegendLayer(layer: GeoLibreLayer): LegendLayer {
  let entry = legendCache.get(layer);
  if (!entry) {
    entry = legendLayer(layer);
    legendCache.set(layer, entry);
  }
  return entry;
}

interface LegendPanelProps {
  /** The live MapLibre map, or null (not ready, or another engine). */
  getMap: () => MapLibreMap | null;
  /** Bumps when the map is (re)created, so the panel re-binds its listeners. */
  mapReadyGeneration: number;
}

/**
 * SWIFTMAP (Change 25): the Legend panel. A fixed header (title, In view |
 * All) over a scrolling list of the visible layers' swatches. In view
 * asks the map what it draws, after panning or zooming stops.
 */
export function LegendPanel({ getMap, mapReadyGeneration }: LegendPanelProps) {
  const { t } = useTranslation();
  const layers = useAppStore((state) => state.layers);
  const groups = useAppStore((state) => state.layerGroups);
  const storeZoom = useAppStore((state) => state.mapView.zoom);
  const mode = useLegendStore((state) => state.mode);

  const listed = useMemo(() => listedLayers(layers, groups), [layers, groups]);
  const legendLayers = useMemo(() => listed.map(cachedLegendLayer), [listed]);

  const [inView, setInView] = useState<InViewResult | null>(null);
  const [zoom, setZoom] = useState<number>(storeZoom);
  const latest = useRef({ listed, legendLayers });
  latest.current = { listed, legendLayers };

  // Recalculate once the map is idle after a move or a change to the layers,
  // never while it moves. One query per recalculation, over all listed layers.
  useEffect(() => {
    const map = getMap();
    if (!map) {
      setInView(null);
      return;
    }
    let pending = true;
    const recalculate = () => {
      if (!pending) return;
      pending = false;
      const current = latest.current;
      setZoom(map.getZoom());
      try {
        setInView(queryInView(map, current.listed, current.legendLayers, nativeLayerIdPrefix));
      } catch {
        setInView(null);
      }
    };
    const markPending = () => {
      pending = true;
    };
    map.on("moveend", markPending);
    map.on("idle", recalculate);
    // The map may already be idle: ask for one frame so `idle` follows.
    map.triggerRepaint();
    return () => {
      map.off("moveend", markPending);
      map.off("idle", recalculate);
    };
  }, [getMap, mapReadyGeneration, legendLayers]);

  const view = useMemo(
    () =>
      legendView({
        hasAnyLayers: layers.length > 0,
        layers: legendLayers,
        zoom: getMap() ? zoom : storeZoom,
        mode,
        inView,
      }),
    [layers.length, legendLayers, zoom, storeZoom, mode, inView, getMap],
  );

  return (
    <section
      aria-labelledby="legend-panel-title"
      data-testid="legend-panel"
      className="flex min-h-0 w-full flex-col border-b bg-background px-3 pt-3.5 md:h-full md:w-[var(--layer-panel-width)] md:border-e md:border-b-0"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-1.5 pb-2">
        <h2 id="legend-panel-title" className="min-w-0 truncate text-sm font-semibold">
          {t("rail.legend")}
        </h2>
        <ModeToggle />
      </div>
      {/* Radix lays the viewport's content out as a table, which never truncates;
          a block lets long names end in an ellipsis. Right padding (12px here,
          14px on rows) matches the left (the panel's 12px, the rows' 14px). */}
      <ScrollArea
        variant="thin"
        className="-me-3 min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block"
        data-testid="legend-list"
      >
        <div className="flex flex-col gap-1 pe-3 pb-3.5">
          {view.empty ? (
            <p
              data-testid="legend-empty"
              className="py-2 pe-3.5 ps-3.5 text-[13px] text-muted-foreground"
            >
              {t(`swiftmapLegend.empty.${view.empty}`)}
            </p>
          ) : (
            view.rows.map((row) => <LegendBlock key={row.layer.id} row={row} />)
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

function ModeToggle() {
  const { t } = useTranslation();
  const mode = useLegendStore((state) => state.mode);
  const setMode = useLegendStore((state) => state.setMode);
  const options: { value: LegendMode; label: string }[] = [
    { value: "view", label: t("swiftmapLegend.inView") },
    { value: "all", label: t("swiftmapLegend.all") },
  ];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : mode === "view" ? 1 : 0;
    setMode(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={t("swiftmapLegend.modes")}
      onKeyDown={onKeyDown}
      className="grid shrink-0 grid-cols-2 rounded-[7px] bg-muted p-0.5"
    >
      {options.map((option, index) => {
        const on = mode === option.value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => setMode(option.value)}
            className={cn(
              "h-6 min-w-[60px] rounded-[5px] px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function LegendBlock({ row }: { row: LegendRow }) {
  const { t } = useTranslation();
  const { layer, outOfRange: dimmed, classes } = row;
  const heading = layer.classes.length > 0;
  return (
    <div
      data-testid="legend-layer"
      data-layer-name={layer.name}
      data-out-of-range={dimmed || undefined}
      className="flex shrink-0 flex-col"
    >
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-lg pe-3.5 ps-3.5 pt-1",
          classes.length > 0 ? "pb-0" : "pb-1",
        )}
      >
        {!heading && layer.swatch ? <LegendSwatch swatch={layer.swatch} dimmed={dimmed} /> : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <TruncatedText
            text={layer.name}
            className={cn("text-[13px] font-medium", dimmed && "text-muted-foreground")}
          />
          {dimmed ? (
            <span className="text-xs text-muted-foreground">
              {t("swiftmapLegend.notVisibleAtZoom")}
            </span>
          ) : null}
        </span>
      </div>
      {classes.length > 0 ? (
        <ul className="mt-1 flex flex-col pe-3.5 ps-3.5">
          {classes.map((item) => (
            <li
              key={item.id}
              data-testid="legend-class"
              className="flex h-[22px] items-center gap-2.5 text-[13px]"
            >
              <LegendSwatch swatch={item.swatch} category />
              <TruncatedText text={item.label} className="flex-1" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
