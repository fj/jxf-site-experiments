"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { inspect } = require("node:util");
const { load, tile } = require("./load");

const B = load(["config.js", "level.js", "file.js"]);
const F = B.file;
const L = B.level;

const TWO_SPACE_INDENT = 2;
const COLOR_KEYS = B.PALETTE.map((c) => c.key);
const OTHER_COLOR = COLOR_KEYS.find((key) => key !== B.DEFAULT_COLOR);

// A board with more room than its tiles need, so its size cannot be read back
// from where they stand.
const BOARD = { w: 5, h: 6 };

// A few tiles that between them use every field a tile can carry.
function sampleLevel() {
  const level = L.create(BOARD.w, BOARD.h);
  L.add(level, 0, 0, 0);
  L.add(level, 1, 0, 2, OTHER_COLOR);
  L.setShape(level, 1, 0, "ramp");
  L.setFacing(level, 1, 0, "E");
  L.setDecor(level, 1, 0, "chest");
  L.toggleMark(level, 1, 0, "arrow-n");
  L.toggleMark(level, 1, 0, "rope");
  L.add(level, 2, 3, B.ELEV_MIN);
  return level;
}

describe("file: names", () => {
  it("saves as level.blocklayer.json", () => {
    assert.equal(F.EXTENSION, ".blocklayer.json");
    assert.equal(F.FILE_NAME, "level.blocklayer.json");
  });
});

describe("file: serialize", () => {
  it("is the level's toJSON, pretty-printed two spaces deep, with one final newline", () => {
    const level = sampleLevel();
    const expected = JSON.stringify(L.toJSON(level), null, TWO_SPACE_INDENT) + "\n";
    assert.equal(F.serialize(level), expected);
  });

  it("writes an empty level as its board and no tiles", () => {
    assert.equal(F.serialize(L.create(B.SIZE_MIN, B.SIZE_MIN)),
      '{\n  "version": 3,\n  "size": {\n    "w": 1,\n    "h": 1\n  },\n  "tiles": []\n}\n');
  });
});

describe("file: parse", () => {
  it("round-trips a level that uses every field", () => {
    const level = F.parse(F.serialize(sampleLevel()));
    assert.deepEqual(level, sampleLevel());
  });

  it("brings the board back at the size it was saved at", () => {
    assert.deepEqual(F.parse(F.serialize(sampleLevel())).size, BOARD);
  });

  it("round-trips an empty level", () => {
    assert.deepEqual(F.parse(F.serialize(L.create())), L.create());
  });

  it("brings every tile back in the colour it was saved in", () => {
    const level = L.create();
    COLOR_KEYS.forEach((color, x) => L.add(level, x, 0, B.NEW_TILE_ELEV, color));
    const read = F.parse(F.serialize(level));
    COLOR_KEYS.forEach((color, x) => assert.equal(L.get(read, x, 0).color, color, color));
  });

  it("returns null for text that is not JSON", () => {
    for (const text of ["", "not json", "{", "{tiles: []}", "{'tiles': []}"]) {
      assert.equal(F.parse(text), null, inspect(text));
    }
  });

  it("returns null for JSON that is not a level", () => {
    for (const text of ["[]", "1", "null", '"level"', "{}", '{"tiles": 1}', '{"tiles": {}}']) {
      assert.equal(F.parse(text), null, text);
    }
  });

  it("never throws, whatever it is handed", () => {
    for (const junk of [undefined, null, 42, {}, [], () => {}, " ", "\u0000"]) {
      assert.doesNotThrow(() => F.parse(junk), inspect(junk));
      assert.equal(F.parse(junk), null, inspect(junk));
    }
  });

  it("opens a version 1 file, which names no colour, in the default colour", () => {
    const text = JSON.stringify({
      version: 1,
      tiles: [{ x: 0, y: 0, elev: 2, shape: "ramp", facing: "S", decor: "rock", marks: ["jump"] }]
    });
    assert.deepEqual(L.get(F.parse(text), 0, 0), tile({
      x: 0, y: 0, elev: 2, color: B.DEFAULT_COLOR,
      shape: "ramp", facing: "S", decor: "rock", marks: ["jump"]
    }));
  });

  it("opens a version 2 file, which names no size, on the board its tiles fit", () => {
    const text = JSON.stringify({
      version: 2,
      tiles: [tile({ x: 0, y: 0 }), tile({ x: 3, y: 1 })]
    });
    const level = F.parse(text);
    assert.deepEqual(level.size, { w: 4, h: 2 });
    assert.deepEqual(L.get(level, 3, 1), tile({ x: 3, y: 1 }));
  });

  it("opens a file whose size is nonsense on that board too", () => {
    for (const size of ["big", 0, { w: 0, h: 0 }, { w: 4 }, null]) {
      const text = JSON.stringify({ version: 3, size, tiles: [tile({ x: 3, y: 1 })] });
      assert.deepEqual(F.parse(text).size, { w: 4, h: 2 }, inspect(size));
    }
  });

  it("drops a tile that stands off the board its own file names", () => {
    const text = JSON.stringify({
      version: 3,
      size: { w: 2, h: 2 },
      tiles: [tile({ x: 1, y: 1 }), tile({ x: 2, y: 1 })]
    });
    const level = F.parse(text);
    assert.equal(L.count(level), 1);
    assert.deepEqual(L.get(level, 1, 1), tile({ x: 1, y: 1 }));
  });

  it("drops a tile whose colour the palette does not hold", () => {
    const text = JSON.stringify({
      version: 2,
      tiles: [tile({ x: 0 }), tile({ x: 1, color: "puce" })]
    });
    const level = F.parse(text);
    assert.equal(L.count(level), 1);
    assert.deepEqual(L.get(level, 0, 2), tile({ x: 0 }));
  });

  it("keeps the good tiles of a file that also holds bad ones", () => {
    const text = JSON.stringify({
      version: 2,
      tiles: [
        tile({ x: 0 }),
        tile({ x: 1, elev: B.ELEV_MAX + 1 }),
        tile({ x: 2, shape: "dome" }),
        "tile",
        tile({ x: 3, marks: ["rope", "arrow-up", "rope"] })
      ]
    });
    const level = F.parse(text);
    assert.equal(L.count(level), 2);
    assert.deepEqual(L.get(level, 0, 2), tile({ x: 0 }));
    assert.deepEqual(L.get(level, 3, 2), tile({ x: 3, marks: ["rope"] }));
  });

  it("reads a hand-written file without the version or the optional fields", () => {
    const level = F.parse('{"tiles":[{"x":0,"y":0,"elev":1,"shape":"block","facing":"N"}]}');
    assert.deepEqual(L.get(level, 0, 0), tile({ x: 0, y: 0, elev: 1 }));
  });
});
