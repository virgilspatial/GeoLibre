import { ScrollArea, cn } from "@geolibre/ui";
import { ChevronLeft, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ANALYSIS_TOOLS, searchTools, type AnalysisTool } from "./analysis-tools";
import { useAnalysisStore } from "./analysisStore";
import { BufferForm } from "./BufferForm";
import { DissolveForm, OverlayForm } from "./OverlayForms";
import type { AnalysisToolId } from "./origin";

/**
 * SWIFTMAP (Change 37): the Analysis side panel (`ui-handoff.md`, "Analysis
 * panel"): "Search analysis tools...", Recent, then the Screening toolkit. A
 * tool opens its form in the same panel, with a back arrow. Editors only for
 * now; viewers get theirs in branch 8. Analysis history arrives in 6b3.
 */
export function AnalysisPanel() {
  const { t } = useTranslation();
  const tool = useAnalysisStore((state) => state.tool);
  return (
    <section
      aria-labelledby="analysis-panel-title"
      data-testid="analysis-panel"
      className="flex min-h-0 w-full flex-col border-b bg-background px-3 pt-3.5 md:h-full md:w-[var(--layer-panel-width)] md:border-e md:border-b-0"
    >
      {tool ? (
        <ToolHeader tool={tool} />
      ) : (
        <h2 id="analysis-panel-title" className="shrink-0 px-1.5 pb-2 text-sm font-semibold">
          {t("rail.analysis")}
        </h2>
      )}
      <ScrollArea
        variant="thin"
        className="-me-3 min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block"
      >
        <div className="flex min-h-full flex-col pe-3 pb-3.5">
          <ToolBody tool={tool} />
        </div>
      </ScrollArea>
    </section>
  );
}

function ToolBody({ tool }: { tool: AnalysisToolId | null }) {
  switch (tool) {
    case "buffer":
      return <BufferForm />;
    case "clip":
    case "intersect":
      // Keyed, so switching between the two starts with fresh field ids.
      return <OverlayForm key={tool} tool={tool} />;
    case "dissolve":
      return <DissolveForm />;
    default:
      return <ToolList />;
  }
}

function ToolHeader({ tool }: { tool: AnalysisToolId }) {
  const { t } = useTranslation();
  const back = useAnalysisStore((state) => state.back);
  return (
    <div className="flex shrink-0 items-center gap-1.5 pb-1.5">
      <button
        type="button"
        aria-label={t("swiftmapAnalysis.back")}
        data-testid="analysis-back"
        onClick={back}
        className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <h2 id="analysis-panel-title" className="min-w-0 truncate text-sm font-semibold">
        {t(`swiftmapAnalysis.tools.${tool}`)}
      </h2>
      <span className="ms-auto shrink-0 text-xs text-muted-foreground">
        {t("swiftmapAnalysis.screeningToolkit")}
      </span>
    </div>
  );
}

function ToolList() {
  const { t } = useTranslation();
  const query = useAnalysisStore((state) => state.query);
  const setQuery = useAnalysisStore((state) => state.setQuery);
  const recent = useAnalysisStore((state) => state.recent);
  const nameOf = (id: AnalysisToolId) => t(`swiftmapAnalysis.tools.${id}`);
  const searching = query.trim().length > 0;
  const results = searching ? searchTools(query, nameOf) : [];
  const recentTools = recent
    .map((id) => ANALYSIS_TOOLS.find((tool) => tool.id === id))
    .filter((tool): tool is AnalysisTool => Boolean(tool));
  return (
    <>
      <label className="flex h-9 shrink-0 cursor-text items-center gap-2 rounded-lg border border-input px-2.5 text-[13px] text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
        <input
          type="search"
          aria-label={t("swiftmapAnalysis.searchLabel")}
          placeholder={t("swiftmapAnalysis.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !query) return;
            event.preventDefault();
            event.stopPropagation();
            setQuery("");
          }}
          className="w-0 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            aria-label={t("swiftmapAnalysis.clearSearch")}
            className="-me-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setQuery("")}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        ) : null}
      </label>
      {searching ? (
        results.length > 0 ? (
          <ToolGroup
            title={t("swiftmapAnalysis.results", { count: results.length })}
            tools={results}
            showCategory
          />
        ) : (
          <p className="px-2 py-3 text-[13px] text-muted-foreground" aria-live="polite">
            {t("swiftmapAnalysis.noResults", { query: query.trim() })}
          </p>
        )
      ) : (
        <>
          {recentTools.length > 0 ? (
            <ToolGroup
              title={t("swiftmapAnalysis.recent")}
              tools={recentTools}
              testId="analysis-recent"
            />
          ) : null}
          <ToolGroup title={t("swiftmapAnalysis.screeningToolkit")} tools={[...ANALYSIS_TOOLS]} />
        </>
      )}
    </>
  );
}

function ToolGroup({
  title,
  tools,
  showCategory = false,
  testId,
}: {
  title: string;
  tools: AnalysisTool[];
  showCategory?: boolean;
  testId?: string;
}) {
  const { t } = useTranslation();
  const openTool = useAnalysisStore((state) => state.openTool);
  return (
    <div role="group" aria-label={title} data-testid={testId} className="flex flex-col gap-0.5">
      <div
        className="mt-3.5 mb-1 px-2 text-xs font-medium text-muted-foreground"
        aria-hidden="true"
      >
        {title}
      </div>
      {tools.map((tool) => {
        const name = t(`swiftmapAnalysis.tools.${tool.id}`);
        return (
          <button
            key={tool.id}
            type="button"
            data-testid={`analysis-tool-${tool.id}`}
            disabled={!tool.available}
            onClick={() => openTool(tool.id)}
            className={cn(
              "flex h-[34px] w-full shrink-0 items-center gap-2 rounded-lg pe-2.5 ps-3.5 text-start text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tool.available
                ? "text-foreground hover:bg-accent"
                : "cursor-default text-muted-foreground",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {!tool.available ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("swiftmapAnalysis.comingSoon")}
              </span>
            ) : showCategory ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("swiftmapAnalysis.screeningToolkit")}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
