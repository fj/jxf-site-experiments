"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { inspect } = require("node:util");
const { load } = require("./load");

const B = load(["config.js", "level.js", "file.js", "demo.js", "store.js"]);
const S = B.store;
const L = B.level;
const F = B.file;

const DENIED = "storage is denied";

// A storage that holds one string, as localStorage does, and remembers the
// keys it was asked about.
function storage(text = null) {
  const kept = { text, reads: [], writes: [] };
  return Object.assign(kept, {
    getItem(key) {
      kept.reads.push(key);
      return kept.text;
    },
    setItem(key, value) {
      kept.writes.push([key, value]);
      kept.text = value;
    }
  });
}

// A storage that refuses every call, as a browser with storage turned off.
function refusing() {
  const deny = () => { throw new Error(DENIED); };
  return { getItem: deny, setItem: deny };
}

function levelOf(tiles) {
  const level = L.create();
  for (const [x, y] of tiles) L.add(level, x, y, B.NEW_TILE_ELEV);
  return level;
}

describe("store: from", () => {
  it("hands back the window's own storage", () => {
    const local = storage();
    assert.equal(S.from({ localStorage: local }), local);
  });

  it("answers nothing when the browser refuses to hand it over", () => {
    const win = { get localStorage() { throw new Error(DENIED); } };
    assert.doesNotThrow(() => S.from(win));
    assert.equal(S.from(win), null);
  });

  it("answers nothing when the window has no storage at all", () => {
    assert.equal(S.from({}), null);
  });
});

describe("store: read", () => {
  it("reads the level that was stored, under the key config.js names", () => {
    const level = levelOf([[0, 0], [1, 2]]);
    const kept = storage(F.serialize(level));
    assert.deepEqual(S.read(kept), level);
    assert.deepEqual(kept.reads, [B.STORAGE_KEY]);
  });

  it("answers the demo level when the storage holds nothing", () => {
    assert.deepEqual(S.read(storage()), B.demo.level());
  });

  it("answers the demo level when what is stored is not a level", () => {
    for (const text of ["", "not json", "[]", "{}", '{"tiles": 1}', "null"]) {
      assert.deepEqual(S.read(storage(text)), B.demo.level(), inspect(text));
    }
  });

  it("answers an empty level that was stored, rather than the demo", () => {
    const empty = S.read(storage(F.serialize(L.create())));
    assert.deepEqual(empty, L.create());
    assert.equal(L.count(empty), 0);
  });

  it("answers the demo level when the storage throws, and does not throw", () => {
    assert.doesNotThrow(() => S.read(refusing()));
    assert.deepEqual(S.read(refusing()), B.demo.level());
  });

  it("answers the demo level when there is no storage to read", () => {
    assert.deepEqual(S.read(null), B.demo.level());
  });

  it("answers a level of its own each time, which an edit cannot reach back into", () => {
    const kept = storage(F.serialize(levelOf([[0, 0]])));
    const first = S.read(kept);
    L.add(first, 5, 5, B.NEW_TILE_ELEV);
    assert.equal(L.count(S.read(kept)), 1);
  });
});

describe("store: write", () => {
  it("writes the level as the file's own text, under the key config.js names", () => {
    const level = levelOf([[0, 0], [1, 3]]);
    const kept = storage();
    S.write(kept, level);
    assert.deepEqual(kept.writes, [[B.STORAGE_KEY, F.serialize(level)]]);
  });

  it("is read back as the level that was written", () => {
    const kept = storage();
    const level = levelOf([[2, 2], [3, 3]]);
    S.write(kept, level);
    assert.deepEqual(S.read(kept), level);
  });

  it("writes an empty level, which reads back empty and not as the demo", () => {
    const kept = storage(F.serialize(levelOf([[0, 0]])));
    S.write(kept, L.create());
    assert.deepEqual(S.read(kept), L.create());
  });

  it("survives a storage that throws on the write", () => {
    assert.doesNotThrow(() => S.write(refusing(), levelOf([[0, 0]])));
  });

  it("survives having no storage to write to", () => {
    assert.doesNotThrow(() => S.write(null, levelOf([[0, 0]])));
  });
});
