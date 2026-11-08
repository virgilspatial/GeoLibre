import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import "./helpers/dom";

// SWIFTMAP (Change 30): DesktopShell is the file every GeoLibre merge touches
// on both sides, so this loads it to catch a merge that leaves it importing
// something gone or renamed. It also keeps the file in the coverage report,
// which the untested-modules ratchet reads.

describe("DesktopShell after a GeoLibre merge", () => {
  it("loads, with every import resolvable", async () => {
    const mod = await import("../apps/geolibre-desktop/src/components/layout/DesktopShell");
    assert.equal(typeof mod.DesktopShell, "function");
  });

  it("hides plugins by the ids GeoLibre registers", async () => {
    const { JAXA_EARTH_PLUGIN_ID } = await import("@geolibre/plugins");
    const { SWIFTMAP_HIDDEN_PLUGIN_IDS } =
      await import("../apps/geolibre-desktop/src/components/layout/swiftmap-hidden");
    assert.deepEqual([...SWIFTMAP_HIDDEN_PLUGIN_IDS], [JAXA_EARTH_PLUGIN_ID]);
  });

  it("hides indoor samples that GeoLibre still ships in the vector panel", () => {
    // The CSS hides them by URL; if GeoLibre renames a sample, update index.css.
    const vector = readFileSync(
      new URL("../packages/plugins/src/plugins/maplibre-vector.ts", import.meta.url),
      "utf8",
    );
    const css = readFileSync(
      new URL("../apps/geolibre-desktop/src/index.css", import.meta.url),
      "utf8",
    );
    for (const file of ["/berlin-hbf-indoor.geojson", "/Dinoseum.zip"]) {
      assert.ok(vector.includes(file), `GeoLibre still lists ${file}`);
      assert.ok(css.includes(`[title$="${file}"]`), `index.css hides ${file}`);
    }
  });
});
