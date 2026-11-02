import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@geolibre/core";
import type { GeoLibreLayer, LayerGroup } from "@geolibre/core";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@geolibre/ui";
import { ChevronRight, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { openAddData } from "../../layout/add-data/open-add-data";
import type { ADD_DATA_DIALOG_SOURCES } from "./layer-panel-utils";
import {
  LAYER_MENU_COLLISION_PADDING,
  LayerMenuItem,
  subTriggerClass,
} from "./LayerActionsMenu";
import { LayerOpacityCard } from "./LayerRowCards";
import type { LayerRename } from "./useLayerRename";

interface LayerGroupHeaderProps {
  group: LayerGroup;
  /** Nesting depth of the group (0 at the top level). */
  depth: number;
  /** Whether a dragged layer is hovering this header. */
  isDropTarget: boolean;
  moveability: { up: boolean; down: boolean } | undefined;
  sortability: { asc: boolean; desc: boolean } | undefined;
  /** Groups this one can be moved into (not itself or a descendant). */
  moveTargets: LayerGroup[];
  /** The Add Data sources offered by "Add data to group". */
  addDataGroupSources: typeof ADD_DATA_DIALOG_SOURCES;
  rename: Pick<
    LayerRename,
    | "editingGroupId"
    | "editingGroupName"
    | "setEditingGroupName"
    | "beginGroupRename"
    | "commitGroupRename"
    | "cancelGroupRename"
  >;
}

/** How many layers sit in a group, counting those in its subgroups. */
function countGroupLayers(layers: GeoLibreLayer[], groups: LayerGroup[], groupId: string): number {
  const parentOf = new Map(groups.map((g) => [g.id, g.parentId] as const));
  return layers.filter((layer) => {
    let id = layer.groupId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      if (id === groupId) return true;
      seen.add(id);
      id = parentOf.get(id);
    }
    return false;
  }).length;
}

/**
 * SWIFTMAP: a group row in the Layers panel (Change 17), as in the mockup:
 * chevron, bold name, muted layer count, then ⋯ and the eye over the right end
 * on hover or keyboard focus (a hidden group keeps its crossed eye showing).
 * No background at rest, the hover fill on hover. Group opacity is in the ⋯
 * menu (the user's addition), opening the same Opacity card layers use. The
 * menu keeps GeoLibre's group items until 4b rebuilds it (Change 18).
 */
export function LayerGroupHeader({
  group,
  depth,
  isDropTarget,
  moveability,
  sortability,
  moveTargets,
  addDataGroupSources,
  rename,
}: LayerGroupHeaderProps) {
  const { i18n, t } = useTranslation();
  const removeLayerGroup = useAppStore((s) => s.removeLayerGroup);
  const setLayerGroupVisibility = useAppStore((s) => s.setLayerGroupVisibility);
  const setLayerGroupOpacity = useAppStore((s) => s.setLayerGroupOpacity);
  const toggleLayerGroupCollapsed = useAppStore((s) => s.toggleLayerGroupCollapsed);
  const moveLayerGroupToGroup = useAppStore((s) => s.moveLayerGroupToGroup);
  const reorderLayerGroup = useAppStore((s) => s.reorderLayerGroup);
  const sortLayerGroup = useAppStore((s) => s.sortLayerGroup);
  const layerCount = useAppStore((s) => countGroupLayers(s.layers, s.layerGroups, group.id));
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    editingGroupId,
    editingGroupName,
    setEditingGroupName,
    beginGroupRename,
    commitGroupRename,
    cancelGroupRename,
  } = rename;
  const eyeLabel = group.visible
    ? t("layerPanel.hideLayer", { name: group.name })
    : t("layerPanel.showLayer", { name: group.name });
  // ⋯ and the eye show on hover, keyboard focus, touch screens and while the
  // menu is open; a hidden group's eye always shows.
  const reveal =
    "opacity-0 group-hover/grp:opacity-100 group-has-[:focus-visible]/grp:opacity-100 [@media(hover:none)]:opacity-100";
  const actionsShown = menuOpen || !group.visible;
  return (
    <div
      data-group-header=""
      data-testid="layer-group-header"
      data-group-name={group.name}
      data-group-id={group.id}
      // Its level in the layer list's hierarchy; the expanded state is on
      // the collapse toggle, which is where a listitem may carry it.
      role="listitem"
      aria-level={depth + 1}
      className="w-full min-w-0"
      style={depth > 0 ? { paddingInlineStart: `${depth * 20}px` } : undefined}
    >
      <div
        className={cn(
          "group/grp relative flex min-w-0 items-center gap-1.5 rounded-[10px] py-1 pe-1.5 ps-1.5 transition-colors hover:bg-row-hover",
          isDropTarget && "ring-1 ring-inset ring-foreground",
        )}
      >
        <button
          type="button"
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={group.collapsed ? t("layers.expandGroup") : t("layers.collapseGroup")}
          aria-expanded={!group.collapsed}
          onClick={() => toggleLayerGroupCollapsed(group.id)}
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform rtl:rotate-180",
              !group.collapsed && "rotate-90 rtl:rotate-90",
            )}
            strokeWidth={2.25}
          />
        </button>
        {editingGroupId === group.id ? (
          <input
            autoFocus
            type="text"
            className="h-6 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={editingGroupName}
            aria-label={t("layers.renameNamed", { name: group.name })}
            onChange={(e) => setEditingGroupName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitGroupRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commitGroupRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelGroupRename();
              }
            }}
          />
        ) : (
          // The name toggles the group, as in the mockup; double-click renames.
          <button
            type="button"
            tabIndex={-1}
            title={group.name}
            className="flex min-w-0 flex-1 items-baseline gap-1.5 text-start"
            onClick={() => toggleLayerGroupCollapsed(group.id)}
            onDoubleClick={() => beginGroupRename(group)}
          >
            <span
              className={cn(
                "min-w-0 truncate text-[13px] font-semibold",
                !group.visible && "opacity-50",
              )}
            >
              {group.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {layerCount}
            </span>
          </button>
        )}
        {/* ⋯ and eye over the right end, on a short fade matching the row. */}
        <div
          className={cn(
            "absolute end-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 ps-5",
            "bg-gradient-to-l from-background from-70% to-transparent group-hover/grp:from-row-hover",
            !actionsShown && reveal,
          )}
        >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("layers.groupActions")}
                className={cn(
                  "h-6 w-6 rounded-md",
                  !menuOpen && !group.visible && reveal,
                  menuOpen && "bg-foreground text-background hover:bg-foreground/90 hover:text-background",
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              collisionPadding={LAYER_MENU_COLLISION_PADDING}
              className="min-w-[210px] rounded-[10px]"
            >
              <LayerMenuItem
                label={opacityOpen ? t("layerPanel.hideOpacity") : t("layerPanel.opacity")}
                onSelect={() => setOpacityOpen((open) => !open)}
              />
              <DropdownMenuSeparator />
              {/* preventDefault keeps the menu's close from racing the input's autofocus. */}
              <LayerMenuItem
                label={t("layers.renameGroup")}
                onSelect={(e) => {
                  e.preventDefault();
                  beginGroupRename(group);
                }}
              />
              {addDataGroupSources.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className={subTriggerClass}>
                    {t("layers.addDataToGroup")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {addDataGroupSources.map((entry) => (
                      <DropdownMenuItem
                        key={entry.id}
                        onSelect={() => openAddData(entry.id, { groupId: group.id })}
                      >
                        {t(entry.labelKey)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {moveTargets.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className={subTriggerClass}>
                    {t("layers.moveToGroup")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {moveTargets.map((target) => (
                      <LayerMenuItem
                        key={target.id}
                        label={target.name}
                        disabled={group.parentId === target.id}
                        onSelect={() => moveLayerGroupToGroup(group.id, target.id)}
                      />
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {group.parentId && (
                <LayerMenuItem
                  label={t("layers.removeFromGroup")}
                  onSelect={() => moveLayerGroupToGroup(group.id, null)}
                />
              )}
              <LayerMenuItem
                label={t("layers.moveGroupUp")}
                disabled={!moveability?.up}
                onSelect={() => reorderLayerGroup(group.id, "up")}
              />
              <LayerMenuItem
                label={t("layers.moveGroupDown")}
                disabled={!moveability?.down}
                onSelect={() => reorderLayerGroup(group.id, "down")}
              />
              <LayerMenuItem
                label={t("layers.sortGroupAscending")}
                disabled={!sortability?.asc}
                onSelect={() => sortLayerGroup(group.id, "asc", i18n.language)}
              />
              <LayerMenuItem
                label={t("layers.sortGroupDescending")}
                disabled={!sortability?.desc}
                onSelect={() => sortLayerGroup(group.id, "desc", i18n.language)}
              />
              <DropdownMenuSeparator />
              <LayerMenuItem
                label={t("layers.ungroupKeepLayers")}
                onSelect={() => removeLayerGroup(group.id)}
              />
              <LayerMenuItem
                label={t("layers.deleteGroupAndLayers")}
                danger
                onSelect={() => removeLayerGroup(group.id, { removeChildren: true })}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            aria-label={eyeLabel}
            aria-pressed={group.visible}
            title={eyeLabel}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setLayerGroupVisibility(group.id, !group.visible)}
          >
            {group.visible ? (
              <Eye className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <EyeOff className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>
      {opacityOpen ? (
        <div className="pt-1">
          <LayerOpacityCard
            name={group.name}
            opacity={group.opacity}
            onChange={(v) => setLayerGroupOpacity(group.id, v)}
          />
        </div>
      ) : null}
    </div>
  );
}
