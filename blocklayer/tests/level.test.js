"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { inspect } = require("node:util");
const { load, tile } = require("./load");

const B = load(["config.js", "level.js"]);
const L = B.level;

const DECOR_KEYS = B.DECOR.map((d) => d.key);
const MARK_KEYS = B.MARKS.map((m) => m.key);

describe("level: tiles", () => {
  it("starts empty", () => {
    const level = L.create();
    assert.equal(L.count(level), 0);
    assert.deepEqual(L.all(level), []);
    assert.equal(L.get(level, 0, 0), null);
  });

  it("keys a cell as x,y", () => {
    assert.equal(L.key(3, -4), "3,-4");
  });

  it("adds a block at the new-tile elevation facing north", () => {
    const level = L.create();
    const tile = L.add(level, 2, 3);
    assert.deepEqual(tile, {
      x: 2, y: 3, elev: B.NEW_TILE_ELEV, shape: "block", facing: "N", decor: null, marks: []
    });
    assert.equal(L.get(level, 2, 3), tile);
    assert.equal(L.count(level), 1);
  });

  it("clamps the elevation of an added tile", () => {
    const level = L.create();
    assert.equal(L.add(level, 0, 0, 99).elev, B.ELEV_MAX);
    assert.equal(L.add(level, 1, 0, -99).elev, B.ELEV_MIN);
    assert.equal(L.add(level, 2, 0, 2).elev, 2);
  });

  it("returns an existing tile untouched instead of replacing it", () => {
    const level = L.create();
    const first = L.add(level, 0, 0, 2);
    L.toggleMark(level, 0, 0, "rope");
    const again = L.add(level, 0, 0, -3);
    assert.equal(again, first);
    assert.equal(again.elev, 2);
    assert.deepEqual(again.marks, ["rope"]);
    assert.equal(L.count(level), 1);
  });

  it("removes a tile and reports whether anything went", () => {
    const level = L.create();
    L.add(level, 0, 0);
    assert.equal(L.remove(level, 0, 0), true);
    assert.equal(L.get(level, 0, 0), null);
    assert.equal(L.remove(level, 0, 0), false);
    assert.equal(L.count(level), 0);
  });

  it("clears every tile", () => {
    const level = L.create();
    L.add(level, 0, 0);
    L.add(level, 1, 1);
    L.clear(level);
    assert.equal(L.count(level), 0);
    assert.equal(L.get(level, 1, 1), null);
  });

  it("lists all tiles", () => {
    const level = L.create();
    const a = L.add(level, 0, 0);
    const b = L.add(level, -1, 5);
    assert.deepEqual(new Set(L.all(level)), new Set([a, b]));
  });
});

describe("level: sloped, top and maxElev", () => {
  it("a block is flat, tops out at its elevation and can reach the max", () => {
    const block = tile({ elev: 2 });
    assert.equal(L.sloped(block), false);
    assert.equal(L.top(block), 2);
    assert.equal(L.maxElev(block), B.ELEV_MAX);
  });

  it("a ramp or stairs is sloped, tops out one block higher and so stops one lower", () => {
    for (const shape of ["ramp", "stairs"]) {
      const sloped = tile({ elev: 2, shape });
      assert.equal(L.sloped(sloped), true);
      assert.equal(L.top(sloped), 3);
      assert.equal(L.maxElev(sloped), B.ELEV_MAX - 1);
    }
  });
});

describe("level: raise", () => {
  it("moves the elevation by the delta and returns it", () => {
    const level = L.create();
    L.add(level, 0, 0, 0);
    assert.equal(L.raise(level, 0, 0, 1), 1);
    assert.equal(L.raise(level, 0, 0, -2), -1);
    assert.equal(L.get(level, 0, 0).elev, -1);
  });

  it("clamps at the top and the bottom", () => {
    const level = L.create();
    L.add(level, 0, 0, 0);
    assert.equal(L.raise(level, 0, 0, 10), B.ELEV_MAX);
    assert.equal(L.raise(level, 0, 0, 1), B.ELEV_MAX);
    assert.equal(L.raise(level, 0, 0, -10), B.ELEV_MIN);
    assert.equal(L.raise(level, 0, 0, -1), B.ELEV_MIN);
  });

  it("stops a ramp or stairs one step below the max", () => {
    for (const shape of ["ramp", "stairs"]) {
      const level = L.create();
      L.add(level, 0, 0, 0);
      L.setShape(level, 0, 0, shape);
      assert.equal(L.raise(level, 0, 0, 10), B.ELEV_MAX - 1, shape);
    }
  });

  it("returns null when there is no tile", () => {
    assert.equal(L.raise(L.create(), 0, 0, 1), null);
  });
});

describe("level: setShape", () => {
  it("changes the shape and returns the tile", () => {
    const level = L.create();
    const tile = L.add(level, 0, 0);
    assert.equal(L.setShape(level, 0, 0, "stairs"), tile);
    assert.equal(tile.shape, "stairs");
  });

  it("lowers a tile at the max to the sloped shape's max", () => {
    for (const shape of ["ramp", "stairs"]) {
      const level = L.create();
      L.add(level, 0, 0, B.ELEV_MAX);
      assert.equal(L.setShape(level, 0, 0, shape).elev, B.ELEV_MAX - 1, shape);
      assert.equal(L.setShape(level, 0, 0, "block").elev, B.ELEV_MAX - 1, shape);
    }
  });

  it("ignores an unknown shape", () => {
    const level = L.create();
    L.add(level, 0, 0);
    assert.equal(L.setShape(level, 0, 0, "dome").shape, "block");
  });

  it("returns null when there is no tile", () => {
    assert.equal(L.setShape(L.create(), 0, 0, "ramp"), null);
  });
});

describe("level: facing", () => {
  it("sets a known facing and ignores an unknown one", () => {
    const level = L.create();
    L.add(level, 0, 0);
    assert.equal(L.setFacing(level, 0, 0, "W"), "W");
    assert.equal(L.setFacing(level, 0, 0, "up"), "W");
    assert.equal(L.setFacing(level, 5, 5, "N"), null);
  });

  it("cycles N, E, S, W and back", () => {
    const level = L.create();
    L.add(level, 0, 0);
    assert.equal(L.cycleFacing(level, 0, 0), "E");
    assert.equal(L.cycleFacing(level, 0, 0), "S");
    assert.equal(L.cycleFacing(level, 0, 0), "W");
    assert.equal(L.cycleFacing(level, 0, 0), "N");
    assert.equal(L.cycleFacing(level, 5, 5), null);
  });
});

describe("level: setDecor", () => {
  it("places one object, swaps it, and clears it on a repeat", () => {
    const level = L.create();
    L.add(level, 0, 0);
    assert.equal(L.setDecor(level, 0, 0, "chest"), "chest");
    assert.equal(L.setDecor(level, 0, 0, "rock"), "rock");
    assert.equal(L.setDecor(level, 0, 0, "rock"), null);
  });

  it("clears on null", () => {
    const level = L.create();
    L.add(level, 0, 0);
    L.setDecor(level, 0, 0, "crystal-red");
    assert.equal(L.setDecor(level, 0, 0, null), null);
    assert.equal(L.setDecor(level, 0, 0, null), null);
  });

  it("ignores unknown keys and missing tiles", () => {
    const level = L.create();
    L.add(level, 0, 0);
    L.setDecor(level, 0, 0, "chest");
    assert.equal(L.setDecor(level, 0, 0, "dragon"), "chest");
    assert.equal(L.setDecor(level, 0, 0, undefined), "chest");
    assert.equal(L.setDecor(level, 5, 5, "chest"), null);
  });

  it("accepts every decor key", () => {
    const level = L.create();
    L.add(level, 0, 0);
    for (const k of DECOR_KEYS) assert.equal(L.setDecor(level, 0, 0, k), k);
  });
});

describe("level: toggleMark", () => {
  it("adds, then removes, and never duplicates", () => {
    const level = L.create();
    const tile = L.add(level, 0, 0);
    assert.equal(L.toggleMark(level, 0, 0, "rope"), true);
    assert.equal(L.toggleMark(level, 0, 0, "jump"), true);
    assert.deepEqual(tile.marks, ["rope", "jump"]);
    assert.equal(L.toggleMark(level, 0, 0, "rope"), false);
    assert.deepEqual(tile.marks, ["jump"]);
    assert.equal(L.toggleMark(level, 0, 0, "rope"), true);
    assert.deepEqual(tile.marks, ["jump", "rope"]);
  });

  it("ignores unknown keys and missing tiles", () => {
    const level = L.create();
    const tile = L.add(level, 0, 0);
    assert.equal(L.toggleMark(level, 0, 0, "arrow-up"), false);
    assert.deepEqual(tile.marks, []);
    assert.equal(L.toggleMark(level, 5, 5, "rope"), false);
  });

  it("accepts every mark key", () => {
    const level = L.create();
    const tile = L.add(level, 0, 0);
    for (const k of MARK_KEYS) assert.equal(L.toggleMark(level, 0, 0, k), true);
    assert.deepEqual(tile.marks, MARK_KEYS);
  });
});

describe("level: toJSON", () => {
  it("writes version 1 and the tiles sorted by y then x", () => {
    const level = L.create();
    L.add(level, 2, 1);
    L.add(level, 0, 1);
    L.add(level, 5, 0, -2);
    L.setShape(level, 5, 0, "stairs");
    L.setFacing(level, 5, 0, "S");
    L.setDecor(level, 5, 0, "rock");
    L.toggleMark(level, 5, 0, "teleport");
    assert.deepEqual(L.toJSON(level), {
      version: 1,
      tiles: [
        { x: 5, y: 0, elev: -2, shape: "stairs", facing: "S", decor: "rock", marks: ["teleport"] },
        { x: 0, y: 1, elev: 0, shape: "block", facing: "N", decor: null, marks: [] },
        { x: 2, y: 1, elev: 0, shape: "block", facing: "N", decor: null, marks: [] }
      ]
    });
  });

  it("writes an empty level as no tiles", () => {
    assert.deepEqual(L.toJSON(L.create()), { version: 1, tiles: [] });
  });

  it("is stable regardless of insertion order", () => {
    const a = L.create();
    const b = L.create();
    for (const [x, y] of [[3, 3], [-1, 0], [0, -1], [2, 3]]) L.add(a, x, y);
    for (const [x, y] of [[2, 3], [0, -1], [3, 3], [-1, 0]]) L.add(b, x, y);
    assert.deepEqual(L.toJSON(a), L.toJSON(b));
  });

  it("returns fresh data that does not alias the level", () => {
    const level = L.create();
    const tile = L.add(level, 0, 0);
    L.toggleMark(level, 0, 0, "rope");
    const data = L.toJSON(level);
    data.tiles[0].marks.push("jump");
    data.tiles[0].elev = 3;
    assert.deepEqual(tile.marks, ["rope"]);
    assert.equal(tile.elev, 0);
  });
});

describe("level: fromJSON", () => {
  it("returns null for anything that is not an object with a tiles array", () => {
    for (const bad of [null, undefined, 42, "level", [], {}, { tiles: {} }, { tiles: "x" }]) {
      assert.equal(L.fromJSON(bad), null, `for ${JSON.stringify(bad)}`);
    }
  });

  it("reads an empty level as an empty level", () => {
    assert.deepEqual(L.fromJSON({ version: 1, tiles: [] }), L.create());
  });

  it("drops fields it does not know", () => {
    const level = L.fromJSON({ tiles: [tile({ extra: 1 })] });
    assert.deepEqual(L.get(level, 1, 2), tile());
  });

  it("reads a good tile in full", () => {
    const raw = tile({
      elev: -2, shape: "stairs", facing: "W", decor: "chest", marks: ["jump"]
    });
    const level = L.fromJSON({ version: 1, tiles: [raw] });
    assert.deepEqual(L.get(level, 1, 2), raw);
    assert.notEqual(L.get(level, 1, 2), raw);
    assert.notEqual(L.get(level, 1, 2).marks, raw.marks);
  });

  it("fills in a missing decor and missing marks", () => {
    const level = L.fromJSON({ tiles: [{ x: 0, y: 0, elev: 0, shape: "block", facing: "N" }] });
    assert.deepEqual(L.get(level, 0, 0), tile({ x: 0, y: 0 }));
  });

  it("drops each kind of bad tile and keeps the good ones around it", () => {
    const bad = [
      null, 7, "tile", [],
      tile({ x: 1.5 }), tile({ y: "2" }), tile({ x: NaN }), tile({ y: Infinity }),
      tile({ elev: B.ELEV_MAX + 1 }), tile({ elev: B.ELEV_MIN - 1 }),
      tile({ elev: 0.5 }), tile({ elev: "0" }), tile({ elev: undefined }),
      tile({ shape: "dome" }), tile({ shape: undefined }),
      tile({ facing: "up" }), tile({ facing: undefined }),
      tile({ decor: "dragon" }), tile({ decor: 3 })
    ];
    for (const raw of bad) {
      assert.equal(L.count(L.fromJSON({ tiles: [raw] })), 0, inspect(raw));
    }
    const level = L.fromJSON({ tiles: [tile({ x: 0 }), ...bad, tile({ x: 9 })] });
    assert.equal(L.count(level), 2);
    assert.deepEqual(L.get(level, 0, 2), tile({ x: 0 }));
    assert.deepEqual(L.get(level, 9, 2), tile({ x: 9 }));
  });

  it("drops unknown and repeated marks but keeps the tile", () => {
    const raw = tile({ marks: ["rope", "arrow-up", "rope", 4, null, "jump"] });
    const level = L.fromJSON({ tiles: [raw] });
    assert.deepEqual(L.get(level, 1, 2).marks, ["rope", "jump"]);
  });

  it("treats marks that are not an array as none", () => {
    const level = L.fromJSON({ tiles: [tile({ marks: "rope" })] });
    assert.deepEqual(L.get(level, 1, 2).marks, []);
  });

  it("keeps the first tile of a duplicated cell", () => {
    const level = L.fromJSON({ tiles: [tile({ elev: 1 }), tile({ elev: 2 })] });
    assert.equal(L.count(level), 1);
    assert.equal(L.get(level, 1, 2).elev, 1);
  });

  it("clamps a ramp or stairs above its max instead of dropping it", () => {
    const level = L.fromJSON({ tiles: [
      tile({ x: 0, shape: "ramp", elev: B.ELEV_MAX }),
      tile({ x: 1, shape: "stairs", elev: B.ELEV_MAX })
    ] });
    assert.equal(L.get(level, 0, 2).elev, B.ELEV_MAX - 1);
    assert.equal(L.get(level, 1, 2).elev, B.ELEV_MAX - 1);
  });

  it("round-trips through toJSON", () => {
    const level = L.create();
    L.add(level, -2, 3, 2);
    L.setShape(level, -2, 3, "ramp");
    L.setFacing(level, -2, 3, "S");
    L.setDecor(level, -2, 3, "crystal-yellow");
    L.toggleMark(level, -2, 3, "arrow-sw");
    L.toggleMark(level, -2, 3, "teleport");
    L.add(level, 4, 0, -3);
    assert.deepEqual(L.fromJSON(JSON.parse(JSON.stringify(L.toJSON(level)))), level);
  });
});
