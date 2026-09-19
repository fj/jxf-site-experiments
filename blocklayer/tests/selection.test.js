"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load, tile } = require("./load");

const B = load(["config.js", "selection.js"]);
const S = B.selection;

const cellsOf = (cells) => cells.map((cell) => [cell.x, cell.y]);
const at = (pairs) => pairs.map(([x, y]) => ({ x, y }));

describe("selection: holds", () => {
  const cells = at([[0, 0], [-1, 3]]);

  it("finds a cell the list holds, wherever it sits in it", () => {
    assert.equal(S.holds(cells, 0, 0), true);
    assert.equal(S.holds(cells, -1, 3), true);
  });

  it("does not find a cell the list is missing", () => {
    assert.equal(S.holds(cells, 3, -1), false);
    assert.equal(S.holds(cells, 0, 3), false);
  });

  it("holds nothing when it is empty", () => {
    assert.equal(S.holds([], 0, 0), false);
  });

  it("reads a list of tiles as the cells they stand on, as the renderer asks it", () => {
    assert.equal(S.holds([tile({ x: 4, y: 5 })], 4, 5), true);
    assert.equal(S.holds([tile({ x: 4, y: 5 })], 5, 4), false);
  });

  it("passes over a slot holding nothing, as sameCell does", () => {
    assert.equal(S.holds([null, { x: 1, y: 1 }], 1, 1), true);
    assert.equal(S.holds([null, undefined], 1, 1), false);
  });
});

describe("selection: only", () => {
  it("is the one cell, as a cell and not as the tile", () => {
    assert.deepEqual(S.only(2, -3), [{ x: 2, y: -3 }]);
  });
});

describe("selection: add", () => {
  it("takes the tiles in as cells, in the order swept", () => {
    const next = S.add([], [tile({ x: 1, y: 0 }), tile({ x: 0, y: 2 })]);
    assert.deepEqual(next, at([[1, 0], [0, 2]]));
  });

  it("keeps a cell it already holds in its place, and adds it no second time", () => {
    const cells = at([[0, 0], [1, 1]]);
    const next = S.add(cells, at([[1, 1], [2, 2]]));
    assert.deepEqual(cellsOf(next), [[0, 0], [1, 1], [2, 2]]);
  });

  it("adds a cell named twice in one go only once", () => {
    assert.deepEqual(cellsOf(S.add([], at([[4, 4], [4, 4]]))), [[4, 4]]);
  });

  it("answers the very list it was given when every cell is already there", () => {
    const cells = at([[0, 0], [1, 1]]);
    assert.equal(S.add(cells, at([[1, 1], [0, 0]])), cells);
    assert.equal(S.add(cells, []), cells);
    assert.equal(S.add([], []).length, 0);
  });

  it("leaves the list it was given as it found it", () => {
    const cells = at([[0, 0]]);
    S.add(cells, at([[1, 1]]));
    assert.deepEqual(cellsOf(cells), [[0, 0]]);
  });

  it("takes cells, not the tiles, so an edit to a tile does not reach the selection", () => {
    const source = tile({ x: 5, y: 6, elev: 2 });
    const next = S.add([], [source]);
    assert.notEqual(next[0], source);
    assert.deepEqual(next[0], { x: 5, y: 6 });
  });
});

describe("selection: remove", () => {
  it("takes the cell out and leaves the rest in order", () => {
    const cells = at([[0, 0], [1, 1], [2, 2]]);
    assert.deepEqual(cellsOf(S.remove(cells, 1, 1)), [[0, 0], [2, 2]]);
    assert.equal(S.holds(S.remove(cells, 1, 1), 1, 1), false);
  });

  it("takes out every copy of a cell, however it got in", () => {
    assert.deepEqual(S.remove(at([[1, 1], [1, 1]]), 1, 1), []);
  });

  it("answers the very list it was given for a cell that is not there", () => {
    const cells = at([[0, 0]]);
    assert.equal(S.remove(cells, 9, 9), cells);
    assert.equal(S.remove([], 0, 0).length, 0);
  });

  it("leaves the list it was given as it found it", () => {
    const cells = at([[0, 0], [1, 1]]);
    S.remove(cells, 0, 0);
    assert.deepEqual(cellsOf(cells), [[0, 0], [1, 1]]);
  });

  it("empties a list of one", () => {
    assert.deepEqual(S.remove(at([[3, 3]]), 3, 3), []);
  });
});

describe("selection: toggle", () => {
  it("puts a cell that is not there in, as the newest of the list", () => {
    const cells = at([[0, 0]]);
    assert.deepEqual(cellsOf(S.toggle(cells, 2, 1)), [[0, 0], [2, 1]]);
  });

  it("takes a cell that is there out", () => {
    const cells = at([[0, 0], [2, 1]]);
    const next = S.toggle(cells, 0, 0);
    assert.deepEqual(cellsOf(next), [[2, 1]]);
    assert.equal(S.holds(next, 0, 0), false);
  });

  it("puts a cell back where it was taken from, as the newest", () => {
    const cells = at([[0, 0], [1, 1], [2, 2]]);
    const out = S.toggle(cells, 0, 0);
    assert.deepEqual(cellsOf(S.toggle(out, 0, 0)), [[1, 1], [2, 2], [0, 0]]);
  });

  it("answers a list of its own either way, and leaves the one it was given", () => {
    const cells = at([[0, 0]]);
    assert.notEqual(S.toggle(cells, 0, 0), cells);
    assert.notEqual(S.toggle(cells, 1, 1), cells);
    assert.deepEqual(cellsOf(cells), [[0, 0]]);
  });

  it("makes a list of one out of nothing", () => {
    assert.deepEqual(S.toggle([], -2, 4), [{ x: -2, y: 4 }]);
  });
});
