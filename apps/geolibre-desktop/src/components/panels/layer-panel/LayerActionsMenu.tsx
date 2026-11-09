import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  activeLayerFilterExpression,
  clearQuickFilterValues,
  hasActiveLayerFilter,
  hasActiveQuickFilter,
  isDuckDBQueryLayer,
  resolveLayerCapabilities,
  useAppStore,
} from "@geolibre/core";
import type { GeoLibreLayer, LayerGroup } from "@geolibre/core";
import {
  canEditLayerGeometry,
  getLayerTimeBinding,
  getTemporalLayerAdapter,
  isArcGISWritableLayer,
  isTileVectorLayer,
  SKETCHES_SOURCE_KIND,
} from "@geolibre/plugins";
import { startFeatureSelection, type MapEngine } from "@geolibre/map";
import {
  cn,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@geolibre/ui";
import { canOpenLayerAttributeTable } from "../../../lib/attribute-table-source";
import { getLayerRefreshConfig, isRefreshableLayer } from "../../../lib/layer-refresh";
import { getSqlQueryLayerConfig, isSqlQueryLayer } from "../../../lib/sql-query-layer";
import { requestSqlWorkspaceQuery } from "../../../lib/sql-workspace-prefill";
import { canExportLidarLayer, type LidarExportFormat } from "../../../lib/lidar-export";
import { canExportRasterLayer } from "../../../lib/raster-export";
import { clearFeatureSelection } from "../../../lib/selection-actions";
import { canWriteEditsToSource, isMssqlEditableLayer, isPostgisEditableLayer } from "./layer-panel-utils";
import { layerShortcutLabel, type LayerShortcutId } from "./layer-shortcuts";
import type { LayerActions } from "./useLayerActions";
import type { LayerRefresh } from "./useLayerRefresh";
import type { TimeSliderBinding } from "./useTimeSliderBinding";
import { quickFiltersAvailable } from "../../style-panel-swiftmap/LayerFilterCard";

/** The LiDAR layer Export submenu, in menu order. */
const LIDAR_EXPORT_ITEMS = [
  { format: "las", labelKey: "layers.exportLas" },
  { format: "laz", labelKey: "layers.exportLaz" },
  { format: "copc", labelKey: "layers.exportCopc" },
] as const satisfies ReadonlyArray<{ format: LidarExportFormat; labelKey: string }>;

/**
 * SWIFTMAP: the vector Export formats kept by the user (Change 17, item 12).
 * GeoParquet, KML, encoded polyline and the 3D models are dropped from the UI.
 */
const VECTOR_EXPORT_ITEMS = [
  { format: "geojson", label: "GeoJSON" },
  { format: "geopackage", label: "GeoPackage" },
  { format: "shapefile", label: "Shapefile (zipped)" },
  { format: "kmz", label: "KMZ" },
  { format: "csv", label: "CSV" },
] as const;

/** The selected layer's inline cards, opened from the ⋯ menu. */
export type LayerCard = "opacity" | "properties" | "filter";

/**
 * What every row's actions menu shares: the panel-wide state the menu items
 * read and the handlers they call. Built once per panel render.
 */
export interface LayerActionsMenuShared {
  mapControllerRef: RefObject<MapEngine | null>;
  layers: GeoLibreLayer[];
  layerGroups: LayerGroup[];
  actions: LayerActions;
  handleRefreshLayer: LayerRefresh["handleRefreshLayer"];
  openBindTimeSliderDialog: TimeSliderBinding["openBindTimeSliderDialog"];
  beginRename: (layer: GeoLibreLayer) => void;
  setRefreshSettingsLayerId: (layerId: string) => void;
  onToggleGeometryEdit: (layerId: string) => void;
  onMaterializeDuckDBLayer: (layer: GeoLibreLayer) => void;
  onOpenStylePanel?: () => void;
  onOpenRasterStylePanel: () => void;
  /** Toggle the selected layer's Opacity or Properties card. */
  toggleCard: (card: LayerCard) => void;
  openCard: LayerCard | null;
  /** Run one of the menu's shortcut actions (shared with the keyboard). */
  runAction: (id: LayerShortcutId, layer: GeoLibreLayer) => void;
  isMac: boolean;
}

interface LayerActionsMenuItemsProps {
  shared: LayerActionsMenuShared;
  layer: GeoLibreLayer;
  /** The layer's resolved capabilities (explicit flags over inferred defaults). */
  layerCaps: ReturnType<typeof resolveLayerCapabilities>;
  /** Whether the layer is drawn once its groups' visibility is folded in. */
  layerRendered: boolean;
  /** Whether Identify (this layer's or all-layer) currently owns map clicks. */
  identifyOwnsClicks: boolean;
  geometryEditActive: boolean;
  geometryEditElsewhere: boolean;
  /** Whether collaboration lets this session change the layer. */
  layerEditable: boolean;
  refreshConfig: ReturnType<typeof getLayerRefreshConfig>;
  isRefreshing: boolean;
  /** Whether the opacity slider has any effect on this layer. */
  opacityAvailable: boolean;
  canDuplicate: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Controlled open state of the Export submenu, so ⌘E can open it. */
  exportOpen: boolean;
  setExportOpen: (open: boolean) => void;
}

/** A menu item with the mockup's height, text size and shortcut column. */
export function LayerMenuItem({
  label,
  shortcut,
  disabled,
  danger,
  title,
  onSelect,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
  onSelect: (event: Event) => void;
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      title={title}
      onSelect={onSelect}
      className={cn(
        "h-8 rounded-md px-2.5 text-[13px]",
        danger && "text-destructive focus:bg-destructive/10 focus:text-destructive",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? (
        <DropdownMenuShortcut className="font-mono text-[11px]">{shortcut}</DropdownMenuShortcut>
      ) : null}
    </DropdownMenuItem>
  );
}

/**
 * SWIFTMAP: keeps the layer and group ⋯ menus inside the window, clear of its
 * edges and of the status bar at the bottom. A menu taller than the room left
 * scrolls (the primitive caps it at the available height), or opens upward
 * when there is more room above.
 */
export const LAYER_MENU_COLLISION_PADDING = { top: 8, right: 8, bottom: 40, left: 8 };

export const subTriggerClass = "h-8 rounded-md px-2.5 text-[13px]";
const Item = LayerMenuItem;

/**
 * SWIFTMAP: the items of a layer row's ⋯ menu (Change 17). The mockup's items
 * come first (Open attribute table, Opacity, Properties; Rename, Duplicate,
 * Move up, Move down, Add to new group, Export), then the GeoLibre actions the
 * user kept, then Remove layer in red. The rest of GeoLibre's layer actions
 * were dropped from the UI only; their code is untouched.
 */
export function LayerActionsMenuItems({
  shared,
  layer,
  layerCaps,
  layerRendered,
  identifyOwnsClicks,
  geometryEditActive,
  geometryEditElsewhere,
  layerEditable,
  refreshConfig,
  isRefreshing,
  opacityAvailable,
  canDuplicate,
  canMoveUp,
  canMoveDown,
  exportOpen,
  setExportOpen,
}: LayerActionsMenuItemsProps) {
  const { t } = useTranslation();
  const {
    layers,
    layerGroups,
    actions,
    handleRefreshLayer,
    openBindTimeSliderDialog,
    setRefreshSettingsLayerId,
    onToggleGeometryEdit,
    onMaterializeDuckDBLayer,
    toggleCard,
    openCard,
    runAction,
    isMac,
  } = shared;
  const {
    quickBufferPresets,
    formatQuickDistance,
    runLayerQuickTool,
    exportSketchesAsLayer,
    handleExportLayer,
    handleSaveEditsToSource,
    handleBindTemporalLayer,
    handleUnbindTimeSlider,
    handleExportRasterLayer,
    handleExportLidarLayer,
  } = actions;
  const moveLayersToGroup = useAppStore((s) => s.moveLayersToGroup);
  const selectLayer = useAppStore((s) => s.selectLayer);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const setIdentifyLayer = useAppStore((s) => s.setIdentifyLayer);
  const setLoadEditorFeaturesOpen = useAppStore((s) => s.setLoadEditorFeaturesOpen);
  const setSqlWorkspaceOpen = useAppStore((s) => s.setSqlWorkspaceOpen);
  const setVectorToolOpen = useAppStore((s) => s.setVectorToolOpen);
  const selectedLayerId = useAppStore((s) => s.selectedLayerId);
  const selectedFeatureCount = useAppStore((s) => s.selectedFeatureIds.length);
  const key = (id: LayerShortcutId) => layerShortcutLabel(id, isMac);
  const run = (id: LayerShortcutId) => () => runAction(id, layer);

  const canEditGeometry = canEditLayerGeometry(layer) && layerCaps.update;
  // A vector layer whose in-view features can be loaded into the GeoEditor (a
  // copy, not in-place). Gated on `export`: it copies this layer's features out.
  const canLoadIntoEditor =
    layerCaps.export &&
    layer.metadata.sourceKind !== SKETCHES_SOURCE_KIND &&
    layer.metadata.tileType !== "raster" &&
    (layer.type === "geojson" ||
      layer.type === "vector-tiles" ||
      layer.type === "pmtiles" ||
      layer.type === "mbtiles");
  const canMaterializeDuckDB =
    isDuckDBQueryLayer(layer) && typeof layer.metadata.query === "string";
  // Rasters open their raster attribute table from the same item (item 16).
  const canExportRaster = layerCaps.export && canExportRasterLayer(layer);
  const canOpenAttributeTable = canOpenLayerAttributeTable(layer) || canExportRaster;
  const canRunQuickAnalysis = layerCaps.query && (layer.geojson?.features?.length ?? 0) > 0;
  // Drawing a selection on the map has no other entry point (the Edit menu
  // selects by expression or location only), so it stays (Change 17, item 10).
  const canSelectFeatures = canRunQuickAnalysis;
  const holdsSelection =
    canSelectFeatures && layer.id === selectedLayerId && selectedFeatureCount > 0;
  const canExportVector = layerCaps.export && layer.type === "geojson";
  const canExportLidar = layerCaps.export && canExportLidarLayer(layer);
  const canExport = canExportVector || canExportRaster || canExportLidar;
  const canWriteBack =
    canWriteEditsToSource(layer) && (layerCaps.update || layerCaps.create || layerCaps.delete);
  const temporalAdapter = getTemporalLayerAdapter(layer.id);
  const canBindTimeSlider =
    layer.type === "geojson" || isTileVectorLayer(layer) || Boolean(temporalAdapter);
  const timeBinding = getLayerTimeBinding(layer);
  const canRefresh = isRefreshableLayer(layer);
  // Auto refresh was dropped (item 19), but a layer that already has it on
  // keeps the item, so it can still be turned off.
  const showAutoRefresh = canRefresh && refreshConfig.enabled;
  const clearsExpression = layerEditable && activeLayerFilterExpression(layer) !== null;
  const clearableQuickFilters = hasActiveQuickFilter(layer);
  const isSqlLayer = isSqlQueryLayer(layer);
  const isSketches = layer.metadata.sourceKind === SKETCHES_SOURCE_KIND;
  const sketchCount = Array.isArray(layer.geojson?.features) ? layer.geojson.features.length : 0;

  const keptItems: ReactNode[] = [];
  if (hasActiveLayerFilter(layer)) {
    keptItems.push(
      <Item
        key="clear-filters"
        label={t(clearsExpression ? "quickFilters.clearAllWithExpression" : "quickFilters.clearAll")}
        disabled={!clearsExpression && !clearableQuickFilters}
        onSelect={() => {
          const quickFilters = clearQuickFilterValues(layer.quickFilters);
          updateLayer(layer.id, {
            ...(clearsExpression ? { filterExpression: undefined } : {}),
            quickFilters: quickFilters.length > 0 ? quickFilters : undefined,
          });
        }}
      />,
    );
  }
  if (canRunQuickAnalysis) {
    // Kept until branch 6's Analysis panel replaces it (decided 2 Nov 2026).
    keptItems.push(
      <DropdownMenuSub key="quick-analysis">
        <DropdownMenuSubTrigger className={subTriggerClass}>
          {t("quickAnalysis.menu")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {quickBufferPresets.map((preset) => (
            <Item
              key={`${preset.distance}-${preset.units}`}
              label={t("quickAnalysis.bufferFeatures", { distance: formatQuickDistance(preset) })}
              onSelect={() =>
                runLayerQuickTool(
                  layer,
                  "buffer",
                  { distance: preset.distance, units: preset.units },
                  t("quickAnalysis.bufferOfLayerName", {
                    name: layer.name,
                    distance: formatQuickDistance(preset),
                  }),
                )
              }
            />
          ))}
          <DropdownMenuSeparator />
          <Item
            label={t("quickAnalysis.centroids")}
            onSelect={() =>
              runLayerQuickTool(
                layer,
                "centroids",
                {},
                t("quickAnalysis.centroidsLayerName", { name: layer.name }),
              )
            }
          />
          <Item
            label={t("quickAnalysis.convexHull")}
            onSelect={() =>
              runLayerQuickTool(
                layer,
                "convex-hull",
                {},
                t("quickAnalysis.convexHullLayerName", { name: layer.name }),
              )
            }
          />
          <Item
            label={t("quickAnalysis.boundingBox")}
            onSelect={() =>
              runLayerQuickTool(
                layer,
                "bounding-box",
                {},
                t("quickAnalysis.boundingBoxLayerName", { name: layer.name }),
              )
            }
          />
          <DropdownMenuSeparator />
          <Item
            label={t("quickAnalysis.openInProcessing")}
            onSelect={() => {
              selectLayer(layer.id);
              setVectorToolOpen("buffer");
            }}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
    );
  }
  if (canSelectFeatures) {
    keptItems.push(
      <DropdownMenuSub key="select-features">
        <DropdownMenuSubTrigger className={subTriggerClass}>
          {t("layers.selectFeaturesMenu")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {(
            [
              ["single", "layers.selectFeaturesSingle"],
              ["rectangle", "layers.selectFeaturesRectangle"],
              ["polygon", "layers.selectFeaturesPolygon"],
              ["freehand", "layers.selectFeaturesFreehand"],
              ["radius", "layers.selectFeaturesRadius"],
            ] as const
          ).map(([shape, label]) => (
            <Item
              key={shape}
              label={t(label)}
              // A gesture on a hidden layer would match nothing at all.
              disabled={!layerRendered}
              onSelect={() => {
                if (identifyOwnsClicks) setIdentifyLayer(null);
                startFeatureSelection({ layerId: layer.id, shape });
              }}
            />
          ))}
          <DropdownMenuSeparator />
          <Item
            label={t("toolbar.item.clearSelection")}
            disabled={!holdsSelection}
            onSelect={clearFeatureSelection}
          />
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="max-w-64 whitespace-normal text-xs font-normal text-muted-foreground">
            {t("layers.selectFeaturesModifiers")}
          </DropdownMenuLabel>
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
    );
  }
  // Group moves stay until 4b's drag and drop decides them (item 4).
  if (layerGroups.length > 0) {
    keptItems.push(
      <DropdownMenuSub key="move-to-group">
        <DropdownMenuSubTrigger className={subTriggerClass} disabled={!layerEditable}>
          {t("layers.moveToGroup")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {layerGroups.map((g) => (
            <Item
              key={g.id}
              label={g.name}
              disabled={layers.find((item) => item.id === layer.id)?.groupId === g.id}
              onSelect={() => moveLayersToGroup([layer.id], g.id)}
            />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
    );
  }
  if (layer.groupId) {
    keptItems.push(
      <Item
        key="remove-from-group"
        label={t("layers.removeFromGroup")}
        disabled={!layerEditable}
        onSelect={() => moveLayersToGroup([layer.id], null)}
      />,
    );
  }
  if (isSketches) {
    keptItems.push(
      <DropdownMenuSub key="sketches">
        <DropdownMenuSubTrigger className={subTriggerClass} disabled={sketchCount === 0}>
          {t("layers.exportSketchesAsLayer")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <Item label={t("layers.exportSketchesKeep")} onSelect={() => exportSketchesAsLayer(layer)} />
          <Item
            label={t("layers.exportSketchesClear")}
            disabled={!layerEditable}
            onSelect={() => exportSketchesAsLayer(layer, true)}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
    );
  }
  if (canMaterializeDuckDB) {
    keptItems.push(
      <Item
        key="materialize"
        label={t("layers.materializeToEditable")}
        disabled={!layerEditable}
        onSelect={() => onMaterializeDuckDBLayer(layer)}
      />,
    );
  }
  if (isSqlLayer) {
    keptItems.push(
      <Item
        key="edit-sql"
        label={t("layers.editSqlQuery")}
        onSelect={() => {
          const config = getSqlQueryLayerConfig(layer);
          if (!config) return;
          // Park the query first so the panel finds it whether it mounts now
          // or is already open.
          requestSqlWorkspaceQuery(config.sql);
          setSqlWorkspaceOpen(true);
        }}
      />,
    );
  }
  if (canEditGeometry || geometryEditActive) {
    keptItems.push(
      <Item
        key="edit-geometry"
        label={geometryEditActive ? t("layers.finishEditingGeometry") : t("layers.editGeometry")}
        disabled={geometryEditElsewhere || !layerEditable}
        onSelect={() => {
          selectLayer(layer.id);
          if (identifyOwnsClicks) setIdentifyLayer(null);
          onToggleGeometryEdit(layer.id);
        }}
      />,
    );
  }
  if (canLoadIntoEditor) {
    keptItems.push(
      <Item
        key="load-editor"
        label={t("loadEditorFeatures.menuItem")}
        disabled={!layerEditable}
        onSelect={() => {
          selectLayer(layer.id);
          setLoadEditorFeaturesOpen(true, layer.id);
        }}
      />,
    );
  }
  if (canWriteBack) {
    const mssqlPending = isMssqlEditableLayer(layer) && layer.mssqlWritebackPending === true;
    keptItems.push(
      <Item
        key="write-back"
        label={
          isArcGISWritableLayer(layer)
            ? t("layers.saveEditsToArcgis")
            : isMssqlEditableLayer(layer)
              ? t("layers.saveEditsToMssql")
              : isPostgisEditableLayer(layer)
                ? t("layers.saveEditsToPostgis")
                : t("layers.saveEditsToSource")
        }
        disabled={geometryEditActive || !layerEditable || mssqlPending}
        title={mssqlPending ? t("layers.saveEditsMssqlRefreshRequired") : undefined}
        onSelect={() => {
          void handleSaveEditsToSource(layer);
        }}
      />,
    );
  }
  if (canBindTimeSlider) {
    keptItems.push(
      <Item
        key="time-slider"
        label={
          timeBinding
            ? t("layers.unbindFromTimeSlider")
            : temporalAdapter
              ? t("layers.bindTimeDimensionToTimeSlider")
              : t("layers.bindToTimeSlider")
        }
        onSelect={() => {
          if (timeBinding) handleUnbindTimeSlider(layer);
          else if (temporalAdapter) handleBindTemporalLayer(layer);
          else void openBindTimeSliderDialog(layer);
        }}
      />,
    );
  }
  if (canRefresh) {
    keptItems.push(
      <Item
        key="refresh"
        label={t("layers.refresh")}
        disabled={isRefreshing}
        onSelect={() => {
          void handleRefreshLayer(layer);
        }}
      />,
    );
  }
  if (showAutoRefresh) {
    keptItems.push(
      <Item
        key="auto-refresh"
        label={t("layers.autoRefreshOn")}
        onSelect={() => setRefreshSettingsLayerId(layer.id)}
      />,
    );
  }

  return (
    <>
      {canOpenAttributeTable ? (
        <Item
          label={t("layerPanel.openAttributeTable")}
          shortcut={key("attributeTable")}
          onSelect={run("attributeTable")}
        />
      ) : null}
      {opacityAvailable ? (
        <Item
          label={
            openCard === "opacity"
              ? t("swiftmapStyle.layerOpacityHide")
              : t("swiftmapStyle.layerOpacityMenu")
          }
          shortcut={key("opacity")}
          onSelect={() => toggleCard("opacity")}
        />
      ) : null}
      <Item
        label={
          openCard === "properties" ? t("layerPanel.hideProperties") : t("layerPanel.properties")
        }
        shortcut={key("properties")}
        onSelect={() => toggleCard("properties")}
      />
      {/* SWIFTMAP (Change 27): quick filters moved here from the Style panel. */}
      {quickFiltersAvailable(layer) ? (
        <Item
          label={openCard === "filter" ? t("swiftmapStyle.filter.hide") : t("swiftmapStyle.filter.menu")}
          onSelect={() => toggleCard("filter")}
        />
      ) : null}
      <DropdownMenuSeparator />
      {/* preventDefault keeps the menu's close from racing the rename input's autofocus. */}
      <Item
        label={t("layerPanel.rename")}
        shortcut={key("rename")}
        disabled={!layerEditable}
        onSelect={(event) => {
          event.preventDefault();
          runAction("rename", layer);
        }}
      />
      <Item
        label={t("layerPanel.duplicate")}
        shortcut={key("duplicate")}
        disabled={!layerEditable || !canDuplicate}
        title={canDuplicate ? undefined : t("layerPanel.duplicateUnavailable")}
        onSelect={run("duplicate")}
      />
      <Item
        label={t("layerPanel.moveUp")}
        shortcut={key("moveUp")}
        disabled={!layerEditable || !canMoveUp}
        onSelect={run("moveUp")}
      />
      <Item
        label={t("layerPanel.moveDown")}
        shortcut={key("moveDown")}
        disabled={!layerEditable || !canMoveDown}
        onSelect={run("moveDown")}
      />
      <Item
        label={t("layerPanel.addToNewGroup")}
        shortcut={key("addToNewGroup")}
        disabled={!layerEditable}
        onSelect={run("addToNewGroup")}
      />
      {canExport ? (
        <DropdownMenuSub open={exportOpen} onOpenChange={setExportOpen}>
          <DropdownMenuSubTrigger className={subTriggerClass}>
            <span className="min-w-0 flex-1 truncate">{t("layerPanel.export")}</span>
            <DropdownMenuShortcut className="font-mono text-[11px]">
              {key("export")}
            </DropdownMenuShortcut>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {canExportVector
              ? VECTOR_EXPORT_ITEMS.map(({ format, label }) => (
                  <Item
                    key={format}
                    label={label}
                    onSelect={() => {
                      void handleExportLayer(layer, format);
                    }}
                  />
                ))
              : null}
            {canExportRaster ? (
              <Item
                label={t("layers.exportGeoTiff")}
                onSelect={() => {
                  void handleExportRasterLayer(layer);
                }}
              />
            ) : null}
            {canExportLidar
              ? LIDAR_EXPORT_ITEMS.map(({ format, labelKey }) => (
                  <Item
                    key={format}
                    label={t(labelKey)}
                    onSelect={() => {
                      void handleExportLidarLayer(layer, format);
                    }}
                  />
                ))
              : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : (
        <Item
          label={t("layerPanel.export")}
          shortcut={key("export")}
          disabled
          title={t("layerPanel.exportUnavailable")}
          onSelect={() => {}}
        />
      )}
      {keptItems.length > 0 ? (
        <>
          <DropdownMenuSeparator />
          {keptItems}
        </>
      ) : null}
      <DropdownMenuSeparator />
      <Item
        label={t("layerPanel.removeLayer")}
        shortcut={key("remove")}
        danger
        disabled={!layerEditable}
        onSelect={run("remove")}
      />
    </>
  );
}
