"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { INK, canvasDocument, rows, headHeavy } = require("./sprite");

const ICON_SIZE = 16;

// Each direction on screen, y down.
const VECTORS = {
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
  S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1]
};

const B = load(["config.js", "pixel.js", "sprites-icons.js"], { document: canvasDocument() });
const P = B.pixel;

const columnsOf = (row) => [...row].flatMap((ch, x) => (ch === INK ? [x] : []));
const inkedRows = (art) => art.filter((row) => row.includes(INK));

describe("icons: arrow", () => {
  const arrow = (dir) => rows(B.icons.arrow(dir));

  it("draws a 16x16 mask for each of the eight directions, each its own shape", () => {
    const arts = B.DIRECTIONS.map(arrow);
    for (const art of arts) {
      assert.equal(art.length, ICON_SIZE);
      for (const row of art) assert.equal(row.length, ICON_SIZE);
    }
    assert.equal(new Set(arts.map((art) => art.join("\n"))).size, B.DIRECTIONS.length);
  });

  it("every arrow's head outweighs its tail toward its own direction, not the opposite", () => {
    for (const dir of B.DIRECTIONS) {
      const [dx, dy] = VECTORS[dir];
      assert.equal(headHeavy(arrow(dir), dx, dy), true, `${dir} toward itself`);
      assert.equal(headHeavy(arrow(dir), -dx, -dy), false, `${dir} away from itself`);
    }
  });

  it("N is mirror-symmetric with a 2 px tip at the top centre, and E and W are not", () => {
    const n = arrow("N");
    assert.deepEqual(P.hflip(n), n);
    assert.deepEqual(columnsOf(inkedRows(n)[0]), [ICON_SIZE / 2 - 1, ICON_SIZE / 2]);
    assert.notDeepEqual(P.hflip(arrow("E")), arrow("E"));
    assert.notDeepEqual(P.hflip(arrow("W")), arrow("W"));
  });

  it("NE's tip is at the top right: its first inked row reaches its rightmost column", () => {
    const ne = arrow("NE");
    const right = Math.max(...ne.flatMap(columnsOf));
    assert.ok(columnsOf(inkedRows(ne)[0]).includes(right));
  });

  it("hands back the same sprite for a direction and refuses an unknown one", () => {
    assert.equal(B.icons.arrow("N"), B.icons.arrow("N"));
    assert.notEqual(B.icons.arrow("N"), B.icons.arrow("S"));
    assert.throws(() => B.icons.arrow("up"), /unknown direction/);
  });
});
