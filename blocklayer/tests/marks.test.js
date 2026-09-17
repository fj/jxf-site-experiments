"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { canvasDocument, rows, headHeavy } = require("./sprite");

const ROTS = [0, 1, 2, 3];
const MAX_ARROW = 12;               // px, either way, for an outlined arrow mark
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The eight screen directions as vectors, y down: up-right along the 2:1
// line, right, down-right, down, down-left, left, up-left, up.
const SCREEN_VECTORS = [[2, -1], [1, 0], [2, 1], [0, 1], [-2, 1], [-1, 0], [-2, -1], [0, -1]];

const B = load(["config.js", "pixel.js", "sprites-marks.js"], { document: canvasDocument() });
const M = B.marks;

const arrows = B.MARKS.filter((m) => m.dir);
const stills = B.MARKS.filter((m) => !m.dir);
const screenDirOf = (mark, rot) => B.screenDir(rot, B.DIRECTIONS.indexOf(mark.dir));
const fillOf = (sprite) => rows(sprite, B.COLORS.outline);

describe("marks: sprite", () => {
  it("builds every mark at every rotation, an arrow within 12x12", () => {
    for (const m of B.MARKS) {
      for (const rot of ROTS) {
        const s = M.sprite(m.key, rot);
        const name = `${m.key} at rot ${rot}`;
        assert.ok(s.canvas.width > 0 && s.canvas.height > 0, name);
        if (m.dir) assert.ok(s.canvas.width <= MAX_ARROW && s.canvas.height <= MAX_ARROW, name);
      }
    }
  });

  it("an arrow's fill is heavier at its head, toward where its direction points on screen", () => {
    for (const m of arrows) {
      for (const rot of ROTS) {
        const [dx, dy] = SCREEN_VECTORS[screenDirOf(m, rot)];
        const art = fillOf(M.sprite(m.key, rot));
        assert.equal(headHeavy(art, dx, dy), true, `${m.key} at rot ${rot}`);
        assert.equal(headHeavy(art, -dx, -dy), false, `${m.key} at rot ${rot}, reversed`);
      }
    }
  });

  it("turned a quarter, a world arrow looks as the next one round did before", () => {
    for (const m of arrows) {
      for (const rot of ROTS) {
        const seenAs = arrows.find((o) => o.dir === B.DIRECTIONS[screenDirOf(m, rot)]);
        assert.deepEqual(rows(M.sprite(m.key, rot)), rows(M.sprite(seenAs.key, 0)),
          `${m.key} at rot ${rot} is ${seenAs.key} at rot 0`);
      }
    }
  });

  it("a still mark is the same at every rotation", () => {
    for (const m of stills) {
      const first = rows(M.sprite(m.key, 0));
      for (const rot of ROTS) assert.deepEqual(rows(M.sprite(m.key, rot)), first, m.key);
    }
  });

  it("outlines every mark in the dark outline colour, one pixel deep on every side", () => {
    for (const m of B.MARKS) {
      const filled = M.sprite(m.key, 0).canvas.filled;
      const colourAt = (x, y) => filled.get(`${x},${y}`);
      let fills = 0;
      for (const [at, colour] of filled) {
        const [x, y] = at.split(",").map(Number);
        const around = NEIGHBOURS.map(([dx, dy]) => colourAt(x + dx, y + dy));
        if (colour === B.COLORS.outline) {
          assert.ok(around.some((c) => c && c !== B.COLORS.outline), `${m.key}: outline at ${at}`);
        } else {
          fills++;
          assert.ok(around.every(Boolean), `${m.key}: fill at ${at} touches an empty pixel`);
        }
      }
      assert.ok(fills > 0, m.key);
    }
  });

  it("refuses a mark it does not know", () => {
    assert.throws(() => M.sprite("arrow-up", 0), /unknown mark/);
  });
});
