"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { inspect } = require("node:util");
const { load } = require("./load");

const B = load(["config.js", "level.js", "file.js"]);
const F = B.file;
const L = B.level;

const TWO_SPACE_INDENT = 2;

function goodTile(overrides = {}) {
  return {
    x: 1, y: 2, elev: 0, shape: "block", facing: "N", decor: null, marks: [], ...overrides
  };
}

// A few tiles that between them use every field a tile can carry.
function sampleLevel() {
  const level = L.create();
  L.add(level, 0, 0, 0);
  L.add(level, 1, 0, 2);
  L.setShape(level, 1, 0, "ramp");
  L.setFacing(level, 1, 0, "E");
  L.setDecor(level, 1, 0, "chest");
  L.toggleMark(level, 1, 0, "arrow-n");
  L.toggleMark(level, 1, 0, "rope");
  L.add(level, -2, 3, -3);
  return level;
}

describe("file: names", () => {
  it("saves as level.blocklayer.json", () => {
    assert.equal(F.EXTENSION, ".blocklayer.json");
    assert.equal(F.FILE_NAME, "level.blocklayer.json");
  });
});

describe("file: serialize", () => {
  const level = sampleLevel();
  const text = F.serialize(level);

  it("writes valid JSON equal to the level's toJSON", () => {
    assert.deepEqual(JSON.parse(text), L.toJSON(level));
  });

  it("pretty-prints with a two-space indent", () => {
    assert.equal(text, JSON.stringify(L.toJSON(level), null, TWO_SPACE_INDENT) + "\n");
    assert.match(text, /^\{\n {2}"version": 1,\n {2}"tiles": \[\n {4}\{\n {6}"x": /);
  });

  it("ends with exactly one newline", () => {
    assert.ok(text.endsWith("\n"), "ends with a newline");
    assert.ok(!text.endsWith("\n\n"), "and only one");
  });

  it("writes an empty level", () => {
    assert.equal(F.serialize(L.create()), '{\n  "version": 1,\n  "tiles": []\n}\n');
  });
});

describe("file: parse", () => {
  it("round-trips a level that uses every field", () => {
    const level = F.parse(F.serialize(sampleLevel()));
    assert.deepEqual(level, sampleLevel());
  });

  it("round-trips an empty level", () => {
    assert.deepEqual(F.parse(F.serialize(L.create())), L.create());
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

  it("keeps the good tiles of a file that also holds bad ones", () => {
    const text = JSON.stringify({
      version: 1,
      tiles: [
        goodTile({ x: 0 }),
        goodTile({ x: 1, elev: B.ELEV_MAX + 1 }),
        goodTile({ x: 2, shape: "dome" }),
        "tile",
        goodTile({ x: 3, marks: ["rope", "arrow-up", "rope"] })
      ]
    });
    const level = F.parse(text);
    assert.equal(L.count(level), 2);
    assert.deepEqual(L.get(level, 0, 2), goodTile({ x: 0 }));
    assert.deepEqual(L.get(level, 3, 2), goodTile({ x: 3, marks: ["rope"] }));
  });

  it("reads a hand-written file without the version or the optional fields", () => {
    const level = F.parse('{"tiles":[{"x":0,"y":0,"elev":1,"shape":"block","facing":"N"}]}');
    assert.deepEqual(L.get(level, 0, 0), goodTile({ x: 0, y: 0, elev: 1 }));
  });
});
