"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { INK, canvasDocument, rows } = require("./sprite");

const FLAT_TONES = 2;              // the top face and the outline
const BLOCK_TONES = 4;             // and a face on each side
const SEAM_TONES = 6;              // and a darker tone where two blocks meet

const B = load(["config.js", "pixel.js", "sprites-tiles.js"], { document: canvasDocument() });
const P = B.pixel;
const T = B.tiles;

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
  it("spells every elevation in the range, and a '+' before one", () => {
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
  const centre = `${B.TILE_W / 2},${B.TILE_H / 2}`;

  it("ghosts a tile with no blocks as the ring of its top face, with a '+' on it", () => {
    const flat = T.ghost(B.ELEV_MIN);
    assert.equal(flat.canvas.height, B.TILE_H);
    assert.deepEqual(colours(flat), new Set([B.COLORS.outline, B.COLORS.ghost]));
    assert.equal(flat.canvas.filled.get(centre), B.COLORS.ghost);
  });

  it("ghosts a taller tile with a front edge down the column under its top", () => {
    const tall = T.ghost(B.ELEV_MIN + 1);
    assert.equal(tall.canvas.height, B.TILE_H + B.BLOCK_H);
    assert.equal(tall.canvas.filled.get(centre), B.COLORS.ghost);
    assert.ok(rows(tall).slice(B.TILE_H).some((row) => row.includes(INK)));
  });
});
