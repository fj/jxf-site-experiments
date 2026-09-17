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
    captured: null,
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: WIDTH, bottom: HEIGHT, width: WIDTH, height: HEIGHT };
    },
    focus() { canvas.focused = true; },
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
  const canvas = fakeCanvas();
  const hits = new Map();
  const added = new Set();
  const calls = [];
  let selected = null;
  const record = (name) => (...args) => { calls.push([name, ...args]); };
  const key = (x, y) => `${x},${y}`;
  const pick = (x, y) => {
    const hit = hits.get(key(x, y)) || null;
    const cell = hit && hit.cell;
    return cell && added.has(key(cell.x, cell.y)) ? tile(cell.x, cell.y) : hit;
  };
  const handlers = {
    pick,
    selected: () => selected,
    hover: record("hover"),
    add: (x, y) => { record("add")(x, y); added.add(key(x, y)); },
    select: record("select"),
    raise: record("raise"),
    hold: record("hold"),
    remove: record("remove"),
    pan: record("pan"),
    rotate: record("rotate"),
    zoom: record("zoom"),
    deselect: record("deselect"),
    setShape: record("setShape"),
    cycleFacing: record("cycleFacing"),
    setDecor: record("setDecor"),
    toggleMark: record("toggleMark")
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
    select(cell) { selected = cell; },
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
    r.fire("keydown", { key: "Backspace" });
    r.select(null);
    assert.equal(r.fire("keydown", { key: "Delete" }).prevented, true);
    assert.deepEqual(r.of("remove"), [[1, 1], [1, 1]]);
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
      r.fire("keydown", { key: "k" }),
      r.fire("keydown", { key: "Enter" })
    ];
    assert.deepEqual(r.calls, []);
    assert.deepEqual(events.map((e) => e.prevented), events.map(() => false));
  });
});

const SHIFT = { shiftKey: true };

// Every key that acts on the selected tile, as [key, event props].
const TILE_KEYS = [
  ...["w", "s", "a", "d", "b", "r", "t", "1", "2", "3", "4", "5", "p", "l", "j", "x"]
    .map((key) => [key, {}]),
  ...["W", "E", "D", "C", "S", "Z", "A", "Q"].map((key) => [key, SHIFT])
];

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
  it("w raises and s lowers, like the wheel", () => {
    const r = pressOnSelected([["w"], ["s"], ["w"]]);
    assert.deepEqual(r.calls, [["raise", 1], ["raise", -1], ["raise", 1]]);
  });

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

  it("Shift with the keys around S toggles the arrow mark in that compass direction", () => {
    const keys = ["W", "E", "D", "C", "S", "Z", "A", "Q"];
    const r = pressOnSelected(keys.map((key) => [key, SHIFT]));
    assert.deepEqual(r.calls, [
      "arrow-n", "arrow-ne", "arrow-e", "arrow-se", "arrow-s", "arrow-sw", "arrow-w", "arrow-nw"
    ].map((mark) => ["toggleMark", mark]));
  });

  it("reads a shifted key by its lowercase letter, so Caps Lock changes nothing", () => {
    const r = pressOnSelected([["w", SHIFT]]);
    assert.deepEqual(r.calls, [["toggleMark", "arrow-n"]]);
  });

  it("q, e, z and c do nothing without Shift", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    for (const key of ["q", "e", "z", "c"]) {
      assert.equal(r.fire("keydown", { key }).prevented, false, key);
    }
    assert.deepEqual(r.calls, []);
  });

  it("Shift with a key that has no mark does nothing", () => {
    const r = rig();
    r.select({ x: 1, y: 1 });
    for (const key of ["R", "X", "!", "ArrowUp"]) {
      r.fire("keydown", { key, shiftKey: true });
    }
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
