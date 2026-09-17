"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { INK, canvasDocument, rows } = require("./sprite");

const ROTS = [0, 1, 2, 3];
const ROW_STEP = 2;               // px an isometric line steps across in a row
const LINES_PER_ROW = 2;          // cell boundaries any row of the lattice crosses
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [2, -3]];
const CELLS = [[0, 0], [1, 0], [0, 1], [-1, 2], [3, -2], [5, 5]];

const B = load(["config.js", "pixel.js", "view.js", "sprites-tiles.js"], { document: canvasDocument() });

const HALF_W = B.TILE_W / 2;
const HALF_H = B.TILE_H / 2;
const art = rows(B.tiles.grid());
const wrap = (n, size) => ((n % size) + size) % size;

// The pattern tiled over the whole floor plane, its anchor on the lattice
// point where cell (0, 0) stands.
const lit = (x, y) => art[wrap(y, B.TILE_H)].charAt(wrap(x, B.TILE_W)) === INK;

// Where cell (x, y) stands on the floor, in the tiled pattern's own pixels.
function centre(view, x, y) {
  const origin = B.view.project(view, 0, 0, B.FLOOR);
  const p = B.view.project(view, x, y, B.FLOOR);
  return { x: p.sx - origin.sx, y: p.sy - origin.sy };
}

function turned(rot) {
  const view = B.view.create();
  view.rot = rot;
  return view;
}

describe("tiles: grid", () => {
  it("answers one pattern tile, a cell wide and a cell tall, anchored on a lattice point", () => {
    const tile = B.tiles.grid();
    assert.deepEqual([tile.canvas.width, tile.canvas.height], [B.TILE_W, B.TILE_H]);
    assert.deepEqual([tile.ox, tile.oy], [0, 0]);
    assert.equal(B.tiles.grid(), tile);
  });

  it("draws every line in the grid colour, part way to the canvas behind it", () => {
    const colours = [...new Set(B.tiles.grid().canvas.filled.values())];
    assert.equal(colours.length, 1);
    const rgba = /^rgba\((\d+,\d+,\d+),([\d.]+)\)$/.exec(colours[0]);
    assert.ok(rgba, colours[0]);
    assert.equal(rgba[1], B.pixel.parseHex(B.COLORS.grid).join(","));
    assert.ok(Number(rgba[2]) > 0 && Number(rgba[2]) < 1, colours[0]);
  });

  it("repeats along the lattice: a step to another cell leaves the pattern as it was", () => {
    for (const rot of ROTS) {
      for (const [x, y] of NEIGHBOURS) {
        const step = centre(turned(rot), x, y);
        for (let j = 0; j < B.TILE_H; j++) {
          for (let i = 0; i < B.TILE_W; i++) {
            assert.equal(lit(i + step.x, j + step.y), lit(i, j),
              `(${i}, ${j}) stepped to cell (${x}, ${y}) at rot ${rot}`);
          }
        }
      }
    }
  });

  it("lays a line on every cell's four corners and none across its middle", () => {
    for (const rot of ROTS) {
      for (const [x, y] of CELLS) {
        const c = centre(turned(rot), x, y);
        const at = `cell (${x}, ${y}) at rot ${rot}`;
        assert.equal(lit(c.x, c.y - HALF_H), true, `${at}: its top corner`);
        assert.equal(lit(c.x, c.y + HALF_H), true, `${at}: its bottom corner`);
        assert.equal(lit(c.x - HALF_W, c.y), true, `${at}: its left corner`);
        assert.equal(lit(c.x + HALF_W, c.y), true, `${at}: its right corner`);
        for (let d = ROW_STEP - HALF_W; d < HALF_W - ROW_STEP; d++) {
          assert.equal(lit(c.x + d, c.y), false, `${at}: ${d} px across its middle`);
        }
      }
    }
  });

  it("crosses every row of the tile with two boundaries, each ROW_STEP px wide", () => {
    for (const row of art) {
      assert.equal([...row].filter((ch) => ch === INK).length, LINES_PER_ROW * ROW_STEP, row);
    }
  });

  // A cell's lower edges fall on the same pixels as its neighbour's upper ones,
  // so drawing both would lay the translucent colour twice and darken the line.
  it("paints each pixel of a line once, so an edge two cells share does not double", () => {
    for (const [at, paints] of B.tiles.grid().canvas.paints) {
      assert.equal(paints, 1, `painted ${paints} times at (${at})`);
    }
  });
});
