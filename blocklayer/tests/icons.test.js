"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const INK = "#";
const BLANK = ".";
const ICON_SIZE = 16;

// A document whose canvases remember every pixel filled on them, so a
// sprite's art can be read back as rows of string art.
function fakeDocument() {
  function canvas() {
    const c = { width: 0, height: 0, filled: new Set() };
    c.getContext = () => {
      const ctx = { fillStyle: "", imageSmoothingEnabled: true };
      ctx.fillRect = (x, y, w, h) => {
        for (let j = y; j < y + h; j++) {
          for (let i = x; i < x + w; i++) c.filled.add(`${i},${j}`);
        }
      };
      return ctx;
    };
    return c;
  }
  return { createElement: (tag) => { assert.equal(tag, "canvas"); return canvas(); } };
}

const B = load(["config.js", "pixel.js", "sprites-icons.js"], { document: fakeDocument() });
const P = B.pixel;

function rows(sprite) {
  const out = [];
  for (let y = 0; y < sprite.canvas.height; y++) {
    let row = "";
    for (let x = 0; x < sprite.canvas.width; x++) {
      row += sprite.canvas.filled.has(`${x},${y}`) ? INK : BLANK;
    }
    out.push(row);
  }
  return out;
}

const inkedRows = (art) => art.filter((row) => row.includes(INK));
const columnsOf = (row) => [...row].flatMap((ch, x) => (ch === INK ? [x] : []));

function extent(art) {
  const xs = art.flatMap(columnsOf);
  return { left: Math.min(...xs), right: Math.max(...xs) };
}

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

  it("N points straight up: mirror-symmetric, its tip at the top centre, its shaft below", () => {
    const n = arrow("N");
    assert.deepEqual(P.hflip(n), n);
    const inked = inkedRows(n);
    const centre = [ICON_SIZE / 2 - 1, ICON_SIZE / 2];
    assert.deepEqual(columnsOf(inked[0]), centre);
    assert.deepEqual(columnsOf(inked[inked.length - 1]), centre);
    const { left, right } = extent(n);
    assert.ok(right - left > ICON_SIZE / 2, "the head is wider than half the icon");
  });

  it("S, W and E are N turned to face down, left and right", () => {
    const n = arrow("N");
    assert.deepEqual(arrow("S"), P.vflip(n));
    assert.deepEqual(arrow("W"), P.transpose(n));
    assert.deepEqual(arrow("E"), P.hflip(P.transpose(n)));
  });

  it("NE points up-right: the tip row holds the rightmost ink, the tail row the leftmost", () => {
    const ne = arrow("NE");
    const inked = inkedRows(ne);
    const { left, right } = extent(ne);
    assert.ok(columnsOf(inked[0]).includes(right), "tip at the top right");
    assert.ok(columnsOf(inked[inked.length - 1]).includes(left), "tail at the bottom left");
    assert.ok(!columnsOf(inked[inked.length - 1]).includes(right), "the tail is not full width");
  });

  it("NW, SE and SW are NE flipped", () => {
    const ne = arrow("NE");
    assert.deepEqual(arrow("NW"), P.hflip(ne));
    assert.deepEqual(arrow("SE"), P.vflip(ne));
    assert.deepEqual(arrow("SW"), P.hflip(P.vflip(ne)));
  });

  it("hands back the same sprite for a direction and refuses an unknown one", () => {
    assert.equal(B.icons.arrow("N"), B.icons.arrow("N"));
    assert.notEqual(B.icons.arrow("N"), B.icons.arrow("S"));
    assert.throws(() => B.icons.arrow("up"), /unknown direction/);
  });
});
