import { useTranslation } from "react-i18next";

export interface MoreSourceEntry {
  id: string;
  label: string;
  /** Opens GeoLibre's own loader for this source. */
  onSelect: () => void;
}

export interface MoreSourceGroup {
  id: string;
  label: string;
  entries: MoreSourceEntry[];
}

interface MoreSourcesTabProps {
  groups: MoreSourceGroup[];
  /** Called after an entry is chosen, to close the dialog. */
  onPicked: () => void;
}

/**
 * SWIFTMAP (Change 24): More sources, as in mockup 5a-more-sources: grouped,
 * two columns, no search, and no Files or Web services sections (Upload and From
 * a link cover those). Only sources that work here are passed in.
 */
export function MoreSourcesTab({ groups, onPicked }: MoreSourcesTabProps) {
  const { t } = useTranslation();
  if (groups.length === 0) {
    return <p className="text-[13px] text-muted-foreground">{t("addDataDialog.more.empty")}</p>;
  }
  return (
    <div className="flex flex-col">
      {groups.map((group, index) => (
        <section key={group.id} aria-labelledby={`add-data-more-${group.id}`}>
          <h3
            id={`add-data-more-${group.id}`}
            className={`mb-1 px-2.5 text-xs font-medium text-muted-foreground ${index === 0 ? "mt-0" : "mt-4"}`}
          >
            {group.label}
          </h3>
          <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="flex h-[34px] w-full items-center rounded-md px-2.5 text-start text-[13px] text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    onPicked();
                    entry.onSelect();
                  }}
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
