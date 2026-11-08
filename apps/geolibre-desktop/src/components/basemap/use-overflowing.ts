import { useEffect, useState, type RefObject } from "react";

/**
 * SWIFTMAP (Change 28, 7c review 3): whether a scrolling list is long enough
 * to scroll beneath the Basemap card, which then shows a line above it.
 *
 * `ref` is the scroll container itself, or (with `viewportSelector`) an element
 * inside it, such as the list in a Radix ScrollArea's viewport. Re-measured
 * whenever the container or its content changes size.
 */
export function useOverflowing(
  ref: RefObject<HTMLElement | null>,
  viewportSelector?: string,
): boolean {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const root = ref.current;
    const viewport = viewportSelector ? root?.closest<HTMLElement>(viewportSelector) : root;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflowing(viewport.scrollHeight > viewport.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    for (const child of Array.from(viewport.children)) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [ref, viewportSelector]);
  return overflowing;
}
