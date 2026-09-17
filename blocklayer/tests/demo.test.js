"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const B = load(["config.js", "level.js", "view.js", "demo.js"]);
const L = B.level;

const DECOR_KEYS = B.DECOR.map((d) => d.key);
const FIRST_ROT = B.view.create().rot;

describe("demo: the first level", () => {
  const demo = B.demo.level();
  const tiles = L.all(demo);

  it("survives a round-trip through toJSON and fromJSON unchanged", () => {
    assert.deepEqual(L.fromJSON(JSON.parse(JSON.stringify(L.toJSON(demo)))), demo);
  });

  it("is a fresh level each time", () => {
    const other = B.demo.level();
    assert.deepEqual(other, demo);
    assert.notEqual(other, demo);
    L.clear(other);
    assert.equal(L.count(demo), tiles.length);
  });

  it("has a plateau at 0, a raised 2x2 at +1 and a sunken row at -1", () => {
    const at = (elev) => tiles.filter((t) => t.elev === elev && t.shape === "block");
    assert.ok(at(0).length >= 30);
    assert.equal(at(1).length, 4);
    assert.ok(at(-1).length >= 6);
    assert.equal(new Set(at(-1).map((t) => t.y)).size, 1);
  });

  it("climbs the raised square by a ramp and by stairs that face it", () => {
    const raised = new Set(tiles.filter((t) => t.elev === 1).map((t) => L.key(t.x, t.y)));
    const step = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
    for (const shape of ["ramp", "stairs"]) {
      const ways = tiles.filter((t) => t.shape === shape);
      assert.equal(ways.length, 1, shape);
      const [dx, dy] = step[ways[0].facing];
      assert.equal(ways[0].elev, 0);
      assert.ok(raised.has(L.key(ways[0].x + dx, ways[0].y + dy)), `${shape} faces the top`);
    }
  });

  it("rises away from the first view's camera on both slopes, so each is in sight", () => {
    const slopes = tiles.filter((t) => t.shape !== "block");
    assert.equal(slopes.length, 2);
    for (const t of slopes) {
      const seen = B.view.viewFacing(FIRST_ROT, t.facing);
      assert.ok(seen === "ur" || seen === "ul", `${t.shape} facing ${t.facing} is seen ${seen}`);
    }
  });

  it("shows every decor object once", () => {
    const placed = tiles.map((t) => t.decor).filter(Boolean);
    assert.deepEqual(new Set(placed), new Set(DECOR_KEYS));
    assert.equal(placed.length, DECOR_KEYS.length);
  });

  it("shows an arrow pair, a teleport, a rope and a jump", () => {
    const marks = tiles.flatMap((t) => t.marks);
    assert.equal(marks.filter((m) => m.startsWith("arrow-")).length, 2);
    for (const m of ["teleport", "rope", "jump"]) assert.ok(marks.includes(m), m);
  });
});
