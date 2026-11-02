import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LayerGroup } from "@geolibre/core";
import { geojsonLayer } from "./helpers/layer-fixtures";
import {
  buildLayerTree,
  detachNode,
  engineKeepsTree,
  groupLevel,
  insertNode,
  serializeTree,
  withinDepthLimit,
  writeLayerTree,
} from "../apps/geolibre-desktop/src/components/panels/layer-panel/layer-tree";

// SWIFTMAP: the Layers panel's tree for drag and drop (Change 18).
const group = (id: string, parentId?: string): LayerGroup => ({
  id,
  name: id,
  collapsed: false,
  visible: true,
  opacity: 1,
  ...(parentId ? { parentId } : {}),
});

/** Layers listed top of the panel first, as `name` or `name@group`. */
function layersTopFirst(...specs: string[]) {
  return specs
    .map((spec) => {
      const [id, groupId] = spec.split("@");
      return geojsonLayer({ id, name: id, ...(groupId ? { groupId } : {}) });
    })
    .reverse();
}

function move(
  layers: ReturnType<typeof layersTopFirst>,
  groups: LayerGroup[],
  key: string,
  parentId: string | null,
  index: number,
) {
  const tree = buildLayerTree(layers, groups);
  const { tree: detached, node } = detachNode(tree, key);
  assert.ok(node);
  const next = insertNode(detached, node, { parentId, index });
  assert.ok(next);
  return { next, kept: engineKeepsTree(next, layers, groups) };
}

describe("buildLayerTree", () => {
  it("nests groups and layers in panel order", () => {
    const groups = [group("env"), group("haz", "env")];
    const layers = layersTopFirst("top", "flood@haz", "fire@haz", "heritage@env", "base");
    assert.equal(
      serializeTree(buildLayerTree(layers, groups)),
      "top,env(haz(flood,fire),heritage),base",
    );
  });

  it("round-trips through the store arrays unchanged", () => {
    const groups = [group("env"), group("haz", "env"), group("empty")];
    const layers = layersTopFirst("flood@haz", "heritage@env", "base");
    const tree = buildLayerTree(layers, groups);
    const written = writeLayerTree(tree, layers, groups);
    assert.equal(serializeTree(buildLayerTree(written.layers, written.layerGroups)), serializeTree(tree));
    // Nothing moved, so every record keeps its identity.
    written.layers.forEach((layer) => assert.ok(layers.includes(layer)));
  });
});

describe("moving a node", () => {
  it("moves a layer into a group, writing its groupId", () => {
    const groups = [group("g")];
    const layers = layersTopFirst("a", "b@g", "c");
    const { next, kept } = move(layers, groups, "layer:c", "g", 0);
    assert.equal(kept, true);
    const written = writeLayerTree(next, layers, groups);
    assert.equal(written.layers.find((l) => l.id === "c")?.groupId, "g");
    assert.equal(serializeTree(buildLayerTree(written.layers, written.layerGroups)), "a,g(c,b)");
  });

  it("moves a group with everything inside it", () => {
    const groups = [group("g"), group("h")];
    const layers = layersTopFirst("x@g", "y@h", "z@h");
    const { next, kept } = move(layers, groups, "group:h", null, 0);
    assert.equal(kept, true);
    assert.equal(serializeTree(next), "h(y,z),g(x)");
  });

  it("can't split a group's own layers with a subgroup (engine limit)", () => {
    const groups = [group("env"), group("haz", "env")];
    const layers = layersTopFirst("flood@haz", "heritage@env", "species@env");
    // Between heritage and species: the engine would gather them back together.
    assert.equal(move(layers, groups, "group:haz", "env", 1).kept, false);
    // Above or below the group's own layers is fine.
    assert.equal(move(layers, groups, "group:haz", "env", 2).kept, true);
  });

  it("keeps an empty group only beside other groups", () => {
    const groups = [group("empty"), group("g")];
    const layers = layersTopFirst("a", "b@g");
    assert.equal(serializeTree(buildLayerTree(layers, groups)), "a,empty(),g(b)");
    // Above the layer, with no group beside it: not representable.
    assert.equal(move(layers, groups, "group:empty", null, 0).kept, false);
    // Directly below the other group is.
    assert.equal(move(layers, groups, "group:empty", null, 2).kept, true);
  });
});

describe("depth limit", () => {
  const groups = [group("one"), group("two", "one"), group("three", "two"), group("other")];
  it("counts levels from the top of the panel", () => {
    assert.equal(groupLevel(groups, null), 0);
    assert.equal(groupLevel(groups, "three"), 3);
  });

  it("allows three levels of groups and no more", () => {
    const tree = buildLayerTree(layersTopFirst("a"), groups);
    const { node } = detachNode(tree, "group:other");
    assert.ok(node);
    assert.equal(withinDepthLimit(groups, node, "two"), true);
    assert.equal(withinDepthLimit(groups, node, "three"), false);
    // A layer can go into the deepest group.
    assert.equal(withinDepthLimit(groups, { kind: "layer", id: "a" }, "three"), true);
  });
});
