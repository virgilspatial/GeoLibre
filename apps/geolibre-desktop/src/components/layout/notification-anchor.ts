import { useEffect, useState, type RefObject } from "react";

/**
 * SWIFTMAP: where the notification region sits (Change 41). The lowest card's
 * bottom-right corner sits on the attribution control's corner (the same insets
 * from the map's edges as the (i)), so while a message shows the (i) is covered
 * completely, never partly. An expanded attribution is covered when it fits
 * inside that card; otherwise the cards sit just above it. The region follows
 * the map as side panels open and close.
 */

/** The gap between the lowest card and an expanded attribution it sits above. */
export const NOTIFICATION_GAP_PX = 8;
/** The margin MapLibre gives its corner controls, used when there is no attribution. */
export const NOTIFICATION_CORNER_INSET_PX = 10;
/** The least room left between the cards and the map's far edge. */
export const NOTIFICATION_FAR_INSET_PX = 16;
/** The widest a card gets (24rem). */
export const NOTIFICATION_MAX_WIDTH_PX = 384;

/** A box in viewport pixels, as `getBoundingClientRect` gives it. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Fixed-position offsets for the region, in viewport pixels. */
export interface NotificationAnchor {
  /** Anchored on the right: the distance from the viewport's right edge. */
  right?: number;
  /** Anchored on the left: the distance from the viewport's left edge. */
  left?: number;
  bottom: number;
  width: number;
}

export interface AnchorInput {
  map: Box;
  /** The attribution control (the (i), or the whole box when expanded), or null when off. */
  attribution: Box | null;
  /** The lowest card's height once it has rendered; null before that. */
  cardHeight: number | null;
  viewport: { width: number; height: number };
  /** Right to left: with no attribution, the corner is the bottom left. */
  rtl?: boolean;
}

/**
 * The region's offsets.
 *
 * @returns Where to put the region so its lowest card covers the attribution
 *   completely, or sits above it when it can't.
 */
export function notificationAnchor({
  map,
  attribution,
  cardHeight,
  viewport,
  rtl = false,
}: AnchorInput): NotificationAnchor {
  // The corner the attribution is in (MapLibre keeps it bottom right even
  // right to left); with no attribution, the reading direction's end corner.
  const onLeft = attribution
    ? attribution.left - map.left < map.right - attribution.right
    : rtl;
  const corner: Box = attribution ?? {
    left: map.left + NOTIFICATION_CORNER_INSET_PX,
    right: map.right - NOTIFICATION_CORNER_INSET_PX,
    top: map.bottom - NOTIFICATION_CORNER_INSET_PX,
    bottom: map.bottom - NOTIFICATION_CORNER_INSET_PX,
  };
  const nearInset = onLeft ? corner.left - map.left : map.right - corner.right;
  const width = Math.max(
    0,
    Math.min(NOTIFICATION_MAX_WIDTH_PX, map.right - map.left - nearInset - NOTIFICATION_FAR_INSET_PX),
  );
  // Covered only when it fits inside the card's footprint; before the card
  // has a height, the collapsed (i) is assumed to fit and anything taller not.
  const attributionWidth = corner.right - corner.left;
  const attributionHeight = corner.bottom - corner.top;
  const fits =
    attribution === null ||
    (attributionWidth <= width && attributionHeight <= (cardHeight ?? 2 * attributionWidth));
  const lowest = fits ? corner.bottom : corner.top - NOTIFICATION_GAP_PX;
  const bottom = Math.max(0, viewport.height - lowest);
  return onLeft
    ? { left: corner.left, bottom, width }
    : { right: Math.max(0, viewport.width - corner.right), bottom, width };
}

const MAP_SELECTOR = '[data-testid="map-canvas"]';
const ATTRIBUTION_SELECTOR = ".maplibregl-ctrl-attrib, .mapboxgl-ctrl-attrib";
const CARD_SELECTOR = '[data-testid="notification"]';

const visibleBox = (element: Element | null | undefined): Box | null => {
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return box.width === 0 || box.height === 0 ? null : box;
};

const sameAnchor = (a: NotificationAnchor | null, b: NotificationAnchor | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.right === b.right &&
    a.left === b.left &&
    a.bottom === b.bottom &&
    a.width === b.width);

/**
 * Measure the map, its attribution and the lowest card while messages are
 * showing, and again whenever any of them changes size (side panels, the
 * Style panel, the attribution expanding, a card's text wrapping) or the
 * window does.
 *
 * @param active - Whether any message is showing.
 * @param regionRef - The notification region, to find its lowest card.
 * @returns The region's offsets, or null when there is no map to anchor to.
 */
export function useNotificationAnchor(
  active: boolean,
  regionRef: RefObject<HTMLElement | null>,
): NotificationAnchor | null {
  const [anchor, setAnchor] = useState<NotificationAnchor | null>(null);
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const map = document.querySelector<HTMLElement>(MAP_SELECTOR);
    if (!map) {
      setAnchor(null);
      return;
    }
    const rtl = getComputedStyle(map).direction === "rtl";
    const attributionElement = map.querySelector(ATTRIBUTION_SELECTOR);
    const lowestCard = () => {
      const cards = regionRef.current?.querySelectorAll(CARD_SELECTOR);
      return cards && cards.length > 0 ? cards[cards.length - 1] : null;
    };
    const measure = () => {
      const box = visibleBox(map);
      const card = visibleBox(lowestCard());
      const next = box
        ? notificationAnchor({
            map: box,
            attribution: visibleBox(attributionElement),
            cardHeight: card ? card.bottom - card.top : null,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            rtl,
          })
        : null;
      setAnchor((previous) => (sameAnchor(previous, next) ? previous : next));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(map);
    if (attributionElement) observer?.observe(attributionElement);
    if (regionRef.current) observer?.observe(regionRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active, regionRef]);
  return active ? anchor : null;
}
