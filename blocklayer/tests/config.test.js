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
