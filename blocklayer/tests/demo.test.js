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

  it("has a plateau at 2, a raised 2x2 at 3, a sunken row at 1 and flat ground at 0", () => {
    const at = (elev) => tiles.filter((t) => t.elev === elev && t.shape === "block");
    assert.ok(at(2).length >= 28);
    assert.equal(at(3).length, 4);
    for (const elev of [1, 0]) {
      assert.ok(at(elev).length >= 6, `the row at ${elev}`);
      assert.equal(new Set(at(elev).map((t) => t.y)).size, 1, `the row at ${elev}`);
    }
  });

  it("reaches both ends of the elevation range, so the first view shows each", () => {
    const elevs = tiles.map((t) => t.elev);
    assert.equal(Math.min(...elevs), B.ELEV_MIN);
    assert.equal(Math.max(...elevs), B.ELEV_MAX);
  });

  it("climbs the raised square by a ramp and by stairs that face it", () => {
    const raised = new Set(tiles.filter((t) => t.elev === 3).map((t) => L.key(t.x, t.y)));
    const step = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
    for (const shape of ["ramp", "stairs"]) {
      const ways = tiles.filter((t) => t.shape === shape);
      assert.equal(ways.length, 1, shape);
      const [dx, dy] = step[ways[0].facing];
      assert.equal(ways[0].elev, 2);
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
