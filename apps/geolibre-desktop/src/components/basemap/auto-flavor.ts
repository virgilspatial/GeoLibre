import { useSyncExternalStore } from "react";
import { getInitialThemeMode } from "../../hooks/useThemeMode";

// SWIFTMAP (Change 33): which flavour the Auto basemap draws. Light in light
// mode, Dark in dark mode, except while an export holds it on Light (PDFs are
// always Light). Kept apart from auto-basemap.ts so the registry can read it
// without an import cycle.

export type AutoFlavor = "light" | "dark";

let lightHolds = 0;
const listeners = new Set<() => void>();

/**
 * The app's theme. `useThemeMode` sets the `dark` class and `color-scheme` on
 * `<html>` after the first render; before that (the registry runs before it),
 * the theme the app is about to set is read the same way the app reads it.
 */
export function themeFlavor(): AutoFlavor {
  if (typeof document === "undefined") return "light";
  const root = document.documentElement;
  if (root.style.colorScheme === "dark" || root.style.colorScheme === "light") {
    return root.classList.contains("dark") ? "dark" : "light";
  }
  return getInitialThemeMode();
}

/** The flavour Auto draws now. */
export function autoFlavor(): AutoFlavor {
  return lightHolds > 0 ? "light" : themeFlavor();
}

/** Holds Auto on Light (an export dialog is open) until the returned release is called. */
export function holdAutoOnLight(): () => void {
  lightHolds += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lightHolds -= 1;
    notify();
  };
}

/** Called when an export hold starts or ends; the theme is watched separately. */
export function onAutoHoldChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribeAutoFlavor(onChange: () => void): () => void {
  const observer =
    typeof MutationObserver === "undefined" || typeof document === "undefined"
      ? null
      : new MutationObserver(onChange);
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  const stopHolds = onAutoHoldChange(onChange);
  return () => {
    observer?.disconnect();
    stopHolds();
  };
}

/** The flavour Auto draws now, re-rendering when the theme or an export hold changes it. */
export function useAutoFlavor(): AutoFlavor {
  return useSyncExternalStore(subscribeAutoFlavor, autoFlavor, () => "light" as const);
}
