"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { INK, BLANK, canvasDocument, rows, headHeavy } = require("./sprite");

const ICON_SIZE = 16;
const ROTS = [0, 1, 2, 3];

// Each direction on screen, y down.
const VECTORS = {
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
  S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1]
};

// The four 2:1 screen diagonals the compass rose's arms run along, y down.
const DIAGONALS = { N: [2, -1], E: [2, 1], S: [-2, 1], W: [-2, -1] };

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

// The letter the rose names north with, wherever the rotation puts it.
const NORTH_LABEL = [
  "#...#",
  "##..#",
  "#.#.#",
  "#..##",
  "#...#"
];

// The rose's ink as string art; the halo behind it is another colour.
function roseArt(sprite) {
  const art = [];
  for (let y = 0; y < sprite.canvas.height; y++) {
    let row = "";
    for (let x = 0; x < sprite.canvas.width; x++) {
      row += sprite.canvas.filled.get(`${x},${y}`) === B.COLORS.outline ? INK : BLANK;
    }
    art.push(row);
  }
  return art;
}

// The ink of the art, as offsets from the sprite's anchor.
const inkOf = (art, sprite) => art.flatMap((row, y) =>
  [...row].flatMap((ch, x) => (ch === INK ? [[x - sprite.ox, y - sprite.oy]] : [])));

// How far the ink reaches from the anchor along a screen diagonal.
const reach = (ink, [dx, dy]) => Math.max(...ink.map(([x, y]) => dx * x + dy * y));

// Whether the art holds `block` anywhere, ink and gaps alike.
function holds(art, block) {
  for (let y = 0; y + block.length <= art.length; y++) {
    for (let x = 0; x + block[0].length <= art[0].length; x++) {
      if (block.every((row, j) => art[y + j].slice(x, x + row.length) === row)) return true;
    }
  }
  return false;
}

describe("icons: compass", () => {
  const rose = (rot) => roseArt(B.icons.compass(rot));

  it("draws a different rose at each rotation", () => {
    assert.equal(new Set(ROTS.map((rot) => rose(rot).join("\n"))).size, ROTS.length);
  });

  it("runs its long arm toward the screen direction screenDir gives world north", () => {
    for (const rot of ROTS) {
      const sprite = B.icons.compass(rot);
      const ink = inkOf(rose(rot), sprite);
      const north = DIAGONALS[B.DIRECTIONS[B.screenDir(rot, 0)]];
      for (const [dir, diagonal] of Object.entries(DIAGONALS)) {
        if (diagonal === north) continue;
        assert.ok(reach(ink, north) > reach(ink, diagonal), `rot ${rot} reaches past ${dir}`);
      }
    }
  });

  it("names the arm it points north with, at every rotation", () => {
    for (const rot of ROTS) assert.ok(holds(rose(rot), NORTH_LABEL), `rot ${rot} has no N`);
  });

  it("keeps the whole rose in its sprite, and haloes the ink in another colour", () => {
    for (const rot of ROTS) {
      const sprite = B.icons.compass(rot);
      const colours = new Set(sprite.canvas.filled.values());
      assert.equal(colours.size, 2, `rot ${rot}: the halo is the colour of the ink`);
      assert.ok(colours.has(B.COLORS.outline), `rot ${rot}`);
      for (const [at] of sprite.canvas.filled) {
        const [x, y] = at.split(",").map(Number);
        const inside = x >= 0 && x < sprite.canvas.width && y >= 0 && y < sprite.canvas.height;
        assert.ok(inside, `rot ${rot}: a pixel at ${at} falls outside the sprite`);
      }
    }
  });
});
