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
  BLANK_BASEMAP,
  pluginOwnsPaint,
  resolveLayerCapabilities,
  useAppStore,
  layerGroupDepth,
  layerGroupMoveability,
  layerGroupSortability,
  layerPanelGroupHeaders,
} from "@geolibre/core";
import type { GeoLibreLayer, LayerGroup } from "@geolibre/core";
import { getTemporalLayersVersion, subscribeTemporalLayers } from "@geolibre/plugins";
import { rendererCapabilities, type MapEngine } from "@geolibre/map";
import { getIsMobileViewport } from "../../hooks/useIsMobileViewport";
import type { ThemeMode } from "../../hooks/useThemeMode";
import { usePluginRegistry } from "../../hooks/usePlugins";
import { useDesktopSettingsStore } from "../../hooks/useDesktopSettings";
import { canOpenLayerAttributeTable } from "../../lib/attribute-table-source";
import { isMacPlatform } from "../../lib/commands";
import { isMobile } from "../../lib/is-mobile";
import { masHidesDataSource } from "../../lib/mas-build";
import { notify } from "../../lib/notify";
import { canExportRasterLayer } from "../../lib/raster-export";
import { activeInterfaceProfile, isDataSourceVisible } from "../../lib/ui-profile";
import { Button, ScrollArea, Separator } from "@geolibre/ui";
import { Layers, PanelLeftOpen } from "lucide-react";
import { participantCanEditLayer } from "../../lib/collab-protocol";
import type { CollaborationApi } from "../../hooks/useCollaboration";
import { useSidePanelStore } from "../layout/rail/sidePanelStore";
import { BasemapPickerDialog } from "./BasemapPickerDialog";
import { LayerPanelPlaceSearch } from "./LayerPanelPlaceSearch";
import { useMapCapabilities } from "../../hooks/useMapCapabilities";
import { ADD_DATA_DIALOG_SOURCES, BACKGROUND_SELECTION_ID } from "./layer-panel/layer-panel-utils";
import { BackgroundAppearanceDialog, BackgroundLayerRow } from "./layer-panel/BackgroundLayerRow";
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
import { RemoveLayerDialog } from "./layer-panel/RemoveLayerDialog";
import { useLayerActions } from "./layer-panel/useLayerActions";
import type { LayerRefresh } from "./layer-panel/useLayerRefresh";
import { useLayerRename } from "./layer-panel/useLayerRename";
import { useTimeSliderBinding } from "./layer-panel/useTimeSliderBinding";
import { setLayersPanelCollapsed } from "../../lib/layer-panel-collapse";

interface LayerPanelProps {
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

export function LayerPanel({
  themeMode,
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
  const { i18n, t } = useTranslation();
  const isBeginnerProfile = useDesktopSettingsStore(
    (s) => activeInterfaceProfile(s.desktopSettings.uiProfile) === "beginner",
  );
  const uiProfile = useDesktopSettingsStore((s) => s.desktopSettings.uiProfile);
  // Same visibility rules the Add Data menu applies, for group headers' Add
  // Data entries.
  const mobile = useMemo(() => isMobile(), []);
  const isMac = useMemo(() => isMacPlatform(), []);
  const controlLayerPanels = useAppStore(
    (s) => rendererCapabilities(s.primaryRenderer).controlLayerPanels,
  );
  const addDataGroupSources = useMemo(
    () =>
      ADD_DATA_DIALOG_SOURCES.filter(
        (entry) =>
          isDataSourceVisible(uiProfile, entry.id) &&
          (!["pmtiles", "raster", "zarr"].includes(entry.id) || !controlLayerPanels) &&
          !((entry.id === "postgres" || entry.id === "mssql") && mobile) &&
          !masHidesDataSource(entry.id),
      ),
    [uiProfile, mobile, controlLayerPanels],
  );
  const addDataAvailable = useSidePanelStore((s) => s.addDataAvailable);
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
  const basemapVisible = useAppStore((s) => s.basemapVisible);
  const basemapStyleUrl = useAppStore((s) =>
    // eslint-disable-next-line local/no-renderer-kind-checks -- Mapbox keeps its own persisted style URL
    s.primaryRenderer === "mapbox"
      ? (s.preferences.map.mapboxStyleUrl ?? s.basemapStyleUrl)
      : s.basemapStyleUrl,
  );
  const reorderLayer = useAppStore((s) => s.reorderLayer);
  const addLayerGroup = useAppStore((s) => s.addLayerGroup);
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

  const [basemapPickerOpen, setBasemapPickerOpen] = useState(false);
  const [backgroundAppearanceOpen, setBackgroundAppearanceOpen] = useState(false);
  const [layerPendingRemoval, setLayerPendingRemoval] = useState<GeoLibreLayer | null>(null);
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

  const visibleLayers = useMemo(() => [...layers].reverse(), [layers]);
  // Single selection, as in the mockup (Shift/Ctrl multi-select was dropped,
  // item 24): the store's selected layer is the only one. No dragging until 4b
  // (decided 2 Nov 2026): rows reorder from the ⋯ menu.
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
  const groupSortability = useMemo(
    () => layerGroupSortability(layers, layerGroups, i18n.language),
    [layers, layerGroups, i18n.language],
  );

  const backgroundSelected = selectedLayerId === BACKGROUND_SELECTION_ID;
  const blankBackgroundActive = basemapStyleUrl === BLANK_BASEMAP;

  const renderGroupHeader = (group: LayerGroup) => {
    if (hasCollapsedAncestor(group)) return null;
    return (
      <LayerGroupHeader
        group={group}
        depth={groupDepth(group)}
        isDropTarget={false}
        moveability={groupMoveability.get(group.id)}
        sortability={groupSortability.get(group.id)}
        moveTargets={groupMoveTargets(group)}
        addDataGroupSources={addDataGroupSources}
        rename={rename}
      />
    );
  };

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
      case "moveUp":
        if (editable) reorderLayer(layer.id, "up");
        return;
      case "moveDown":
        if (editable) reorderLayer(layer.id, "down");
        return;
      case "addToNewGroup":
        if (editable) addLayerGroup(undefined, [layer.id]);
        return;
      case "export":
        setMenuOpen(true);
        setExportOpen(true);
        return;
      case "remove":
        // GeoLibre's confirmation stays: Undo can't bring back every layer
        // type in full (decided 2 Nov 2026, Change 17).
        if (editable) setLayerPendingRemoval(layer);
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
        {layers.length === 0 && (
          <p className="px-4 pb-2 pt-4 text-xs text-muted-foreground">
            {isBeginnerProfile ? t("layers.emptyBeginner") : t("layers.empty")}
          </p>
        )}
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
        {/* Rows, group headers and the Background card are listitems carrying
            their nesting depth as aria-level. */}
        <div
          data-layer-list=""
          role="list"
          aria-label={t("sharedRail.layers")}
          className="flex w-full min-w-0 flex-col gap-px px-3 pb-3"
        >
          {displayLayers.map((layer) => {
            const group = layer.groupId ? groupById.get(layer.groupId) : undefined;
            const groupCollapsed = group?.collapsed ?? false;
            const groupAncestorCollapsed = group ? hasCollapsedAncestor(group) : false;
            const panelIndex = visibleLayers.indexOf(layer);
            const selected = selectedLayerId === layer.id;
            return (
              <Fragment key={layer.id}>
                {groupHeaders.aboveLayer.get(layer.id)?.map((header) => (
                  <Fragment key={header.id}>{renderGroupHeader(header)}</Fragment>
                ))}
                {!groupCollapsed && !groupAncestorCollapsed && (
                  <LayerRow
                    layer={layer}
                    displayIndex={panelIndex}
                    displayCount={visibleLayers.length}
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
          {/* Kept until branch 6 moves basemaps to Map controls (item 26). */}
          {!searching ? (
            <div className="pt-2">
              <BackgroundLayerRow
                selected={backgroundSelected}
                basemapVisible={basemapVisible}
                blankBackgroundActive={blankBackgroundActive}
                onOpenBasemapPicker={() => setBasemapPickerOpen(true)}
                onOpenAppearance={() => setBackgroundAppearanceOpen(true)}
              />
            </div>
          ) : null}
        </div>
      </ScrollArea>
      {/* Kept until the map's own place search lands (item 27). */}
      <Separator />
      <LayerPanelPlaceSearch mapControllerRef={mapControllerRef} />
      <BasemapPickerDialog open={basemapPickerOpen} onOpenChange={setBasemapPickerOpen} />
      <BackgroundAppearanceDialog
        open={backgroundAppearanceOpen}
        onOpenChange={setBackgroundAppearanceOpen}
        themeMode={themeMode}
      />
      <BindTimeSliderDialog binding={binding} />
      <RefreshSettingsDialog
        settings={refreshSettings}
        setRefreshInterval={refresh.setRefreshInterval}
        setRefreshFailurePolicy={refresh.setRefreshFailurePolicy}
      />
      <RemoveLayerDialog layer={layerPendingRemoval} onClose={() => setLayerPendingRemoval(null)} />
    </aside>
  );
}
