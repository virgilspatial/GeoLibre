import { shouldZoomToNewLayers, useAppStore } from "@geolibre/core";
import {
  addVectorLayerFromUrl,
  cancelStacCatalogRequest,
  requestStacCatalogUrl,
  STAC_PLUGIN_ID,
} from "@geolibre/plugins";
import { getLayerBounds, type MapEngine } from "@geolibre/map";
import type { ParseKeys } from "i18next";
import { useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useDesktopSettingsStore } from "../../../hooks/useDesktopSettings";
import { useMapCapabilities } from "../../../hooks/useMapCapabilities";
import { loadDataUrl } from "../../../hooks/useDataUrlLoader";
import type { createAppAPI } from "../../../hooks/usePlugins";
import { supportsAddDataRenderer } from "../../../lib/add-data-renderer";
import { isDesktopRuntime } from "../../../lib/is-mobile";
import { masHidesDataSource } from "../../../lib/mas-build";
import { notify } from "../../../lib/notify";
import { DATA_SOURCE_CATALOG, isDataSourceVisible } from "../../../lib/ui-profile";
import { openAddData } from "../add-data/open-add-data";
import type { AddDataKind } from "../add-data/types";
import type { AddLayerHandlers } from "../toolbar/constants";
import type { LinkKind } from "./link-detection";
import type { MoreSourceGroup } from "./MoreSourcesTab";

type AppApi = ReturnType<typeof createAppAPI>;

/** GeoLibre's Historical imagery and Overture Maps plugins, listed under Reference until 5b. */
const WAYBACK_PLUGIN_ID = "maplibre-gl-esri-wayback";
const OVERTURE_PLUGIN_ID = "maplibre-gl-overture-maps";

/**
 * More sources, in mockup order. Only entries confirmed to work in the browser
 * build are listed (Change 24); the database entries that need the desktop
 * app's helper processes appear only there.
 */
const MORE_SOURCE_SECTIONS: readonly { id: string; labelKey: ParseKeys; ids: readonly string[] }[] = [
  {
    id: "cloud",
    labelKey: "addDataDialog.more.section.cloud",
    ids: ["geoparquet", "flatgeobuf", "pmtiles", "zarr", "netcdf"],
  },
  {
    id: "threeD",
    labelKey: "addDataDialog.more.section.threeD",
    ids: ["lidar", "3d-tiles", "kml", "gltf-model"],
  },
  {
    // CAD drawings open GeoLibre's form, where the drawing's coordinate system is
    // entered; a projected DXF dropped on the map draws nothing (Change 24).
    id: "cad",
    labelKey: "addDataDialog.more.section.cad",
    ids: ["cad", "landxml"],
  },
  {
    id: "databases",
    labelKey: "addDataDialog.more.section.databases",
    ids: ["duckdb", "postgres", "mssql"],
  },
];

/** Entries whose catalog label promises more than the browser build does. */
const LABEL_OVERRIDES: Partial<Record<string, ParseKeys>> = {
  // DWG doesn't load in the browser build (Change 24).
  cad: "addDataDialog.more.cadDrawing",
};

/** Sources that need the desktop app's Martin server or Python sidecar. */
const DESKTOP_ONLY_SOURCES = new Set(["postgres", "mssql"]);

/** Link types GeoLibre's own form finishes (choosing a layer, naming it). */
const FORM_KINDS: Partial<Record<LinkKind, AddDataKind>> = {
  arcgis: "arcgis",
  wms: "wms",
  wmts: "wmts",
  wfs: "wfs",
  "ogc-features": "ogc-features",
  xyz: "xyz",
  kml: "kml",
};

interface AddDataSourceDeps {
  appApi: AppApi;
  mapControllerRef: RefObject<MapEngine | null>;
  addLayer: AddLayerHandlers;
  openAddDataKind: (kind: AddDataKind) => void;
  onAddGltfModel: () => void;
  isActive: (pluginId: string) => boolean;
  toggle: (pluginId: string, app: AppApi) => void;
}

/**
 * SWIFTMAP (Change 24): what the Add Data dialog's More sources tab lists, and
 * how its From a link tab adds each link type. Everything runs through
 * GeoLibre's existing loaders; nothing here touches the engine.
 */
export function useAddDataSources({
  appApi,
  mapControllerRef,
  addLayer,
  openAddDataKind,
  onAddGltfModel,
  isActive,
  toggle,
}: AddDataSourceDeps) {
  const { t } = useTranslation();
  const uiProfile = useDesktopSettingsStore((state) => state.desktopSettings.uiProfile);
  const capabilities = useMapCapabilities();
  const renderer = useAppStore((state) => state.primaryRenderer);
  const desktop = useMemo(() => isDesktopRuntime(), []);

  const handlers: Record<string, () => void> = {
    geoparquet: addLayer.vector,
    flatgeobuf: addLayer.flatGeobuf,
    pmtiles: addLayer.pmtiles,
    zarr: addLayer.zarr,
    netcdf: addLayer.netcdf,
    lidar: addLayer.lidar,
    "3d-tiles": addLayer.threeDTiles,
    kml: () => openAddDataKind("kml"),
    "gltf-model": onAddGltfModel,
    cad: () => openAddDataKind("cad"),
    landxml: () => openAddDataKind("landxml"),
    duckdb: addLayer.duckdb,
    postgres: () => openAddDataKind("postgres"),
    mssql: () => openAddDataKind("mssql"),
  };
  // Mirrors the gates the old Add Data menu applied.
  const gated: Record<string, boolean> = {
    "gltf-model": !capabilities.deckOverlay,
    duckdb: !capabilities.deckOverlay,
  };

  const openPlugin = (pluginId: string) => {
    if (!isActive(pluginId)) toggle(pluginId, appApi);
  };

  const moreSources: MoreSourceGroup[] = MORE_SOURCE_SECTIONS.map((section) => ({
    id: section.id,
    label: t(section.labelKey),
    entries: section.ids
      .map((id) => DATA_SOURCE_CATALOG.find((entry) => entry.id === id))
      .filter((entry) => entry !== undefined)
      .filter(
        (entry) =>
          isDataSourceVisible(uiProfile, entry.id) &&
          !masHidesDataSource(entry.id) &&
          !(DESKTOP_ONLY_SOURCES.has(entry.id) && !desktop) &&
          !gated[entry.id] &&
          supportsAddDataRenderer(entry.id, renderer, capabilities.deckOverlay),
      )
      .map((entry) => ({
        id: entry.id,
        label: t(LABEL_OVERRIDES[entry.id] ?? entry.labelKey),
        onSelect: handlers[entry.id] ?? (() => {}),
      })),
  }));
  moreSources.push({
    id: "reference",
    label: t("addDataDialog.more.section.reference"),
    entries: [
      {
        id: "historical-imagery",
        label: t("addDataDialog.more.historicalImagery"),
        onSelect: () => openPlugin(WAYBACK_PLUGIN_ID),
      },
      {
        id: "overture",
        label: t("addDataDialog.more.overture"),
        onSelect: () => openPlugin(OVERTURE_PLUGIN_ID),
      },
    ],
  });

  /**
   * Add a link. Direct files load straight away and resolve to the new layer's
   * name; services open GeoLibre's form for that type, prefilled, and resolve to
   * null. Throws with a readable message when the link can't be loaded.
   */
  const addLink = async (url: string, kind: LinkKind): Promise<string | null> => {
    const formKind = FORM_KINDS[kind];
    if (formKind) {
      openAddData(formKind, { url });
      return null;
    }
    if (kind === "stac") {
      requestStacCatalogUrl(url);
      try {
        if (isActive(STAC_PLUGIN_ID)) toggle(STAC_PLUGIN_ID, appApi);
        await appApi.activatePlugin?.(STAC_PLUGIN_ID);
      } finally {
        cancelStacCatalogRequest();
      }
      return null;
    }
    const fit = shouldZoomToNewLayers();
    let name: string;
    if (kind === "flatgeobuf") {
      name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "FlatGeobuf").replace(
        /\.fgb$/i,
        "",
      );
      const added = await addVectorLayerFromUrl(appApi, url, { name, fitBounds: fit });
      if (!added) throw new Error(t("addDataDialog.link.couldNotLoad"));
    } else {
      const result = await loadDataUrl(appApi, url, { fit });
      const layer = useAppStore.getState().layers.find((item) => item.id === result.layerIds[0]);
      name = layer?.name ?? url;
      // GeoJSON is framed here; the other formats' loaders move the camera themselves.
      const fitLayer = useAppStore
        .getState()
        .layers.find((item) => item.id === result.fitLayerIds[0]);
      const bounds = fitLayer ? getLayerBounds(fitLayer) : null;
      if (fit && bounds) mapControllerRef.current?.fitBounds(bounds);
    }
    notify.success(t("addDataDialog.addedToTop", { name }));
    return name;
  };

  return { moreSources, addLink };
}
