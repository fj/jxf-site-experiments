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
const DPR = 1;                     // the device pixel ratio the fake page reports
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
  "parts.js", "toolbar.js", "bounds.js", "tip.js"
];

// The modules that make a file's text, in a namespace of their own: what a
// storage holds is written before the app is booted on it.
const FILE = load(["config.js", "level.js", "file.js"]);

// app.js schedules its redraws on the bare global, and a test runs them by
// hand, so a frame happens only where the test says it does.
let scheduled = [];
globalThis.requestAnimationFrame = (fn) => scheduled.push(fn);
globalThis.cancelAnimationFrame = () => {};

// A storage that holds one string, as localStorage does, and keeps every text
// it was written.
function storing(text = null) {
  const kept = { text, writes: [] };
  return Object.assign(kept, {
    getItem() { return kept.text; },
    setItem(key, value) {
      kept.writes.push(value);
      kept.text = value;
    }
  });
}

// A window or a document that remembers its listeners, and the call that fires
// one of them: what the app listens for on the page, a test can deliver.
function listening(target) {
  const byType = new Map();
  target.addEventListener = (type, fn) => {
    byType.set(type, (byType.get(type) || []).concat(fn));
  };
  return (type, props = {}) => {
    const e = { key: "", altKey: false, ...props };
    for (const fn of byType.get(type) || []) fn(e);
    return e;
  };
}

// A storage that throws on every call, as a browser with storage turned off.
function refusing() {
  const deny = () => { throw new Error("storage is denied"); };
  return { getItem: deny, setItem: deny };
}

// The text a storage holds a level of that size as.
function levelText(size) {
  return FILE.file.serialize(FILE.level.create(size.w, size.h));
}

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

// The app booted into a mount of its own, on the storage the test hands it —
// none at all by default — and, with no level there, on a demo of `tiles` at
// the starting size.
function boot(tiles = [], storage = null) {
  const document = fakeDocument();
  const mount = document.createElement(MOUNT_TAG);
  const window = { document, devicePixelRatio: DPR };
  if (storage) window.localStorage = storage;
  // The page's own listeners: input.js watches Alt on the window, so the
  // canvas need never hold focus for the tip to come and go, and app.js
  // watches the document for the page going out of sight.
  const firePage = listening(window);
  const fireDoc = listening(document);
  document.getElementById = () => mount;

  const B = load(MODULES, window);
  const calls = [];
  watchContract(B, calls);

  // What the renderer was handed, frame by frame. What it makes of the state
  // is render.js's own business; the wiring has only to reach it.
  const drawn = [];
  B.render.draw = (on, state, scale) => drawn.push({ canvas: on, state, scale });
  scheduled = [];

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
    drawn,
    // Every frame the app has asked for runs, as the browser would run them,
    // and the state the renderer was handed last comes back.
    frame() {
      const due = scheduled;
      scheduled = [];
      due.forEach((fn) => fn());
      return drawn.length ? drawn[drawn.length - 1].state : null;
    },
    // How many frames the app is waiting on.
    waiting() { return scheduled.length; },
    // Where on the page the top face of the tile at (x, y) is drawn, or the
    // floor of that cell while no tile stands there.
    over(x, y) {
      const standing = B.level.get(level, x, y);
      const origin = B.view.frame(canvas, scale);
      const at = B.view.project(view, x, y, standing ? B.level.top(standing) : B.FLOOR);
      return { clientX: (at.sx + origin.ox) * scale, clientY: (at.sy + origin.oy) * scale };
    },
    of(name) { return calls.filter((c) => c[0] === name).map((c) => c.slice(1)); },
    // The reader presses on the cell at (x, y): a tile goes there, or the one
    // already standing there is selected.
    press(x, y, props = {}) {
      canvas.fire("pointerdown", { ...this.over(x, y), button: PRIMARY, ...props });
    },
    firePage,
    // The reader turns to another tab, and back.
    hide(hidden = true) {
      document.hidden = hidden;
      fireDoc("visibilitychange");
    },
    cells() { return B.level.all(level).map((tile) => [tile.x, tile.y]).sort(); },
    // Each text the storage was written, read back as the level it holds.
    saved() { return storage ? storage.writes.map((text) => B.file.parse(text)) : []; },
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

describe("app: the level a visit starts on", () => {
  const STORED = { w: 5, h: 6 };     // a board the demo's is not

  it("opens the level the storage kept", () => {
    const r = boot([], storing(levelText(STORED)));
    assert.deepEqual(r.shown(), [STORED.w, STORED.h]);
  });

  it("opens the demo when the storage keeps no level of its own", () => {
    const starts = {
      "a first visit": null,
      "an empty storage": storing(),
      "junk in storage": storing("not a level"),
      "a storage that throws": refusing()
    };
    for (const [what, storage] of Object.entries(starts)) {
      assert.deepEqual(boot([], storage).shown(), [START.w, START.h], what);
    }
  });
});

describe("app: saving the level", () => {
  // The app on a storage of its own, with a tile at (0, 0) laid but no frame
  // run yet.
  const edited = () => {
    const storage = storing();
    const r = boot([], storage);
    r.press(0, 0);
    return r;
  };

  it("writes the edited level on the frame the edit asks for, and not before", () => {
    const r = edited();
    assert.deepEqual(r.saved(), [], "no frame has run yet");
    r.frame();
    assert.equal(r.saved().length, 1);
    assert.deepEqual(r.B.level.all(r.saved()[0]).map((t) => [t.x, t.y]), [[0, 0]]);
  });

  it("writes once for a burst of edits, not once for each", () => {
    const storage = storing();
    const r = boot([], storage);
    r.press(0, 0);
    r.press(1, 0);
    r.press(2, 0);
    r.frame();
    assert.equal(r.saved().length, 1);
    assert.equal(r.B.level.count(r.saved()[0]), 3, "and the write holds every one");
  });

  it("writes nothing on a frame that no edit asked for", () => {
    const r = boot([[0, 0]], storing());
    r.frame();
    r.find("rotate", 1).fire("click");
    r.frame();
    assert.deepEqual(r.saved(), [], "a turn of the camera is no edit");
  });

  it("writes what no frame has reached when the page goes away", () => {
    for (const going of ["pagehide", "beforeunload"]) {
      const r = edited();
      r.firePage(going);
      assert.equal(r.saved().length, 1, going);
    }
  });

  it("writes what no frame has reached when the page goes out of sight", () => {
    const r = edited();
    r.hide(false);
    assert.deepEqual(r.saved(), [], "a page still in sight is going nowhere");
    r.hide(true);
    assert.equal(r.saved().length, 1);
  });

  it("writes nothing more once a frame has saved the edit", () => {
    const r = edited();
    r.frame();
    r.firePage("pagehide");
    r.hide(true);
    assert.equal(r.saved().length, 1);
  });
});

describe("app: the frames it draws on", () => {
  it("draws on the frame the boot asks for, on the canvas the reader sees", () => {
    const r = boot();
    assert.equal(r.waiting(), 1, "the boot asks for a frame of its own");
    r.frame();
    assert.equal(r.drawn.length, 1);
    assert.equal(r.drawn[0].canvas, r.canvas);
    assert.equal(r.drawn[0].scale, r.B.ZOOM_DEFAULT * DPR, "at the view's own scale");
  });

  it("asks for a frame on an edit, and draws a burst of edits on the one", () => {
    const r = boot([[0, 0]]);
    r.press(0, 0);
    r.frame();
    assert.equal(r.waiting(), 0, "nothing waits once the frame has run");
    r.find("shape", "ramp").fire("click");
    assert.equal(r.waiting(), 1, "the edit asked for a frame");
    r.find("color", "red").fire("click");
    assert.equal(r.waiting(), 1, "and the next edit rides the frame already asked for");
    assert.equal(r.frame().level, r.level, "the renderer reads the app's own level");
    assert.equal(r.drawn.length, 2);
  });
});

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
      r.B.parts.shapeLabel(tile.shape)
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
