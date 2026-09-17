"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { INK, canvasDocument, rows } = require("./sprite");

const FLAT_TONES = 2;              // the top face and the outline
const BLOCK_TONES = 4;             // and a face on each side
const SEAM_TONES = 6;              // and a darker tone where two blocks meet
const ROTS = [0, 1, 2, 3];
const ROW_STEP = 2;                // px an isometric line steps across in a row
const LINES_PER_ROW = 2;           // cell boundaries any row of the lattice crosses
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [2, -3]];
const CELLS = [[0, 0], [1, 0], [0, 1], [-1, 2], [3, -2], [5, 5]];

const B = load(["config.js", "pixel.js", "view.js", "sprites-tiles.js"],
  { document: canvasDocument() });
const P = B.pixel;
const T = B.tiles;

const HALF_W = B.TILE_W / 2;
const HALF_H = B.TILE_H / 2;

const ELEVATIONS = [];
for (let elev = B.ELEV_MIN; elev <= B.ELEV_MAX; elev++) ELEVATIONS.push(elev);

const colours = (sprite) => new Set(sprite.canvas.filled.values());
const top = (elev) => B.ELEVATION_COLORS[String(elev)];
const face = (elev, side) => P.shade(top(elev), B.FACE_SHADES[side]);

describe("tiles: the elevation colours", () => {
  it("names a colour for every elevation in the range and none outside it", () => {
    assert.deepEqual(new Set(Object.keys(B.ELEVATION_COLORS)),
      new Set(ELEVATIONS.map(String)));
  });

  it("gives each elevation its own colour, and builds a column there", () => {
    const tops = ELEVATIONS.map(top);
    assert.equal(new Set(tops).size, tops.length);
    for (const elev of ELEVATIONS) {
      assert.ok(T.column(elev).canvas.filled.size > 0, `elevation ${elev}`);
    }
  });

  it("sinks a tile with no blocks into a cool blue", () => {
    const [r, g, b] = P.parseHex(top(B.ELEV_MIN));
    assert.ok(b > r && b > g, top(B.ELEV_MIN));
  });

  it("warms every step of the climb, from green at the foot to red at the top", () => {
    // Red leads green once a colour turns warm, so the difference climbs too.
    const warmth = (elev) => {
      const [r, g] = P.parseHex(top(elev));
      return r - g;
    };
    const foot = B.ELEV_MIN + 1;
    for (let elev = foot + 1; elev <= B.ELEV_MAX; elev++) {
      assert.ok(warmth(elev) > warmth(elev - 1), `elevation ${elev} over ${elev - 1}`);
    }
    assert.ok(warmth(foot) < 0, `green at ${foot}`);
    assert.ok(warmth(B.ELEV_MAX) > 0, `red at ${B.ELEV_MAX}`);
  });
});

describe("tiles: column", () => {
  it("draws a tile with no blocks as its top face alone, outlined", () => {
    const flat = T.column(B.ELEV_MIN);
    assert.equal(flat.canvas.height, B.TILE_H);
    assert.deepEqual(colours(flat), new Set([top(B.ELEV_MIN), B.COLORS.outline]));
  });

  it("draws a side face on each side of a tile that has a block", () => {
    const elev = B.ELEV_MIN + 1;
    const one = T.column(elev);
    assert.equal(one.canvas.height, B.TILE_H + B.BLOCK_H);
    assert.deepEqual(colours(one), new Set([
      top(elev), face(elev, "left"), face(elev, "right"), B.COLORS.outline
    ]));
  });

  it("seams two stacked blocks in a darker tone, whatever the column's height", () => {
    assert.equal(colours(T.column(B.ELEV_MIN)).size, FLAT_TONES);
    assert.equal(colours(T.column(B.ELEV_MIN + 1)).size, BLOCK_TONES);
    assert.equal(colours(T.column(B.ELEV_MIN + 2)).size, SEAM_TONES);
    assert.equal(colours(T.column(B.ELEV_MAX)).size, SEAM_TONES);
  });
});

describe("tiles: label", () => {
  it("spells every elevation, and keeps the '+' that a change badge spells with", () => {
    for (const elev of ELEVATIONS) {
      assert.ok(T.label(String(elev)).canvas.filled.size > 0, `elevation ${elev}`);
      assert.ok(T.label(`+${elev}`).canvas.filled.size > 0, `+${elev}`);
    }
  });

  it("refuses a glyph it does not have, the sign a plain number never needs", () => {
    assert.throws(() => T.label("-1"), /no glyph/);
  });
});

describe("tiles: ghost", () => {
  const middle = `${HALF_W},${HALF_H}`;

  it("ghosts a tile with no blocks as the ring of its top face, with a '+' on it", () => {
    const flat = T.ghost(B.ELEV_MIN);
    assert.equal(flat.canvas.height, B.TILE_H);
    assert.deepEqual(colours(flat), new Set([B.COLORS.outline, B.COLORS.ghost]));
    assert.equal(flat.canvas.filled.get(middle), B.COLORS.ghost);
  });

  it("ghosts a taller tile with a front edge down the column under its top", () => {
    const tall = T.ghost(B.ELEV_MIN + 1);
    assert.equal(tall.canvas.height, B.TILE_H + B.BLOCK_H);
    assert.equal(tall.canvas.filled.get(middle), B.COLORS.ghost);
    assert.ok(rows(tall).slice(B.TILE_H).some((row) => row.includes(INK)));
  });
});

const art = rows(T.grid());
const wrap = (n, size) => ((n % size) + size) % size;

// The pattern tiled over the whole floor plane, its anchor on the lattice
// point where cell (0, 0) stands.
const lit = (x, y) => art[wrap(y, B.TILE_H)].charAt(wrap(x, B.TILE_W)) === INK;

// Where cell (x, y) stands on the floor, in the tiled pattern's own pixels.
function cellCentre(view, x, y) {
  const origin = B.view.project(view, 0, 0, B.FLOOR);
  const p = B.view.project(view, x, y, B.FLOOR);
  return { x: p.sx - origin.sx, y: p.sy - origin.sy };
}

function turned(rot) {
  const view = B.view.create();
  view.rot = rot;
  return view;
}

// The one translucent colour a sprite's pixels carry, as its channels and its
// alpha.
function oneColour(sprite) {
  const found = [...new Set(sprite.canvas.filled.values())];
  assert.equal(found.length, 1, found.join(" "));
  const rgba = /^rgba\((\d+,\d+,\d+),([\d.]+)\)$/.exec(found[0]);
  assert.ok(rgba, found[0]);
  return { channels: rgba[1], alpha: Number(rgba[2]) };
}

describe("tiles: grid", () => {
  it("answers one pattern tile, a cell wide and a cell tall, anchored on a lattice point", () => {
    const tile = T.grid();
    assert.deepEqual([tile.canvas.width, tile.canvas.height], [B.TILE_W, B.TILE_H]);
    assert.deepEqual([tile.ox, tile.oy], [0, 0]);
    assert.equal(T.grid(), tile);
  });

  it("draws every line in the grid colour, part way to the canvas behind it", () => {
    const colour = oneColour(T.grid());
    assert.equal(colour.channels, P.parseHex(B.COLORS.grid).join(","));
    assert.ok(colour.alpha > 0 && colour.alpha < 1, String(colour.alpha));
  });

  it("repeats along the lattice: a step to another cell leaves the pattern as it was", () => {
    for (const rot of ROTS) {
      for (const [x, y] of NEIGHBOURS) {
        const step = cellCentre(turned(rot), x, y);
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
        const c = cellCentre(turned(rot), x, y);
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
    for (const [at, paints] of T.grid().canvas.paints) {
      assert.equal(paints, 1, `painted ${paints} times at (${at})`);
    }
  });
});

describe("tiles: holdMask", () => {
  it("fills a held tile with the hold colour, part way to the tile under it", () => {
    const colour = oneColour(T.holdMask(1));
    assert.equal(colour.channels, P.parseHex(B.COLORS.hold).join(","));
    assert.ok(colour.alpha > 0 && colour.alpha < 1, String(colour.alpha));
  });
});
