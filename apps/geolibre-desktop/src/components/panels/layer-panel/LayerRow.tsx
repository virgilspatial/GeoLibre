import { type ReactNode, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IDENTIFY_ALL_LAYERS_ID,
  effectiveLayerRenderState,
  identifyAllIncludes,
  hasActiveLayerFilter,
  isDuckDBQueryLayer,
  pluginOwnsPaint,
  rendererAppliesOpacity,
  resolveLayerCapabilities,
  supportsBridgedOpacity,
  useAppStore,
} from "@geolibre/core";
import type { GeoLibreLayer, LayerGroup } from "@geolibre/core";
import {
  isArcgisSupportedLayer,
  isCesiumSupportedLayerType,
  isPlaceholderLayer,
  placeholderMessage,
} from "@geolibre/map";
import { arcGISLayerHasPendingEdits, isArcGISWritableLayer, RASTER_SOURCE_KIND } from "@geolibre/plugins";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geolibre/ui";
import {
  Eye,
  EyeOff,
  Filter,
  MoreHorizontal,
  MousePointerClick,
  Palette,
  PencilRuler,
  ZoomIn,
} from "lucide-react";
import { layerFilteredHintKey } from "../../../lib/layer-filter-hint";
import { getLayerRefreshConfig } from "../../../lib/layer-refresh";
import { notify } from "../../../lib/notify";
import { hasNativeIdentifyLayers, type LayerRefreshStatus } from "./layer-panel-utils";
import {
  LAYER_MENU_COLLISION_PADDING,
  LayerActionsMenuItems,
  type LayerActionsMenuShared,
} from "./LayerActionsMenu";
import { LayerOpacityCard, LayerPropertiesCard } from "./LayerRowCards";

interface LayerRowProps {
  layer: GeoLibreLayer;
  /** The row's index in panel (top-to-bottom) order. */
  displayIndex: number;
  /** How many layer rows the panel lists, for Move up/down at the ends. */
  displayCount: number;
  /** The group the layer belongs to, if any. */
  group: LayerGroup | undefined;
  /** Every group by id, for folding ancestor visibility into the row. */
  groupById: Map<string, LayerGroup>;
  groupDepth: (group: LayerGroup) => number;
  selected: boolean;
  /** Select the layer, or deselect it when it is already selected. */
  onToggleSelect: (layerId: string) => void;
  /** Whether this row's name is open for inline rename. */
  editing: boolean;
  editingName: string;
  setEditingName: (name: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  /** A transient status note (refresh, export, …) for this layer, if any. */
  transientRefreshStatus: LayerRefreshStatus | undefined;
  identifyLayerId: string | null;
  geometryEditLayerId: string | null;
  onToggleGeometryEdit: (layerId: string) => void;
  onCancelGeometryEdit: () => void;
  cesiumPrimary: boolean;
  arcgisPrimary: boolean;
  /** Whether the ArcGIS engine can host deck.gl overlays. */
  deckOverlay: boolean;
  canEditLayer: (layerId: string) => boolean;
  /** Whether a copy of this layer can be drawn (Duplicate). */
  canDuplicate: boolean;
  /** Open state of the selected row's ⋯ menu and its Export submenu. */
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  exportOpen: boolean;
  setExportOpen: (open: boolean) => void;
  /** Panel-wide state and handlers for the row's actions menu. */
  menu: LayerActionsMenuShared;
}

/** The mockup's toolbar tooltip: 12px medium text, opening above the button. */
const toolTipClass = "rounded-lg px-2.5 py-1.5 text-xs font-medium";

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button fires no pointer events, so the tooltip hangs on a wrapper. */}
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            className={cn(
              "h-7 w-7 rounded-md",
              pressed && "bg-foreground text-background hover:bg-foreground/90 hover:text-background",
            )}
            onClick={onClick}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className={toolTipClass}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * SWIFTMAP: one layer in the Layers panel (Change 17). At rest the row is the
 * layer's name and its eye; selecting it adds the toolbar (Zoom to layer,
 * Identify, Style, ⋯) and, from the ⋯ menu, the Opacity or Properties card.
 * No drag handle: the name line is what a drag grabs (Change 18, useRowDrag).
 */
export function LayerRow({
  layer,
  displayIndex,
  displayCount,
  group,
  groupById,
  groupDepth,
  selected,
  onToggleSelect,
  editing,
  editingName,
  setEditingName,
  commitRename,
  cancelRename,
  transientRefreshStatus,
  identifyLayerId,
  geometryEditLayerId,
  onToggleGeometryEdit,
  onCancelGeometryEdit,
  cesiumPrimary,
  arcgisPrimary,
  deckOverlay,
  canEditLayer,
  canDuplicate,
  menuOpen,
  setMenuOpen,
  exportOpen,
  setExportOpen,
  menu,
}: LayerRowProps) {
  const { t } = useTranslation();
  // The ⋯ tooltip shows on hover or keyboard focus only. When its menu closes,
  // Radix returns focus to the button, which would reopen the tooltip; that
  // focus is ignored until the pointer comes back or focus leaves and returns.
  const [actionsTipOpen, setActionsTipOpen] = useState(false);
  const suppressActionsTip = useRef(false);
  const setLayerVisibility = useAppStore((s) => s.setLayerVisibility);
  const setLayerOpacity = useAppStore((s) => s.setLayerOpacity);
  const primaryRenderer = useAppStore((s) => s.primaryRenderer);
  const selectLayer = useAppStore((s) => s.selectLayer);
  const setIdentifyLayer = useAppStore((s) => s.setIdentifyLayer);
  const identifyLayerIds = useAppStore((s) => s.identifyLayerIds);
  const { mapControllerRef, beginRename, onOpenStylePanel, onOpenRasterStylePanel, openCard } =
    menu;
  // A layer inside a hidden group dims too, but keeps its own eye state.
  const layerRendered = effectiveLayerRenderState(layer, groupById).visible;
  const groupHidden = layer.visible && !layerRendered;
  const dimmed = !layer.visible || groupHidden;
  const eyeLabel = groupHidden
    ? t("layerPanel.hiddenByGroup", {
        name: t("layerPanel.hideLayer", { name: layer.name }),
      })
    : layer.visible
      ? t("layerPanel.hideLayer", { name: layer.name })
      : t("layerPanel.showLayer", { name: layer.name });
  const layerCaps = resolveLayerCapabilities(layer);
  const canIdentify =
    layerCaps.query &&
    (layer.type === "geojson" ||
      isDuckDBQueryLayer(layer) ||
      (layer.type === "wms" &&
        typeof layer.source.layers === "string" &&
        Boolean(layer.source.layers.trim()) &&
        Boolean(
          (typeof layer.source.url === "string" && layer.source.url.trim()) || layer.sourcePath,
        )) ||
      layer.type === "vector-tiles" ||
      (layer.type === "mbtiles" && layer.metadata.tileType === "vector") ||
      // COG layers identify pixel values via the raster control's pixel
      // inspector (see useRasterIdentify), not the vector feature query.
      layer.type === "cog" ||
      hasNativeIdentifyLayers(layer));
  const identifyActive = identifyLayerId === layer.id;
  const identifyOwnsClicks =
    identifyActive ||
    (identifyLayerId === IDENTIFY_ALL_LAYERS_ID && identifyAllIncludes(layer.id, identifyLayerIds));
  const isPixelIdentify = layer.type === "cog" || layer.metadata.pixelIdentify === true;
  const identifyLabel = canIdentify
    ? isPixelIdentify
      ? t("layers.identifyInspectPixels")
      : t("layerPanel.identify")
    : layerCaps.query
      ? t("layers.identifyUnavailable")
      : t("layers.identifyCapabilityDisabled");
  const geometryEditActive = geometryEditLayerId === layer.id;
  const geometryEditElsewhere = geometryEditLayerId !== null && !geometryEditActive;
  // Edits to an ArcGIS layer stay local until Save edits to ArcGIS service.
  const arcgisEditsUnsent = useMemo(
    () =>
      !geometryEditActive &&
      layer.metadata.arcgisSaveUncertain !== true &&
      isArcGISWritableLayer(layer) &&
      arcGISLayerHasPendingEdits(layer.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the features and baseline, which every edit and save replaces
    [
      geometryEditActive,
      layer.geojson,
      layer.metadata.arcgisEditBaseline,
      layer.metadata.arcgisEditInfo,
      layer.metadata.arcgisSaveUncertain,
    ],
  );
  const layerEditable = canEditLayer(layer.id);
  const refreshConfig = getLayerRefreshConfig(layer);
  // Only the sync error is kept from GeoLibre's status lines (Change 17,
  // item 21), plus transient notes from actions such as Refresh.
  const refreshStatus: LayerRefreshStatus | undefined =
    transientRefreshStatus ??
    (layer.connection?.lastError
      ? {
          type: "error",
          message: t("layers.syncErrorStatus", { message: layer.connection.lastError }),
        }
      : undefined);
  const isRefreshing = refreshStatus?.type === "refreshing";
  // A plugin-painted layer has no paint property for opacity to land on, so
  // the slider is offered only when it has an effect (#1445).
  const opacityAvailable =
    !pluginOwnsPaint(layer) ||
    supportsBridgedOpacity(layer.id) ||
    rendererAppliesOpacity(layer, primaryRenderer);
  const rasterStyled = layer.metadata.sourceKind === RASTER_SOURCE_KIND;
  const styleAvailable = rasterStyled || Boolean(onOpenStylePanel);
  const depth = group ? groupDepth(group) + 1 : 0;
  const filtered = hasActiveLayerFilter(layer);

  return (
    <div
      data-testid="layer-row"
      data-layer-name={layer.name}
      data-layer-id={layer.id}
      data-drag-key={`layer:${layer.id}`}
      role="listitem"
      aria-level={group ? groupDepth(group) + 2 : 1}
      className="relative min-w-0"
      style={depth > 0 ? { paddingInlineStart: `${depth * 20}px` } : undefined}
    >
      <div
        className={cn(
          "group/row rounded-[10px] transition-colors hover:bg-row-hover",
          selected && "bg-row-hover ring-1 ring-inset ring-accent",
        )}
      >
        <div data-drag-grip="" className="relative flex min-w-0 items-center gap-2.5 py-1 ps-3.5 pe-1.5">
          {editing ? (
            <input
              autoFocus
              type="text"
              className="h-6 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={editingName}
              aria-label={t("layers.renameNamed", { name: layer.name })}
              onChange={(e) => setEditingName(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                }
              }}
            />
          ) : (
            // The row's selection control: click selects, click again deselects.
            // Double-click renames (kept, item 23), and so does F2.
            <button
              type="button"
              aria-pressed={selected}
              data-layer-select=""
              data-drag-ok=""
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={layer.name}
              onClick={() => onToggleSelect(layer.id)}
              onDoubleClick={() => {
                if (layerEditable) beginRename(layer);
              }}
              // F2 renames the focused row's layer, selected or not.
              onKeyDown={(e) => {
                if (e.key !== "F2" || !layerEditable) return;
                e.preventDefault();
                beginRename(layer);
              }}
            >
              <span
                className={cn(
                  "min-w-0 truncate text-[13px] font-medium",
                  dimmed && "opacity-50",
                )}
              >
                {layer.name}
              </span>
              {/* Kept until branch 7 with Clear filters (item 21). */}
              {filtered ? (
                <Filter
                  className="h-3 w-3 shrink-0 text-muted-foreground"
                  aria-label={t(layerFilteredHintKey(layer))}
                >
                  <title>{t(layerFilteredHintKey(layer))}</title>
                </Filter>
              ) : null}
            </button>
          )}
          <button
            type="button"
            aria-label={eyeLabel}
            aria-pressed={layer.visible}
            title={eyeLabel}
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-[.85] group-has-[:focus-visible]/row:opacity-[.85] [@media(hover:none)]:opacity-[.85]",
              selected && "opacity-[.85]",
              !layer.visible && "opacity-75",
            )}
            onClick={() => setLayerVisibility(layer.id, !layer.visible)}
          >
            {layer.visible ? (
              <Eye className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <EyeOff className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
        {selected ? (
          <div
            role="toolbar"
            aria-label={t("layerPanel.toolbar")}
            className="flex items-center gap-1 pb-1.5 pe-1 ps-2 pt-0.5"
          >
            <ToolButton
              label={t("layerPanel.zoomToLayer")}
              onClick={() => {
                const controller = mapControllerRef.current;
                // A layer with no known extent cannot be framed; say so.
                if (controller && !controller.fitLayer(layer)) {
                  notify.info(t("layers.zoomToLayerUnknownExtent", { name: layer.name }));
                }
              }}
            >
              <ZoomIn className="h-4 w-4" />
            </ToolButton>
            <ToolButton
              label={identifyLabel}
              pressed={identifyActive}
              disabled={!canIdentify || geometryEditActive}
              onClick={() => {
                if (!canIdentify) return;
                selectLayer(layer.id);
                setIdentifyLayer(identifyActive ? null : layer.id);
              }}
            >
              <MousePointerClick className="h-4 w-4" />
            </ToolButton>
            <ToolButton
              label={styleAvailable ? t("layerPanel.style") : t("layerPanel.styleUnavailable")}
              disabled={!styleAvailable}
              onClick={() => {
                selectLayer(layer.id);
                // GeoLibre's own panels until branch 7: rasters added through
                // the raster panel are styled there, everything else in the
                // Style panel.
                if (rasterStyled) onOpenRasterStylePanel();
                else onOpenStylePanel?.();
              }}
            >
              <Palette className="h-4 w-4" />
            </ToolButton>
            <div className="ms-auto">
              <DropdownMenu
                open={menuOpen}
                onOpenChange={(open) => {
                  setMenuOpen(open);
                  if (!open) {
                    setExportOpen(false);
                    suppressActionsTip.current = true;
                  }
                  setActionsTipOpen(false);
                }}
              >
                <Tooltip
                  open={actionsTipOpen && !menuOpen}
                  onOpenChange={(open) => {
                    if (open && suppressActionsTip.current) return;
                    setActionsTipOpen(open);
                  }}
                >
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("layerPanel.actions")}
                        onPointerEnter={() => {
                          suppressActionsTip.current = false;
                        }}
                        onBlur={() => {
                          suppressActionsTip.current = false;
                        }}
                        className={cn(
                          "h-7 w-7 rounded-md",
                          menuOpen &&
                            "bg-foreground text-background hover:bg-foreground/90 hover:text-background",
                        )}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8} className={toolTipClass}>
                    {t("layerPanel.actions")}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent
                  align="end"
                  sideOffset={6}
                  collisionPadding={LAYER_MENU_COLLISION_PADDING}
                  className="min-w-[210px] rounded-[10px]"
                >
                  <LayerActionsMenuItems
                    shared={menu}
                    layer={layer}
                    layerCaps={layerCaps}
                    layerRendered={layerRendered}
                    identifyOwnsClicks={identifyOwnsClicks}
                    geometryEditActive={geometryEditActive}
                    geometryEditElsewhere={geometryEditElsewhere}
                    layerEditable={layerEditable}
                    refreshConfig={refreshConfig}
                    isRefreshing={isRefreshing}
                    opacityAvailable={opacityAvailable}
                    canDuplicate={canDuplicate}
                    canMoveUp={displayIndex > 0}
                    canMoveDown={displayIndex < displayCount - 1}
                    exportOpen={exportOpen}
                    setExportOpen={setExportOpen}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : null}
        {selected && openCard === "opacity" && opacityAvailable ? (
          <LayerOpacityCard
            name={layer.name}
            opacity={layer.opacity}
            onChange={(v) => setLayerOpacity(layer.id, v)}
          />
        ) : null}
        {selected && openCard === "properties" ? <LayerPropertiesCard layer={layer} /> : null}
      </div>
      {/* A load failure says why the layer shows nothing. Suppressed for the
          kinds the globe or ArcGIS view draws themselves. */}
      {(!cesiumPrimary || !isCesiumSupportedLayerType(layer)) &&
        (!arcgisPrimary || !isArcgisSupportedLayer(layer, deckOverlay)) &&
        isPlaceholderLayer(layer) && (
          <p className="px-3.5 pb-1 text-[11px] text-amber-600">{placeholderMessage(layer)}</p>
        )}
      {refreshStatus && (
        <p
          title={layer.connection?.lastError ?? ""}
          className={cn(
            "px-3.5 pb-1 text-[11px]",
            refreshStatus.type === "error"
              ? "text-destructive"
              : refreshStatus.type === "warning"
                ? "text-amber-600"
                : "text-muted-foreground",
          )}
        >
          {refreshStatus.message}
        </p>
      )}
      {arcgisEditsUnsent && !refreshStatus && (
        <p className="px-3.5 pb-1 text-[11px] text-amber-600">{t("layers.arcgisEditsUnsent")}</p>
      )}
      {/* The geometry-editing strip stays while editing is kept (item 22). */}
      {geometryEditActive && (
        <div className="mx-2 mb-1 flex items-center gap-1 rounded-md bg-muted px-1.5 py-1">
          <PencilRuler className="h-3 w-3" />
          <span className="flex-1 text-[11px] font-medium">{t("layers.editingGeometry")}</span>
          <Button
            variant="default"
            size="sm"
            className="h-6 px-2 text-[11px]"
            title={t("layers.saveGeometryEdits")}
            onClick={() => onToggleGeometryEdit(layer.id)}
          >
            {t("common.save")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            title={t("layers.discardGeometryEdits")}
            onClick={onCancelGeometryEdit}
          >
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
