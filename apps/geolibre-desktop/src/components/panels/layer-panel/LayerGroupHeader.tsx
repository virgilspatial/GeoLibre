import { type KeyboardEvent as ReactKeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@geolibre/core";
import type { GeoLibreLayer, LayerGroup } from "@geolibre/core";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geolibre/ui";
import { ChevronRight, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import {
  LAYER_MENU_COLLISION_PADDING,
  LayerMenuItem,
  subTriggerClass,
} from "./LayerActionsMenu";
import { layersInGroup } from "./layer-tree";
import { LayerOpacityCard } from "./LayerRowCards";
import type { LayerRename } from "./useLayerRename";

interface LayerGroupHeaderProps {
  group: LayerGroup;
  /** Nesting depth of the group (0 at the top level). */
  depth: number;
  /** Whether a group above this one is hidden, which hides this one too. */
  hiddenByParent: boolean;
  moveability: { up: boolean; down: boolean } | undefined;
  /** Groups this one can be moved into (not itself or a descendant). */
  moveTargets: LayerGroup[];
  rename: Pick<
    LayerRename,
    | "editingGroupId"
    | "editingGroupName"
    | "setEditingGroupName"
    | "beginGroupRename"
    | "commitGroupRename"
    | "cancelGroupRename"
  >;
  onAddSubgroup: (group: LayerGroup) => void;
  onZoomToGroup: (group: LayerGroup) => void;
  onUngroup: (group: LayerGroup) => void;
  onRemoveGroup: (group: LayerGroup) => void;
  /** Move into another group, unless that passes the depth limit. */
  onMoveToGroup: (group: LayerGroup, targetId: string | null) => void;
}

/** How many layers sit in a group, counting those in its subgroups. */
function countGroupLayers(layers: GeoLibreLayer[], groups: LayerGroup[], groupId: string): number {
  return layersInGroup(layers, groups, groupId).length;
}

/** The mockup's full-name tooltip: after about 450ms, only when the name is cut off. */
const NAME_TOOLTIP_DELAY = 450;

/**
 * SWIFTMAP: a group row in the Layers panel (Changes 17 and 18), as in the
 * mockup: chevron, bold name, muted layer count, then ⋯ and the eye over the
 * right end on hover or keyboard focus (a hidden group keeps its crossed eye
 * showing). The ⋯ menu is the mockup's (Rename, Add subgroup, Zoom to group,
 * Ungroup, Remove group) plus Opacity, and GeoLibre's Move items, kept as the
 * way to do without dragging what a drag does (Change 18, G2 and G3). An empty
 * group shows no placeholder; its "0" count says so (Change 22).
 */
export function LayerGroupHeader({
  group,
  depth,
  hiddenByParent,
  moveability,
  moveTargets,
  rename,
  onAddSubgroup,
  onZoomToGroup,
  onUngroup,
  onRemoveGroup,
  onMoveToGroup,
}: LayerGroupHeaderProps) {
  const { t } = useTranslation();
  const setLayerGroupVisibility = useAppStore((s) => s.setLayerGroupVisibility);
  const setLayerGroupOpacity = useAppStore((s) => s.setLayerGroupOpacity);
  const toggleLayerGroupCollapsed = useAppStore((s) => s.toggleLayerGroupCollapsed);
  const reorderLayerGroup = useAppStore((s) => s.reorderLayerGroup);
  const layerCount = useAppStore((s) => countGroupLayers(s.layers, s.layerGroups, group.id));
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nameTipOpen, setNameTipOpen] = useState(false);
  const nameRef = useRef<HTMLSpanElement>(null);
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
  const dimmed = !group.visible || hiddenByParent;
  // ⋯ and the eye show on hover, keyboard focus, touch screens and while the
  // menu is open; a hidden group's eye always shows.
  const reveal =
    "opacity-0 group-hover/grp:opacity-100 group-has-[:focus-visible]/grp:opacity-100 [@media(hover:none)]:opacity-100";
  const actionsShown = menuOpen || !group.visible;

  // F2 renames and Delete removes the group while focus is on its row.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.target instanceof HTMLInputElement) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "F2") {
      event.preventDefault();
      beginGroupRename(group);
    } else if (event.key === "Delete") {
      event.preventDefault();
      onRemoveGroup(group);
    }
  };

  return (
    <div
      data-group-header=""
      data-testid="layer-group-header"
      data-group-name={group.name}
      data-group-id={group.id}
      data-drag-key={`group:${group.id}`}
      // Its level in the layer list's hierarchy; the expanded state is on
      // the collapse toggle, which is where a listitem may carry it.
      role="listitem"
      aria-level={depth + 1}
      className="w-full min-w-0"
      style={depth > 0 ? { paddingInlineStart: `${depth * 20}px` } : undefined}
      onKeyDown={handleKeyDown}
    >
      <div
        data-drag-grip=""
        className="group/grp relative flex min-w-0 items-center gap-1.5 rounded-[10px] py-1 pe-1.5 ps-1.5 transition-colors hover:bg-row-hover"
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
          <Tooltip
            open={nameTipOpen}
            delayDuration={NAME_TOOLTIP_DELAY}
            onOpenChange={(open) => {
              const name = nameRef.current;
              setNameTipOpen(open && !!name && name.scrollWidth > name.clientWidth);
            }}
          >
            <TooltipTrigger asChild>
              {/* The name toggles the group, as in the mockup; double-click renames. */}
              <button
                type="button"
                tabIndex={-1}
                data-drag-ok=""
                className="flex min-w-0 flex-1 items-baseline gap-1.5 text-start"
                onClick={() => toggleLayerGroupCollapsed(group.id)}
                onDoubleClick={() => beginGroupRename(group)}
              >
                <span
                  ref={nameRef}
                  className={cn(
                    "min-w-0 truncate text-[13px] font-semibold",
                    dimmed && "opacity-50",
                  )}
                >
                  {group.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs text-muted-foreground tabular-nums",
                    dimmed && "opacity-50",
                  )}
                >
                  {layerCount}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="rounded-lg px-2.5 py-1.5 text-xs font-medium">
              {group.name}
            </TooltipContent>
          </Tooltip>
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
                label={t("layerPanel.rename")}
                shortcut="F2"
                onSelect={(e) => {
                  e.preventDefault();
                  beginGroupRename(group);
                }}
              />
              <LayerMenuItem
                label={t("layerPanel.addSubgroup")}
                onSelect={() => onAddSubgroup(group)}
              />
              <LayerMenuItem
                label={t("layerPanel.zoomToGroup")}
                disabled={layerCount === 0}
                onSelect={() => onZoomToGroup(group)}
              />
              <LayerMenuItem label={t("layerPanel.ungroup")} onSelect={() => onUngroup(group)} />
              {/* Kept from GeoLibre: the way to move a group without dragging. */}
              <DropdownMenuSeparator />
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
                        onSelect={() => onMoveToGroup(group, target.id)}
                      />
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {group.parentId && (
                <LayerMenuItem
                  label={t("layers.removeFromGroup")}
                  onSelect={() => onMoveToGroup(group, null)}
                />
              )}
              <DropdownMenuSeparator />
              <LayerMenuItem
                label={t("layerPanel.removeGroup")}
                shortcut="Del"
                danger
                onSelect={() => onRemoveGroup(group)}
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
