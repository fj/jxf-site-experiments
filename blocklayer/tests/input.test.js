"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load, tile: makeTile } = require("./load");

const WIDTH = 400;
const HEIGHT = 300;
const FRAME_MS = 16;
const PRIMARY = 0;
const MIDDLE = 1;
const SECONDARY = 2;

// A clock and a frame scheduler the test advances by hand.
function fakeWindow() {
  let now = 0;
  let nextId = 1;
  let frames = [];
  const window = {
    performance: { now: () => now },
    requestAnimationFrame(fn) {
      const id = nextId++;
      frames.push({ id, fn });
      return id;
    },
    cancelAnimationFrame(id) {
      frames = frames.filter((f) => f.id !== id);
    }
  };
  function tick(ms) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(now + FRAME_MS, end);
      const due = frames;
      frames = [];
      for (const f of due) f.fn(now);
    }
  }
  return { window, tick, pending: () => frames.length };
}

function fakeCanvas() {
  const listeners = {};
  const canvas = {
    width: WIDTH,
    height: HEIGHT,
    focused: false,
    focusOptions: null,
    captured: null,
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: WIDTH, bottom: HEIGHT, width: WIDTH, height: HEIGHT };
    },
    focus(options) { canvas.focused = true; canvas.focusOptions = options; },
    setPointerCapture(id) { canvas.captured = id; },
    fire(type, props = {}) {
      const e = {
        clientX: 0, clientY: 0, button: PRIMARY, pointerId: 1, deltaY: 0, key: "",
        prevented: false,
        preventDefault() { this.prevented = true; },
        ...props
      };
      for (const fn of listeners[type] || []) fn(e);
      return e;
    }
  };
  return canvas;
}

// input.js attached to a stub canvas, with the hit under each client point
// declared by the test and every handler call recorded. A cell that has been
// added answers as its tile from then on, as the level would.
function rig() {
  const clock = fakeWindow();
  const B = load(["config.js", "input.js"], clock.window);
  // config.js grows inCells in the change that makes the selection a list.
  B.inCells = B.inCells || ((cells, x, y) => cells.some((c) => c.x === x && c.y === y));
  const canvas = fakeCanvas();
  const hits = new Map();
  const added = new Set();
  const calls = [];
  let selection = [];
  let color = B.DEFAULT_COLOR;
  const record = (name) => (...args) => { calls.push([name, ...args]); };
  const key = (x, y) => `${x},${y}`;
  const pick = (x, y) => {
    const hit = hits.get(key(x, y)) || null;
    const cell = hit && hit.cell;
    return cell && added.has(key(cell.x, cell.y)) ? tile(cell.x, cell.y) : hit;
  };
  const handlers = {
    pick,
    selection: () => selection,
    hover: record("hover"),
    add: (x, y) => { record("add")(x, y); added.add(key(x, y)); },
    select: record("select"),
    toggleSelect: record("toggleSelect"),
    box: record("box"),
    selectBox: record("selectBox"),
    raise: record("raise"),
    raiseAll: record("raiseAll"),
    hold: record("hold"),
    // app.js takes a tile it removes out of the selection, in place, as a
    // model that hands the same list to every caller would.
    remove: (x, y) => {
      record("remove")(x, y);
      const at = selection.findIndex((c) => c.x === x && c.y === y);
      if (at !== -1) selection.splice(at, 1);
    },
    pan: record("pan"),
    rotate: record("rotate"),
    zoom: record("zoom"),
    deselect: record("deselect"),
    setShape: record("setShape"),
    cycleFacing: record("cycleFacing"),
    setDecor: record("setDecor"),
    toggleMark: record("toggleMark"),
    // app.js makes the key it is handed the foreground, as setColor does there.
    color: () => color,
    setColor: (key) => { record("setColor")(key); color = key; }
  };
  B.input.attach(canvas, handlers);
  return {
    B,
    canvas,
    calls,
    tick: clock.tick,
    pending: clock.pending,
    at(x, y, hit) {
      hits.set(`${x},${y}`, hit);
      return { clientX: x, clientY: y };
    },
    select(...cells) { selection = cells; },
    of(name) { return calls.filter((c) => c[0] === name).map((c) => c.slice(1)); },
    fire(type, props) { return canvas.fire(type, props); }
  };
}

const cell = (x, y) => ({ cell: { x, y } });
const edge = (x, y) => ({ cell: { x, y }, edge: true });
const tile = (x, y) => ({ tile: makeTile({ x, y }) });

describe("input: adding by click and drag", () => {
  it("a left click on an empty cell adds it, focuses the canvas and captures the pointer", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    const e = r.fire("pointerdown", { ...a, button: PRIMARY, pointerId: 7 });
    assert.deepEqual(r.of("add"), [[0, 0]]);
    assert.equal(r.canvas.focused, true);
    assert.equal(r.canvas.captured, 7);
    assert.equal(e.prevented, true);
  });

  // Focus scrolls its element into view by default, which would move the page
  // under the press and put the tile in the cell the pointer left behind.
  it("takes focus without scrolling the canvas into view", () => {
    const r = rig();
    r.fire("pointerdown", { ...r.at(10, 10, cell(0, 0)), button: PRIMARY });
    assert.deepEqual(r.canvas.focusOptions, { preventScroll: true });
  });

  it("a click, and each cell of a drag, hovers the tile it added in place of the cell", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    const b = r.at(40, 10, cell(1, 0));
    r.fire("pointerdown", { ...a, button: PRIMARY });
    assert.deepEqual(r.calls, [["add", 0, 0], ["hover", tile(0, 0)]]);
    r.fire("pointermove", b);
    assert.deepEqual(r.calls.slice(2), [["add", 1, 0], ["hover", tile(1, 0)]]);
  });

  it("a left click on a tile selects it and adds nothing", () => {
    const r = rig();
    r.fire("pointerdown", { ...r.at(20, 20, tile(1, 1)), button: PRIMARY });
    assert.deepEqual(r.of("select"), [[1, 1]]);
    assert.deepEqual(r.of("add"), []);
  });

  it("a drag adds each cell it crosses once and stops at the release", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    const b = r.at(40, 10, cell(1, 0));
    const c = r.at(70, 10, cell(2, 0));
    const d = r.at(100, 10, cell(3, 0));
    r.fire("pointerdown", { ...a, button: PRIMARY });
    r.fire("pointermove", a);
    r.fire("pointermove", b);
    r.fire("pointermove", b);
    r.fire("pointermove", c);
    r.fire("pointerup", { ...c, button: PRIMARY });
    r.fire("pointermove", d);
    assert.deepEqual(r.of("add"), [[0, 0], [1, 0], [2, 0]]);
  });

  it("a left click on a cell reached on a grid line still adds it", () => {
    const r = rig();
    r.fire("pointerdown", { ...r.at(25, 10, edge(0, 0)), button: PRIMARY });
    assert.deepEqual(r.of("add"), [[0, 0]]);
  });

  it("a drag survives a trip off the canvas and back", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    const b = r.at(40, 10, cell(1, 0));
    r.fire("pointerdown", { ...a, button: PRIMARY });
    r.fire("pointermove", { clientX: WIDTH + 5, clientY: 10 });
    r.fire("pointermove", b);
    assert.deepEqual(r.of("add"), [[0, 0], [1, 0]]);
    assert.deepEqual(r.of("hover"), [[tile(0, 0)], [null], [tile(1, 0)]]);
  });

  it("a drag that starts on a tile selects it, then adds the empty cells it crosses", () => {
    const r = rig();
    const t = r.at(20, 20, tile(1, 1));
    const c = r.at(50, 20, cell(2, 1));
    r.fire("pointerdown", { ...t, button: PRIMARY });
    r.fire("pointermove", c);
    assert.deepEqual(r.of("select"), [[1, 1]]);
    assert.deepEqual(r.of("add"), [[2, 1]]);
  });

  it("a drag skips a cell it reaches on the line between two cells", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    const between = r.at(25, 10, edge(1, 0));
    const c = r.at(70, 10, cell(2, 0));
    r.fire("pointerdown", { ...a, button: PRIMARY });
    r.fire("pointermove", between);
    r.fire("pointermove", c);
    assert.deepEqual(r.of("add"), [[0, 0], [2, 0]]);
  });

  it("a drag over a tile adds nothing, and the pointer is still hovered", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    const t = r.at(20, 20, tile(1, 1));
    r.fire("pointerdown", { ...a, button: PRIMARY });
    r.fire("pointermove", t);
    assert.deepEqual(r.of("add"), [[0, 0]]);
    assert.deepEqual(r.of("hover"), [[tile(0, 0)], [tile(1, 1)]]);
  });

  it("a pointer outside the canvas hovers nothing", () => {
    const r = rig();
    r.at(WIDTH + 5, 10, cell(9, 9));
    r.fire("pointermove", { clientX: WIDTH + 5, clientY: 10 });
    r.fire("pointerleave", {});
    assert.deepEqual(r.of("hover"), [[null], [null]]);
  });

  it("a middle button press is ignored", () => {
    const r = rig();
    const e = r.fire("pointerdown", { ...r.at(10, 10, cell(0, 0)), button: MIDDLE });
    assert.deepEqual(r.calls, []);
    assert.equal(r.canvas.focused, false);
    assert.equal(r.canvas.captured, null);
    assert.equal(e.prevented, false);
  });
});

// Ctrl and Cmd are one gesture: a Mac reads Cmd, and Ctrl+click there also
// makes the context menu the canvas swallows.
const TOGGLE_KEYS = [{ ctrlKey: true }, { metaKey: true }];

describe("input: Ctrl or Cmd to toggle a tile in the selection", () => {
  it("toggles the tile under the pointer and selects nothing outright", () => {
    for (const modifier of TOGGLE_KEYS) {
      const r = rig();
      r.select({ x: 2, y: 2 });
      r.fire("pointerdown", { ...r.at(20, 20, tile(1, 1)), button: PRIMARY, ...modifier });
      assert.deepEqual(r.calls, [["toggleSelect", 1, 1]], Object.keys(modifier)[0]);
    }
  });

  // Which way it goes is the handler's to decide, so a tile already in the
  // selection takes the same call.
  it("toggles a tile that is already in the selection", () => {
    const r = rig();
    r.select({ x: 1, y: 1 }, { x: 2, y: 2 });
    r.fire("pointerdown", { ...r.at(20, 20, tile(1, 1)), button: PRIMARY, ctrlKey: true });
    assert.deepEqual(r.calls, [["toggleSelect", 1, 1]]);
  });

  it("on an empty cell it does nothing at all, and is still swallowed", () => {
    for (const modifier of TOGGLE_KEYS) {
      const r = rig();
      const a = r.at(10, 10, cell(0, 0));
      const e = r.fire("pointerdown", { ...a, button: PRIMARY, ...modifier });
      r.tick(r.B.HOLD_MS);
      assert.deepEqual(r.calls, [], Object.keys(modifier)[0]);
      assert.equal(e.prevented, true);
    }
  });

  it("starts no drag, on a tile or on an empty cell", () => {
    for (const hit of [tile(1, 1), cell(0, 0)]) {
      const r = rig();
      const from = r.at(20, 20, hit);
      const c = r.at(50, 20, cell(2, 1));
      r.fire("pointerdown", { ...from, button: PRIMARY, ctrlKey: true });
      r.fire("pointermove", c);
      assert.deepEqual(r.of("add"), []);
    }
  });
});

const OFF_CANVAS = { clientX: WIDTH + 5, clientY: 10 };

describe("input: Shift to sweep a box of tiles into the selection", () => {
  it("reports the box from the press to the pointer, then selects it at the release", () => {
    const r = rig();
    r.select({ x: 9, y: 9 });
    const from = r.at(10, 10, cell(0, 0));
    const over = r.at(40, 30, cell(1, 0));
    const to = r.at(70, 50, cell(2, 0));
    r.fire("pointerdown", { ...from, button: PRIMARY, shiftKey: true });
    r.fire("pointermove", over);
    r.fire("pointermove", to);
    assert.deepEqual(r.of("box"), [[10, 10, 40, 30], [10, 10, 70, 50]]);
    // The button may outlast the key that started the sweep.
    r.fire("pointerup", { ...to, button: PRIMARY });
    assert.deepEqual(r.of("box").pop(), [null]);
    assert.deepEqual(r.of("selectBox"), [[10, 10, 70, 50]]);
    assert.deepEqual(r.of("select"), []);
    assert.deepEqual(r.of("deselect"), []);
  });

  it("a shift click that never moves sweeps a box of no size and reports none", () => {
    const r = rig();
    const a = r.at(20, 20, tile(1, 1));
    r.fire("pointerdown", { ...a, button: PRIMARY, shiftKey: true });
    r.fire("pointerup", { ...a, button: PRIMARY });
    assert.deepEqual(r.of("selectBox"), [[20, 20, 20, 20]]);
    assert.deepEqual(r.of("box"), [[null]]);
    assert.deepEqual(r.of("select"), []);
    assert.deepEqual(r.of("add"), []);
  });

  it("adds no tiles, even when the sweep crosses empty cells", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    const b = r.at(40, 10, cell(1, 0));
    const c = r.at(70, 10, cell(2, 0));
    r.fire("pointerdown", { ...a, button: PRIMARY, shiftKey: true });
    r.fire("pointermove", b);
    r.fire("pointermove", c);
    r.fire("pointerup", { ...c, button: PRIMARY });
    assert.deepEqual(r.of("add"), []);
    assert.deepEqual(r.of("selectBox"), [[10, 10, 70, 10]]);
  });

  it("a cancelled sweep clears the box and selects nothing, then or on the release", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    const b = r.at(40, 30, cell(1, 0));
    r.fire("pointerdown", { ...a, button: PRIMARY, shiftKey: true });
    r.fire("pointermove", b);
    r.fire("pointercancel", b);
    assert.deepEqual(r.of("box").pop(), [null]);
    r.fire("pointerup", { ...b, button: PRIMARY });
    assert.deepEqual(r.of("selectBox"), []);
  });

  it("a sweep that ends off the canvas clears the box and selects nothing", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    r.fire("pointerdown", { ...a, button: PRIMARY, shiftKey: true });
    r.fire("pointermove", OFF_CANVAS);
    r.fire("pointerup", { ...OFF_CANVAS, button: PRIMARY });
    assert.deepEqual(r.of("box"), [[10, 10, OFF_CANVAS.clientX, OFF_CANVAS.clientY], [null]]);
    assert.deepEqual(r.of("selectBox"), []);
  });

  it("the pointer moving with no sweep under way reports no box", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    r.fire("pointerdown", { ...a, button: PRIMARY });
    r.fire("pointermove", r.at(40, 10, cell(1, 0)));
    r.fire("pointerup", { ...a, button: PRIMARY });
    assert.deepEqual(r.of("box"), []);
    assert.deepEqual(r.of("selectBox"), []);
  });
});

describe("input: hold to remove", () => {
  it("the right button held on a tile reports progress and removes it at HOLD_MS", () => {
    const r = rig();
    const t = r.at(20, 20, tile(1, 1));
    r.fire("pointerdown", { ...t, button: SECONDARY });
    assert.deepEqual(r.of("hold"), [[1, 1, 0]]);
    r.tick(r.B.HOLD_MS / 2);
    const progress = r.of("hold").map((h) => h[2]);
    assert.equal(progress[progress.length - 1], 0.5);
    for (let i = 1; i < progress.length; i++) {
      assert.ok(progress[i] > progress[i - 1], `frame ${i}`);
    }
    assert.deepEqual(r.of("remove"), []);
    r.tick(r.B.HOLD_MS / 2);
    assert.deepEqual(r.of("remove"), [[1, 1]]);
    assert.deepEqual(r.of("hold").pop(), [1, 1, null]);
    assert.equal(r.pending(), 0);
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.of("remove"), [[1, 1]]);
  });

  it("releasing the right button early cancels the hold", () => {
    const r = rig();
    const t = r.at(20, 20, tile(1, 1));
    r.fire("pointerdown", { ...t, button: SECONDARY });
    r.tick(r.B.HOLD_MS / 4);
    r.fire("pointerup", { ...t, button: SECONDARY });
    assert.deepEqual(r.of("hold").pop(), [1, 1, null]);
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.of("remove"), []);
    assert.equal(r.pending(), 0);
  });

  it("the pointer leaving the canvas, or being cancelled, cancels the hold", () => {
    for (const type of ["pointerleave", "pointercancel"]) {
      const r = rig();
      const t = r.at(20, 20, tile(1, 1));
      r.fire("pointerdown", { ...t, button: SECONDARY });
      r.tick(r.B.HOLD_MS / 4);
      r.fire(type, t);
      assert.deepEqual(r.of("hold").pop(), [1, 1, null], type);
      r.tick(r.B.HOLD_MS);
      assert.deepEqual(r.of("remove"), [], type);
    }
  });

  it("moving off the tile cancels the hold; moving on it does not", () => {
    const r = rig();
    const t = r.at(20, 20, tile(1, 1));
    const c = r.at(10, 10, cell(0, 0));
    r.fire("pointerdown", { ...t, button: SECONDARY });
    r.tick(r.B.HOLD_MS / 4);
    r.fire("pointermove", { clientX: 20, clientY: 20 });
    assert.notEqual(r.of("hold").pop()[2], null);
    r.fire("pointermove", c);
    assert.deepEqual(r.of("hold").pop(), [1, 1, null]);
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.of("remove"), []);
  });

  it("moving onto another tile cancels the hold too", () => {
    const r = rig();
    const t = r.at(20, 20, tile(1, 1));
    const other = r.at(50, 50, tile(2, 2));
    r.fire("pointerdown", { ...t, button: SECONDARY });
    r.fire("pointermove", other);
    assert.deepEqual(r.of("hold").pop(), [1, 1, null]);
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.of("remove"), []);
  });

  it("releasing the right button mid-drag ends the hold, not the drag", () => {
    const r = rig();
    const a = r.at(10, 10, cell(0, 0));
    const t = r.at(20, 20, tile(1, 1));
    const b = r.at(40, 10, cell(1, 0));
    r.fire("pointerdown", { ...a, button: PRIMARY });
    r.fire("pointerdown", { ...t, button: SECONDARY });
    r.fire("pointerup", { ...t, button: SECONDARY });
    r.fire("pointermove", b);
    assert.deepEqual(r.of("hold"), [[1, 1, 0], [1, 1, null]]);
    assert.deepEqual(r.of("add"), [[0, 0], [1, 0]]);
  });

  it("the right button on an empty cell starts no hold and adds nothing", () => {
    const r = rig();
    r.fire("pointerdown", { ...r.at(10, 10, cell(0, 0)), button: SECONDARY });
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.of("hold"), []);
    assert.deepEqual(r.of("add"), []);
    assert.deepEqual(r.of("remove"), []);
  });

  it("the context menu never opens on the canvas", () => {
    const r = rig();
    assert.equal(r.fire("contextmenu").prevented, true);
  });
});

describe("input: the right button and the selection", () => {
  it("a right press on an empty cell drops the selection and starts no hold", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    r.fire("pointerdown", { ...r.at(10, 10, cell(0, 0)), button: SECONDARY });
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.calls, [["deselect"]]);
  });

  it("a right press on another tile drops the selection, then holds to remove that tile", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    r.fire("pointerdown", { ...r.at(50, 50, tile(2, 2)), button: SECONDARY });
    assert.deepEqual(r.calls, [["deselect"], ["hold", 2, 2, 0]]);
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.of("remove"), [[2, 2]]);
    assert.deepEqual(r.of("deselect"), [[]]);
  });

  it("a tile that shares a row or a column with the selection is another tile", () => {
    for (const hit of [tile(1, 2), tile(2, 1)]) {
      const where = `${hit.tile.x},${hit.tile.y}`;
      const r = rig();
      r.select({ x: 1, y: 1 });
      r.fire("pointerdown", { ...r.at(50, 50, hit), button: SECONDARY });
      assert.deepEqual(r.of("deselect"), [[]], where);
      assert.deepEqual(r.of("hold"), [[hit.tile.x, hit.tile.y, 0]], where);
    }
  });

  it("a right press off the canvas drops the selection and starts no hold", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    r.at(WIDTH + 5, 10, tile(9, 9));
    r.fire("pointerdown", { clientX: WIDTH + 5, clientY: 10, button: SECONDARY });
    assert.deepEqual(r.calls, [["deselect"]]);
  });

  it("a right press on the selected tile keeps the selection and still removes it", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    r.fire("pointerdown", { ...r.at(20, 20, tile(1, 1)), button: SECONDARY });
    assert.deepEqual(r.of("hold"), [[1, 1, 0]]);
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.of("remove"), [[1, 1]]);
    assert.deepEqual(r.of("deselect"), []);
  });

  it("a right press keeps a selection of several on a tile in it, and drops it on one outside", () => {
    for (const [hit, deselects] of [[tile(2, 2), []], [tile(3, 3), [[]]]]) {
      const where = `${hit.tile.x},${hit.tile.y}`;
      const r = rig();
      r.select({ x: 1, y: 1 }, { x: 2, y: 2 });
      r.fire("pointerdown", { ...r.at(50, 50, hit), button: SECONDARY });
      assert.deepEqual(r.of("deselect"), deselects, where);
      assert.deepEqual(r.of("hold"), [[hit.tile.x, hit.tile.y, 0]], where);
    }
  });

  it("with nothing selected, a right press deselects nothing, on a tile or off one", () => {
    const r = rig();
    r.fire("pointerdown", { ...r.at(10, 10, cell(0, 0)), button: SECONDARY });
    r.fire("pointerdown", { ...r.at(20, 20, tile(1, 1)), button: SECONDARY });
    r.tick(r.B.HOLD_MS);
    assert.deepEqual(r.of("deselect"), []);
    assert.deepEqual(r.of("remove"), [[1, 1]]);
  });

  it("a left press leaves the selection to the select handler", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    r.fire("pointerdown", { ...r.at(10, 10, cell(0, 0)), button: PRIMARY });
    r.fire("pointerdown", { ...r.at(50, 50, tile(2, 2)), button: PRIMARY });
    assert.deepEqual(r.of("deselect"), []);
  });
});

describe("input: the wheel", () => {
  it("raises or lowers the selected tile under the pointer and swallows the event", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    const t = r.at(20, 20, tile(1, 1));
    const up = r.fire("wheel", { ...t, deltaY: -100 });
    const down = r.fire("wheel", { ...t, deltaY: 100 });
    assert.deepEqual(r.of("raise"), [[1], [-1]]);
    assert.equal(up.prevented, true);
    assert.equal(down.prevented, true);
    assert.deepEqual(r.of("hover"), [[tile(1, 1)], [tile(1, 1)]]);
  });

  it("raises a tile that is one of several selected", () => {
    const r = rig();
    r.select({ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 });
    const t = r.at(50, 50, tile(2, 2));
    assert.equal(r.fire("wheel", { ...t, deltaY: -100 }).prevented, true);
    assert.deepEqual(r.of("raise"), [[1]]);
  });

  it("does nothing over an unselected tile, an empty cell, or with no vertical delta", () => {
    const r = rig();
    const t = r.at(20, 20, tile(1, 1));
    const c = r.at(10, 10, cell(0, 0));
    const events = [
      r.fire("wheel", { ...t, deltaY: -100 }),
      r.fire("wheel", { ...c, deltaY: -100 })
    ];
    r.select({ x: 2, y: 2 });
    events.push(r.fire("wheel", { ...t, deltaY: -100 }));
    r.select({ x: 1, y: 1 });
    events.push(r.fire("wheel", { ...t, deltaY: 0 }));
    assert.deepEqual(r.of("raise"), []);
    assert.deepEqual(events.map((e) => e.prevented), [false, false, false, false]);
  });
});

describe("input: the keyboard", () => {
  it("the arrows pan the camera toward the compass", () => {
    const r = rig();
    const keys = { ArrowUp: "N", ArrowRight: "E", ArrowDown: "S", ArrowLeft: "W" };
    for (const key of Object.keys(keys)) {
      assert.equal(r.fire("keydown", { key }).prevented, true, key);
    }
    assert.deepEqual(r.of("pan"), Object.values(keys).map((f) => [f]));
  });

  it("[ and ] turn, - and = or + zoom", () => {
    const r = rig();
    for (const key of ["[", "]", "-", "=", "+"]) {
      assert.equal(r.fire("keydown", { key }).prevented, true, key);
    }
    assert.deepEqual(r.of("rotate"), [[-1], [1]]);
    assert.deepEqual(r.of("zoom"), [[-1], [1], [1]]);
  });

  it("Delete and Backspace remove the selected tile, and nothing when none is", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    r.fire("keydown", { key: "Delete" });
    r.select({ x: 1, y: 1 });
    r.fire("keydown", { key: "Backspace" });
    r.select();
    assert.equal(r.fire("keydown", { key: "Delete" }).prevented, true);
    assert.deepEqual(r.of("remove"), [[1, 1], [1, 1]]);
  });

  // Each removal takes its cell out of the selection, so the last cell is
  // reached only by a key that reads the whole selection first.
  it("Delete removes every tile in the selection, oldest first", () => {
    const r = rig();
    r.select({ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 });
    assert.equal(r.fire("keydown", { key: "Delete" }).prevented, true);
    assert.deepEqual(r.of("remove"), [[1, 1], [2, 2], [3, 3]]);
  });

  it("Escape deselects", () => {
    const r = rig();
    assert.equal(r.fire("keydown", { key: "Escape" }).prevented, true);
    assert.deepEqual(r.of("deselect"), [[]]);
  });

  it("keys with a modifier held, and other keys, pass through untouched", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    const events = [
      r.fire("keydown", { key: "ArrowUp", ctrlKey: true }),
      r.fire("keydown", { key: "]", metaKey: true }),
      r.fire("keydown", { key: "Delete", altKey: true }),
      r.fire("keydown", { key: "w", ctrlKey: true }),
      r.fire("keydown", { key: "W", shiftKey: true, ctrlKey: true }),
      r.fire("keydown", { key: "g" }),
      r.fire("keydown", { key: "Enter" })
    ];
    assert.deepEqual(r.calls, []);
    assert.deepEqual(events.map((e) => e.prevented), events.map(() => false));
  });
});

const SHIFT = { shiftKey: true };

// Every key that acts on the selected tile, as [key, event props].
const TILE_KEYS = [
  "a", "d", "b", "r", "t", "1", "2", "3", "4", "5", "p", "l", "x",
  "y", "u", "i", "h", "j", "k", "n", "m", ","
].map((key) => [key, {}]);

// A rig with (1, 1) selected, and the keys fired on it, each asserted swallowed.
function pressOnSelected(keys) {
  const r = rig();
  r.select({ x: 1, y: 1 });
  for (const [key, props] of keys) {
    assert.equal(r.fire("keydown", { key, ...props }).prevented, true, key);
  }
  return r;
}

describe("input: keys on the selected tile", () => {
  it("a turns the facing anticlockwise and d clockwise", () => {
    const r = pressOnSelected([["a"], ["d"]]);
    assert.deepEqual(r.calls, [["cycleFacing", -1], ["cycleFacing", 1]]);
  });

  it("b, r and t set the shape", () => {
    const r = pressOnSelected([["b"], ["r"], ["t"]]);
    assert.deepEqual(r.calls, ["block", "ramp", "stairs"].map((shape) => ["setShape", shape]));
  });

  it("1 to 5 toggle the decor in toolbar order", () => {
    const r = pressOnSelected(["1", "2", "3", "4", "5"].map((key) => [key]));
    assert.deepEqual(r.calls, r.B.DECOR.map((d) => ["setDecor", d.key]));
  });

  it("the rose under the right hand toggles the arrow mark in that compass direction", () => {
    const keys = ["u", "i", "k", ",", "m", "n", "h", "y"];
    const r = pressOnSelected(keys.map((key) => [key]));
    assert.deepEqual(r.calls, [
      "arrow-n", "arrow-ne", "arrow-e", "arrow-se", "arrow-s", "arrow-sw", "arrow-w", "arrow-nw"
    ].map((mark) => ["toggleMark", mark]));
  });

  it("reads a key by its lowercase letter, so Caps Lock changes nothing", () => {
    const r = pressOnSelected([["W"], ["U"]]);
    assert.deepEqual(r.calls, [["raise", 1], ["toggleMark", "arrow-n"]]);
  });

  it("no key the marks left behind toggles a mark, shifted or not", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    for (const key of ["q", "e", "z"]) {
      assert.equal(r.fire("keydown", { key }).prevented, false, key);
    }
    for (const key of ["Q", "E", "A", "D", "Z"]) {
      assert.equal(r.fire("keydown", { key, ...SHIFT }).prevented, false, key);
    }
    for (const key of ["W", "S"]) r.fire("keydown", { key, ...SHIFT });
    assert.deepEqual(r.of("toggleMark"), []);
    assert.deepEqual(r.of("raiseAll"), [[1], [-1]]);
  });

  it("Shift with an unbound key is not swallowed; Shift with a view key still works", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    for (const key of ["R", "X", "!"]) {
      assert.equal(r.fire("keydown", { key, shiftKey: true }).prevented, false, key);
    }
    assert.equal(r.fire("keydown", { key: "ArrowUp", shiftKey: true }).prevented, true);
    assert.deepEqual(r.calls, [["pan", "N"]]);
  });

  it("p, l and j toggle the teleport, rope and jump marks", () => {
    const r = pressOnSelected([["p"], ["l"], ["j"]]);
    assert.deepEqual(r.calls, [
      ["toggleMark", "teleport"], ["toggleMark", "rope"], ["toggleMark", "jump"]
    ]);
  });

  it("x removes the selected tile", () => {
    const r = pressOnSelected([["x"]]);
    assert.deepEqual(r.calls, [["remove", 1, 1]]);
  });

  it("with nothing selected, every tile key does nothing and is not swallowed", () => {
    const r = rig();
    for (const [key, props] of TILE_KEYS) {
      assert.equal(r.fire("keydown", { key, ...props }).prevented, false, key);
    }
    assert.deepEqual(r.calls, []);
  });
});

describe("input: the elevation keys", () => {
  it("w raises and s lowers, with a tile selected or without one", () => {
    const r = rig();
    for (const key of ["w", "s"]) {
      assert.equal(r.fire("keydown", { key }).prevented, true, key);
    }
    r.select({ x: 1, y: 1 });
    for (const key of ["w", "s"]) {
      assert.equal(r.fire("keydown", { key }).prevented, true, key);
    }
    assert.deepEqual(r.of("raise"), [[1], [-1], [1], [-1]]);
  });

  it("Shift+W raises and Shift+S lowers every tile, with a selection or without one", () => {
    const r = rig();
    for (const key of ["W", "S"]) {
      assert.equal(r.fire("keydown", { key, ...SHIFT }).prevented, true, key);
    }
    r.select({ x: 1, y: 1 });
    for (const key of ["W", "S"]) {
      assert.equal(r.fire("keydown", { key, ...SHIFT }).prevented, true, key);
    }
    assert.deepEqual(r.of("raiseAll"), [[1], [-1], [1], [-1]]);
  });

  it("reads the shifted key by its lowercase letter, so Caps Lock changes nothing", () => {
    const r = rig();
    r.fire("keydown", { key: "w", ...SHIFT });
    assert.deepEqual(r.of("raiseAll"), [[1]]);
    assert.deepEqual(r.of("raise"), []);
  });
});

describe("input: the colour keys", () => {
  const { PALETTE, DEFAULT_COLOR } = rig().B;
  const KEYS = PALETTE.map((entry) => entry.key);
  const FROM = KEYS.indexOf(DEFAULT_COLOR);
  const round = (n) => KEYS[(((FROM + n) % KEYS.length) + KEYS.length) % KEYS.length];
  const walk = (step) => KEYS.map((entry, i) => round(step * (i + 1)));

  // The whole palette, pressed key by key, so the last step is the one that wraps.
  function press(key, props) {
    const r = rig();
    for (let i = 0; i < KEYS.length; i++) {
      assert.equal(r.fire("keydown", { key, ...props }).prevented, true, key);
    }
    return r.of("setColor").flat();
  }

  it("C steps the foreground on through the palette and wraps at the end", () => {
    assert.deepEqual(press("c"), walk(1));
    assert.equal(walk(1).pop(), DEFAULT_COLOR, "the walk comes back round");
  });

  it("Shift+C steps it back through the palette and wraps at the start", () => {
    assert.deepEqual(press("C", SHIFT), walk(-1));
  });

  it("paints by the same call with a tile selected and without one", () => {
    const r = rig();
    assert.equal(r.fire("keydown", { key: "c" }).prevented, true);
    r.select({ x: 1, y: 1 });
    assert.equal(r.fire("keydown", { key: "c" }).prevented, true);
    assert.equal(r.fire("keydown", { key: "C", ...SHIFT }).prevented, true);
    assert.deepEqual(r.of("setColor"), [[round(1)], [round(2)], [round(1)]]);
  });
});

describe("input: keyFor", () => {
  const B = load(["config.js", "input.js"]);
  const keyFor = B.input.keyFor;

  it("names a view key as typed, an arrow key by its direction", () => {
    assert.equal(keyFor("pan", "N"), "Up");
    assert.equal(keyFor("pan", "W"), "Left");
    assert.equal(keyFor("rotate", -1), "[");
    assert.equal(keyFor("rotate", 1), "]");
    assert.equal(keyFor("zoom", -1), "-");
    assert.equal(keyFor("zoom", 1), "=");
    assert.equal(keyFor("deselect"), "Escape");
  });

  it("names a tile key in upper case, and a punctuation key as typed", () => {
    assert.equal(keyFor("raise", 1), "W");
    assert.equal(keyFor("raise", -1), "S");
    assert.equal(keyFor("cycleFacing", -1), "A");
    assert.equal(keyFor("cycleFacing", 1), "D");
    assert.equal(keyFor("setShape", "stairs"), "T");
    assert.equal(keyFor("toggleMark", "arrow-se"), ",");
  });

  it("names a shifted key with Shift+ before it", () => {
    assert.equal(keyFor("raiseAll", 1), "Shift+W");
    assert.equal(keyFor("raiseAll", -1), "Shift+S");
  });

  it("names the colour step on and the colour step back", () => {
    const step = rig().B.input.CYCLE_COLOR;
    assert.equal(keyFor(step, 1), "C");
    assert.equal(keyFor(step, -1), "Shift+C");
  });

  it("names a key for every mark, the eight arrows as a rose around the jump", () => {
    const rose = {
      "arrow-nw": "Y", "arrow-n": "U", "arrow-ne": "I",
      "arrow-w": "H", jump: "J", "arrow-e": "K",
      "arrow-sw": "N", "arrow-s": "M", "arrow-se": ",",
      teleport: "P", rope: "L"
    };
    const names = B.MARKS.map((m) => keyFor("toggleMark", m.key));
    assert.deepEqual(names, B.MARKS.map((m) => rose[m.key]));
  });

  it("numbers the decor from 1 in B.DECOR order", () => {
    const names = B.DECOR.map((d) => keyFor("setDecor", d.key));
    assert.deepEqual(names, B.DECOR.map((d, i) => String(i + 1)));
  });

  it("is null for a call no key makes", () => {
    assert.equal(keyFor("save"), null);
    assert.equal(keyFor("toggleLayer", "marks"), null);
    assert.equal(keyFor("setShape", "dome"), null);
    assert.equal(keyFor("remove"), null);
  });
});
