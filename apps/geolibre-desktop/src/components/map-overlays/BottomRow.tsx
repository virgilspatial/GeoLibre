import { useAppStore } from "@geolibre/core";
import type { MapEngine } from "@geolibre/map";
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { findPrimaryPane } from "../map-buttons/primary-pane";
import { shouldStack, type Span } from "./bottom-row-layout";

// SWIFTMAP (Change 39): the primary map's bottom-right row: the scale bar, then
// the attribution (i) (`ui-handoff.md`, Map overlays). GeoLibre's scale bar is
// moved to the bottom-right corner, and index.css lays the corner out as a row,
// or as a stack when the row would reach whatever is in the bottom left.

/** Marks the pane whose bottom-right corner is laid out as the row. */
export const BOTTOM_ROW_ATTR = "data-swiftmap-bottom-row";
/** Set on the pane while the corner falls back to a stack. */
export const BOTTOM_STACK_ATTR = "data-swiftmap-bottom-stack";
/** Marks an element outside MapLibre's corners that sits in the map's bottom left. */
export const BOTTOM_LEFT_ATTR = "data-swiftmap-bottom-left";

const spanOf = (element: Element): Span | null => {
  const box = element.getBoundingClientRect();
  return box.width === 0 && box.height === 0 ? null : { left: box.left, right: box.right };
};

interface BottomRowProps {
  engine: RefObject<MapEngine | null>;
  /** Bumps when the engine is (re)published. */
  ready: number;
}

export function BottomRow({ engine, ready }: BottomRowProps) {
  const gridCells = useAppStore((s) => s.mapLayout.rows * s.mapLayout.cols);
  const [pane, setPane] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setPane(findPrimaryPane());
  }, [gridCells, ready]);

  // GeoLibre's scale bar defaults to the bottom left; move it into the row.
  // Only on a MapLibre map (ArcGIS and Cesium keep their own layouts).
  useEffect(() => {
    const current = engine.current;
    if (!current?.getMap()) return;
    if (current.getBuiltInControlPosition("scale") !== "bottom-right") {
      current.setBuiltInControlPosition("scale", "bottom-right");
    }
  }, [engine, ready]);

  // Mark the pane for index.css, and stack the corner when the row would reach
  // the bottom left.
  useLayoutEffect(() => {
    if (!pane) return;
    const map = pane.querySelector<HTMLElement>(".maplibregl-map");
    const corner = map?.querySelector<HTMLElement>(".maplibregl-ctrl-bottom-right");
    if (!map || !corner) return;
    pane.setAttribute(BOTTOM_ROW_ATTR, "");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const mapSpan = spanOf(map);
      if (!mapSpan) return;
      const attribution = corner.querySelector<HTMLElement>(":scope > .maplibregl-ctrl-attrib");
      const bottomLeft = [
        ...(map.querySelector(".maplibregl-ctrl-bottom-left")?.children ?? []),
        ...pane.querySelectorAll(`[${BOTTOM_LEFT_ATTR}]`),
      ]
        .map(spanOf)
        .filter((span): span is Span => span !== null);
      const stack = shouldStack({
        map: mapSpan,
        scale: corner.querySelector(":scope > .maplibregl-ctrl-scale") !== null,
        otherWidths: [attribution ? attribution.getBoundingClientRect().width : 0],
        bottomLeft,
      });
      pane.toggleAttribute(BOTTOM_STACK_ATTR, stack);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    const resize = new ResizeObserver(schedule);
    const observeAll = () => {
      resize.disconnect();
      resize.observe(map);
      for (const element of map.querySelectorAll(
        ".maplibregl-ctrl-bottom-right > *, .maplibregl-ctrl-bottom-left > *",
      )) {
        resize.observe(element);
      }
      for (const element of pane.querySelectorAll(`[${BOTTOM_LEFT_ATTR}]`)) resize.observe(element);
    };
    observeAll();
    // Controls come and go (the scale bar, a docked legend).
    const mutations = new MutationObserver(() => {
      observeAll();
      schedule();
    });
    mutations.observe(map.querySelector(".maplibregl-control-container") ?? map, {
      childList: true,
      subtree: true,
    });
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      pane.removeAttribute(BOTTOM_ROW_ATTR);
      pane.removeAttribute(BOTTOM_STACK_ATTR);
    };
  }, [pane, ready]);

  return null;
}
