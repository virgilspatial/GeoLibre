import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

interface LayerSearchFieldProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Layers matching the query, and all layers. */
  shown: number;
  total: number;
}

/**
 * SWIFTMAP: the Layers panel's search (Change 17): "Search layers..." with a
 * live count ("5 layers", or "2 of 5" while searching), a clear button, and Esc
 * to clear.
 */
export function LayerSearchField({ query, onQueryChange, shown, total }: LayerSearchFieldProps) {
  const { t } = useTranslation();
  const searching = query.trim().length > 0;
  return (
    <label className="mb-2 flex h-9 cursor-text items-center gap-2 rounded-lg border border-input px-2.5 text-[13px] text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
      <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
      <input
        type="search"
        aria-label={t("layerPanel.searchLabel")}
        placeholder={t("layerPanel.searchPlaceholder")}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !query) return;
          // Esc clears the search; the panel's own Esc (deselect) waits for the next press.
          event.preventDefault();
          event.stopPropagation();
          onQueryChange("");
        }}
        className="w-0 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="whitespace-nowrap text-xs tabular-nums" aria-live="polite">
        {searching
          ? t("layerPanel.countFiltered", { shown, total })
          : t("layerPanel.count", { count: total })}
      </span>
      {query ? (
        <button
          type="button"
          aria-label={t("layerPanel.clearSearch")}
          className="-me-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onQueryChange("")}
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      ) : null}
    </label>
  );
}
