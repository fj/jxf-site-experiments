"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load, tile } = require("./load");

const B = load(["config.js"]);

describe("config: sameCell", () => {
  it("matches a tile or a cell at the same coordinates", () => {
    assert.equal(B.sameCell({ x: 1, y: 2 }, 1, 2), true);
    assert.equal(B.sameCell(tile({ x: 1, y: 2 }), 1, 2), true);
    assert.equal(B.sameCell({ x: 1, y: 2 }, 2, 1), false);
  });

  it("matches nothing against nothing at all", () => {
    assert.equal(B.sameCell(null, 0, 0), false);
    assert.equal(B.sameCell(undefined, 0, 0), false);
  });
});

describe("config: inCells", () => {
  const cells = [{ x: 0, y: 0 }, { x: -1, y: 3 }];

  it("finds a cell the list holds, wherever it sits in it", () => {
    assert.equal(B.inCells(cells, 0, 0), true);
    assert.equal(B.inCells(cells, -1, 3), true);
  });

  it("does not find a cell the list is missing", () => {
    assert.equal(B.inCells(cells, 3, -1), false);
    assert.equal(B.inCells(cells, 0, 3), false);
  });

  it("finds nothing in an empty list", () => {
    assert.equal(B.inCells([], 0, 0), false);
  });

  it("reads a list of tiles as the cells they stand on", () => {
    assert.equal(B.inCells([tile({ x: 4, y: 5 })], 4, 5), true);
  });

  it("passes over a slot holding nothing, as sameCell does", () => {
    assert.equal(B.inCells([null, { x: 1, y: 1 }], 1, 1), true);
    assert.equal(B.inCells([null, undefined], 1, 1), false);
  });
});
