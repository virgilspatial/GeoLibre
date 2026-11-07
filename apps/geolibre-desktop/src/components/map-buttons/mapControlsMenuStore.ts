import { create } from "zustand";

// SWIFTMAP (Change 26): links the stack's Map controls slot to GeoLibre's
// Controls menu, which is mounted in the header, so the menu can open from the
// button on the map.

interface MapControlsMenuState {
  /** The slot at the bottom of the stack the menu's trigger is drawn into. */
  anchor: HTMLElement | null;
  open: boolean;
  setAnchor: (anchor: HTMLElement | null) => void;
  setOpen: (open: boolean) => void;
}

export const useMapControlsMenuStore = create<MapControlsMenuState>((set) => ({
  anchor: null,
  open: false,
  setAnchor: (anchor) => set({ anchor }),
  setOpen: (open) => set({ open }),
}));
