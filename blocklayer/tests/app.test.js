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
const FRAME_MS = 16;               // ms the page leaves between the frames it draws
const PRIMARY = 0;
const SECONDARY = 2;
const ALT_DOWN = { key: "Alt", altKey: true };
const ALT_UP = { key: "Alt", altKey: false };

// Every module the page loads, in the manifest's order, less the kit's file
// download, which only a save reaches, and app.js, which boots on the level
// the stubs below give it.
const MODULES = [
  "config.js", "pixel.js", "level.js", "file.js", "view.js", "selection.js",
  "pulse.js", "demo.js", "store.js", "sprites-tiles.js", "sprites-decor.js",
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
// file.js's, which each test says for itself. A file marked unreadable fails
// the way a browser fails one it cannot read.
globalThis.FileReader = class {
  readAsText(file) {
    if (file && file.unreadable) this.onerror();
    else this.onload();
  }
};

// A page that can watch a box for a change of its size: it keeps every box it
// was told to watch, and delivers a change of size to the app on the word of a
// test.
function sizeWatcher(window) {
  const boxes = [];
  const callbacks = [];
  window.ResizeObserver = class {
    constructor(fn) { callbacks.push(fn); }
    observe(box) { boxes.push(box); }
  };
  return { boxes, resized: () => callbacks.forEach((fn) => fn()) };
}

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
// the starting size. `dpr` is the pixel ratio the page reports, and `watching`
// whether it can watch a box for a change of its size; an older page cannot.
function boot(tiles = [], storage = null, dpr = DPR, watching = true) {
  const document = fakeDocument();
  const mount = document.createElement(MOUNT_TAG);
  const window = { document, devicePixelRatio: dpr };
  if (storage) window.localStorage = storage;
  const watcher = watching ? sizeWatcher(window) : { boxes: [], resized: () => {} };
  // input.js runs the hold that removes a tile on the page's own clock and
  // frames, which a test moves on by hand.
  let now = 0;
  let nextFrame = 1;
  let holdFrames = [];
  window.performance = { now: () => now };
  window.requestAnimationFrame = (fn) => {
    holdFrames.push({ id: nextFrame, fn });
    return nextFrame++;
  };
  window.cancelAnimationFrame = (id) => {
    holdFrames = holdFrames.filter((f) => f.id !== id);
  };
  // The page's own listeners: input.js watches Alt on the window, so the
  // canvas need never hold focus for the tip to come and go, and app.js
  // watches the document for the page going out of sight.
  const firePage = listening(window);
  const fireDoc = listening(document);
  document.getElementById = () => mount;

  // The page gives a canvas its box the moment the app makes one, so the boot
  // fits the bitmap to it as a browser would.
  const makeElement = document.createElement;
  document.createElement = (tag) => {
    const el = makeElement(tag);
    if (tag === "canvas") Object.assign(el, { clientWidth: CANVAS_W, clientHeight: CANVAS_H });
    return el;
  };

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

  // The bitmap the boot fitted to the canvas's box, which a test then takes
  // back to the box's own size, so a later fit shows. The view app.js boots
  // with is read here too, so a test can name the client point a tile sits
  // under.
  const canvas = descend(mount).find((el) => el.tag === "canvas");
  const bootFit = [canvas.width, canvas.height];
  Object.assign(canvas, { width: CANVAS_W, height: CANVAS_H });
  const view = B.view.create();
  const scale = view.zoom * dpr;

  // Where on the page the point over cell (x, y) at height z is drawn.
  const pageAt = (x, y, z) => {
    const origin = B.view.frame(canvas, scale);
    const at = B.view.project(view, x, y, z);
    return { clientX: (at.sx + origin.ox) * scale, clientY: (at.sy + origin.oy) * scale };
  };

  return {
    B,
    window,
    level,
    calls,
    canvas,
    drawn,
    // Every frame the app has asked for runs, as the browser would run them,
    // each on the clock the page reads at `at`, and the state the renderer was
    // handed last comes back.
    frame(at = 0) {
      const due = scheduled;
      scheduled = [];
      due.forEach((fn) => fn(at));
      return drawn.length ? drawn[drawn.length - 1].state : null;
    },
    // How many frames the app is waiting on.
    waiting() { return scheduled.length; },
    // Where on the page the top face of the tile at (x, y) is drawn, or the
    // floor of that cell while no tile stands there.
    over(x, y) {
      const standing = B.level.get(level, x, y);
      return pageAt(x, y, standing ? B.level.top(standing) : B.FLOOR);
    },
    // Where the floor of the cell at (x, y) is drawn, whatever stands on it:
    // the point a see-through level reads that cell from.
    onFloor(x, y) { return pageAt(x, y, B.FLOOR); },
    of(name) { return calls.filter((c) => c[0] === name).map((c) => c.slice(1)); },
    // The reader presses on the cell at (x, y): a tile goes there, or the one
    // already standing there is selected.
    press(x, y, props = {}) {
      canvas.fire("pointerdown", { ...this.over(x, y), button: PRIMARY, ...props });
    },
    // The reader holds the right button down on the tile at (x, y), which
    // wipes it away, and lets the button go again.
    hold(x, y) {
      canvas.fire("pointerdown", { ...this.over(x, y), button: SECONDARY });
    },
    letGo(x, y) {
      canvas.fire("pointerup", { ...this.over(x, y), button: SECONDARY });
    },
    // The page's clock moves on by `ms`, frame by frame, and a hold reads
    // each frame as it goes.
    tick(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(now + FRAME_MS, end);
        const due = holdFrames;
        holdFrames = [];
        due.forEach((f) => f.fn(now));
      }
    },
    firePage,
    // The boxes the app asked the page to watch for a change of their size,
    // and the change of size the page delivers to it.
    watched() { return watcher.boxes; },
    resized() { watcher.resized(); },
    // The bitmap the boot fitted the canvas to.
    bootFit() { return bootFit; },
    // The reader turns to another tab, and back.
    hide(hidden = true) {
      document.hidden = hidden;
      fireDoc("visibilitychange");
    },
    cells() { return B.level.all(level).map((tile) => [tile.x, tile.y]).sort(); },
    // The tile standing at (x, y) on the level the app holds now.
    tileAt(x, y) { return B.level.get(this.frame().level, x, y); },
    // The cells the selection holds, as the renderer is handed them.
    selected() { return this.frame().selection.map((cell) => [cell.x, cell.y]); },
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
    // The line under the canvas that a message lands on.
    status() {
      const el = descend(mount).find((one) => one.getAttribute("role") === "status");
      assert.ok(el, "no status line");
      return el;
    },
    // What the canvas stands in, which a file dragged over marks.
    stage() {
      const el = descend(mount).find((one) => one.className === `${B.PREFIX}stage`);
      assert.ok(el, "no stage");
      return el;
    },
    // The picker the open button opens.
    picker() {
      const el = descend(mount).find((one) => one.tag === "input" && one.type === "file");
      assert.ok(el, "no picker");
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

describe("app: the redraws a flashing highlight asks for", () => {
  const CLOCK = 1234;              // a time the page might hand a frame
  const A_MOMENT = 1;              // ms either side of a turn of the flash
  const A_WHILE = 5000;            // ms: more cycles of the flash than anyone counts
  const TURNS = [1, 2, 3];         // turns of the colour, one after another

  // The app see-through with the pointer over the tile at (0, 0), drawn once
  // on the clock at `at`: a highlight that flashes.
  const flashing = (at = 0) => {
    const r = boot([[0, 0]]);
    r.find("opaque", "").fire("click");
    r.canvas.fire("pointermove", r.onFloor(0, 0));
    r.frame(at);
    assert.equal(r.frame().hover.tile, r.tileAt(0, 0), "the pointer is on the tile");
    return r;
  };

  it("hands the renderer the clock the page gave the frame", () => {
    const r = boot();
    assert.equal(r.frame(CLOCK).time, CLOCK);
  });

  // The clock starts part way through a cycle, so the first wait is a part of
  // one: a flash on a beat of its own would miss it.
  it("asks for the redraw each turn of the flash needs, turn after turn", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let clock = CLOCK;
    const r = flashing(clock);
    for (const turn of TURNS) {
      const wait = r.B.pulse.untilFlip(clock);
      assert.equal(r.waiting(), 0, `turn ${turn}: the frame just drawn waits on nothing`);
      t.mock.timers.tick(wait - A_MOMENT);
      assert.equal(r.waiting(), 0, `turn ${turn}: and asks for none before the colour turns`);
      t.mock.timers.tick(A_MOMENT);
      assert.equal(r.waiting(), 1, `turn ${turn}: the turn asked for its redraw`);
      clock += wait;
      r.frame(clock);
    }
    assert.equal(r.drawn.length, TURNS.length + 1, "one frame each, and the first");
  });

  it("asks for none while the level is solid, tile hovered or not", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = boot([[0, 0]]);
    r.canvas.fire("pointermove", r.over(0, 0));
    r.frame();
    assert.equal(r.frame().hover.tile, r.tileAt(0, 0));
    t.mock.timers.tick(A_WHILE);
    assert.equal(r.waiting(), 0);
    assert.equal(r.drawn.length, 1, "and draws the one frame only");
  });

  it("stops once the level is solid again", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = flashing();
    r.find("opaque", "").fire("click");
    r.frame();
    t.mock.timers.tick(A_WHILE);
    assert.equal(r.waiting(), 0, "the timer the flash held went with it");
  });

  it("stops once the highlight goes", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = flashing();
    r.canvas.fire("pointerleave", r.onFloor(0, 0));
    r.frame();
    assert.equal(r.frame().hover, null);
    t.mock.timers.tick(A_WHILE);
    assert.equal(r.waiting(), 0);
  });

  // The pointer rests where the tile was, so nothing picks afresh: the app
  // has to let the hover go with the tile.
  it("stops once the tile it rings is taken away", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = flashing();
    r.canvas.fire("pointerdown", { ...r.onFloor(0, 0), button: PRIMARY });
    assert.deepEqual(r.selected(), [[0, 0]], "the tile under the pointer is selected");
    r.canvas.fire("keydown", { key: "Delete" });
    r.frame();
    assert.deepEqual(r.cells(), [], "and taken away");
    t.mock.timers.tick(A_WHILE);
    assert.equal(r.waiting(), 0, "nothing flashes over a tile that is gone");
  });
});

describe("app: the canvas the board is drawn on", () => {
  const DENSE = 2;                 // device pixels per CSS pixel on a sharp screen
  const NO_WATCHER = false;        // a page that cannot watch a box for its size
  const FULL = [CANVAS_W * DENSE, CANVAS_H * DENSE];
  const bitmap = (r) => [r.canvas.width, r.canvas.height];

  it("draws at the page's own pixel ratio, so the picture stays sharp", () => {
    const r = boot([], null, DENSE);
    r.frame();
    assert.equal(r.drawn[0].scale, r.B.ZOOM_DEFAULT * DENSE);
  });

  it("fits the canvas bitmap to its box on the boot, before any change of size", () => {
    assert.deepEqual(boot([], null, DENSE).bootFit(), FULL);
  });

  it("fits the canvas bitmap to the stage it stands in, in the page's own pixels", () => {
    const r = boot([], null, DENSE);
    r.frame();
    assert.deepEqual(r.watched(), [r.stage()], "the box the canvas grows with");
    r.resized();
    assert.deepEqual(bitmap(r), FULL);
    assert.equal(r.waiting(), 1, "and asks for the frame that fills it");
  });

  it("fits it on the window's own resize where the page watches no box", () => {
    const r = boot([], null, DENSE, NO_WATCHER);
    r.frame();
    assert.deepEqual(r.watched(), [], "nothing watches the stage");
    r.firePage("resize");
    assert.deepEqual(bitmap(r), FULL);
    assert.equal(r.waiting(), 1, "and asks for the frame that fills it");
  });
});

// A pair of tiles side by side, for a selection of one or of both.
const PAIR = [[0, 0], [1, 0]];

describe("app: the controls that edit the tiles", () => {
  // The app with the tile at (0, 0) selected, ready for the toolbar.
  const selecting = () => {
    const r = boot(PAIR);
    r.press(0, 0);
    assert.deepEqual(r.selected(), [PAIR[0]], "the press selected the tile");
    return r;
  };

  it("shapes the selected tile with the shape button", () => {
    const r = selecting();
    r.find("shape", "stairs").fire("click");
    assert.equal(r.tileAt(0, 0).shape, "stairs");
  });

  it("gives the selected tile a decor object with the decor button", () => {
    const r = selecting();
    r.find("decor", "chest").fire("click");
    assert.equal(r.tileAt(0, 0).decor, "chest");
  });

  it("marks the selected tile with the mark button", () => {
    const r = selecting();
    r.find("mark", "teleport").fire("click");
    assert.deepEqual(r.tileAt(0, 0).marks, ["teleport"]);
  });

  it("paints the selection with the colour button", () => {
    const r = selecting();
    r.find("color", "violet").fire("click");
    assert.equal(r.tileAt(0, 0).color, "violet");
  });

  it("takes the colour button as the next tile's colour while nothing is selected", () => {
    const r = boot();
    r.find("color", "orange").fire("click");
    r.press(2, 2);
    assert.equal(r.tileAt(2, 2).color, "orange");
  });

  it("turns the slopes in the selection and leaves a tile that has none alone", () => {
    const r = selecting();
    r.find("shape", "ramp").fire("click");
    r.press(1, 0, { ctrlKey: true });
    assert.deepEqual(r.selected(), PAIR, "a slope and a block, together");
    const block = r.tileAt(1, 0).facing;
    r.find("facing", "").fire("click");
    assert.equal(r.tileAt(0, 0).facing, r.B.FACINGS[1], "the ramp turned");
    assert.equal(r.tileAt(1, 0).facing, block, "and the block did not");
  });
});

describe("app: the controls that take tiles away", () => {
  it("takes the tile and its cell out of the selection on Delete", () => {
    const r = boot(PAIR);
    r.press(0, 0);
    r.canvas.fire("keydown", { key: "Delete" });
    assert.deepEqual(r.cells(), [PAIR[1]]);
    assert.deepEqual(r.selected(), [], "the cell goes with the tile");
  });

  it("empties the level and the selection when the reader holds the clear button", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = boot(PAIR);
    r.press(0, 0);
    r.find("clear", "").fire("pointerdown", { button: PRIMARY });
    t.mock.timers.tick(r.B.HOLD_MS);
    assert.deepEqual(r.cells(), []);
    assert.deepEqual(r.selected(), []);
  });
});

describe("app: the right button held on a tile", () => {
  const HELD = [2, 3];
  const PARTS = 4;                 // the parts of a hold a test watches it in

  // The wipe the renderer is handed: the cell it covers and how far it has
  // come, or none at all.
  const wipe = (r) => r.frame().hold;

  // The app with the tile at HELD under the right button, drawn once.
  const holding = () => {
    const r = boot([HELD]);
    r.frame();
    r.hold(...HELD);
    return r;
  };

  it("wipes the held tile further on each frame, and takes it away at the end", () => {
    const r = holding();
    assert.equal(r.waiting(), 1, "the press asked for the frame the wipe shows on");
    assert.deepEqual(wipe(r), { x: HELD[0], y: HELD[1], progress: 0 });
    let last = 0;
    for (let part = 1; part < PARTS; part++) {
      r.tick(r.B.HOLD_MS / PARTS);
      assert.equal(r.waiting(), 1, `part ${part}: the wipe asked for its frame`);
      const now = wipe(r);
      assert.deepEqual([now.x, now.y], HELD, `part ${part}: over the tile held`);
      assert.ok(now.progress > last, `part ${part}: further on than the frame before`);
      last = now.progress;
    }
    assert.deepEqual(r.cells(), [HELD], "the tile stands while the hold runs");
    r.tick(r.B.HOLD_MS / PARTS);
    assert.deepEqual(r.cells(), [], "and goes once the hold is up");
    assert.equal(wipe(r), null, "the wipe goes with it");
  });

  it("takes the wipe off and leaves the tile when the reader lets go early", () => {
    const r = holding();
    r.tick(r.B.HOLD_MS / PARTS);
    r.letGo(...HELD);
    assert.equal(r.waiting(), 1, "the wipe going asked for its frame too");
    assert.equal(wipe(r), null);
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.cells(), [HELD], "a hold let go takes no tile away");
  });
});

describe("app: the controls that raise and lower", () => {
  const elevOf = (r) => PAIR.map(([x, y]) => r.tileAt(x, y).elev);
  const raise = (r, props = {}) => r.canvas.fire("keydown", { key: "w", ...props });

  it("raises the selected tile and leaves the rest of the level standing", () => {
    const r = boot(PAIR);
    r.press(0, 0);
    const [selected, other] = elevOf(r);
    raise(r);
    assert.deepEqual(elevOf(r), [selected + 1, other], "only the selection rose");
  });

  it("raises every tile on the board on Shift, selection or none", () => {
    const r = boot(PAIR);
    const before = elevOf(r);
    raise(r, { shiftKey: true });
    assert.deepEqual(elevOf(r), before.map((elev) => elev + 1));
  });

  it("moves the height the next tile gets while nothing is selected", () => {
    const r = boot();
    raise(r);
    r.press(2, 2);
    assert.equal(r.tileAt(2, 2).elev, r.B.NEW_TILE_ELEV + 1);
  });
});

describe("app: the controls that change the selection", () => {
  it("selects a tile, takes another in and out with Ctrl, and drops the lot on Escape", () => {
    const r = boot(PAIR);
    r.press(0, 0);
    assert.deepEqual(r.selected(), [PAIR[0]]);
    r.press(1, 0, { ctrlKey: true });
    assert.deepEqual(r.selected(), PAIR);
    r.press(1, 0, { ctrlKey: true });
    assert.deepEqual(r.selected(), [PAIR[0]], "Ctrl takes it back out");
    r.canvas.fire("keydown", { key: "Escape" });
    assert.deepEqual(r.selected(), []);
  });

  it("sweeps a box with Shift, and takes every tile inside it in", () => {
    const r = boot(PAIR);
    r.canvas.fire("pointerdown", { ...r.over(0, 0), button: PRIMARY, shiftKey: true });
    r.canvas.fire("pointermove", r.over(1, 0));
    assert.ok(r.frame().box, "the rectangle the sweep is drawing");
    r.canvas.fire("pointerup", { ...r.over(1, 0), button: PRIMARY });
    assert.equal(r.frame().box, null, "which goes when the sweep ends");
    assert.deepEqual(r.selected(), PAIR);
  });

  // A sweep that goes nowhere is a click, and follows the plane the rest of
  // the clicks read: no column in front answers for the cell.
  it("reads a sweep of no size on the floor plane once the level is see-through", () => {
    const r = boot([[1, 1]]);
    const shiftClick = () => {
      const at = { ...r.onFloor(0, 0), button: PRIMARY };
      r.canvas.fire("pointerdown", { ...at, shiftKey: true });
      r.canvas.fire("pointerup", at);
    };
    shiftClick();
    assert.deepEqual(r.selected(), [[1, 1]], "the ray meets the column in front");
    r.canvas.fire("keydown", { key: "Escape" });
    r.find("opaque", "").fire("click");
    shiftClick();
    assert.deepEqual(r.selected(), [], "and the cell under the pointer holds no tile");
  });
});

describe("app: what the pointer is over", () => {
  // A column one cell toward the eye, which covers the floor of (0, 0): what
  // the ray meets over that floor while the level is solid.
  const IN_FRONT = [[1, 1]];

  it("hands the renderer the tile under the pointer, and none once it leaves", () => {
    const r = boot(PAIR);
    r.canvas.fire("pointermove", r.over(0, 0));
    assert.equal(r.frame().hover.tile, r.tileAt(0, 0));
    r.canvas.fire("pointerleave", r.over(0, 0));
    assert.equal(r.frame().hover, null);
  });

  it("hovers the cell on the floor plane once the level is see-through", () => {
    const r = boot(IN_FRONT);
    r.canvas.fire("pointermove", r.over(0, 0));
    assert.equal(r.frame().hover.tile, r.tileAt(1, 1), "the ray meets the column in front");
    r.find("opaque", "").fire("click");
    r.canvas.fire("pointermove", r.over(0, 0));
    assert.deepEqual(r.frame().hover.cell, { x: 0, y: 0 });
  });

  it("lays a tile on that cell rather than selecting the column in front", () => {
    const r = boot(IN_FRONT);
    r.find("opaque", "").fire("click");
    r.press(0, 0);
    assert.deepEqual(r.cells(), [[0, 0], [1, 1]]);
    assert.deepEqual(r.selected(), [], "and it selects nothing");
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

describe("app: the controls that move the view", () => {
  const FAR = 40;                  // presses: further than the board and the frame together
  const DRAG = 60;                 // client px: a drag past the slop, and short of the clamp
  const FAR_DRAG = 4000;           // ...and one that would leave the board far behind
  const LAYERS = { elevation: true, marks: true, decor: true };

  // Whether the board's floor still overlaps what the canvas shows.
  const onScreen = (r) => {
    const state = r.frame();
    const box = r.B.view.board(state.view, state.size).box;
    const frame = r.B.view.frame(r.canvas, state.view.zoom * DPR);
    return box.right >= -frame.ox && box.left <= frame.w - frame.ox &&
      box.bottom >= -frame.oy && box.top <= frame.h - frame.oy;
  };

  const push = (r, act, arg, times = 1) => {
    for (let i = 0; i < times; i++) r.find(act, arg).fire("click");
  };

  // One press, and the redraw it must ask for. Every frame already asked for
  // has to have run first.
  const pressed = (r, act, arg) => {
    push(r, act, arg);
    assert.equal(r.waiting(), 1, `${act} ${arg} asks for a redraw`);
  };

  it("pans the camera, and back again on the opposite press", () => {
    const r = boot();
    const home = { ...r.frame().view.pan };
    pressed(r, "pan", "N");
    assert.notDeepEqual({ ...r.frame().view.pan }, home, "the camera moved");
    pressed(r, "pan", "S");
    assert.deepEqual(r.frame().view.pan, home, "and came back");
  });

  it("keeps some of the board on screen however far the reader pans", () => {
    for (const facing of ["N", "E", "S", "W"]) {
      const r = boot();
      push(r, "pan", facing, FAR);
      assert.equal(onScreen(r), true, facing);
    }
  });

  // The reader takes hold of the scene at `from` and carries the pointer away
  // by (dx, dy), which is a pan once it is past the slop input.js allows.
  const dragBy = (r, from, dx, dy) => {
    const to = { clientX: from.clientX + dx, clientY: from.clientY + dy };
    r.canvas.fire("pointerdown", { ...from, button: SECONDARY });
    r.canvas.fire("pointermove", to);
    r.canvas.fire("pointerup", { ...to, button: SECONDARY });
    return to;
  };

  it("pans by a right drag, which leaves the cell it took hold of under the pointer", () => {
    const HELD = [2, 3];
    const r = boot([HELD]);
    const home = { ...r.frame().view.pan };
    const scale = r.frame().view.zoom * DPR;
    dragBy(r, r.over(...HELD), DRAG, -DRAG);
    assert.deepEqual({ ...r.frame().view.pan }, {
      x: home.x + DRAG / scale,
      y: home.y - DRAG / scale
    }, "the view moved by the pointer's own travel");
    assert.equal(r.frame().hover.tile, r.tileAt(...HELD), "and the tile is still under it");
  });

  it("keeps some of the board on screen however far a drag carries it", () => {
    const r = boot();
    const asked = r.of("clampPan").length;
    dragBy(r, r.over(0, 0), FAR_DRAG, FAR_DRAG);
    assert.ok(r.of("clampPan").length > asked, "the drag is clamped like any other move");
    assert.equal(onScreen(r), true);
  });

  it("turns the view a quarter at a time, round either way", () => {
    const r = boot();
    assert.equal(r.frame().view.rot, 0);
    pressed(r, "rotate", 1);
    assert.equal(r.frame().view.rot, 1);
    push(r, "rotate", -1, 2);
    assert.equal(r.frame().view.rot, 3, "and round the far side of the turn");
    assert.equal(onScreen(r), true);
  });

  it("zooms between the ends of the range", () => {
    const r = boot();
    const span = r.B.ZOOM_MAX - r.B.ZOOM_MIN;
    assert.equal(r.frame().view.zoom, r.B.ZOOM_DEFAULT);
    pressed(r, "zoom", 1);
    assert.equal(r.frame().view.zoom, r.B.ZOOM_DEFAULT + 1);
    push(r, "zoom", -1, span);
    assert.equal(r.frame().view.zoom, r.B.ZOOM_MIN, "no further out than the range allows");
    assert.equal(onScreen(r), true, "zoomed out");
    push(r, "zoom", 1, span);
    assert.equal(r.frame().view.zoom, r.B.ZOOM_MAX, "and no further in");
    assert.equal(onScreen(r), true, "zoomed in");
  });

  it("hides and shows the layer each toggle names, and only that one", () => {
    const r = boot();
    assert.deepEqual(r.frame().layers, LAYERS, "every layer shows to start with");
    for (const name of Object.keys(LAYERS)) {
      pressed(r, "layer", name);
      assert.deepEqual(r.frame().layers, { ...LAYERS, [name]: false }, name);
      pressed(r, "layer", name);
      assert.deepEqual(r.frame().layers, LAYERS, `${name} again`);
    }
  });

  it("turns the tiles see-through, and solid again", () => {
    const r = boot();
    assert.equal(r.frame().opaque, true);
    pressed(r, "opaque", "");
    assert.equal(r.frame().opaque, false);
    pressed(r, "opaque", "");
    assert.equal(r.frame().opaque, true);
  });
});

describe("app: a level opened from a file", () => {
  const OPENED = { w: 4, h: 3 };
  const DROP = { dataTransfer: { files: [{}] } };
  const NOT_A_LEVEL = "not a level file";

  // A file dropped on the canvas of an app with a tile selected, which file.js
  // reads as a board of `holding`, or as no level at all. What it makes of the
  // text is the file module's own business.
  const opening = (holding = OPENED) => {
    const r = boot(PAIR);
    r.press(0, 0);
    r.opened = holding && r.B.level.create(holding.w, holding.h);
    r.B.file.parse = () => r.opened;
    r.canvas.fire("drop", DROP);
    return r;
  };

  it("moves the size row and the camera onto the opened board", () => {
    const r = opening();
    assert.deepEqual(r.shown(), [OPENED.w, OPENED.h]);
    assert.deepEqual(r.of("clampPan").pop(), [OPENED.w, OPENED.h]);
  });

  it("puts the level the file held in place of the one on the board", () => {
    const r = opening();
    assert.equal(r.frame().level, r.opened);
    assert.deepEqual(r.selected(), [], "the old level's selection goes with it");
    assert.equal(r.status().textContent, "", "a file that opens says nothing");
  });

  it("opens the file the reader chooses with the picker", () => {
    const r = boot(PAIR);
    r.opened = r.B.level.create(OPENED.w, OPENED.h);
    r.B.file.parse = () => r.opened;
    const picker = r.picker();
    picker.files = [{}];
    picker.fire("change");
    assert.equal(r.frame().level, r.opened);
  });

  it("says so on the status line when the file is no level, and changes nothing", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = opening(null);
    assert.equal(r.status().textContent, NOT_A_LEVEL);
    assert.equal(r.frame().level, r.level, "the level on the board is untouched");
    assert.deepEqual(r.cells(), PAIR);
    assert.deepEqual(r.selected(), [PAIR[0]], "and so is the selection");
  });

  it("says the same of a file the browser will not read", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = boot(PAIR);
    r.canvas.fire("drop", { dataTransfer: { files: [{ unreadable: true }] } });
    assert.equal(r.status().textContent, NOT_A_LEVEL);
    assert.deepEqual(r.cells(), PAIR);
  });

  it("takes the message off the status line after its time", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = opening(null);
    t.mock.timers.tick(r.B.STATUS_MS - 1);
    assert.equal(r.status().textContent, NOT_A_LEVEL, "still there a moment short of it");
    t.mock.timers.tick(1);
    assert.equal(r.status().textContent, "");
  });

  it("gives a later message its own full time, however near the last one was", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = opening(null);
    t.mock.timers.tick(r.B.STATUS_MS - 1);
    r.canvas.fire("drop", DROP);
    t.mock.timers.tick(1);
    assert.equal(r.status().textContent, NOT_A_LEVEL, "the first message's timer was stopped");
  });
});

describe("app: the level saved to a file", () => {
  const JSON_MIME = "application/json";
  const REFUSED = "the browser would not save it";

  it("hands the level's own text to the kit's download, under the file's name", async () => {
    const r = boot(PAIR);
    const saves = [];
    r.window.ExpPng = { save(blob, name) { saves.push({ blob, name }); } };
    r.find("save", "").fire("click");
    assert.equal(saves.length, 1);
    assert.equal(saves[0].name, r.B.file.FILE_NAME);
    assert.equal(saves[0].blob.type, JSON_MIME);
    assert.equal(await saves[0].blob.text(), r.B.file.serialize(r.level));
  });

  it("says why on the status line when the download will not run", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = boot(PAIR);
    r.window.ExpPng = { save() { throw new Error(REFUSED); } };
    r.find("save", "").fire("click");
    assert.equal(r.status().textContent, REFUSED);
  });
});

describe("app: a file dragged over the canvas", () => {
  const DROPPING = "is-dropping";    // the stylesheet's hook for a file overhead
  const marked = (r) => r.stage().classList.contains(DROPPING);

  it("marks the stage while the file is over it, and takes the mark off after", () => {
    const r = boot();
    assert.equal(r.canvas.fire("dragover").prevented, true, "the page may take the drop");
    assert.equal(marked(r), true);
    r.canvas.fire("dragleave");
    assert.equal(marked(r), false);
  });

  it("takes the mark off when the file is dropped", () => {
    const r = boot();
    r.canvas.fire("dragover");
    const dropped = r.canvas.fire("drop", { dataTransfer: null });
    assert.equal(dropped.prevented, true, "the browser does not open the file itself");
    assert.equal(marked(r), false);
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
