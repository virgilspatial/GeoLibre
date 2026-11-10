import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import {
  pluginOwnsPaint,
  resolveLayerCapabilities,
  useAppStore,
  layerGroupDepth,
  layerGroupMoveability,
  layerPanelGroupHeaders,
} from "@geolibre/core";
import type { GeoLibreLayer, LayerGroup } from "@geolibre/core";
import { getTemporalLayersVersion, subscribeTemporalLayers } from "@geolibre/plugins";
import { getLayerBounds, type MapEngine } from "@geolibre/map";
import { getIsMobileViewport } from "../../hooks/useIsMobileViewport";
import type { ThemeMode } from "../../hooks/useThemeMode";
import { usePluginRegistry } from "../../hooks/usePlugins";
import { canOpenLayerAttributeTable } from "../../lib/attribute-table-source";
import { isMacPlatform } from "../../lib/commands";
import { notify } from "../../lib/notify";
import { canExportRasterLayer } from "../../lib/raster-export";
import { Button, cn, ScrollArea } from "@geolibre/ui";
import { Layers, PanelLeftOpen } from "lucide-react";
import { EmptyLayers } from "./layer-panel/EmptyLayers";
import { participantCanEditLayer } from "../../lib/collab-protocol";
import type { CollaborationApi } from "../../hooks/useCollaboration";
import { useSidePanelStore } from "../layout/rail/sidePanelStore";
import { useMapCapabilities } from "../../hooks/useMapCapabilities";
import { BasemapCard } from "../basemap/BasemapCard";
import { useOverflowing } from "../basemap/use-overflowing";
import { BindTimeSliderDialog } from "./layer-panel/BindTimeSliderDialog";
import type { LayerActionsMenuShared, LayerCard } from "./layer-panel/LayerActionsMenu";
import { LayerGroupHeader } from "./layer-panel/LayerGroupHeader";
import { LayerHoverControls } from "./layer-panel/LayerHoverControls";
import { LayerPanelHeader } from "./layer-panel/LayerPanelHeader";
import { LayerRow } from "./layer-panel/LayerRow";
import { LayerSearchField } from "./layer-panel/LayerSearchField";
import { matchLayerShortcut, type LayerShortcutId } from "./layer-panel/layer-shortcuts";
import {
  RefreshSettingsDialog,
  useRefreshSettingsDialog,
} from "./layer-panel/RefreshSettingsDialog";
import { RemoveGroupDialog, removeGroupAndContents } from "./layer-panel/RemoveGroupDialog";
import { RemoveLayerDialog } from "./layer-panel/RemoveLayerDialog";
import { removeLayerWithUndo, undoRestoresLayer } from "./layer-panel/layer-removal";
import {
  buildLayerTree,
  childrenAt,
  detachNode,
  engineKeepsTree,
  findGroupNode,
  groupLevel,
  insertNode,
  layersInGroup,
  MAX_GROUP_LEVELS,
  stepLayer,
  withinDepthLimit,
  writeLayerTree,
} from "./layer-panel/layer-tree";
import { useRowDrag } from "./layer-panel/useRowDrag";
import { useLayerActions } from "./layer-panel/useLayerActions";
import type { LayerRefresh } from "./layer-panel/useLayerRefresh";
import { useLayerRename } from "./layer-panel/useLayerRename";
import { useTimeSliderBinding } from "./layer-panel/useTimeSliderBinding";
import { useDrawOrderHint } from "../draw-order/useDrawOrderHint";
import { setLayersPanelCollapsed } from "../../lib/layer-panel-collapse";

interface LayerPanelProps {
  /** Unused since Change 28 (the Blank background dialog went with the Background row). */
  themeMode: ThemeMode;
  mapControllerRef: RefObject<MapEngine | null>;
  refresh: LayerRefresh;
  collaborationApi?: CollaborationApi;
  /**
   * Drag handler for the panel's own resize edge. SWIFTMAP: optional; leave it
   * out when a container (Swiftmap's side panel, Change 16) owns the resizing,
   * and the edge is not drawn.
   */
  onResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** Id of the layer currently in a geometry-edit session, or null. */
  geometryEditLayerId: string | null;
  /** Toggle in-place geometry editing for a layer (toggling off saves). */
  onToggleGeometryEdit: (layerId: string) => void;
  /** Discard the active geometry-edit session without saving. */
  onCancelGeometryEdit: () => void;
  /** Materialize a DuckDB query layer into an editable GeoJSON layer. */
  onMaterializeDuckDBLayer: (layer: GeoLibreLayer) => void;
  /** Open the floating Add Raster Layer panel for advanced raster styling. */
  onOpenRasterStylePanel: () => void;
  /**
   * Select the target layer and expand the built-in Style panel. Left undefined
   * when that panel is hidden (Settings → "Show Style panel").
   */
  onOpenStylePanel?: () => void;
  /**
   * SWIFTMAP: no longer offered (Extract subset was dropped, Change 17); kept so
   * the shell's call sites still type-check.
   */
  onOpenRasterSubset?: (layer: GeoLibreLayer) => void;
  /**
   * When this flips to `true` the panel collapses to its thin rail (it is not
   * unmounted). Used to clear room for a story map presentation.
   */
  autoCollapse?: boolean;
  /**
   * Controlled collapse state for the shared left-sidebar mode. When defined,
   * the parent fully owns expand/collapse.
   */
  collapsed?: boolean;
  /** Notify the parent of a collapse/expand request in controlled mode. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** In the shared left-sidebar mode, render nothing when collapsed. */
  hideOwnRail?: boolean;
}

/**
 * SWIFTMAP: the layer types whose copy GeoLibre draws straight from the store
 * record, so Duplicate can add one (Change 17). Layers a map control draws
 * (rasters, point clouds, Add Vector Layer files…) are left out: a copied
 * record would show in the panel with nothing on the map.
 */
const DUPLICABLE_TYPES = new Set<GeoLibreLayer["type"]>([
  "geojson",
  "vector-tiles",
  "wms",
  "wmts",
  "xyz",
  "image",
]);

function canDuplicateLayer(layer: GeoLibreLayer): boolean {
  return (
    DUPLICABLE_TYPES.has(layer.type) &&
    layer.metadata.externalNativeLayer !== true &&
    !pluginOwnsPaint(layer)
  );
}

/** Whether a key press comes from somewhere the panel's shortcuts must not act. */
function isShortcutExcludedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="combobox"], input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ),
  );
}

/** Whether a key press comes from inside the row of the layer with this id. */
function isInLayerRow(target: EventTarget | null, layerId: string): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId === layerId;
}

export function LayerPanel({
  mapControllerRef,
  refresh,
  collaborationApi,
  onResizeStart,
  geometryEditLayerId,
  onToggleGeometryEdit,
  onCancelGeometryEdit,
  onMaterializeDuckDBLayer,
  onOpenRasterStylePanel,
  onOpenStylePanel,
  autoCollapse = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  hideOwnRail = false,
}: LayerPanelProps) {
  const { t } = useTranslation();
  const isMac = useMemo(() => isMacPlatform(), []);
  const addDataAvailable = useSidePanelStore((s) => s.addDataAvailable);
  // SWIFTMAP (Change 36): explains once why a reorder didn't change the map.
  useDrawOrderHint();
  const layers = useAppStore((s) => s.layers);
  const layerGroups = useAppStore((s) => s.layerGroups);
  // The 3D globe and the ArcGIS view draw a subset of the layer kinds MapLibre
  // does; a row's load-failure note is suppressed for kinds they draw themselves.
  // eslint-disable-next-line local/no-renderer-kind-checks -- selects the engine's layer support table
  const cesiumPrimary = useAppStore((s) => s.primaryRenderer === "cesium");
  // eslint-disable-next-line local/no-renderer-kind-checks -- selects the engine's layer support table
  const arcgisPrimary = useAppStore((s) => s.primaryRenderer === "arcgis");
  const capabilities = useMapCapabilities(mapControllerRef);
  const selectedLayerId = useAppStore((s) => s.selectedLayerId);
  const selectLayer = useAppStore((s) => s.selectLayer);
  const identifyLayerId = useAppStore((s) => s.identifyLayerId);
  const addLayerGroup = useAppStore((s) => s.addLayerGroup);
  const removeLayerGroup = useAppStore((s) => s.removeLayerGroup);
  const moveLayerGroupToGroup = useAppStore((s) => s.moveLayerGroupToGroup);
  const toggleLayerGroupCollapsed = useAppStore((s) => s.toggleLayerGroupCollapsed);
  const setAttributeTableOpen = useAppStore((s) => s.setAttributeTableOpen);
  const setRasterAttributeTableOpen = useAppStore((s) => s.setRasterAttributeTableOpen);
  const collaboration = useAppStore((s) => s.collaboration);
  const selfParticipant = useMemo(() => {
    if (!collaboration.isActive || !collaboration.clientId) return null;
    return collaboration.participants.find((p) => p.clientId === collaboration.clientId) ?? null;
  }, [collaboration.isActive, collaboration.clientId, collaboration.participants]);

  const canEditLayer = useCallback(
    (layerId: string): boolean => {
      if (!collaboration.isActive) return true;
      if (collaborationApi?.canEditLayer) return collaborationApi.canEditLayer(layerId);
      if (!selfParticipant) {
        if (collaboration.role === "host") return true;
        return (
          collaboration.mode === "co-edit" &&
          !(collaboration.lockedLayerIds ?? []).includes(layerId)
        );
      }
      return participantCanEditLayer(
        selfParticipant,
        collaboration.mode,
        layerId,
        collaboration.lockedLayerIds ?? [],
      );
    },
    [
      collaboration.isActive,
      collaboration.role,
      collaboration.mode,
      collaboration.lockedLayerIds,
      selfParticipant,
      collaborationApi,
    ],
  );

  const [layerPendingRemoval, setLayerPendingRemoval] = useState<GeoLibreLayer | null>(null);
  const [groupPendingRemoval, setGroupPendingRemoval] = useState<LayerGroup | null>(null);
  // SWIFTMAP: search, and the selected layer's card and menu (Change 17).
  const [query, setQuery] = useState("");
  const [openCard, setOpenCard] = useState<LayerCard | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // A new selection starts with its toolbar only: no card, no menu.
  useEffect(() => {
    setOpenCard(null);
    setMenuOpen(false);
    setExportOpen(false);
  }, [selectedLayerId]);
  // A layer becomes temporal when its renderer finishes resolving a time axis,
  // outside the store, so the menu subscribes to offer "Bind to Time Slider".
  useSyncExternalStore(subscribeTemporalLayers, getTemporalLayersVersion, getTemporalLayersVersion);
  const { isActive: isPluginActive, toggle: togglePlugin } = usePluginRegistry();
  const [internalCollapsed, setInternalCollapsed] = useState(getIsMobileViewport);
  const isControlled = controlledCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledCollapsed : internalCollapsed;
  const setIsCollapsed = useCallback(
    (value: boolean) => {
      if (isControlled) onCollapsedChange?.(value);
      else setInternalCollapsed(value);
    },
    [isControlled, onCollapsedChange],
  );
  // Publish the collapse state for Export as HTML (see layer-panel-collapse).
  useEffect(() => {
    setLayersPanelCollapsed(isCollapsed);
    return () => setLayersPanelCollapsed(false);
  }, [isCollapsed]);
  // Collapse when `autoCollapse` flips on (a story map starts presenting) and
  // restore the prior state when it flips off. Skipped in controlled mode.
  const prevAutoCollapse = useRef<boolean | null>(null);
  const collapsedBeforeAuto = useRef(internalCollapsed);
  useEffect(() => {
    if (isControlled) return;
    const wasAuto = prevAutoCollapse.current;
    prevAutoCollapse.current = autoCollapse;
    if (autoCollapse && !wasAuto) {
      collapsedBeforeAuto.current = internalCollapsed;
      setInternalCollapsed(true);
    } else if (!autoCollapse && wasAuto) {
      setInternalCollapsed(collapsedBeforeAuto.current);
    }
  }, [autoCollapse, internalCollapsed, isControlled]);

  // Single selection, as in the mockup (Shift/Ctrl multi-select was dropped,
  // item 24): the store's selected layer is the only one.
  const toggleSelect = useCallback(
    (layerId: string) => selectLayer(selectedLayerId === layerId ? null : layerId),
    [selectLayer, selectedLayerId],
  );
  const rename = useLayerRename(layers, layerGroups);
  const actions = useLayerActions({
    mapControllerRef,
    canEditLayer,
    setRefreshStatuses: refresh.setRefreshStatuses,
    clearRefreshStatusTimer: refresh.clearRefreshStatusTimer,
    scheduleStatusClear: refresh.scheduleStatusClear,
    markMssqlRefreshRequired: refresh.markMssqlRefreshRequired,
    isPluginActive,
    togglePlugin,
  });
  const binding = useTimeSliderBinding({ layers, mapControllerRef });
  const refreshSettings = useRefreshSettingsDialog(layers);

  // SWIFTMAP: search keeps each match's groups, expanded (Change 17).
  const trimmedQuery = query.trim().toLowerCase();
  const searching = trimmedQuery.length > 0;
  const matchingLayers = useMemo(
    () =>
      searching ? layers.filter((layer) => layer.name.toLowerCase().includes(trimmedQuery)) : layers,
    [layers, searching, trimmedQuery],
  );
  const displayGroups = useMemo(() => {
    if (!searching) return layerGroups;
    const byId = new Map(layerGroups.map((g) => [g.id, g] as const));
    const keep = new Set<string>();
    for (const layer of matchingLayers) {
      let id = layer.groupId;
      while (id && !keep.has(id)) {
        keep.add(id);
        id = byId.get(id)?.parentId;
      }
    }
    return layerGroups.filter((g) => keep.has(g.id)).map((g) => ({ ...g, collapsed: false }));
  }, [layerGroups, matchingLayers, searching]);
  const displayLayers = useMemo(() => [...matchingLayers].reverse(), [matchingLayers]);

  const groupById = useMemo(
    () => new Map(displayGroups.map((g) => [g.id, g] as const)),
    [displayGroups],
  );
  const groupDepth = useCallback(
    (group: LayerGroup) => layerGroupDepth(group, groupById),
    [groupById],
  );
  const hasCollapsedAncestor = useCallback(
    (group: LayerGroup) => {
      let parentId = group.parentId;
      const visited = new Set([group.id]);
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = groupById.get(parentId);
        if (!parent) return false;
        if (parent.collapsed) return true;
        parentId = parent.parentId;
      }
      return false;
    },
    [groupById],
  );
  const groupMoveTargets = useCallback(
    (group: LayerGroup) =>
      layerGroups.filter((candidate) => {
        if (candidate.id === group.id) return false;
        let parentId: string | undefined = candidate.parentId;
        const visited = new Set<string>();
        while (parentId && !visited.has(parentId)) {
          if (parentId === group.id) return false;
          visited.add(parentId);
          parentId = layerGroups.find((g) => g.id === parentId)?.parentId;
        }
        return true;
      }),
    [layerGroups],
  );
  // Every group header comes from one core walk, anchored to the layer row it
  // is drawn above (GeoLibre#1739).
  const groupHeaders = useMemo(
    () => layerPanelGroupHeaders(matchingLayers, displayGroups),
    [matchingLayers, displayGroups],
  );
  const groupMoveability = useMemo(
    () => layerGroupMoveability(layers, layerGroups),
    [layers, layerGroups],
  );
  // SWIFTMAP: the panel as a tree, for empty groups and the group menu (Change 18).
  const tree = useMemo(() => buildLayerTree(layers, layerGroups), [layers, layerGroups]);
  // SWIFTMAP: where each layer's Move up and Move down can go (Change 22).
  const layerMoveability = useMemo(
    () =>
      new Map(
        layers.map((layer) => [
          layer.id,
          {
            up: stepLayer(tree, layers, layerGroups, layer.id, "up") !== null,
            down: stepLayer(tree, layers, layerGroups, layer.id, "down") !== null,
          },
        ]),
      ),
    [tree, layers, layerGroups],
  );
  const moveLayerStep = (id: string, direction: "up" | "down") => {
    const state = useAppStore.getState();
    const current = buildLayerTree(state.layers, state.layerGroups);
    const next = stepLayer(current, state.layers, state.layerGroups, id, direction);
    if (!next) return;
    useAppStore.setState({ ...writeLayerTree(next, state.layers, state.layerGroups), isDirty: true });
  };
  const allGroupsById = useMemo(
    () => new Map(layerGroups.map((g) => [g.id, g] as const)),
    [layerGroups],
  );
  const hiddenByParent = useCallback(
    (group: LayerGroup) => {
      let parentId = group.parentId;
      const seen = new Set([group.id]);
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        const parent = allGroupsById.get(parentId);
        if (!parent) return false;
        if (!parent.visible) return true;
        parentId = parent.parentId;
      }
      return false;
    },
    [allGroupsById],
  );

  const warnDepthLimit = useCallback(
    () => notify.info(t("layerPanel.groupDepthLimit", { max: MAX_GROUP_LEVELS })),
    [t],
  );

  // Add subgroup: a new, empty group at the top of this one (as in the
  // mockup), or as near the top as the engine keeps it.
  const addSubgroup = (group: LayerGroup) => {
    if (groupLevel(layerGroups, group.id) >= MAX_GROUP_LEVELS) {
      warnDepthLimit();
      return;
    }
    const id = addLayerGroup(t("layerPanel.newGroup"));
    const state = useAppStore.getState();
    const { tree: detached, node } = detachNode(
      buildLayerTree(state.layers, state.layerGroups),
      `group:${id}`,
    );
    const siblings = childrenAt(detached, group.id) ?? [];
    let placed = false;
    for (let index = 0; node && !placed && index <= siblings.length; index++) {
      const next = insertNode(detached, node, { parentId: group.id, index });
      if (next && engineKeepsTree(next, state.layers, state.layerGroups)) {
        useAppStore.setState({
          ...writeLayerTree(next, state.layers, state.layerGroups),
          isDirty: true,
        });
        placed = true;
      }
    }
    if (!placed) moveLayerGroupToGroup(id, group.id);
    if (group.collapsed) toggleLayerGroupCollapsed(group.id);
  };

  const zoomToGroup = (group: LayerGroup) => {
    const controller = mapControllerRef.current;
    if (!controller) return;
    const members = layersInGroup(layers, layerGroups, group.id);
    // One layer: the map's own fit, which knows tile zoom limits and 3D tiles.
    if (members.length === 1) {
      if (!controller.fitLayer(members[0])) {
        notify.info(t("layerPanel.zoomToGroupUnknownExtent", { name: group.name }));
      }
      return;
    }
    // Several: the box around every layer whose extent is known.
    let box: [number, number, number, number] | null = null;
    for (const layer of members) {
      const bounds = getLayerBounds(layer);
      if (!bounds) continue;
      box = box
        ? [
            Math.min(box[0], bounds[0]),
            Math.min(box[1], bounds[1]),
            Math.max(box[2], bounds[2]),
            Math.max(box[3], bounds[3]),
          ]
        : bounds;
    }
    if (box) controller.fitBounds(box);
    else notify.info(t("layerPanel.zoomToGroupUnknownExtent", { name: group.name }));
  };

  // Ungroup: what the group held takes its place, inside its parent (GeoLibre
  // moved the layers to the top level).
  const ungroup = (group: LayerGroup) => {
    const state = useAppStore.getState();
    const current = buildLayerTree(state.layers, state.layerGroups);
    const { tree: detached, node, from } = detachNode(current, `group:${group.id}`);
    if (node?.kind === "group" && from) {
      const siblings = childrenAt(detached, from.parentId);
      siblings?.splice(from.index, 0, ...node.children);
      useAppStore.setState({
        ...writeLayerTree(detached, state.layers, state.layerGroups),
        isDirty: true,
      });
    }
    removeLayerGroup(group.id);
  };

  // A group with layers asks first (G6); an empty one goes straight away.
  const removeGroup = (group: LayerGroup) => {
    if (layersInGroup(layers, layerGroups, group.id).length > 0) setGroupPendingRemoval(group);
    else removeGroupAndContents(group.id);
  };

  const moveGroupToGroup = (group: LayerGroup, targetId: string | null) => {
    const node = findGroupNode(tree, group.id);
    if (targetId && node && !withinDepthLimit(layerGroups, node, targetId)) {
      warnDepthLimit();
      return;
    }
    moveLayerGroupToGroup(group.id, targetId);
  };

  const renderGroupHeader = (group: LayerGroup) => {
    if (hasCollapsedAncestor(group)) return null;
    return (
      <LayerGroupHeader
        group={group}
        depth={groupDepth(group)}
        hiddenByParent={hiddenByParent(group)}
        moveability={groupMoveability.get(group.id)}
        moveTargets={groupMoveTargets(group)}
        rename={rename}
        onAddSubgroup={addSubgroup}
        onZoomToGroup={zoomToGroup}
        onUngroup={ungroup}
        onRemoveGroup={removeGroup}
        onMoveToGroup={moveGroupToGroup}
      />
    );
  };

  // SWIFTMAP: drag and drop (Change 18). Off while searching.
  const listRef = useRef<HTMLDivElement>(null);
  const listOverflows = useOverflowing(listRef, "[data-radix-scroll-area-viewport]");
  const drag = useRowDrag({
    listRef,
    enabled: !searching,
    canDrag: (key) => {
      const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      if (kind === "layer") return canEditLayer(id) && rename.editingLayerId !== id;
      return rename.editingGroupId !== id;
    },
    onDepthLimit: warnDepthLimit,
  });

  const toggleCard = useCallback(
    (card: LayerCard) => setOpenCard((current) => (current === card ? null : card)),
    [],
  );

  const duplicateLayer = (layer: GeoLibreLayer) => {
    const { layers: current, addLayer } = useAppStore.getState();
    const index = current.findIndex((candidate) => candidate.id === layer.id);
    if (index < 0) return;
    let copy: GeoLibreLayer;
    try {
      copy = structuredClone(layer);
    } catch (error) {
      console.warn("[Swiftmap] Could not copy the layer", error);
      notify.error(t("layerPanel.duplicateUnavailable"));
      return;
    }
    // The copy is a new layer: its own id and name, and no sync record (that
    // belongs to the original's connection).
    const { connection: _connection, ...rest } = copy;
    // Inserting before the layer above the original puts the copy directly
    // above it in the panel, in the same group.
    addLayer(
      {
        ...rest,
        id: `layer-${crypto.randomUUID()}`,
        name: t("layerPanel.copyName", { name: layer.name }),
      },
      current[index + 1]?.id ?? null,
    );
  };

  const runAction = (id: LayerShortcutId, layer: GeoLibreLayer) => {
    const editable = canEditLayer(layer.id);
    switch (id) {
      case "attributeTable": {
        selectLayer(layer.id);
        if (canOpenLayerAttributeTable(layer)) setAttributeTableOpen(true);
        else if (resolveLayerCapabilities(layer).export && canExportRasterLayer(layer)) {
          setRasterAttributeTableOpen(true);
        }
        return;
      }
      case "opacity":
      case "properties":
        toggleCard(id);
        return;
      case "rename":
        if (editable) rename.beginRename(layer);
        return;
      case "duplicate":
        if (editable && canDuplicateLayer(layer)) duplicateLayer(layer);
        return;
      // SWIFTMAP (Change 22): one place among its siblings, never past the
      // top or bottom of its group (GeoLibre's reorderLayer moved the group).
      case "moveUp":
        if (editable) moveLayerStep(layer.id, "up");
        return;
      case "moveDown":
        if (editable) moveLayerStep(layer.id, "down");
        return;
      case "addToNewGroup":
        if (editable) addLayerGroup(undefined, [layer.id]);
        return;
      case "export":
        setMenuOpen(true);
        setExportOpen(true);
        return;
      case "remove":
        // The bin, the ⋯ item and Delete all land here (Change 40): removed at
        // once with an Undo message when Undo restores the layer in full,
        // otherwise GeoLibre's confirmation (Change 17).
        if (!editable) return;
        if (undoRestoresLayer(layer)) removeLayerWithUndo(layer, t);
        else setLayerPendingRemoval(layer);
        return;
    }
  };

  // Shortcuts act only while focus is in the panel, never on the map or other
  // panels; menus, dialogs and text fields are left alone.
  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || isShortcutExcludedTarget(event.target)) return;
    if (event.key === "Escape") {
      if (selectedLayerId) {
        event.preventDefault();
        selectLayer(null);
      }
      return;
    }
    const layer = layers.find((candidate) => candidate.id === selectedLayerId);
    if (!layer) return;
    const shortcut = matchLayerShortcut(event.nativeEvent, isMac);
    if (!shortcut) return;
    // Delete removes at once now (Change 40), so it acts only from the selected
    // layer's own row, never from the header or another layer's row.
    if (shortcut === "remove" && !isInLayerRow(event.target, layer.id)) return;
    event.preventDefault();
    runAction(shortcut, layer);
  };

  // Clicking the empty space below the rows deselects.
  const handleListClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // React bubbles clicks from portals (the ⋯ menu, dialogs) through here too.
    if (!event.currentTarget.contains(target)) return;
    if (target.closest("[data-layer-id], [data-group-id], [role='listitem'], button, input, a")) {
      return;
    }
    if (selectedLayerId) selectLayer(null);
  };

  const menu: LayerActionsMenuShared = {
    mapControllerRef,
    layers,
    layerGroups,
    actions,
    handleRefreshLayer: refresh.handleRefreshLayer,
    openBindTimeSliderDialog: binding.openBindTimeSliderDialog,
    beginRename: rename.beginRename,
    setRefreshSettingsLayerId: refreshSettings.setRefreshSettingsLayerId,
    onToggleGeometryEdit,
    onMaterializeDuckDBLayer,
    onOpenStylePanel,
    onOpenRasterStylePanel,
    toggleCard,
    openCard,
    runAction,
    isMac,
  };

  if (isCollapsed) {
    if (hideOwnRail) return null;
    return (
      <aside
        aria-label={t("layers.panelCollapsedLabel")}
        className="flex h-11 w-full shrink-0 items-center gap-2 border-b bg-card px-2 md:h-auto md:w-11 md:flex-col md:border-b-0 md:border-e md:py-2"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t("layers.expand")}
          aria-label={t("layers.expand")}
          onClick={() => setIsCollapsed(false)}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-muted-foreground md:mt-3 md:flex-col">
          <Layers className="h-4 w-4" />
          <span className="text-[10px] font-semibold uppercase tracking-wide md:[writing-mode:vertical-rl] md:rotate-180">
            {t("sharedRail.layers")}
          </span>
        </div>
      </aside>
    );
  }

  return (
    // The header takes the `auto` row and the layer list `minmax(0, 1fr)`, so
    // only the list shrinks and scrolls; the separator and place search fall
    // into implicit rows below it.
    <aside
      aria-label={t("sharedRail.layers")}
      onKeyDown={handlePanelKeyDown}
      className="relative grid grid-cols-[minmax(0,1fr)] max-h-[min(24rem,42vh)] supports-[max-height:1dvh]:max-h-[min(24rem,42dvh)] w-full shrink-0 grid-rows-[auto_minmax(0,1fr)] border-b bg-background max-md:absolute max-md:inset-x-0 max-md:top-0 max-md:z-30 max-md:shadow-xl md:max-h-none md:w-[var(--layer-panel-width)] md:border-b-0 md:border-e"
    >
      {onResizeStart ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("layers.resizePanel")}
          className="absolute -end-1 top-0 z-20 hidden h-full w-2 cursor-col-resize touch-none select-none border-e border-transparent hover:border-primary md:block"
          onPointerDown={onResizeStart}
        />
      ) : null}
      <div className="px-3 pt-3.5">
        <LayerPanelHeader
          onCreateGroup={rename.handleCreateGroup}
          canAddData={addDataAvailable}
        />
        {layers.length > 0 ? (
          <LayerSearchField
            query={query}
            onQueryChange={setQuery}
            shown={matchingLayers.length}
            total={layers.length}
          />
        ) : null}
        {/* Kept as GeoLibre has it: shown only when a layer has hover tips. */}
        <LayerHoverControls className="px-1.5 pb-2" />
      </div>
      <ScrollArea
        className="min-h-0 [&_[data-radix-scroll-area-viewport]]:touch-pan-y [&_[data-radix-scroll-area-viewport]]:overscroll-contain [&_[data-radix-scroll-area-viewport]>div]:block! [&_[data-radix-scroll-area-viewport]>div]:w-full! [&_[data-radix-scroll-area-viewport]>div]:min-w-0!"
        onClick={handleListClick}
      >
        {/* SWIFTMAP (Change 34): an "Add data" button now that Add Data left the rail. */}
        {layers.length === 0 ? <EmptyLayers canAddData={addDataAvailable} /> : null}
        {searching && matchingLayers.length === 0 ? (
          <div className="flex flex-col items-start gap-1.5 px-5 py-2.5 text-[13px] text-muted-foreground">
            <span>{t("layerPanel.noMatch", { query: query.trim() })}</span>
            <button
              type="button"
              className="text-[13px] font-medium text-foreground underline"
              onClick={() => setQuery("")}
            >
              {t("layerPanel.clearSearch")}
            </button>
          </div>
        ) : null}
        {/* Rows and group headers are listitems carrying their nesting depth
            as aria-level. */}
        <div
          ref={listRef}
          data-layer-list=""
          role="list"
          aria-label={t("sharedRail.layers")}
          className={cn(
            "relative flex w-full min-w-0 select-none flex-col gap-px px-3 pb-3",
            drag.dragging && "cursor-grabbing [&_*]:cursor-grabbing",
          )}
          onPointerDown={drag.onPointerDown}
        >
          {displayLayers.map((layer) => {
            const group = layer.groupId ? groupById.get(layer.groupId) : undefined;
            const groupCollapsed = group?.collapsed ?? false;
            const groupAncestorCollapsed = group ? hasCollapsedAncestor(group) : false;
            const selected = selectedLayerId === layer.id;
            return (
              <Fragment key={layer.id}>
                {groupHeaders.aboveLayer.get(layer.id)?.map((header) => (
                  <Fragment key={header.id}>{renderGroupHeader(header)}</Fragment>
                ))}
                {!groupCollapsed && !groupAncestorCollapsed && (
                  <LayerRow
                    layer={layer}
                    moveability={layerMoveability.get(layer.id)}
                    group={group}
                    groupById={groupById}
                    groupDepth={groupDepth}
                    selected={selected}
                    onToggleSelect={toggleSelect}
                    editing={rename.editingLayerId === layer.id}
                    editingName={rename.editingName}
                    setEditingName={rename.setEditingName}
                    commitRename={rename.commitRename}
                    cancelRename={rename.cancelRename}
                    transientRefreshStatus={refresh.refreshStatuses[layer.id]}
                    identifyLayerId={identifyLayerId}
                    geometryEditLayerId={geometryEditLayerId}
                    onToggleGeometryEdit={onToggleGeometryEdit}
                    onCancelGeometryEdit={onCancelGeometryEdit}
                    cesiumPrimary={cesiumPrimary}
                    arcgisPrimary={arcgisPrimary}
                    deckOverlay={capabilities.deckOverlay}
                    canEditLayer={canEditLayer}
                    canDuplicate={canDuplicateLayer(layer)}
                    menuOpen={selected && menuOpen}
                    setMenuOpen={setMenuOpen}
                    exportOpen={selected && exportOpen}
                    setExportOpen={setExportOpen}
                    menu={menu}
                  />
                )}
              </Fragment>
            );
          })}
          {/* Headers placed below the last layer row: the panel has no layer
              left to anchor them above. */}
          {groupHeaders.bottom.map((group) => (
            <Fragment key={group.id}>{renderGroupHeader(group)}</Fragment>
          ))}
          {/* Where a drop lands: a 2px line in the gap the rows open. */}
          {drag.indicator?.kind === "line" ? (
            <div
              data-drag-overlay=""
              data-testid="layer-drop-line"
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-3 h-0.5 rounded-full bg-foreground"
              style={{ top: drag.indicator.top }}
            />
          ) : null}
          {/* The group a drop goes into, outlined over its row (which shows
              its hover fill under the pointer). */}
          {drag.indicator?.kind === "outline" ? (
            <div
              data-drag-overlay=""
              data-testid="layer-drop-outline"
              aria-hidden="true"
              className="pointer-events-none absolute z-10 rounded-[10px] border-2 border-foreground"
              style={{
                top: drag.indicator.top,
                left: drag.indicator.left,
                width: drag.indicator.width,
                height: drag.indicator.height,
              }}
            />
          ) : null}
        </div>
      </ScrollArea>
      {/* SWIFTMAP (Change 28): the Basemap card replaces GeoLibre's Background
          row, fixed at the bottom below the scrolling list. */}
      <BasemapCard divider={listOverflows} />
      <BindTimeSliderDialog binding={binding} />
      <RefreshSettingsDialog
        settings={refreshSettings}
        setRefreshInterval={refresh.setRefreshInterval}
        setRefreshFailurePolicy={refresh.setRefreshFailurePolicy}
      />
      <RemoveLayerDialog layer={layerPendingRemoval} onClose={() => setLayerPendingRemoval(null)} />
      <RemoveGroupDialog
        group={groupPendingRemoval}
        layerCount={
          groupPendingRemoval
            ? layersInGroup(layers, layerGroups, groupPendingRemoval.id).length
            : 0
        }
        onClose={() => setGroupPendingRemoval(null)}
      />
    </aside>
  );
}
