import { create } from "zustand";
import { getIsMobileViewport } from "../../../hooks/useIsMobileViewport";

/** The rail items that switch the side panel (Change 16). */
export type SidePanelId = "layers" | "legend" | "analysis";

interface SidePanelState {
  /** The panel shown beside the rail, or null when the side panel is closed. */
  active: SidePanelId | null;
  /** Show a panel, or close the side panel when that panel is already shown. */
  toggle: (id: SidePanelId) => void;
  open: (id: SidePanelId) => void;
  close: () => void;
  /** Whether the rail's Add Data menu is open; the Layers panel's + opens it too (Change 17). */
  addDataMenuOpen: boolean;
  setAddDataMenuOpen: (open: boolean) => void;
  /** Whether the rail offers Add Data (editors, with the capability). */
  addDataAvailable: boolean;
  setAddDataAvailable: (available: boolean) => void;
}

/**
 * SWIFTMAP: which side panel the rail has open. Shared by the rail (drawn by
 * TopToolbar) and the side panel (drawn by DesktopShell). Starts on Layers, or
 * closed on a phone, where panels overlay the map. Never saved.
 */
export const useSidePanelStore = create<SidePanelState>((set) => ({
  active: getIsMobileViewport() ? null : "layers",
  toggle: (id) => set((state) => ({ active: state.active === id ? null : id })),
  open: (id) => set({ active: id }),
  close: () => set({ active: null }),
  addDataMenuOpen: false,
  setAddDataMenuOpen: (open) => set({ addDataMenuOpen: open }),
  addDataAvailable: false,
  setAddDataAvailable: (available) => set({ addDataAvailable: available }),
}));
