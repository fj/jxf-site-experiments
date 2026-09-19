"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { fakeDocument, descend, control } = require("./dom");

const SIZE_MIN = 2;
const SIZE_MAX = 32;
const SIZE = { w: 8, h: 6 };
const TIMES = "×";
const CTL_ATTR = "data-ctl";
const LABEL_ATTR = "aria-label";
const HIDDEN_ATTR = "aria-hidden";

const B = load([
  "config.js", "pixel.js", "level.js",
  "sprites-tiles.js", "sprites-decor.js", "sprites-marks.js", "sprites-icons.js",
  "input.js", "toolbar.js", "bounds.js"
], { document: fakeDocument() });

B.SIZE_MIN = SIZE_MIN;
B.SIZE_MAX = SIZE_MAX;

// The bounds interface with every handler recording the call it was made by.
function rig() {
  const calls = [];
  const handlers = { resize: (...args) => { calls.push(["resize", ...args]); } };
  const built = B.bounds.build(handlers);
  return {
    built,
    calls,
    ctl(name) {
      const el = control(built.row, name);
      assert.ok(el, `no ${name} control`);
      return el;
    },
    // What the two boxes show the reader.
    shown() {
      return [this.ctl("width").value, this.ctl("height").value].map(Number);
    },
    // The reader types a number into a box and leaves it.
    type(name, value) {
      this.ctl(name).value = value;
      this.ctl(name).fire("change");
    }
  };
}

const state = (over = {}) => ({ size: { ...SIZE }, ...over });

describe("bounds: the size row", () => {
  it("offers a width and a height box, hooked for the tests and the driver", () => {
    const r = rig();
    assert.equal(r.built.row.className, `${B.PREFIX}size`);
    const hooks = descend(r.built.row)
      .map((el) => el.getAttribute(CTL_ATTR))
      .filter(Boolean);
    assert.deepEqual(hooks, ["width", "height"]);
  });

  it("names each box for a screen reader and takes whole tiles inside the range", () => {
    const r = rig();
    for (const [name, label] of [["width", "Width in tiles"], ["height", "Height in tiles"]]) {
      const box = r.ctl(name);
      assert.equal(box.tag, "input", name);
      assert.equal(box.type, "number", name);
      assert.equal(box.getAttribute(LABEL_ATTR), label, name);
      assert.equal(box.min, SIZE_MIN, name);
      assert.equal(box.max, SIZE_MAX, name);
      assert.equal(box.step, 1, name);
    }
  });

  it("writes the times sign between them, and keeps it from a screen reader", () => {
    const between = rig().built.row.children[1];
    assert.equal(between.textContent, TIMES);
    assert.equal(between.getAttribute(HIDDEN_ATTR), "true");
  });

  it("shows the board's size, and shows it again when the level takes another", () => {
    const r = rig();
    r.built.sync(state());
    assert.deepEqual(r.shown(), [SIZE.w, SIZE.h]);
    r.built.sync(state({ size: { w: SIZE_MAX, h: SIZE_MIN } }));
    assert.deepEqual(r.shown(), [SIZE_MAX, SIZE_MIN]);
  });

  it("reports both numbers when either box is changed", () => {
    const r = rig();
    r.built.sync(state());
    r.type("width", SIZE.w + 1);
    assert.deepEqual(r.calls, [["resize", SIZE.w + 1, SIZE.h]]);
    r.type("height", SIZE.h + 2);
    assert.deepEqual(r.calls.pop(), ["resize", SIZE.w + 1, SIZE.h + 2]);
  });

  it("reports the number the reader typed, however far outside the range", () => {
    const r = rig();
    r.built.sync(state());
    r.type("width", SIZE_MAX * 2);
    r.type("height", 0);
    assert.deepEqual(r.calls, [
      ["resize", SIZE_MAX * 2, SIZE.h],
      ["resize", SIZE_MAX * 2, 0]
    ]);
  });

  it("reads a box the reader emptied as the size the board already has", () => {
    const r = rig();
    r.built.sync(state());
    r.type("width", "");
    assert.deepEqual(r.calls, [["resize", SIZE.w, SIZE.h]]);
  });

  it("snaps back to the size the level took, not the one that was asked for", () => {
    const r = rig();
    r.built.sync(state());
    r.type("width", SIZE_MAX * 2);
    r.built.sync(state({ size: { w: SIZE_MAX, h: SIZE.h } }));
    assert.deepEqual(r.shown(), [SIZE_MAX, SIZE.h]);
  });
});
