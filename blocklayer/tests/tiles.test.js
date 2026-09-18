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

const SLOPED = ["ramp", "stairs"];       // the shapes that stand on a wedge
const RINGS = ["select", "hover"];       // the kinds of highlight a tile is ringed with
const WEDGE_ELEV = B.ELEV_MIN + 1;       // a wedge rises a block over its elevation

// A view facing names the screen side a tile's high edge is on: up, which
// shows the slope, or down, which sees it edge-on, then right or left.
const seesSlope = (viewFacing) => viewFacing.charAt(0) === "u";
const onLeft = (viewFacing) => viewFacing.charAt(1) === "l";
const mirrorFacing = (viewFacing) => viewFacing.charAt(0) + (onLeft(viewFacing) ? "r" : "l");
const SLOPE_IN_VIEW = B.VIEW_FACINGS.find(seesSlope);

const wedgeOf = (shape, elev, viewFacing) => T[shape](elev, viewFacing);
const inkDown = (art, x) => art.filter((row) => row.charAt(x) === INK).length;
const topInkRow = (art) => art.findIndex((row) => row.includes(INK));
const brightness = (hex) => P.parseHex(hex).reduce((sum, channel) => sum + channel, 0);

describe("tiles: the wedge a ramp and a flight of stairs stand on", () => {
  it("mirrors a wedge left to right when the facing puts its high edge on the left", () => {
    for (const shape of SLOPED) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const art = rows(wedgeOf(shape, WEDGE_ELEV, viewFacing));
        const twin = rows(wedgeOf(shape, WEDGE_ELEV, mirrorFacing(viewFacing)));
        assert.deepEqual(art, P.hflip(twin), `${shape} ${viewFacing}`);
        assert.notDeepEqual(art, twin, `${shape} ${viewFacing} is not its own mirror`);
      }
    }
  });

  it("stands a block tall down the side its high edge is on, an edge down the other", () => {
    for (const shape of SLOPED) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const art = rows(wedgeOf(shape, WEDGE_ELEV, viewFacing));
        const sides = [0, B.TILE_W - 1];
        const high = onLeft(viewFacing) ? sides[0] : sides[1];
        const low = onLeft(viewFacing) ? sides[1] : sides[0];
        const at = `${shape} ${viewFacing}`;
        assert.ok(inkDown(art, high) > B.BLOCK_H, `${at}: its high side`);
        assert.ok(inkDown(art, low) < B.BLOCK_H, `${at}: its low side`);
      }
    }
  });

  it("rises over the tile's far corner only from a facing that shows the slope", () => {
    for (const shape of SLOPED) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const sprite = wedgeOf(shape, WEDGE_ELEV, viewFacing);
        const aBlockOverTheFarCorner = rows(sprite)[sprite.oy - HALF_H - B.BLOCK_H];
        const at = `${shape} ${viewFacing}`;
        assert.equal(aBlockOverTheFarCorner.includes(INK), seesSlope(viewFacing), at);
        if (seesSlope(viewFacing)) {
          assert.equal(aBlockOverTheFarCorner.charAt(HALF_W), INK, `${at}: over the corner`);
        }
      }
    }
  });

  it("sets every wedge down on the tile's diamond, where the column under it ends", () => {
    const flat = T.column(B.ELEV_MIN);
    for (const shape of SLOPED) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const sprite = wedgeOf(shape, WEDGE_ELEV, viewFacing);
        assert.deepEqual(rows(sprite).slice(sprite.oy), rows(flat).slice(flat.oy),
          `${shape} ${viewFacing}`);
      }
    }
  });

  it("shades the side face a wedge shows like a block's on that side, whichever way it faces", () => {
    for (const elev of ELEVATIONS) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const side = onLeft(viewFacing) ? "left" : "right";
        const tones = colours(T.ramp(elev, viewFacing));
        assert.ok(tones.has(face(elev, side)), `elevation ${elev} ${viewFacing}: a ${side} face`);
      }
    }
  });

  it("shades a slope darker than the tile's top and lighter than its sides, at every elevation", () => {
    for (const elev of ELEVATIONS) {
      const tones = colours(T.ramp(elev, SLOPE_IN_VIEW));
      const at = `elevation ${elev}`;
      const slope = [...tones].find((c) => c !== B.COLORS.outline && c !== face(elev, "right"));
      assert.ok(brightness(slope) < brightness(top(elev)), `${at}: under its top`);
      assert.ok(brightness(slope) > brightness(face(elev, "left")), `${at}: over its sides`);
    }
  });
});

describe("tiles: outline", () => {
  it("rings the wedge a sloped tile stands on, up to its high edge", () => {
    for (const kind of RINGS) {
      for (const shape of SLOPED) {
        for (const viewFacing of B.VIEW_FACINGS) {
          const ring = T.outline(shape, viewFacing, kind);
          const wedge = wedgeOf(shape, WEDGE_ELEV, viewFacing);
          const art = rows(wedge);
          const at = `${shape} ${viewFacing} ${kind}`;
          rows(ring).forEach((row, y) => {
            [...row].forEach((ch, x) => {
              if (ch === INK) assert.equal(art[y].charAt(x), INK, `${at}: (${x}, ${y}) off it`);
            });
          });
          assert.equal(topInkRow(rows(ring)), topInkRow(art), `${at}: up to its high edge`);
          assert.ok(ring.canvas.filled.size < wedge.canvas.filled.size, `${at}: a ring, not a fill`);
        }
      }
    }
  });

  it("mirrors a ring with the wedge it rings", () => {
    for (const kind of RINGS) {
      for (const shape of SLOPED) {
        for (const viewFacing of B.VIEW_FACINGS) {
          const art = rows(T.outline(shape, viewFacing, kind));
          const twin = rows(T.outline(shape, mirrorFacing(viewFacing), kind));
          assert.deepEqual(art, P.hflip(twin), `${shape} ${viewFacing} ${kind}`);
        }
      }
    }
  });

  it("rings a block with its top diamond alone, the same from every facing", () => {
    for (const kind of RINGS) {
      const ring = T.outline("block", SLOPE_IN_VIEW, kind);
      const art = rows(ring);
      assert.equal(topInkRow(art), ring.oy - HALF_H, `${kind}: no higher than its top face`);
      for (const viewFacing of B.VIEW_FACINGS) {
        assert.deepEqual(rows(T.outline("block", viewFacing, kind)), art, `${kind} ${viewFacing}`);
      }
    }
  });

  it("draws a select ring thicker than a hover ring, each in its own colour", () => {
    const [select, hover] = RINGS.map((kind) => T.outline("ramp", SLOPE_IN_VIEW, kind));
    assert.deepEqual(colours(select), new Set([B.COLORS.select]));
    assert.deepEqual(colours(hover), new Set([B.COLORS.hover]));
    assert.ok(select.canvas.filled.size > hover.canvas.filled.size);
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
