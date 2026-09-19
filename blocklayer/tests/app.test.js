"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { fakeDocument, descend, control } = require("./dom");

const SIZE_MIN = 2;
const SIZE_MAX = 32;
const START = { w: 8, h: 8 };
const MOUNT_TAG = "div";

// Every module the page loads, in the manifest's order, less the kit's file
// download, which only a save reaches, and app.js, which boots on the level
// the stubs below give it.
const MODULES = [
  "config.js", "pixel.js", "level.js", "file.js", "view.js", "selection.js",
  "demo.js", "store.js", "sprites-tiles.js", "sprites-decor.js",
  "sprites-marks.js", "sprites-icons.js", "render.js", "input.js",
  "toolbar.js", "bounds.js"
];

// app.js schedules its redraws on the bare global, and a frame that never
// runs keeps the renderer out of a test of the wiring.
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

// The three calls the other changes in flight bring, standing in for the real
// ones: a board of w by h holds the cells from 0 up to each bound, and a
// resize drops the tiles outside it.
function stubContract(B, calls) {
  const bound = (n) => B.clamp(n, SIZE_MIN, SIZE_MAX);
  const outside = (level, w, h) => B.level.all(level)
    .filter((tile) => tile.x >= bound(w) || tile.y >= bound(h));
  B.SIZE_MIN = SIZE_MIN;
  B.SIZE_MAX = SIZE_MAX;
  B.level.outside = (level, w, h) => {
    calls.push(["outside", w, h]);
    return outside(level, w, h);
  };
  B.level.resize = (level, w, h) => {
    calls.push(["resize", w, h]);
    const lost = outside(level, w, h);
    lost.forEach((tile) => B.level.remove(level, tile.x, tile.y));
    level.size = { w: bound(w), h: bound(h) };
    return lost;
  };
  B.view.clampPan = (view, size) => { calls.push(["clampPan", size.w, size.h]); };
}

// The app booted into a mount of its own, on a level of `tiles` at the
// starting size, with no storage to read or write.
function boot(tiles = []) {
  const document = fakeDocument();
  const mount = document.createElement(MOUNT_TAG);
  const window = { document, devicePixelRatio: 1, addEventListener() {} };
  document.addEventListener = () => {};
  document.getElementById = () => mount;

  const B = load(MODULES, window);
  const calls = [];
  stubContract(B, calls);

  const level = B.level.create();
  level.size = { ...START };
  tiles.forEach(([x, y]) => B.level.add(level, x, y));
  B.demo.level = () => level;

  load(["app.js"], window);

  return {
    B,
    level,
    calls,
    of(name) { return calls.filter((c) => c[0] === name).map((c) => c.slice(1)); },
    cells() { return B.level.all(level).map((tile) => [tile.x, tile.y]).sort(); },
    ctl(name) {
      const el = control(mount, name);
      assert.ok(el, `no ${name} control`);
      return el;
    },
    shown() {
      return [this.ctl("width").value, this.ctl("height").value].map(Number);
    },
    modal() {
      const el = descend(mount).find((one) => one.getAttribute("role") === "dialog");
      assert.ok(el, "no modal");
      return el;
    },
    // The sentence the modal puts the count in.
    text() { return descend(this.modal()).find((el) => el.tag === "p").textContent; },
    find(act, arg) {
      const btn = descend(mount).find((el) =>
        el.getAttribute("data-act") === act && el.getAttribute("data-arg") === String(arg));
      assert.ok(btn, `no ${act} ${arg} button`);
      return btn;
    },
    // The reader types a number into a box and leaves it.
    type(name, value) {
      this.ctl(name).value = value;
      this.ctl(name).fire("change");
    }
  };
}

describe("app: the board's size", () => {
  it("starts the size row at the level's own size", () => {
    assert.deepEqual(boot().shown(), [START.w, START.h]);
  });

  it("grows the board at once, and the row follows", () => {
    const r = boot([[0, 0]]);
    r.type("width", START.w + 4);
    assert.deepEqual(r.level.size, { w: START.w + 4, h: START.h });
    assert.deepEqual(r.shown(), [START.w + 4, START.h]);
    assert.deepEqual(r.cells(), [[0, 0]], "a board that grows loses no tile");
  });

  it("shrinks the board at once when the tiles all fit inside the new one", () => {
    const r = boot([[0, 0], [1, 1]]);
    r.type("height", 2);
    assert.deepEqual(r.level.size, { w: START.w, h: 2 });
    assert.deepEqual(r.cells(), [[0, 0], [1, 1]]);
  });

  it("shows the size the level took when the rules refuse the number asked for", () => {
    const r = boot();
    r.type("width", SIZE_MAX * 2);
    assert.deepEqual(r.level.size, { w: SIZE_MAX, h: START.h });
    assert.deepEqual(r.shown(), [SIZE_MAX, START.h]);
  });

  it("keeps some of the board on screen after a resize, a pan, a turn and a zoom", () => {
    const r = boot();
    r.type("width", START.w + 1);
    assert.deepEqual(r.of("clampPan").pop(), [START.w + 1, START.h], "after a resize");
    const moves = [["pan", "N"], ["rotate", 1], ["zoom", 1]];
    for (const [act, arg] of moves) {
      const before = r.of("clampPan").length;
      r.find(act, arg).fire("click");
      assert.equal(r.of("clampPan").length, before + 1, act);
    }
  });
});

// A board of four tiles in a row, which a width of 2 cuts in half.
const ROW = [[0, 0], [1, 0], [2, 0], [3, 0]];
const KEPT = [[0, 0], [1, 0]];
const NARROW = 2;
const DROPPED = ROW.length - KEPT.length;

describe("app: a shrink that would lose tiles", () => {
  const asking = () => {
    const r = boot(ROW);
    r.type("width", NARROW);
    return r;
  };

  it("changes nothing at all, and asks with the count of what would go", () => {
    const r = asking();
    assert.deepEqual(r.level.size, { w: START.w, h: START.h }, "the board is untouched");
    assert.deepEqual(r.cells(), ROW, "and so is every tile");
    assert.deepEqual(r.of("resize"), [], "the level was never resized");
    assert.equal(r.modal().hidden, false);
    assert.equal(r.text(), `${DROPPED} tiles fall outside the new board.`);
  });

  it("keeps showing the number the reader typed while it asks", () => {
    assert.deepEqual(asking().shown(), [NARROW, START.h]);
  });

  it("resizes and drops the tiles when the reader goes ahead", () => {
    const r = asking();
    r.ctl("confirm").fire("click");
    assert.equal(r.modal().hidden, true);
    assert.deepEqual(r.level.size, { w: NARROW, h: START.h });
    assert.deepEqual(r.cells(), KEPT);
    assert.deepEqual(r.shown(), [NARROW, START.h]);
  });

  it("changes nothing and puts the boxes back when the reader cancels", () => {
    const r = asking();
    r.ctl("cancel").fire("click");
    assert.equal(r.modal().hidden, true);
    assert.deepEqual(r.level.size, { w: START.w, h: START.h });
    assert.deepEqual(r.cells(), ROW);
    assert.deepEqual(r.shown(), [START.w, START.h], "back to the board's real size");
  });

  it("takes Escape as the cancel and Enter as the go-ahead", () => {
    const escaped = asking();
    escaped.modal().fire("keydown", { key: "Escape" });
    assert.deepEqual(escaped.cells(), ROW);
    assert.deepEqual(escaped.shown(), [START.w, START.h]);

    const entered = asking();
    entered.modal().fire("keydown", { key: "Enter" });
    assert.deepEqual(entered.cells(), KEPT);
    assert.deepEqual(entered.level.size, { w: NARROW, h: START.h });
  });

  it("asks again, with a fresh count, when the reader tries another shrink", () => {
    const r = asking();
    r.ctl("cancel").fire("click");
    r.type("width", ROW.length - 1);
    assert.equal(r.modal().hidden, false);
    assert.equal(r.text(), "1 tile falls outside the new board.");
  });
});
