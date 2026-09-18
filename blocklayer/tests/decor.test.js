"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { canvasDocument, rows } = require("./sprite");

const ICON_SIZE = 16;

const B = load(["config.js", "pixel.js", "sprites-decor.js"], { document: canvasDocument() });
const D = B.decor;

const both = (key) => [D.sprite(key), D.icon(key)];

// The art's pixels that are not its outline: the faces the light falls on.
function faces(sprite) {
  const out = [];
  for (const [at, colour] of sprite.canvas.filled) {
    if (colour === B.COLORS.outline) continue;
    out.push({ x: Number(at.split(",")[0]), colour: colour });
  }
  return out;
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

  it("refuses a decor it does not know", () => {
    assert.throws(() => D.sprite("barrel"), /unknown decor/);
    assert.throws(() => D.icon("barrel"), /unknown decor/);
  });
});
