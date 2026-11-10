import { useAppStore, type GeoLibreLayer } from "@geolibre/core";
import { isDrawOrderByShapeOn } from "./draw-order";

/**
 * SWIFTMAP (Change 38): labels always on top. GeoLibre places each layer's
 * labels (`layer-<id>-label`) with its shapes, so after Change 36 sorts layers
 * into tiers, a polygon layer's labels could sit under a line or point layer.
 * After every placement pass (`__swiftmapAfterPlacement`, one tagged line in
 * `syncLayers`), this lifts the labels to just above the highest data shape,
 * in draw order, so point labels sit above line labels above polygon labels.
 */

/** The map calls the pass uses. */
export interface LabelOrderMap {
  getLayersOrder(): string[];
  moveLayer(id: string, beforeId?: string): void;
}

const labelId = (layer: GeoLibreLayer) => `layer-${layer.id}-label`;

/** Whether a style layer draws one of these layers' shapes (not its labels). */
function shapeOwner(drawn: readonly GeoLibreLayer[]): (styleLayerId: string) => boolean {
  const prefixes = drawn.map((layer) => `layer-${layer.id}-`);
  const native = new Set(
    drawn.flatMap((layer) => {
      const ids = layer.metadata?.nativeLayerIds;
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
    }),
  );
  const labels = new Set(drawn.map(labelId));
  return (id) =>
    !labels.has(id) && (native.has(id) || prefixes.some((prefix) => id.startsWith(prefix)));
}

/**
 * Where the labels should go: the label ids in draw order, and the style layer
 * they belong beneath (undefined: the top of the style).
 *
 * @param order - The style's layers, bottom to top.
 * @param drawn - The data layers in the order the map draws them, bottom to top.
 * @returns The labels to place and their anchor, or null when there are none.
 */
export function labelPlacement(
  order: readonly string[],
  drawn: readonly GeoLibreLayer[],
): { labels: string[]; beforeId: string | undefined } | null {
  const present = new Set(order);
  const labels = drawn.map(labelId).filter((id) => present.has(id));
  if (labels.length === 0) return null;
  const labelSet = new Set(labels);
  const rest = order.filter((id) => !labelSet.has(id));
  const isShape = shapeOwner(drawn);
  let top = -1;
  rest.forEach((id, index) => {
    if (isShape(id)) top = index;
  });
  if (top === -1) return null;
  return { labels, beforeId: rest[top + 1] };
}

/** Whether the labels already sit, in this order, right where they belong. */
function alreadyPlaced(order: readonly string[], placement: { labels: string[]; beforeId?: string }): boolean {
  const end = placement.beforeId === undefined ? order.length : order.indexOf(placement.beforeId);
  const start = end - placement.labels.length;
  return start >= 0 && placement.labels.every((id, i) => order[start + i] === id);
}

/**
 * Lift the labels of the drawn layers above every data layer's shapes. Moves
 * nothing when they are already in place.
 *
 * @param map - The map the layers were just placed on.
 * @param drawn - The data layers in draw order, bottom to top.
 */
export function liftLabels(map: LabelOrderMap, drawn: readonly GeoLibreLayer[]): void {
  const order = map.getLayersOrder();
  const placement = labelPlacement(order, drawn);
  if (!placement || alreadyPlaced(order, placement)) return;
  for (const id of placement.labels) map.moveLayer(id, placement.beforeId);
}

/** The pass the map calls after placing layers: only while the draw-order switch is on. */
export function swiftmapAfterPlacement(map: LabelOrderMap, drawn: GeoLibreLayer[]): void {
  if (!isDrawOrderByShapeOn(useAppStore.getState().metadata)) return;
  liftLabels(map, drawn);
}

/** Registers the label pass with GeoLibre's map controller. */
export function installSwiftmapLabelOrder(): void {
  (globalThis as { __swiftmapAfterPlacement?: typeof swiftmapAfterPlacement }).__swiftmapAfterPlacement =
    swiftmapAfterPlacement;
}
