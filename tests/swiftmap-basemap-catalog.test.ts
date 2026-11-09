import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { BLANK_BASEMAP, DEFAULT_BASEMAP, useAppStore } from "@geolibre/core";
import {
  choiceUrl,
  currentChoice,
  hostedProtomapsFlavor,
  labelsState,
  legacyBasemapName,
  OFFLINE_SENTINEL_PREFIX,
  parseSwiftmapBasemap,
  parseTileLink,
  pickerChoices,
  swiftmapBasemapUrl,
  tileLinkOf,
  withLabels,
} from "../apps/geolibre-desktop/src/components/basemap/basemap-catalog";
import {
  buildSwiftmapBasemapStyle,
  NSW_IMAGERY_ATTRIBUTION,
} from "../apps/geolibre-desktop/src/components/basemap/basemap-styles";
import { ensureSwiftmapBasemap } from "../apps/geolibre-desktop/src/components/basemap/basemap-registry";
import { applyBasemap } from "../apps/geolibre-desktop/src/components/basemap/basemap-actions";
import {
  getOfflineBasemapStyle,
  OFFLINE_BASEMAP_SENTINEL_PREFIX,
} from "../packages/map/src/protomaps-basemap";
import { resolveMapStyle } from "../packages/map/src/basemap-style";

// SWIFTMAP (Change 28): Swiftmap's basemap catalog, styles and registry.

const S = "geolibre://offline-basemap/swiftmap/";
const KEY_ENV = { VITE_PROTOMAPS_API_KEY: "test-key" };
const NO_KEY_ENV = { VITE_PROTOMAPS_API_KEY: "" };
const HOSTED_LIGHT = "https://api.protomaps.com/styles/v5/light/en.json?key=k";
const HOSTED_WHITE = "https://api.protomaps.com/styles/v5/white/en.json?key=k";

function symbolLayers(style: { layers: { type: string }[] } | null) {
  return style?.layers.filter((layer) => layer.type === "symbol") ?? [];
}

describe("Swiftmap basemap sentinels", () => {
  it("use GeoLibre's offline-basemap prefix", () => {
    assert.equal(OFFLINE_SENTINEL_PREFIX, OFFLINE_BASEMAP_SENTINEL_PREFIX);
  });

  it("round-trip, with labels off in the sentinel", () => {
    const light = swiftmapBasemapUrl({ kind: "protomaps", flavor: "light", labels: true });
    assert.equal(light, `${S}light`);
    assert.equal(swiftmapBasemapUrl({ kind: "aerial", labels: false }), `${S}aerial?labels=off`);
    assert.deepEqual(parseSwiftmapBasemap(`${S}grayscale?labels=off`), {
      kind: "protomaps",
      flavor: "grayscale",
      labels: false,
    });
    const tiles = swiftmapBasemapUrl({
      kind: "tiles",
      tileUrl: "https://t.example.com/{z}/{x}/{y}.png?a=1&b=2",
      scheme: "tms",
    });
    assert.deepEqual(parseSwiftmapBasemap(tiles), {
      kind: "tiles",
      tileUrl: "https://t.example.com/{z}/{x}/{y}.png?a=1&b=2",
      scheme: "tms",
    });
  });

  it("ignore anything that isn't Swiftmap's", () => {
    for (const url of [
      DEFAULT_BASEMAP,
      BLANK_BASEMAP,
      "geolibre://offline-basemap/extract/1",
      `${S}moon`,
      `${S}tiles`,
    ]) {
      assert.equal(parseSwiftmapBasemap(url), null, url);
    }
  });
});

describe("Swiftmap basemap picker rows", () => {
  it("names the current row, counting hosted Protomaps styles", () => {
    assert.equal(currentChoice(`${S}light?labels=off`), "light");
    assert.equal(currentChoice(HOSTED_LIGHT), "light");
    assert.equal(currentChoice(`${S}grayscale`), "grey");
    assert.equal(currentChoice(`${S}aerial`), "aerial");
    assert.equal(currentChoice(BLANK_BASEMAP), "none");
    assert.equal(currentChoice(DEFAULT_BASEMAP), "liberty");
    assert.equal(currentChoice(HOSTED_WHITE), null);
    assert.equal(currentChoice("https://example.com/style.json"), null);
    assert.equal(hostedProtomapsFlavor(HOSTED_WHITE), "white");
  });

  it("lists Liberty only without a key", () => {
    assert.deepEqual(pickerChoices(true), ["light", "grey", "dark", "auto", "aerial", "none"]);
    assert.deepEqual(pickerChoices(false), ["liberty", "aerial", "none"]);
  });

  it("carries Show labels into a pick", () => {
    assert.equal(choiceUrl("dark", false), `${S}dark?labels=off`);
    assert.equal(choiceUrl("aerial", true), `${S}aerial`);
    assert.equal(choiceUrl("none", true), BLANK_BASEMAP);
    assert.equal(choiceUrl("liberty", false), DEFAULT_BASEMAP);
  });

  it("names legacy and custom basemaps", () => {
    assert.equal(
      legacyBasemapName("https://tiles.openfreemap.org/styles/dark"),
      "Dark (OpenFreeMap)",
    );
    assert.equal(legacyBasemapName(HOSTED_WHITE), "White");
    assert.equal(legacyBasemapName(`${S}black`), "Black");
    assert.equal(
      legacyBasemapName(parseTileLink("https://a.example.com/rest/services/Site/MapServer")!),
      "Site",
    );
    assert.equal(
      legacyBasemapName("https://styles.example.com/v1/style.json"),
      "styles.example.com",
    );
    assert.equal(legacyBasemapName("geolibre://offline-basemap/extract/1"), null);
  });
});

// SWIFTMAP (Change 33): the Auto basemap's link, row and labels.
describe("Swiftmap Auto basemap link", () => {
  it("is a sentinel of its own, with labels off in the query", () => {
    assert.equal(swiftmapBasemapUrl({ kind: "auto", labels: true }), `${S}auto`);
    assert.equal(swiftmapBasemapUrl({ kind: "auto", labels: false }), `${S}auto?labels=off`);
    assert.deepEqual(parseSwiftmapBasemap(`${S}auto?labels=off`), { kind: "auto", labels: false });
  });

  it("is the Auto row, picked with the current labels setting", () => {
    assert.equal(currentChoice(`${S}auto`), "auto");
    assert.equal(choiceUrl("auto", false), `${S}auto?labels=off`);
  });

  it("switches labels like Light and Dark, with a key", () => {
    assert.deepEqual(labelsState(`${S}auto`, true), { available: true, on: true });
    assert.deepEqual(labelsState(`${S}auto`, false), { available: false, on: true });
    assert.equal(withLabels(`${S}auto`, false), `${S}auto?labels=off`);
  });

  it("registers nothing without a key (the map shows Liberty)", () => {
    assert.equal(ensureSwiftmapBasemap(`${S}auto`, NO_KEY_ENV), false);
    assert.equal(getOfflineBasemapStyle(`${S}auto`), null);
  });
});

describe("Swiftmap Show labels", () => {
  it("works on Swiftmap's and hosted Protomaps basemaps, with a key", () => {
    assert.deepEqual(labelsState(`${S}light?labels=off`, true), { available: true, on: false });
    assert.deepEqual(labelsState(HOSTED_LIGHT, true), { available: true, on: true });
    assert.deepEqual(labelsState(`${S}aerial`, true), { available: true, on: true });
    assert.deepEqual(labelsState(`${S}aerial`, false), { available: false, on: true });
    for (const url of [BLANK_BASEMAP, DEFAULT_BASEMAP, `${S}tiles?url=x`]) {
      assert.equal(labelsState(url, true).available, false, url);
    }
  });

  it("switches a hosted style onto Swiftmap's sentinel, and leaves others alone", () => {
    assert.equal(withLabels(HOSTED_LIGHT, false), `${S}light?labels=off`);
    assert.equal(withLabels(`${S}aerial?labels=off`, true), `${S}aerial`);
    assert.equal(withLabels(DEFAULT_BASEMAP, false), DEFAULT_BASEMAP);
  });
});

describe("Swiftmap tile links", () => {
  it("accepts XYZ, TMS, ArcGIS MapServer and style links", () => {
    assert.equal(
      parseTileLink(" https://t.example.com/{z}/{x}/{y}.png "),
      swiftmapBasemapUrl({
        kind: "tiles",
        tileUrl: "https://t.example.com/{z}/{x}/{y}.png",
        scheme: "xyz",
      }),
    );
    assert.deepEqual(
      parseSwiftmapBasemap(parseTileLink("https://t.example.com/{z}/{x}/{-y}.png")!),
      {
        kind: "tiles",
        tileUrl: "https://t.example.com/{z}/{x}/{y}.png",
        scheme: "tms",
      },
    );
    assert.deepEqual(
      parseSwiftmapBasemap(
        parseTileLink("https://a.example.com/rest/services/Site/MapServer/?token=t")!,
      ),
      {
        kind: "tiles",
        tileUrl: "https://a.example.com/rest/services/Site/MapServer/tile/{z}/{y}/{x}?token=t",
        scheme: "xyz",
      },
    );
    assert.equal(
      parseTileLink("https://s.example.com/style.json"),
      "https://s.example.com/style.json",
    );
  });

  it("rejects anything else", () => {
    for (const text of [
      "",
      "tiles",
      "https://example.com/page",
      "ftp://t.example.com/{z}/{x}/{y}.png",
    ]) {
      assert.equal(parseTileLink(text), null, text);
    }
  });

  it("prefills the form with the link in use", () => {
    const tms = parseTileLink("https://t.example.com/{z}/{x}/{-y}.png")!;
    assert.equal(tileLinkOf(tms), "https://t.example.com/{z}/{x}/{-y}.png");
    assert.equal(
      tileLinkOf("https://s.example.com/style.json"),
      "https://s.example.com/style.json",
    );
    assert.equal(tileLinkOf(DEFAULT_BASEMAP), null);
    assert.equal(tileLinkOf(`${S}light`), null);
  });
});

describe("Swiftmap basemap styles", () => {
  it("drop the label layers when labels are off", () => {
    const on = buildSwiftmapBasemapStyle({ kind: "protomaps", flavor: "light", labels: true }, "k");
    const off = buildSwiftmapBasemapStyle(
      { kind: "protomaps", flavor: "light", labels: false },
      "k",
    );
    assert.ok(symbolLayers(on).length > 0);
    assert.equal(symbolLayers(off).length, 0);
    assert.ok(off!.layers.length > 0);
  });

  it("need a key for Protomaps, but not for the imagery", () => {
    assert.equal(
      buildSwiftmapBasemapStyle({ kind: "protomaps", flavor: "dark", labels: true }, undefined),
      null,
    );
    const plain = buildSwiftmapBasemapStyle({ kind: "aerial", labels: true }, undefined)!;
    assert.equal(symbolLayers(plain).length, 0);
    assert.equal(plain.sources.protomaps, undefined);
  });

  it("draw Aerial as a hybrid with white labels and the NSW attribution", () => {
    const hybrid = buildSwiftmapBasemapStyle({ kind: "aerial", labels: true }, "k")!;
    const labels = symbolLayers(hybrid) as { paint?: Record<string, unknown> }[];
    assert.ok(labels.length > 0);
    for (const layer of labels) assert.equal(layer.paint?.["text-color"], "#ffffff");
    const imagery = hybrid.sources["swiftmap-aerial"] as { attribution?: string; tiles?: string[] };
    assert.equal(imagery.attribution, NSW_IMAGERY_ATTRIBUTION);
    assert.match(imagery.tiles![0], /NSWWebImagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/);
    // The imagery sits under the labels.
    assert.equal(hybrid.layers[1].id, "swiftmap-aerial");
  });
});

describe("Swiftmap basemap registry", () => {
  // Swiftmap writes into GeoLibre's internal offline-style registry. If an
  // upstream release renames it, this fails instead of the map quietly
  // falling back to Liberty (UI_CUSTOMISATION.md, release checklist).
  it("is read back by GeoLibre's resolveMapStyle", () => {
    const url = `${S}dark?labels=off`;
    assert.equal(ensureSwiftmapBasemap(url, KEY_ENV), true);
    assert.ok(getOfflineBasemapStyle(url));
    const resolved = resolveMapStyle(url);
    assert.equal(typeof resolved, "object");
    assert.equal(symbolLayers(resolved as { layers: { type: string }[] }).length, 0);
  });

  it("leaves a Protomaps basemap unregistered without a key, so Liberty is drawn", () => {
    const url = `${S}grayscale`;
    assert.equal(ensureSwiftmapBasemap(url, NO_KEY_ENV), false);
    assert.equal(getOfflineBasemapStyle(url), null);
    assert.equal(ensureSwiftmapBasemap(DEFAULT_BASEMAP, KEY_ENV), false);
  });
});

describe("Applying a basemap", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it("shows a hidden or faded basemap again and marks the project changed", () => {
    useAppStore.setState({ basemapVisible: false, basemapOpacity: 0.4, isDirty: false });
    applyBasemap(`${S}aerial`);
    const state = useAppStore.getState();
    assert.equal(state.basemapStyleUrl, `${S}aerial`);
    assert.equal(state.basemapVisible, true);
    assert.equal(state.basemapOpacity, 1);
    assert.equal(state.isDirty, true);
  });

  it("applies a viewer's pick quietly: not dirty, no Undo step", () => {
    useAppStore.temporal.getState().clear();
    applyBasemap(BLANK_BASEMAP, { quiet: true });
    assert.equal(useAppStore.getState().basemapStyleUrl, BLANK_BASEMAP);
    assert.equal(useAppStore.getState().isDirty, false);
    assert.equal(useAppStore.temporal.getState().pastStates.length, 0);
  });
});
