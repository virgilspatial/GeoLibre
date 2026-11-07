import { create } from "zustand";
import type { LegendMode } from "./legend-model";

interface LegendState {
  /** In view (the default) or All; shared by the Legend panel and, later, the floating legend. */
  mode: LegendMode;
  setMode: (mode: LegendMode) => void;
}

/** SWIFTMAP (Change 25): the legends' In view | All setting, held in memory. */
export const useLegendStore = create<LegendState>((set) => ({
  mode: "view",
  setMode: (mode) => set({ mode }),
}));
