import { useAppStore } from "@geolibre/core";
import { useEffect } from "react";
import { autoFlavor, holdAutoOnLight, onAutoHoldChange } from "./auto-flavor";
import { parseSwiftmapBasemap } from "./basemap-catalog";
import { ensureSwiftmapBasemap } from "./basemap-registry";

// SWIFTMAP (Change 33): the Auto basemap follows the theme. The stored basemap
// stays `…/swiftmap/auto` (no Undo step, nothing to save); when the flavour
// changes, the style registered under that link is rebuilt and the map is
// asked to apply the same link again, which Swiftmap's swap hook turns into an
// in-place Light ↔ Dark swap (basemap-swap.ts).

let reapply: (() => void) | null = null;

/**
 * Registers how to re-apply the basemap on the live map (MapButtonStack, which
 * holds the map engine). Returns the unregister function.
 */
export function setAutoBasemapReapply(next: () => void): () => void {
  reapply = next;
  return () => {
    if (reapply === next) reapply = null;
  };
}

/** Whether the store's basemap is Auto. */
export function isAutoBasemap(url = useAppStore.getState().basemapStyleUrl): boolean {
  return parseSwiftmapBasemap(url)?.kind === "auto";
}

/**
 * Rebuilds Auto's style for the current flavour and re-applies it, when the
 * map is on Auto. Without a key nothing is registered (the map shows Liberty).
 */
export function refreshAutoBasemap(): void {
  const url = useAppStore.getState().basemapStyleUrl;
  if (!isAutoBasemap(url) || !ensureSwiftmapBasemap(url)) return;
  reapply?.();
}

/**
 * Watches the theme (the `dark` class on `<html>`) and export holds, and
 * refreshes Auto when its flavour changes. Call once, before the first render.
 */
export function installAutoBasemap(): () => void {
  let last = autoFlavor();
  const check = () => {
    const now = autoFlavor();
    if (now === last) return;
    last = now;
    refreshAutoBasemap();
  };
  const observer =
    typeof MutationObserver === "undefined" || typeof document === "undefined"
      ? null
      : new MutationObserver(check);
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  const stopHolds = onAutoHoldChange(check);
  return () => {
    observer?.disconnect();
    stopHolds();
  };
}

/**
 * Holds an Auto map on Light while `open` (Print Layout, the story map
 * handout: PDFs are always Light), and lets it follow the theme again after.
 */
export function useLightBasemapWhileOpen(open: boolean): void {
  useEffect(() => (open ? holdAutoOnLight() : undefined), [open]);
}
