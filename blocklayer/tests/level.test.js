"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { inspect } = require("node:util");
const { load, tile } = require("./load");

const B = load(["config.js", "level.js"]);
const L = B.level;

const COLOR_KEYS = B.PALETTE.map((c) => c.key);
const DECOR_KEYS = B.DECOR.map((d) => d.key);
const MARK_KEYS = B.MARKS.map((m) => m.key);
const OTHER_COLOR = COLOR_KEYS.find((key) => key !== B.DEFAULT_COLOR);

// A board that is not square, so a size read the wrong way round shows.
const BOARD = { w: 3, h: 4 };
const ON_BOARD = [[0, 0], [BOARD.w - 1, 0], [0, BOARD.h - 1], [BOARD.w - 1, BOARD.h - 1]];
// The cell just past each edge, and the one past the far corner.
const OFF_BOARD = [[-1, 0], [0, -1], [BOARD.w, 0], [0, BOARD.h], [BOARD.w, BOARD.h]];

describe("level: tiles", () => {
  it("starts empty, on a board of the default size", () => {
    const level = L.create();
    assert.equal(L.count(level), 0);
    assert.deepEqual(L.all(level), []);
    assert.equal(L.get(level, 0, 0), null);
    assert.deepEqual(level.size, B.SIZE_DEFAULT);
  });

  it("keys a cell as x,y", () => {
    assert.equal(L.key(3, -4), "3,-4");
  });

  it("adds a block at the new-tile elevation, facing north, in the default colour", () => {
    const level = L.create();
    const tile = L.add(level, 2, 3);
    assert.deepEqual(tile, {
      x: 2, y: 3, elev: B.NEW_TILE_ELEV, color: B.DEFAULT_COLOR,
      shape: "block", facing: "N", decor: null, marks: []
    });
    assert.equal(L.get(level, 2, 3), tile);
    assert.equal(L.count(level), 1);
  });

  it("adds a tile in the colour it is given, and the default for any other", () => {
    const level = L.create();
    assert.equal(L.add(level, 0, 0, 1, OTHER_COLOR).color, OTHER_COLOR);
    assert.equal(L.add(level, 1, 0, 1, "puce").color, B.DEFAULT_COLOR);
    assert.equal(L.add(level, 2, 0, 1).color, B.DEFAULT_COLOR);
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
    const again = L.add(level, 0, 0, B.ELEV_MAX, OTHER_COLOR);
    assert.equal(again, first);
    assert.equal(again.elev, 2);
    assert.equal(again.color, B.DEFAULT_COLOR);
    assert.deepEqual(again.marks, ["rope"]);
    assert.equal(L.count(level), 1);
  });

  it("refuses a cell off the board and adds nothing", () => {
    const level = L.create(BOARD.w, BOARD.h);
    for (const [x, y] of OFF_BOARD) {
      assert.equal(L.add(level, x, y), null, `${x},${y}`);
    }
    assert.equal(L.count(level), 0);
  });

  it("adds at every corner of the board", () => {
    const level = L.create(BOARD.w, BOARD.h);
    for (const [x, y] of ON_BOARD) {
      assert.equal(L.add(level, x, y).x, x, `${x},${y}`);
    }
    assert.equal(L.count(level), ON_BOARD.length);
  });

  it("removes a tile and reports whether anything went", () => {
    const level = L.create();
    L.add(level, 0, 0);
    assert.equal(L.remove(level, 0, 0), true);
    assert.equal(L.get(level, 0, 0), null);
    assert.equal(L.remove(level, 0, 0), false);
    assert.equal(L.count(level), 0);
  });

  it("clears every tile and keeps the board", () => {
    const level = L.create(BOARD.w, BOARD.h);
    L.add(level, 0, 0);
    L.add(level, 1, 1);
    L.clear(level);
    assert.equal(L.count(level), 0);
    assert.equal(L.get(level, 1, 1), null);
    assert.deepEqual(level.size, BOARD);
  });

  it("lists all tiles", () => {
    const level = L.create();
    const a = L.add(level, 0, 0);
    const b = L.add(level, 1, 5);
    assert.deepEqual(new Set(L.all(level)), new Set([a, b]));
  });
});

describe("level: the board", () => {
  it("runs from one tile square to sixty-four, and starts twelve by twelve", () => {
    assert.deepEqual([B.SIZE_MIN, B.SIZE_MAX], [1, 64]);
    assert.deepEqual(B.SIZE_DEFAULT, { w: 12, h: 12 });
  });

  it("takes the size it is given", () => {
    assert.deepEqual(L.create(BOARD.w, BOARD.h).size, BOARD);
  });

  it("falls back to the default for a side it is given none", () => {
    assert.deepEqual(L.create().size, B.SIZE_DEFAULT);
    assert.deepEqual(L.create(BOARD.w).size, { w: BOARD.w, h: B.SIZE_DEFAULT.h });
    assert.deepEqual(L.create(undefined, BOARD.h).size, { w: B.SIZE_DEFAULT.w, h: BOARD.h });
  });

  it("falls back for a side that is no number at all", () => {
    for (const bad of [null, "3", NaN, Infinity, -Infinity, {}]) {
      assert.deepEqual(L.create(bad, bad).size, B.SIZE_DEFAULT, inspect(bad));
    }
  });

  it("clamps a size at both ends of the range", () => {
    assert.deepEqual(L.create(0, -1).size, { w: B.SIZE_MIN, h: B.SIZE_MIN });
    assert.deepEqual(L.create(B.SIZE_MAX + 1, B.SIZE_MAX * 2).size,
      { w: B.SIZE_MAX, h: B.SIZE_MAX });
  });

  it("rounds a fractional size to whole tiles", () => {
    assert.deepEqual(L.create(3.2, 4.7).size, { w: 3, h: 5 });
    assert.deepEqual(L.create(B.SIZE_MIN - 0.4, B.SIZE_MAX + 0.4).size,
      { w: B.SIZE_MIN, h: B.SIZE_MAX });
  });
});

describe("level: inside", () => {
  it("holds every cell of the board, from the first to the last", () => {
    const level = L.create(BOARD.w, BOARD.h);
    for (let y = 0; y < BOARD.h; y++) {
      for (let x = 0; x < BOARD.w; x++) assert.equal(L.inside(level, x, y), true, `${x},${y}`);
    }
  });

  it("leaves out the cell just past each edge", () => {
    const level = L.create(BOARD.w, BOARD.h);
    for (const [x, y] of OFF_BOARD) {
      assert.equal(L.inside(level, x, y), false, `${x},${y}`);
    }
  });

  it("holds the one cell of the smallest board and nothing around it", () => {
    const level = L.create(B.SIZE_MIN, B.SIZE_MIN);
    assert.equal(L.inside(level, 0, 0), true);
    for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      assert.equal(L.inside(level, x, y), false, `${x},${y}`);
    }
  });
});

describe("level: outside and resize", () => {
  const SMALLER = { w: 2, h: 2 };
  // The cells past that smaller board, and the cells still on it, in the order
  // the level is given them, which is not the order toJSON sorts them into.
  const DROPPED = [[BOARD.w - 1, BOARD.h - 1], [BOARD.w - 1, 0], [0, BOARD.h - 1]];
  const KEPT = [[0, 0], [1, 1]];
  const LAID_OUT = [DROPPED[0], KEPT[0], DROPPED[1], KEPT[1], DROPPED[2]];

  const cellsOf = (tiles) => tiles.map((t) => [t.x, t.y]);

  function board() {
    const level = L.create(BOARD.w, BOARD.h);
    for (const [x, y] of LAID_OUT) L.add(level, x, y);
    return level;
  }

  it("names the tiles a smaller board would drop, in the level's own order", () => {
    assert.deepEqual(cellsOf(L.outside(board(), SMALLER.w, SMALLER.h)), DROPPED);
  });

  it("names the tiles themselves, not copies of them", () => {
    const level = board();
    const [first] = L.outside(level, SMALLER.w, SMALLER.h);
    assert.equal(first, L.get(level, DROPPED[0][0], DROPPED[0][1]));
  });

  it("names nothing for a board that grows, or one of the same size", () => {
    const level = board();
    assert.deepEqual(L.outside(level, BOARD.w + 1, BOARD.h + 1), []);
    assert.deepEqual(L.outside(level, BOARD.w, BOARD.h), []);
  });

  it("changes nothing at all while naming them", () => {
    const level = board();
    const before = structuredClone(level);
    L.outside(level, SMALLER.w, SMALLER.h);
    assert.deepEqual(level, before);
  });

  it("clamps the size it is asked about, so a board of no size keeps one cell", () => {
    const pastTheFirstCell = LAID_OUT.filter(([x, y]) => !(x === 0 && y === 0));
    assert.deepEqual(cellsOf(L.outside(board(), 0, 0)), pastTheFirstCell);
  });

  it("resizes, drops what no longer fits and keeps the rest", () => {
    const level = board();
    assert.deepEqual(cellsOf(L.resize(level, SMALLER.w, SMALLER.h)), DROPPED);
    assert.deepEqual(level.size, SMALLER);
    assert.equal(L.count(level), KEPT.length);
    for (const [x, y] of KEPT) assert.ok(L.get(level, x, y), `${x},${y} stays`);
    for (const [x, y] of DROPPED) assert.equal(L.get(level, x, y), null, `${x},${y} goes`);
  });

  it("drops nothing when the board grows", () => {
    const level = board();
    assert.deepEqual(L.resize(level, BOARD.w + 1, BOARD.h + 1), []);
    assert.deepEqual(level.size, { w: BOARD.w + 1, h: BOARD.h + 1 });
    assert.equal(L.count(level), LAID_OUT.length);
  });

  it("clamps and rounds the new size, as create does", () => {
    const level = board();
    L.resize(level, B.SIZE_MAX + 1, BOARD.h + 0.4);
    assert.deepEqual(level.size, { w: B.SIZE_MAX, h: BOARD.h });
  });

  it("leaves a board that takes the cells the new one holds and refuses the rest", () => {
    const level = board();
    L.resize(level, SMALLER.w, SMALLER.h);
    assert.equal(L.add(level, DROPPED[0][0], DROPPED[0][1]), null);
    L.remove(level, KEPT[0][0], KEPT[0][1]);
    assert.ok(L.add(level, KEPT[0][0], KEPT[0][1]));
  });
});

describe("level: the elevation range", () => {
  it("runs from flat ground to seven blocks, and a new tile is one block high", () => {
    assert.deepEqual([B.ELEV_MIN, B.ELEV_MAX, B.NEW_TILE_ELEV], [0, 7, 1]);
  });

  it("puts the floor at the lowest elevation, where a tile carries no block", () => {
    assert.equal(B.FLOOR, B.ELEV_MIN);
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
    L.add(level, 0, 0, 2);
    assert.equal(L.raise(level, 0, 0, 1), 3);
    assert.equal(L.raise(level, 0, 0, -2), 1);
    assert.equal(L.get(level, 0, 0).elev, 1);
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

describe("level: raiseCells", () => {
  const ROW = 4;                   // tiles in the row each of these tests builds
  const COLUMNS = Array.from({ length: ROW }, (_, x) => x);
  const cells = (...pairs) => pairs.map(([x, y]) => ({ x, y }));

  // A row of blocks, each one step higher than the last.
  const stack = () => {
    const level = L.create();
    for (const x of COLUMNS) L.add(level, x, 0, x);
    return level;
  };

  const elevs = (level) => COLUMNS.map((x) => L.get(level, x, 0).elev);

  it("moves only the tiles at the cells it is given", () => {
    const level = stack();
    assert.equal(L.raiseCells(level, cells([1, 0], [2, 0]), 1), true);
    assert.deepEqual(elevs(level), [0, 2, 3, 3]);
    assert.equal(L.raiseCells(level, cells([1, 0], [2, 0]), -1), true);
    assert.deepEqual(elevs(level), [0, 1, 2, 3]);
  });

  it("moves none of them when one has no room, and leaves the rest of the level alone", () => {
    const level = stack();
    L.raise(level, 3, 0, B.ELEV_MAX);
    assert.deepEqual(elevs(level), [0, 1, 2, B.ELEV_MAX]);
    assert.equal(L.raiseCells(level, cells([2, 0], [3, 0]), 1), false);
    assert.deepEqual(elevs(level), [0, 1, 2, B.ELEV_MAX]);
  });

  it("refuses at the bottom of the range too", () => {
    const level = stack();
    assert.equal(L.raiseCells(level, cells([0, 0], [1, 0]), -1), false);
    assert.deepEqual(elevs(level), [0, 1, 2, 3]);
  });

  it("refuses when a ramp or stairs is at its own ceiling, though a block could rise", () => {
    for (const shape of ["ramp", "stairs"]) {
      const level = L.create();
      L.add(level, 0, 0, B.ELEV_MAX - 1);
      L.add(level, 1, 0, B.ELEV_MAX - 1);
      L.setShape(level, 1, 0, shape);
      const both = cells([0, 0], [1, 0]);
      assert.equal(L.raiseCells(level, both, 1), false, shape);
      assert.equal(L.raiseCells(level, cells([0, 0]), 1), true, shape);
      assert.equal(L.get(level, 0, 0).elev, B.ELEV_MAX, shape);
      assert.equal(L.get(level, 1, 0).elev, B.ELEV_MAX - 1, shape);
    }
  });

  it("takes an empty list as nothing to do", () => {
    const level = stack();
    assert.equal(L.raiseCells(level, [], 1), false);
    assert.deepEqual(elevs(level), [0, 1, 2, 3]);
  });

  it("moves a tile once however often its cell is named", () => {
    const level = stack();
    const twice = cells([1, 0], [1, 0]);
    assert.equal(L.raiseCells(level, twice, 1), true);
    assert.deepEqual(elevs(level), [0, 2, 2, 3]);
    L.raise(level, 1, 0, B.ELEV_MAX);
    assert.equal(L.raiseCells(level, twice, 1), false);
    assert.equal(L.get(level, 1, 0).elev, B.ELEV_MAX);
  });

  it("passes over a cell that holds no tile", () => {
    const level = stack();
    assert.equal(L.raiseCells(level, cells([0, 0], [9, 9]), 1), true);
    assert.deepEqual(elevs(level), [1, 1, 2, 3]);
    assert.equal(L.raiseCells(level, cells([9, 9]), 1), false);
    assert.equal(L.get(level, 9, 9), null);
  });
});

describe("level: raiseAll", () => {
  it("moves every tile by the delta and reports that it moved", () => {
    const level = L.create();
    L.add(level, 0, 0, B.ELEV_MIN);
    L.add(level, 1, 0, B.NEW_TILE_ELEV);
    assert.equal(L.raiseAll(level, 1), true);
    assert.equal(L.get(level, 0, 0).elev, B.ELEV_MIN + 1);
    assert.equal(L.get(level, 1, 0).elev, B.NEW_TILE_ELEV + 1);
    assert.equal(L.raiseAll(level, -1), true);
    assert.equal(L.get(level, 0, 0).elev, B.ELEV_MIN);
    assert.equal(L.get(level, 1, 0).elev, B.NEW_TILE_ELEV);
  });

  // The tile that refuses is added last, so a level left half-moved shows.
  it("moves nothing when one tile is already at the end of the range", () => {
    for (const [delta, edge] of [[1, B.ELEV_MAX], [-1, B.ELEV_MIN]]) {
      const level = L.create();
      L.add(level, 0, 0, B.NEW_TILE_ELEV);
      L.add(level, 1, 0, edge);
      assert.equal(L.raiseAll(level, delta), false, String(delta));
      assert.equal(L.get(level, 0, 0).elev, B.NEW_TILE_ELEV, String(delta));
      assert.equal(L.get(level, 1, 0).elev, edge, String(delta));
    }
  });

  it("moves nothing when a ramp or stairs is at its own ceiling, though a block could rise", () => {
    for (const shape of ["ramp", "stairs"]) {
      const level = L.create();
      L.add(level, 0, 0, B.ELEV_MIN + 1);
      L.add(level, 1, 0, B.ELEV_MAX - 1);
      L.setShape(level, 1, 0, shape);
      assert.equal(L.raiseAll(level, 1), false, shape);
      assert.equal(L.get(level, 0, 0).elev, B.ELEV_MIN + 1, shape);
      assert.equal(L.get(level, 1, 0).elev, B.ELEV_MAX - 1, shape);
      assert.equal(L.raiseAll(level, -1), true, shape);
      assert.equal(L.get(level, 0, 0).elev, B.ELEV_MIN, shape);
      assert.equal(L.get(level, 1, 0).elev, B.ELEV_MAX - 2, shape);
    }
  });

  it("reports that an empty level did not move", () => {
    assert.equal(L.raiseAll(L.create(), 1), false);
  });
});

describe("level: setColor", () => {
  it("paints a tile a colour the palette holds and returns it", () => {
    const level = L.create();
    const tile = L.add(level, 0, 0);
    assert.equal(L.setColor(level, 0, 0, OTHER_COLOR), OTHER_COLOR);
    assert.equal(tile.color, OTHER_COLOR);
  });

  it("ignores a colour the palette does not hold", () => {
    const level = L.create();
    L.add(level, 0, 0);
    L.setColor(level, 0, 0, OTHER_COLOR);
    for (const bad of ["puce", "#ff0000", "", 3, null, undefined]) {
      assert.equal(L.setColor(level, 0, 0, bad), OTHER_COLOR, inspect(bad));
    }
  });

  it("accepts every colour in the palette", () => {
    const level = L.create();
    L.add(level, 0, 0);
    for (const k of COLOR_KEYS) assert.equal(L.setColor(level, 0, 0, k), k);
  });

  it("returns null when there is no tile", () => {
    assert.equal(L.setColor(L.create(), 5, 5, OTHER_COLOR), null);
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

  it("cycles the other way for a step of -1", () => {
    const level = L.create();
    L.add(level, 0, 0);
    assert.equal(L.cycleFacing(level, 0, 0, -1), "W");
    assert.equal(L.cycleFacing(level, 0, 0, -1), "S");
    assert.equal(L.cycleFacing(level, 0, 0, -1), "E");
    assert.equal(L.cycleFacing(level, 0, 0, -1), "N");
    assert.equal(L.cycleFacing(level, 0, 0, 1), "E");
    assert.equal(L.cycleFacing(level, 5, 5, -1), null);
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
  it("writes version 3, the board's size, and the tiles sorted by y then x", () => {
    const level = L.create(BOARD.w, BOARD.h);
    L.add(level, 2, 1);
    L.add(level, 0, 1);
    L.add(level, 2, 0, 4, OTHER_COLOR);
    L.setShape(level, 2, 0, "stairs");
    L.setFacing(level, 2, 0, "S");
    L.setDecor(level, 2, 0, "rock");
    L.toggleMark(level, 2, 0, "teleport");
    const plain = {
      elev: B.NEW_TILE_ELEV, color: B.DEFAULT_COLOR,
      shape: "block", facing: "N", decor: null, marks: []
    };
    assert.deepEqual(L.toJSON(level), {
      version: 3,
      size: BOARD,
      tiles: [
        {
          x: 2, y: 0, elev: 4, color: OTHER_COLOR,
          shape: "stairs", facing: "S", decor: "rock", marks: ["teleport"]
        },
        { x: 0, y: 1, ...plain },
        { x: 2, y: 1, ...plain }
      ]
    });
  });

  it("writes an empty level as its board and no tiles", () => {
    assert.deepEqual(L.toJSON(L.create()), {
      version: 3, size: B.SIZE_DEFAULT, tiles: []
    });
  });

  it("is stable regardless of insertion order", () => {
    const a = L.create();
    const b = L.create();
    for (const [x, y] of [[3, 3], [1, 0], [0, 1], [2, 3]]) L.add(a, x, y);
    for (const [x, y] of [[2, 3], [0, 1], [3, 3], [1, 0]]) L.add(b, x, y);
    assert.deepEqual(L.toJSON(a), L.toJSON(b));
  });

  it("returns fresh data that does not alias the level", () => {
    const level = L.create(BOARD.w, BOARD.h);
    const tile = L.add(level, 0, 0);
    L.toggleMark(level, 0, 0, "rope");
    const data = L.toJSON(level);
    data.tiles[0].marks.push("jump");
    data.tiles[0].elev = 3;
    data.size.w = BOARD.w + 1;
    assert.deepEqual(tile.marks, ["rope"]);
    assert.equal(tile.elev, B.NEW_TILE_ELEV);
    assert.deepEqual(level.size, BOARD);
  });
});

describe("level: fromJSON", () => {
  it("returns null for anything that is not an object with a tiles array", () => {
    for (const bad of [null, undefined, 42, "level", [], {}, { tiles: {} }, { tiles: "x" }]) {
      assert.equal(L.fromJSON(bad), null, `for ${JSON.stringify(bad)}`);
    }
  });

  it("reads an empty level as an empty level on the smallest board", () => {
    assert.deepEqual(L.fromJSON({ version: 2, tiles: [] }),
      L.create(B.SIZE_MIN, B.SIZE_MIN));
  });

  it("reads the board size the file names", () => {
    assert.deepEqual(L.fromJSON({ version: 3, size: BOARD, tiles: [] }).size, BOARD);
  });

  it("takes the smallest board that holds the tiles when the file names no size", () => {
    const level = L.fromJSON({ version: 2, tiles: [tile({ x: 1, y: 2 }), tile({ x: 3, y: 0 })] });
    assert.deepEqual(level.size, { w: 4, h: 3 });
    assert.ok(L.get(level, 1, 2), "the tile stays where it was");
    assert.ok(L.get(level, 3, 0), "and so does the other");
  });

  it("takes that board for a size it cannot read", () => {
    const tiles = [tile({ x: 1, y: 2 })];
    const fitted = { w: 2, h: 3 };
    const bad = [
      null, "3", 12, [], {}, { w: 2 }, { h: 3 }, { w: "2", h: 3 }, { w: 2.5, h: 3 },
      { w: B.SIZE_MIN - 1, h: 3 }, { w: 2, h: B.SIZE_MAX + 1 }, { w: NaN, h: 3 }
    ];
    for (const size of bad) {
      assert.deepEqual(L.fromJSON({ version: 3, size, tiles }).size, fitted, inspect(size));
    }
  });

  // The board starts at 0,0, so a file written before it existed can name a
  // cell no board holds.
  it("drops a tile at a negative cell instead of shifting the board to hold it", () => {
    const level = L.fromJSON({
      version: 2,
      tiles: [tile({ x: -3, y: 0 }), tile({ x: 0, y: -4 }), tile({ x: 1, y: 2 })]
    });
    assert.deepEqual(level.size, { w: 2, h: 3 });
    assert.equal(L.count(level), 1);
    assert.deepEqual(L.get(level, 1, 2), tile({ x: 1, y: 2 }));
  });

  it("reads the smallest board a file can name", () => {
    const level = L.fromJSON({
      version: 3,
      size: { w: B.SIZE_MIN, h: B.SIZE_MIN },
      tiles: [tile({ x: 0, y: 0 }), tile({ x: 1, y: 0 })]
    });
    assert.deepEqual(level.size, { w: B.SIZE_MIN, h: B.SIZE_MIN });
    assert.equal(L.count(level), 1);
  });

  it("clamps the fitted board to the largest one, dropping what will not fit", () => {
    const level = L.fromJSON({ tiles: [tile({ x: 0, y: 0 }), tile({ x: B.SIZE_MAX, y: 0 })] });
    assert.deepEqual(level.size, { w: B.SIZE_MAX, h: B.SIZE_MIN });
    assert.equal(L.count(level), 1);
  });

  it("drops a tile that stands off the board the file names", () => {
    const level = L.fromJSON({
      version: 3,
      size: { w: 2, h: 2 },
      tiles: [tile({ x: 0, y: 0 }), tile({ x: 2, y: 0 }), tile({ x: 0, y: 2 }), tile({ x: -1, y: 0 })]
    });
    assert.equal(L.count(level), 1);
    assert.deepEqual(L.get(level, 0, 0), tile({ x: 0, y: 0 }));
  });

  it("drops fields it does not know", () => {
    const level = L.fromJSON({ tiles: [tile({ extra: 1 })] });
    assert.deepEqual(L.get(level, 1, 2), tile());
  });

  it("reads a good tile in full", () => {
    const raw = tile({
      elev: 5, color: OTHER_COLOR, shape: "stairs", facing: "W", decor: "chest", marks: ["jump"]
    });
    const level = L.fromJSON({ version: 2, tiles: [raw] });
    assert.deepEqual(L.get(level, 1, 2), raw);
    assert.notEqual(L.get(level, 1, 2), raw);
    assert.notEqual(L.get(level, 1, 2).marks, raw.marks);
  });

  it("accepts every colour in the palette", () => {
    for (const color of COLOR_KEYS) {
      const level = L.fromJSON({ version: 2, tiles: [tile({ color })] });
      assert.equal(L.get(level, 1, 2).color, color);
    }
  });

  // Version 1 named no colour on a tile, so such a file still opens.
  it("fills in a missing colour with the default, and a missing decor and marks", () => {
    const level = L.fromJSON({
      version: 1,
      tiles: [{ x: 0, y: 0, elev: 0, shape: "block", facing: "N" }]
    });
    assert.deepEqual(L.get(level, 0, 0), tile({ x: 0, y: 0, color: B.DEFAULT_COLOR }));
  });

  it("drops each kind of bad tile and keeps the good ones around it", () => {
    const bad = [
      null, 7, "tile", [],
      tile({ x: 1.5 }), tile({ y: "2" }), tile({ x: NaN }), tile({ y: Infinity }),
      tile({ elev: B.ELEV_MAX + 1 }), tile({ elev: B.ELEV_MIN - 1 }),
      tile({ elev: 0.5 }), tile({ elev: "0" }), tile({ elev: undefined }),
      tile({ color: "puce" }), tile({ color: "#7ed957" }), tile({ color: null }),
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

  it("brings back a board with more room than its tiles need", () => {
    const level = L.create(B.SIZE_MAX, B.SIZE_MAX);
    L.add(level, 0, 0);
    assert.deepEqual(L.fromJSON(JSON.parse(JSON.stringify(L.toJSON(level)))), level);
  });

  it("round-trips through toJSON", () => {
    const level = L.create(BOARD.w, BOARD.h);
    L.add(level, 2, 3, 2, OTHER_COLOR);
    L.setShape(level, 2, 3, "ramp");
    L.setFacing(level, 2, 3, "S");
    L.setDecor(level, 2, 3, "crystal-yellow");
    L.toggleMark(level, 2, 3, "arrow-sw");
    L.toggleMark(level, 2, 3, "teleport");
    L.add(level, 4, 0, B.ELEV_MIN);
    assert.deepEqual(L.fromJSON(JSON.parse(JSON.stringify(L.toJSON(level)))), level);
  });
});
