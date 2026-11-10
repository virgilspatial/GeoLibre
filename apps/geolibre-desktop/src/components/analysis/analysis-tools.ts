import type { AnalysisToolId } from "./origin";

/**
 * SWIFTMAP (Change 37): the Analysis panel's toolset: the Screening toolkit
 * only (`design-decisions.md`, "Analysis toolset"). Buffer works in 6b1; the
 * others arrive in 6b2 and 6b3 and show as "Coming soon" until then.
 */
export interface AnalysisTool {
  id: AnalysisToolId;
  available: boolean;
}

export const ANALYSIS_TOOLS: readonly AnalysisTool[] = [
  { id: "buffer", available: true },
  { id: "clip", available: false },
  { id: "intersect", available: false },
  { id: "constraintSummary", available: false },
  { id: "areaByZone", available: false },
  { id: "dissolve", available: false },
];

/** The tools whose name contains the query (case-insensitive), in toolkit order. */
export function searchTools(query: string, nameOf: (id: AnalysisToolId) => string): AnalysisTool[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...ANALYSIS_TOOLS];
  return ANALYSIS_TOOLS.filter((tool) => nameOf(tool.id).toLocaleLowerCase().includes(needle));
}

/** How many tools Recent lists. */
export const RECENT_LIMIT = 3;
const RECENT_KEY = "swiftmap.analysis.recent";
const TOOL_IDS: ReadonlySet<string> = new Set(ANALYSIS_TOOLS.map((tool) => tool.id));

/** Recent tools, most recent first, from this browser's storage. */
export function readRecent(
  storage: Pick<Storage, "getItem"> | null = safeStorage(),
): AnalysisToolId[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is AnalysisToolId => typeof id === "string" && TOOL_IDS.has(id))
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

/** Puts a tool first in Recent and saves the list; returns the new list. */
export function rememberRecent(
  id: AnalysisToolId,
  current: AnalysisToolId[],
  storage: Pick<Storage, "setItem"> | null = safeStorage(),
): AnalysisToolId[] {
  const next = [id, ...current.filter((item) => item !== id)].slice(0, RECENT_LIMIT);
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: Recent lasts for this visit only.
  }
  return next;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
