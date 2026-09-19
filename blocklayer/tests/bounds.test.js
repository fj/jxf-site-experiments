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
const ROLE_ATTR = "role";
const MODAL_ATTR = "aria-modal";
const NAMED_BY_ATTR = "aria-labelledby";
const LOST = 12;
const PENDING = { w: 3, h: 4, lost: LOST };

const page = fakeDocument();
const B = load([
  "config.js", "pixel.js", "level.js",
  "sprites-tiles.js", "sprites-decor.js", "sprites-marks.js", "sprites-icons.js",
  "input.js", "toolbar.js", "bounds.js"
], { document: page });

B.SIZE_MIN = SIZE_MIN;
B.SIZE_MAX = SIZE_MAX;

const HANDLERS = ["resize", "confirmResize", "cancelResize"];

// The bounds interface with every handler recording the call it was made by.
function rig() {
  const calls = [];
  const handlers = {};
  HANDLERS.forEach((name) => {
    handlers[name] = (...args) => { calls.push([name, ...args]); };
  });
  const built = B.bounds.build(handlers);
  return {
    built,
    calls,
    ctl(name) {
      const el = control(built.row, name) || control(built.modal, name);
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

const state = (over = {}) => ({ size: { ...SIZE }, pending: null, ...over });

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
      assert.equal(box.inputMode, "numeric", `${name}: digits on a touch keyboard`);
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

  it("leaves what the reader typed alone while the modal asks about it", () => {
    const r = rig();
    r.built.sync(state());
    r.type("width", 3);
    r.built.sync(state({ pending: PENDING }));
    assert.deepEqual(r.shown(), [3, SIZE.h], "the board's own size would be a lie");
  });
});

describe("bounds: the modal a lossy shrink opens", () => {
  // A modal opened on a resize that would drop LOST tiles.
  const asking = () => {
    const r = rig();
    r.built.sync(state());
    r.built.sync(state({ pending: PENDING }));
    return r;
  };

  it("is a dialog that holds the reader, hidden until a shrink would drop tiles", () => {
    const r = rig();
    const modal = r.built.modal;
    assert.equal(modal.getAttribute(ROLE_ATTR), "dialog");
    assert.equal(modal.getAttribute(MODAL_ATTR), "true");
    r.built.sync(state());
    assert.equal(modal.hidden, true, "nothing pending, nothing shown");
    r.built.sync(state({ pending: PENDING }));
    assert.equal(modal.hidden, false);
    r.built.sync(state());
    assert.equal(modal.hidden, true, "and it goes when the resize is answered");
  });

  it("says how many tiles would go, and names itself to a screen reader by that", () => {
    const r = asking();
    const named = r.built.modal.getAttribute(NAMED_BY_ATTR);
    const text = descend(r.built.modal).find((el) => el.id === named);
    assert.ok(text, "the dialog names an element that is there");
    assert.equal(text.textContent, `${LOST} tiles fall outside the new board.`);
  });

  it("counts one lost tile in the singular", () => {
    const r = rig();
    r.built.sync(state({ pending: { ...PENDING, lost: 1 } }));
    const text = descend(r.built.modal).find((el) => el.tag === "p");
    assert.equal(text.textContent, "1 tile falls outside the new board.");
  });

  it("offers going ahead and cancelling, each hooked and worded", () => {
    const r = asking();
    for (const [name, label] of [["cancel", "Cancel"], ["confirm", "Resize"]]) {
      const btn = r.ctl(name);
      assert.equal(btn.tag, "button", name);
      assert.equal(btn.type, "button", name);
      assert.equal(btn.textContent, label, name);
    }
  });

  it("goes ahead from the confirm button and gives up from the cancel button", () => {
    const r = asking();
    r.ctl("confirm").fire("click");
    assert.deepEqual(r.calls, [["confirmResize"]]);
    r.ctl("cancel").fire("click");
    assert.deepEqual(r.calls.pop(), ["cancelResize"]);
  });

  it("takes Escape as a cancel and Enter as a go-ahead, and swallows both", () => {
    for (const [key, call] of [["Escape", "cancelResize"], ["Enter", "confirmResize"]]) {
      const r = asking();
      assert.equal(r.built.modal.fire("keydown", { key }).prevented, true, key);
      assert.deepEqual(r.calls, [[call]], key);
    }
  });

  it("lets every other key through, so the canvas keys never reach it", () => {
    const r = asking();
    for (const key of ["w", "x", "Delete", " "]) {
      assert.equal(r.built.modal.fire("keydown", { key }).prevented, false, key);
    }
    assert.deepEqual(r.calls, []);
  });

  it("puts the focus on the go-ahead, so Enter is the answer under the finger", () => {
    const r = asking();
    assert.equal(page.activeElement, r.ctl("confirm"));
  });

  it("keeps Tab inside itself, shifted or not, and never lets it past the last", () => {
    const r = asking();
    const [cancel, confirm] = [r.ctl("cancel"), r.ctl("confirm")];
    const tab = (props) => r.built.modal.fire("keydown", { key: "Tab", ...props });
    for (const props of [{}, {}, { shiftKey: true }, { shiftKey: true }]) {
      const from = page.activeElement;
      assert.equal(tab(props).prevented, true, "the page never takes the Tab");
      assert.notEqual(page.activeElement, from, "the focus moves");
      assert.ok([cancel, confirm].includes(page.activeElement), "and stays inside");
    }
  });

  it("hands the focus back to the box the reader changed once it is answered", () => {
    const r = rig();
    r.built.sync(state());
    r.type("height", 2);
    r.built.sync(state({ pending: PENDING }));
    assert.equal(page.activeElement, r.ctl("confirm"));
    r.built.sync(state());
    assert.equal(page.activeElement, r.ctl("height"));
  });

  it("does not move the focus while nothing is pending", () => {
    const r = rig();
    r.ctl("width").focus();
    r.built.sync(state());
    assert.equal(page.activeElement, r.ctl("width"));
  });
});
