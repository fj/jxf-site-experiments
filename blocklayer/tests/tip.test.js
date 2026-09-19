"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load, tile: makeTile } = require("./load");
const { fakeDocument, control } = require("./dom");

const AT = { x: 120, y: 80 };
const ELSEWHERE = { x: 300, y: 40 };
const CTL_ATTR = "data-ctl";

const B = load([
  "config.js", "pixel.js", "level.js",
  "sprites-tiles.js", "sprites-decor.js", "sprites-marks.js", "sprites-icons.js",
  "input.js", "toolbar.js", "tip.js"
], { document: fakeDocument() });

const ALT = true;
const NO_ALT = false;
const hit = (over) => ({ tile: makeTile(over) });
const cell = { cell: { x: 4, y: 5 } };

// The panel, and what it says: one line per fact, the hidden ones left out.
function rig() {
  const built = B.tip.build();
  return {
    el: built.el,
    show(hitting, alt, at = AT) {
      built.sync({ tip: B.tip.from(hitting, alt, at.x, at.y) });
      return built.el;
    },
    said() {
      return built.el.children.filter((line) => !line.hidden).map((line) => line.textContent);
    },
    placed() {
      return [built.el.style.left, built.el.style.top];
    }
  };
}

// The gap the panel keeps from the pointer, read back off a placement.
const GAP = Number(rig().show(hit({}), ALT).style.left.replace("px", "")) - AT.x;

describe("tip: when the panel is there at all", () => {
  it("is hooked and named for what it is, and starts hidden", () => {
    const r = rig();
    assert.equal(r.el.className, `${B.PREFIX}tip`);
    assert.equal(r.el.getAttribute(CTL_ATTR), "tip");
    assert.equal(r.el.getAttribute("role"), "tooltip");
    assert.equal(r.el.hidden, true);
    assert.equal(control(r.el, "tip"), r.el, "the driver finds it by the hook");
  });

  it("opens only while Alt is held over a tile", () => {
    const r = rig();
    assert.equal(r.show(hit({}), ALT).hidden, false, "Alt over a tile");
    assert.equal(r.show(hit({}), NO_ALT).hidden, true, "a tile with Alt up");
    assert.equal(r.show(cell, ALT).hidden, true, "Alt over an empty cell");
    assert.equal(r.show(null, ALT).hidden, true, "Alt over nothing at all");
  });

  it("goes as soon as Alt is let go over the very same tile", () => {
    const r = rig();
    const over = hit({});
    assert.equal(r.show(over, ALT).hidden, false);
    assert.equal(r.show(over, NO_ALT).hidden, true);
  });

  it("answers no place at all while it should not be shown", () => {
    assert.equal(B.tip.from(hit({}), NO_ALT, AT.x, AT.y), null);
    assert.equal(B.tip.from(cell, ALT, AT.x, AT.y), null);
    assert.equal(B.tip.from(null, ALT, AT.x, AT.y), null);
  });
});

describe("tip: what the panel says", () => {
  it("names the tile's elevation, colour and shape, in that order", () => {
    const r = rig();
    r.show(hit({ elev: 5, color: "indigo", shape: "stairs", decor: null }), ALT);
    assert.deepEqual(r.said(), ["Elevation 5", "Indigo", "Stairs"]);
  });

  it("names the decor object the tile carries, and leaves the line out with none", () => {
    const r = rig();
    r.show(hit({ decor: "crystal-blue" }), ALT);
    assert.deepEqual(r.said().pop(), "Blue crystal");
    r.show(hit({ decor: null }), ALT);
    assert.equal(r.said().length, 3, "no decor, no line");
  });

  it("takes every word from the list the rest of the interface reads", () => {
    const r = rig();
    for (const entry of B.PALETTE) {
      r.show(hit({ color: entry.key }), ALT);
      assert.deepEqual(r.said()[1], entry.label, entry.key);
    }
    for (const entry of B.DECOR) {
      r.show(hit({ decor: entry.key }), ALT);
      assert.deepEqual(r.said()[3], entry.label, entry.key);
    }
    for (const shape of B.SHAPES) {
      r.show(hit({ shape }), ALT);
      assert.deepEqual(r.said()[2], B.toolbar.shapeLabel(shape), shape);
    }
  });

  it("says a tile on the floor is on the floor", () => {
    const r = rig();
    r.show(hit({ elev: B.ELEV_MIN }), ALT);
    assert.equal(r.said()[0], `Elevation ${B.ELEV_MIN}`);
  });
});

describe("tip: where the panel stands", () => {
  it("follows the pointer", () => {
    const r = rig();
    r.show(hit({}), ALT, AT);
    assert.deepEqual(r.placed(), [`${AT.x + GAP}px`, `${AT.y + GAP}px`]);
    r.show(hit({}), ALT, ELSEWHERE);
    assert.deepEqual(r.placed(), [`${ELSEWHERE.x + GAP}px`, `${ELSEWHERE.y + GAP}px`]);
  });

  it("stands clear of the pointer, so it never covers what it describes", () => {
    assert.ok(GAP > 0, "the panel is set away from the point it is told");
  });
});
