"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { fakeDocument, descend, control } = require("./dom");

const SIZE_MIN = 1;                // config.js: the smallest board
const SIZE_MAX = 64;               // ...and the largest
const START = { w: 8, h: 8 };
const MOUNT_TAG = "div";
const CANVAS_W = 480;
const CANVAS_H = 320;
const PRIMARY = 0;
const ALT_DOWN = { key: "Alt", altKey: true };
const ALT_UP = { key: "Alt", altKey: false };

// Every module the page loads, in the manifest's order, less the kit's file
// download, which only a save reaches, and app.js, which boots on the level
// the stubs below give it.
const MODULES = [
  "config.js", "pixel.js", "level.js", "file.js", "view.js", "selection.js",
  "demo.js", "store.js", "sprites-tiles.js", "sprites-decor.js",
  "sprites-marks.js", "sprites-icons.js", "render.js", "input.js",
  "toolbar.js", "bounds.js", "tip.js"
];

// app.js schedules its redraws on the bare global, and a frame that never
// runs keeps the renderer out of a test of the wiring.
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

// A file opens at once, with no text of its own: what the text becomes is
// file.js's, which each test says for itself.
globalThis.FileReader = class {
  readAsText() { this.onload(); }
};

// The three calls the app makes on the level and the camera, logged on their
// way through, so a test can say what the wiring asked for as well as what the
// level became.
function watchContract(B, calls) {
  const outside = B.level.outside;
  const resize = B.level.resize;
  const clampPan = B.view.clampPan;
  B.level.outside = (level, w, h) => {
    calls.push(["outside", w, h]);
    return outside(level, w, h);
  };
  B.level.resize = (level, w, h) => {
    calls.push(["resize", w, h]);
    return resize(level, w, h);
  };
  B.view.clampPan = (view, size, frame) => {
    calls.push(["clampPan", size.w, size.h]);
    return clampPan(view, size, frame);
  };
}

// The app booted into a mount of its own, on a level of `tiles` at the
// starting size, with no storage to read or write.
function boot(tiles = []) {
  const document = fakeDocument();
  const mount = document.createElement(MOUNT_TAG);
  // The page's own listeners: input.js watches Alt there, so the canvas need
  // never hold focus for the tip to come and go.
  const onPage = new Map();
  const window = {
    document,
    devicePixelRatio: 1,
    addEventListener(type, fn) { onPage.set(type, (onPage.get(type) || []).concat(fn)); }
  };
  document.addEventListener = () => {};
  document.getElementById = () => mount;

  const B = load(MODULES, window);
  const calls = [];
  watchContract(B, calls);

  const level = B.level.create();
  level.size = { ...START };
  tiles.forEach(([x, y]) => B.level.add(level, x, y));
  B.demo.level = () => level;

  load(["app.js"], window);

  // The canvas takes a size only the page can give it, and the view app.js
  // boots with, so a test can name the client point a tile sits under.
  const canvas = descend(mount).find((el) => el.tag === "canvas");
  Object.assign(canvas, {
    clientWidth: CANVAS_W, clientHeight: CANVAS_H, width: CANVAS_W, height: CANVAS_H
  });
  const view = B.view.create();
  const scale = view.zoom;

  return {
    B,
    level,
    calls,
    canvas,
    // Where on the page the top face of the tile at (x, y) is drawn, or the
    // floor of that cell while no tile stands there.
    over(x, y) {
      const standing = B.level.get(level, x, y);
      const origin = B.view.frame(canvas, scale);
      const at = B.view.project(view, x, y, standing ? B.level.top(standing) : B.FLOOR);
      return { clientX: (at.sx + origin.ox) * scale, clientY: (at.sy + origin.oy) * scale };
    },
    of(name) { return calls.filter((c) => c[0] === name).map((c) => c.slice(1)); },
    firePage(type, props = {}) {
      const e = { key: "", altKey: false, ...props };
      for (const fn of onPage.get(type) || []) fn(e);
      return e;
    },
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

  // A cell left behind in the selection would claim whatever tile is laid
  // there next, so the drop must take it out.
  it("takes a dropped tile's cell out of the selection, not just the tile", () => {
    const r = boot(ROW);
    const going = ROW[ROW.length - 1];
    r.canvas.fire("pointerdown", { ...r.over(...going), button: PRIMARY });
    assert.equal(r.find("shape", "block").disabled, false, "the tile is selected");
    r.type("width", NARROW);
    r.ctl("confirm").fire("click");
    assert.equal(r.find("shape", "block").disabled, true, "and gone with the tile");

    r.type("width", START.w);
    r.canvas.fire("pointerdown", { ...r.over(...going), button: PRIMARY });
    assert.deepEqual(r.cells().pop(), going, "a tile stands on that cell again");
    assert.equal(r.find("shape", "block").disabled, true, "and it is nobody's selection");
  });

  it("keeps a tile the shrink spares in the selection", () => {
    const r = boot(ROW);
    r.canvas.fire("pointerdown", { ...r.over(...KEPT[0]), button: PRIMARY });
    r.type("width", NARROW);
    r.ctl("confirm").fire("click");
    assert.equal(r.find("shape", "block").disabled, false);
  });
});

describe("app: a level opened from a file", () => {
  const OPENED = { w: 4, h: 3 };
  const DROP = { dataTransfer: { files: [{}] }, preventDefault() {} };

  // The picker and the drop both read the file, then hand what file.js makes
  // of it to the app; what it makes is the other change in flight's business.
  const opening = () => {
    const r = boot();
    const other = r.B.level.create();
    other.size = { ...OPENED };
    r.B.file.parse = () => other;
    r.canvas.fire("drop", DROP);
    return r;
  };

  it("moves the size row and the camera onto the opened board", () => {
    const r = opening();
    assert.deepEqual(r.shown(), [OPENED.w, OPENED.h]);
    assert.deepEqual(r.of("clampPan").pop(), [OPENED.w, OPENED.h]);
  });
});

describe("app: Alt over a tile", () => {
  const TILE = [2, 3];
  const tipOf = (r) => r.ctl("tip");
  const said = (r) => tipOf(r).children.filter((l) => !l.hidden).map((l) => l.textContent);

  const hovering = (props) => {
    const r = boot([TILE]);
    r.canvas.fire("pointermove", { ...r.over(...TILE), ...props });
    return r;
  };

  it("opens a panel that names the tile, and only while Alt is held", () => {
    assert.equal(tipOf(hovering({})).hidden, true, "no Alt, no panel");
    const r = hovering({ altKey: true });
    assert.equal(tipOf(r).hidden, false);
    const tile = r.B.level.get(r.level, ...TILE);
    assert.deepEqual(said(r), [
      `Elevation ${tile.elev}`,
      r.B.PALETTE.filter((c) => c.key === tile.color)[0].label,
      r.B.toolbar.shapeLabel(tile.shape)
    ]);
  });

  it("goes as soon as Alt is let go, without the pointer moving", () => {
    const r = hovering({ altKey: true });
    r.firePage("keyup", ALT_UP);
    assert.equal(tipOf(r).hidden, true);
    r.firePage("keydown", ALT_DOWN);
    assert.equal(tipOf(r).hidden, false, "and comes back the same way");
  });

  it("goes when the page loses the keyboard, which takes Alt with it", () => {
    const r = hovering({ altKey: true });
    r.firePage("blur");
    assert.equal(tipOf(r).hidden, true);
  });

  it("shows nothing over an empty cell, Alt or no Alt", () => {
    const r = boot([TILE]);
    const bare = r.over(...TILE);
    r.canvas.fire("pointermove", { clientX: bare.clientX, clientY: 0, altKey: true });
    assert.equal(tipOf(r).hidden, true);
  });
});
