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

const COLORS = B.PALETTE.map((c) => c.key);
const COLOR = B.DEFAULT_COLOR;            // the colour a tile takes unasked
const OTHER_COLOR = COLORS.find((key) => key !== B.DEFAULT_COLOR);
const GREYS = ["grey-light", "grey", "grey-dark"];   // lightest first
const GREY_SPREAD = 32;                   // the most two channels of a grey part by
const SEAM_SHADE = -0.18;                 // how far under its face a seam is shaded

const colours = (sprite) => new Set(sprite.canvas.filled.values());
const top = (color) => B.PALETTE.find((c) => c.key === color).hex;
const face = (color, side) => P.shade(top(color), B.FACE_SHADES[side]);
const seam = (color, side) => P.shade(face(color, side), SEAM_SHADE);
const brightness = (hex) => P.parseHex(hex).reduce((sum, channel) => sum + channel, 0);
const spread = (hex) => Math.max(...P.parseHex(hex)) - Math.min(...P.parseHex(hex));

describe("tiles: the palette", () => {
  it("names each colour once, with a label and a hex of its own", () => {
    assert.equal(new Set(COLORS).size, B.PALETTE.length);
    assert.equal(new Set(B.PALETTE.map((c) => c.hex)).size, B.PALETTE.length);
    for (const c of B.PALETTE) assert.ok(c.label.length > 0, c.key);
  });

  it("builds a column in every colour, each its own top face and an outline", () => {
    for (const color of COLORS) {
      assert.deepEqual(colours(T.column(color, B.ELEV_MIN)),
        new Set([top(color), B.COLORS.outline]), color);
    }
  });

  it("holds the colour a tile takes when nothing names one", () => {
    assert.ok(COLORS.includes(B.DEFAULT_COLOR), B.DEFAULT_COLOR);
  });

  it("keeps its three greys near-neutral and every other colour full of colour", () => {
    for (const color of COLORS) {
      assert.equal(spread(top(color)) < GREY_SPREAD, GREYS.includes(color),
        `${color} is ${top(color)}`);
    }
  });

  it("darkens its greys in the order their names read", () => {
    const tones = GREYS.map((color) => brightness(top(color)));
    for (let i = 1; i < tones.length; i++) {
      assert.ok(tones[i] < tones[i - 1], `${GREYS[i]} under ${GREYS[i - 1]}`);
    }
  });

  it("refuses a colour it does not hold", () => {
    assert.throws(() => T.column("puce", B.ELEV_MIN), /no colour/);
  });
});

describe("tiles: column", () => {
  it("draws a tile with no blocks as its top face alone, outlined", () => {
    const flat = T.column(COLOR, B.ELEV_MIN);
    assert.equal(flat.canvas.height, B.TILE_H);
    assert.deepEqual(colours(flat), new Set([top(COLOR), B.COLORS.outline]));
  });

  it("draws a side face on each side of a tile that has a block", () => {
    const one = T.column(COLOR, B.ELEV_MIN + 1);
    assert.equal(one.canvas.height, B.TILE_H + B.BLOCK_H);
    assert.deepEqual(colours(one), new Set([
      top(COLOR), face(COLOR, "left"), face(COLOR, "right"), B.COLORS.outline
    ]));
  });

  it("shades the two side faces of a column in its own colour, at every height", () => {
    for (const color of COLORS) {
      for (const elev of ELEVATIONS.filter((e) => e > B.ELEV_MIN)) {
        const tones = colours(T.column(color, elev));
        const at = `${color} at ${elev}`;
        assert.ok(tones.has(top(color)), `${at}: its top`);
        assert.ok(tones.has(face(color, "left")), `${at}: its left face`);
        assert.ok(tones.has(face(color, "right")), `${at}: its right face`);
      }
    }
  });

  it("seams two stacked blocks a shade under the faces they meet on, in its own colour", () => {
    const stacked = B.ELEV_MIN + 2;
    for (const color of COLORS) {
      const tones = colours(T.column(color, stacked));
      assert.ok(tones.has(seam(color, "left")), `${color}: its left seam`);
      assert.ok(tones.has(seam(color, "right")), `${color}: its right seam`);
    }
  });

  it("seams two stacked blocks in a darker tone, whatever the column's height", () => {
    assert.equal(colours(T.column(COLOR, B.ELEV_MIN)).size, FLAT_TONES);
    assert.equal(colours(T.column(COLOR, B.ELEV_MIN + 1)).size, BLOCK_TONES);
    assert.equal(colours(T.column(COLOR, B.ELEV_MIN + 2)).size, SEAM_TONES);
    assert.equal(colours(T.column(COLOR, B.ELEV_MAX)).size, SEAM_TONES);
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
const TREADS = 4;                        // the flat steps a flight of stairs climbs in

// A view facing names the screen side a tile's high edge is on: up, which
// shows the slope, or down, which sees it edge-on, then right or left.
const seesSlope = (viewFacing) => viewFacing.charAt(0) === "u";
const onLeft = (viewFacing) => viewFacing.charAt(1) === "l";
const mirrorFacing = (viewFacing) => viewFacing.charAt(0) + (onLeft(viewFacing) ? "r" : "l");
const SLOPE_IN_VIEW = B.VIEW_FACINGS.find(seesSlope);

const wedgeOf = (shape, color, viewFacing) => T[shape](color, WEDGE_ELEV, viewFacing);
const inkDown = (art, x) => art.filter((row) => row.charAt(x) === INK).length;
const topInkRow = (art) => art.findIndex((row) => row.includes(INK));

// How many times a colour starts down a column of a sprite: each flat face the
// column crosses counts once.
const colourRuns = (sprite, x, colour) => {
  let runs = 0;
  let inRun = false;
  for (let y = 0; y < sprite.canvas.height; y++) {
    const here = sprite.canvas.filled.get(`${x},${y}`) === colour;
    if (here && !inRun) runs++;
    inRun = here;
  }
  return runs;
};

describe("tiles: the wedge a ramp and a flight of stairs stand on", () => {
  // The tests read a facing the way sprites-tiles.js does, so the reading is
  // pinned here before anything leans on it.
  it("names each facing for the slope it shows and the side its high edge is on, once", () => {
    const read = B.VIEW_FACINGS.map((vf) => `${seesSlope(vf)} ${onLeft(vf)}`);
    assert.equal(new Set(read).size, B.VIEW_FACINGS.length, read.join(", "));
    for (const viewFacing of B.VIEW_FACINGS) {
      const twin = mirrorFacing(viewFacing);
      assert.ok(B.VIEW_FACINGS.includes(twin), `${viewFacing} mirrors ${twin}`);
      assert.equal(seesSlope(twin), seesSlope(viewFacing), `${viewFacing}: the same slope`);
      assert.notEqual(onLeft(twin), onLeft(viewFacing), `${viewFacing}: the other side`);
    }
  });

  it("mirrors a wedge left to right when the facing puts its high edge on the left", () => {
    for (const shape of SLOPED) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const art = rows(wedgeOf(shape, COLOR, viewFacing));
        const twin = rows(wedgeOf(shape, COLOR, mirrorFacing(viewFacing)));
        assert.deepEqual(art, P.hflip(twin), `${shape} ${viewFacing}`);
        assert.notDeepEqual(art, twin, `${shape} ${viewFacing} is not its own mirror`);
      }
    }
  });

  it("stands a block tall down the side its high edge is on, an edge down the other", () => {
    for (const shape of SLOPED) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const art = rows(wedgeOf(shape, COLOR, viewFacing));
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
        const sprite = wedgeOf(shape, COLOR, viewFacing);
        const aBlockOverTheFarCorner = rows(sprite)[sprite.oy - HALF_H - B.BLOCK_H];
        const at = `${shape} ${viewFacing}`;
        assert.equal(aBlockOverTheFarCorner.includes(INK), seesSlope(viewFacing), at);
        if (seesSlope(viewFacing)) {
          assert.equal(aBlockOverTheFarCorner.charAt(HALF_W), INK, `${at}: over the corner`);
        }
      }
    }
  });

  it("climbs a flight of stairs in flat treads, where a ramp climbs one unbroken slope", () => {
    for (const viewFacing of B.VIEW_FACINGS.filter(seesSlope)) {
      const flats = (shape) =>
        colourRuns(wedgeOf(shape, COLOR, viewFacing), HALF_W, top(COLOR));
      assert.equal(flats("stairs"), TREADS, `stairs ${viewFacing}`);
      assert.equal(flats("ramp"), 0, `ramp ${viewFacing}`);
    }
  });

  // A wedge stands on the tile's top, so the column under it carries the height.
  it("cuts the same wedge at every elevation, in the colour it is asked for", () => {
    for (const shape of SLOPED) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const art = P.dataUrl(wedgeOf(shape, OTHER_COLOR, viewFacing));
        for (const elev of ELEVATIONS) {
          assert.equal(P.dataUrl(T[shape](OTHER_COLOR, elev, viewFacing)), art,
            `${shape} ${viewFacing} at ${elev}`);
        }
      }
    }
  });

  it("sets every wedge down on the tile's diamond, where the column under it ends", () => {
    const flat = T.column(COLOR, B.ELEV_MIN);
    for (const shape of SLOPED) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const sprite = wedgeOf(shape, COLOR, viewFacing);
        assert.deepEqual(rows(sprite).slice(sprite.oy), rows(flat).slice(flat.oy),
          `${shape} ${viewFacing}`);
      }
    }
  });

  it("shades the side face a wedge shows like a block's on that side, whichever way it faces", () => {
    for (const color of COLORS) {
      for (const viewFacing of B.VIEW_FACINGS) {
        const side = onLeft(viewFacing) ? "left" : "right";
        const tones = colours(wedgeOf("ramp", color, viewFacing));
        assert.ok(tones.has(face(color, side)), `${color} ${viewFacing}: a ${side} face`);
      }
    }
  });

  it("shades a slope darker than the tile's top and lighter than its sides, in every colour", () => {
    for (const color of COLORS) {
      const tones = colours(wedgeOf("ramp", color, SLOPE_IN_VIEW));
      const slope = [...tones].find((c) => c !== B.COLORS.outline && c !== face(color, "right"));
      assert.ok(brightness(slope) < brightness(top(color)), `${color}: under its top`);
      assert.ok(brightness(slope) > brightness(face(color, "left")), `${color}: over its sides`);
    }
  });
});

describe("tiles: outline", () => {
  it("rings the wedge a sloped tile stands on, up to its high edge", () => {
    for (const kind of RINGS) {
      for (const shape of SLOPED) {
        for (const viewFacing of B.VIEW_FACINGS) {
          const ring = T.outline(shape, viewFacing, kind);
          const wedge = wedgeOf(shape, COLOR, viewFacing);
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

const HOLD_STEPS = 16;        // steps of progress the mask is built in
const HOLD_SAMPLES = 100;     // progress readings a hold takes, frame by frame

describe("tiles: holdMask", () => {
  it("fills a held tile with the hold colour, part way to the tile under it", () => {
    const colour = oneColour(T.holdMask(1));
    assert.equal(colour.channels, P.parseHex(B.COLORS.hold).join(","));
    assert.ok(colour.alpha > 0 && colour.alpha < 1, String(colour.alpha));
  });

  it("fills more of the tile at every step, from nothing at all to its whole top face", () => {
    const filled = [];
    for (let step = 0; step <= HOLD_STEPS; step++) {
      filled.push(T.holdMask(step / HOLD_STEPS).canvas.filled.size);
    }
    assert.equal(filled[0], 0, "nothing where the hold starts");
    for (let step = 1; step <= HOLD_STEPS; step++) {
      assert.ok(filled[step] > filled[step - 1], `step ${step} over step ${step - 1}`);
    }
    assert.equal(filled[HOLD_STEPS], T.column(COLOR, B.ELEV_MIN).canvas.filled.size,
      "the whole top face where the hold ends");
  });

  it("wipes the tile from its bottom corner upward, a step at a time", () => {
    let reached = B.TILE_H;                  // no row of the tile is wiped yet
    for (let step = 1; step <= HOLD_STEPS; step++) {
      const art = rows(T.holdMask(step / HOLD_STEPS));
      const at = `step ${step}`;
      assert.ok(art[art.length - 1].includes(INK), `${at}: keeps the bottom corner`);
      assert.ok(topInkRow(art) < reached, `${at}: reaches over the step before`);
      reached = topInkRow(art);
    }
    assert.equal(reached, 0, "the whole tile where the hold ends");
  });

  it("answers one mask per step, whatever progress a frame of the hold reads", () => {
    const masks = new Set();
    for (let i = 0; i <= HOLD_SAMPLES; i++) masks.add(T.holdMask(i / HOLD_SAMPLES));
    assert.equal(masks.size, HOLD_STEPS + 1);
  });
});
