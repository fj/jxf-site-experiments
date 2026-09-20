"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { canvasDocument, rows, INK } = require("./sprite");

const ICON_SIZE = 16;
const SWITCH = "switch";              // the decor that stands a lever off its base

const B = load(["config.js", "pixel.js", "sprites-decor.js"], { document: canvasDocument() });
const D = B.decor;

const both = (key) => [D.sprite(key), D.icon(key)];

// The art's pixels that are not its outline: the faces the light falls on.
function faces(sprite) {
  const out = [];
  for (const [at, colour] of sprite.canvas.filled) {
    if (colour === B.COLORS.outline) continue;
    const [x, y] = at.split(",").map(Number);
    out.push({ x, y, colour });
  }
  return out;
}

// Where the ink on one row of string art begins and ends.
function span(row) {
  const xs = [...row].flatMap((ch, x) => (ch === INK ? [x] : []));
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return { lo, hi, width: hi - lo + 1 };
}

// The colours the art paints on each row it paints anything on, top row first.
function painted(sprite) {
  const byRow = new Map();
  for (const p of faces(sprite)) {
    if (!byRow.has(p.y)) byRow.set(p.y, new Set());
    byRow.get(p.y).add(p.colour);
  }
  return [...byRow].sort(([a], [b]) => a - b);
}

const brightness = (hex) => B.pixel.parseHex(hex).reduce((sum, channel) => sum + channel, 0);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

describe("decor: sprite and icon", () => {
  it("builds painted art and a painted 16x16 icon for every decor the config lists", () => {
    for (const d of B.DECOR) {
      const [sprite, icon] = both(d.key);
      assert.ok(sprite.canvas.width > 0 && sprite.canvas.height > 0, d.key);
      assert.equal(icon.canvas.width, ICON_SIZE, d.key);
      assert.equal(icon.canvas.height, ICON_SIZE, d.key);
      assert.ok(faces(sprite).length > 0, `${d.key}: art with nothing painted on it`);
      assert.ok(faces(icon).length > 0, `${d.key}: an icon with nothing painted on it`);
    }
  });

  it("anchors every decor at its base, where it stands on the tile", () => {
    for (const d of B.DECOR) {
      const s = D.sprite(d.key);
      assert.ok(s.ox >= 0 && s.ox <= s.canvas.width, `${d.key}: ox ${s.ox}`);
      assert.ok(s.oy > s.canvas.height / 2, `${d.key}: oy ${s.oy} is not below its middle`);
      assert.ok(s.oy <= s.canvas.height, `${d.key}: oy ${s.oy}`);
    }
  });

  it("lights every decor from the left, as the blocks it stands on are lit", () => {
    for (const d of B.DECOR) {
      for (const sprite of both(d.key)) {
        const middle = (sprite.canvas.width - 1) / 2;
        const side = (keep) => faces(sprite).filter(keep).map((p) => brightness(p.colour));
        const left = mean(side((p) => p.x < middle));
        const right = mean(side((p) => p.x > middle));
        assert.ok(left > right, `${d.key}: left ${left.toFixed(1)}, right ${right.toFixed(1)}`);
      }
    }
  });

  it("gives every decor art of its own, and answers the same sprite each time", () => {
    const arts = B.DECOR.map((d) => rows(D.sprite(d.key)).join("\n"));
    assert.equal(new Set(arts).size, B.DECOR.length);
    assert.equal(D.sprite(B.DECOR[0].key), D.sprite(B.DECOR[0].key));
  });

  it("leans the switch's lever off the plinth it rises from, in the art and in the icon", () => {
    for (const sprite of both(SWITCH)) {
      const spans = rows(sprite).filter((row) => row.includes(INK)).map(span);
      const widest = Math.max(...spans.map((part) => part.width));
      const lever = spans.slice(0, spans.findIndex((part) => part.width === widest));
      const foot = spans[spans.length - 1];
      assert.ok(lever[0].hi < foot.lo, `the lever ends at ${lever[0].hi}, the foot at ${foot.lo}`);
      assert.ok(lever.some((part, y) => y > 0 && part.width < lever[y - 1].width),
        "the knob swells out past the shaft it caps");
    }
  });

  it("stands the switch on its anchor, at the lowest row its plinth is widest on", () => {
    const sprite = D.sprite(SWITCH);
    const spans = rows(sprite).map(span);
    const widest = Math.max(...spans.map((part) => part.width));
    assert.equal(spans[sprite.oy].width, widest, "the anchor stands where the plinth is widest");
    assert.ok(spans[sprite.oy + 1].width < widest, "the base narrows under the anchor's row");
  });

  it("tips the switch's lever with a knob no part of the plinth is painted in", () => {
    for (const sprite of both(SWITCH)) {
      const byRow = painted(sprite);
      const [, knob] = byRow[0];
      const shared = byRow
        .filter(([y]) => y > sprite.canvas.height / 2)
        .filter(([, colours]) => [...knob].some((colour) => colours.has(colour)));
      assert.deepEqual(shared.map(([y]) => y), [], "rows under the lever take a knob colour");
    }
  });

  it("refuses a decor it does not know", () => {
    assert.throws(() => D.sprite("barrel"), /unknown decor/);
    assert.throws(() => D.icon("barrel"), /unknown decor/);
  });
});
