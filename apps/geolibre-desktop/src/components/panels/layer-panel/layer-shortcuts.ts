import { formatShortcut, matchesShortcut, type Shortcut } from "../../../lib/commands";

/**
 * SWIFTMAP: the selected layer's keyboard shortcuts (Change 17), shown in its
 * ⋯ menu as in the mockup and handled by the Layers panel while focus is in it.
 */
export const LAYER_SHORTCUTS = {
  attributeTable: { key: "t" },
  opacity: { key: "o" },
  properties: { key: "i" },
  rename: { key: "F2" },
  duplicate: { key: "d", mod: true, shift: false },
  moveUp: { key: "ArrowUp", alt: true },
  moveDown: { key: "ArrowDown", alt: true },
  addToNewGroup: { key: "g", mod: true, shift: false },
  export: { key: "e", mod: true, shift: false },
  remove: { key: "Delete" },
} as const satisfies Record<string, Shortcut>;

export type LayerShortcutId = keyof typeof LAYER_SHORTCUTS;

const KEY_GLYPHS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", Delete: "Del" };

/** The menu label for a shortcut, e.g. "⌥↑" on a Mac and "Alt+↑" elsewhere. */
export function layerShortcutLabel(id: LayerShortcutId, isMac: boolean): string {
  const shortcut = LAYER_SHORTCUTS[id];
  const glyph = KEY_GLYPHS[shortcut.key];
  return formatShortcut(glyph ? { ...shortcut, key: glyph } : shortcut, isMac);
}

/** Which layer shortcut a key press is, if any. */
export function matchLayerShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  isMac: boolean,
): LayerShortcutId | null {
  for (const [id, shortcut] of Object.entries(LAYER_SHORTCUTS)) {
    if (matchesShortcut(event, shortcut, isMac)) return id as LayerShortcutId;
  }
  return null;
}
