import { useAppStore } from "@geolibre/core";
import type { MapEngine } from "@geolibre/map";
import { LAYER_CONTROL_PLUGIN_ID } from "@geolibre/plugins";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { usePluginRegistry } from "../../hooks/usePlugins";
import {
  CompassIcon,
  FullScreenIcon,
  MapStackButton,
  MyLocationIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./MapStackButton";
import { needleRotation, nativeCornerTop, visibleMapButtons } from "./map-buttons-model";
import { useMapControlsMenuStore } from "./mapControlsMenuStore";

// SWIFTMAP (Change 26): the mockup's map button stack, top right of the primary
// map: Zoom, Compass, My location, Full screen, then Map controls. It replaces
// GeoLibre's floating buttons for those controls, which stay mounted (hidden by
// `[data-swiftmap-map-buttons]` in index.css) so the Controls menu still
// switches them; My location drives MapLibre's own control for its location dot.

interface MapButtonStackProps {
  engine: RefObject<MapEngine | null>;
  /** Bumps when the engine is (re)published, to re-subscribe to its camera. */
  ready: number;
  /** The Controls menu's checkmarks. */
  shown: Partial<Record<string, boolean>>;
}

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null };

function fullscreenElement(): Element | null {
  return (
    document.fullscreenElement ?? (document as FullscreenDocument).webkitFullscreenElement ?? null
  );
}

/** The primary map's pane: the first grid cell in a split layout, else the map area. */
function findPrimaryPane(): HTMLElement | null {
  const grid = document.querySelector<HTMLElement>('[data-testid="map-grid"]');
  const cell = grid?.firstElementChild;
  if (cell instanceof HTMLElement) return cell;
  return document.querySelector<HTMLElement>("[data-map-column] > main");
}

export function MapButtonStack({ engine, ready, shown }: MapButtonStackProps) {
  const { t } = useTranslation();
  const gridCells = useAppStore((s) => s.mapLayout.rows * s.mapLayout.cols);
  const setAnchor = useMapControlsMenuStore((s) => s.setAnchor);
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const [bearing, setBearing] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  const layerControlOn = usePluginRegistry().isActive(LAYER_CONTROL_PLUGIN_ID);

  useLayoutEffect(() => {
    setPane(findPrimaryPane());
  }, [gridCells]);

  // Mark the pane so index.css hides GeoLibre's own buttons there, and move its
  // top-right corner below the stack.
  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!pane || !stack) return;
    pane.setAttribute("data-swiftmap-map-buttons", "");
    const place = () =>
      pane.style.setProperty(
        "--swiftmap-map-corner-top",
        `${nativeCornerTop(stack.getBoundingClientRect().height)}px`,
      );
    place();
    const observer = new ResizeObserver(place);
    observer.observe(stack);
    return () => {
      observer.disconnect();
      pane.removeAttribute("data-swiftmap-map-buttons");
      pane.style.removeProperty("--swiftmap-map-corner-top");
    };
  }, [pane]);

  useEffect(() => {
    const current = engine.current;
    if (!current) return;
    const update = () => setBearing(current.readView().bearing);
    update();
    return current.onCameraMove(update);
  }, [engine, ready]);

  useEffect(() => {
    const sync = () => setIsFullscreen(fullscreenElement() !== null);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  useEffect(() => () => setAnchor(null), [setAnchor]);

  // The Layer Control plugin is off by default in Swiftmap, but the engine
  // still mounts its button on every new map; keep the button in step with the
  // plugin (Controls › Layer control) so the map and the menu's tick agree.
  useEffect(() => {
    if (!layerControlOn) engine.current?.setBuiltInControlVisible("layer-control", false);
  }, [engine, ready, layerControlOn]);

  if (!pane) return null;

  // Full screen covers the whole map area (the <main>), so the stack, legend
  // and other overlays stay on screen; DesktopShell hides the rest of the app.
  const toggleFullscreen = () => {
    if (fullscreenElement()) {
      void document.exitFullscreen?.();
      return;
    }
    const target = (pane.closest("main") ?? pane) as HTMLElement & {
      webkitRequestFullscreen?: () => void;
    };
    if (target.requestFullscreen) void target.requestFullscreen();
    else target.webkitRequestFullscreen?.();
  };

  // MapLibre's GeolocateControl is mounted but hidden; clicking it runs its
  // locate, follow and stop cycle and draws the location dot.
  const locate = () => {
    pane
      .querySelector<HTMLButtonElement>(".maplibregl-ctrl-geolocate, .mapboxgl-ctrl-geolocate")
      ?.click();
  };

  const buttons = visibleMapButtons(shown);

  return createPortal(
    <div
      ref={stackRef}
      role="group"
      aria-label={t("swiftmapMapButtons.group")}
      className="pointer-events-none absolute end-4 top-4 z-20 flex flex-col items-end gap-2 [&>*]:pointer-events-auto"
      data-testid="swiftmap-map-buttons"
    >
      {buttons.includes("zoom") && (
        <div className="flex flex-col overflow-hidden rounded-[8px] border border-border bg-background">
          <MapStackButton
            joined
            label={t("swiftmapMapButtons.zoomIn")}
            className="border-b border-border"
            onClick={() => engine.current?.zoomIn()}
          >
            <ZoomInIcon />
          </MapStackButton>
          <MapStackButton
            joined
            label={t("swiftmapMapButtons.zoomOut")}
            onClick={() => engine.current?.zoomOut()}
          >
            <ZoomOutIcon />
          </MapStackButton>
        </div>
      )}
      {buttons.includes("compass") && (
        <MapStackButton
          label={t("swiftmapMapButtons.resetNorth")}
          onClick={() => engine.current?.resetNorthPitch()}
        >
          <CompassIcon rotation={needleRotation(bearing)} />
        </MapStackButton>
      )}
      {buttons.includes("geolocate") && (
        <MapStackButton label={t("swiftmapMapButtons.myLocation")} onClick={locate}>
          <MyLocationIcon />
        </MapStackButton>
      )}
      {buttons.includes("fullscreen") && (
        <MapStackButton
          label={t(
            isFullscreen ? "swiftmapMapButtons.exitFullScreen" : "swiftmapMapButtons.fullScreen",
          )}
          onClick={toggleFullscreen}
        >
          <FullScreenIcon />
        </MapStackButton>
      )}
      {/* GeoLibre's Controls menu draws its trigger here (MapControlsTrigger). */}
      <div ref={setAnchor} className="empty:hidden" />
    </div>,
    pane,
  );
}
