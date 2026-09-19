"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { canvasDocument } = require("./sprite");
const palette = require("./palette");

const PRIMARY_BUTTON = 0;
const SECONDARY_BUTTON = 2;
const PRESSED = "true";
const RELEASED = "false";
const ACT_ATTR = "data-act";
const ARG_ATTR = "data-arg";
const GROUP_ATTR = "data-group";
const PRESSED_ATTR = "aria-pressed";
const MASK = "mask-image";                   // the style property a glyph is shown by
const HOLDING_CLASS = "is-holding";          // the stylesheet's hook for the hold fill
const EITHER_KEY = "/";                      // between two keys in one title
const HOLD_KEYS = [" ", "Enter"];
const TILE_ACTS = ["shape", "facing", "decor", "mark"];
const SLOPED_SHAPES = ["ramp", "stairs"];    // the shapes with a top to turn
const STILL_ROT = 0;                         // a still mark is the same at every rotation
const GRID = 3;                              // the pan and mark arrows sit in a 3 by 3 rose
const ELEV = 3;
const CELL = { x: 1, y: 2 };
const BARE_CELL = { x: 9, y: 9 };            // a cell with no tile on it
const FILE = { name: "level.blocklayer.json" };
const FOREGROUND = "violet";                 // a foreground the default is not
const TILE_COLOR = "red";                    // ...and a tile's colour that is neither

// An element with what the toolbar touches and no more: attributes, classes,
// style properties, children and listeners. fire() delivers an event to them.
function fakeElement(tag) {
  const attrs = new Map();
  const classes = new Set();
  const listeners = new Map();
  const style = {
    setProperty(name, value) { style[name] = value; },
    getPropertyValue(name) { return style[name] === undefined ? "" : style[name]; }
  };
  const el = {
    tag,
    className: "",
    title: "",
    disabled: false,
    style,
    children: [],
    clicks: 0,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    addEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).concat(fn)); },
    appendChild(child) { el.children.push(child); return child; },
    click() { el.clicks++; el.fire("click"); },
    fire(type, props = {}) {
      const e = {
        button: PRIMARY_BUTTON, key: "", repeat: false, prevented: false,
        preventDefault() { this.prevented = true; },
        ...props
      };
      for (const fn of listeners.get(type) || []) fn(e);
      return e;
    }
  };
  return el;
}

function fakeDocument() {
  const canvases = canvasDocument();
  return {
    createElement(tag) {
      return tag === "canvas" ? canvases.createElement(tag) : fakeElement(tag);
    }
  };
}

const B = load([
  "config.js", "pixel.js", "level.js",
  "sprites-decor.js", "sprites-marks.js", "sprites-icons.js",
  "input.js", "toolbar.js"
], { document: fakeDocument() });

// The tile colours the toolbar picks, until the change that brings them lands.
palette.swatches(palette.tileColors(palette.colors(B)));

const HOLD_VAR = "--" + B.PREFIX + "hold";
const HALF_HOLD_MS = B.HOLD_MS / 2;

// A glyph is a mask over the button's text colour; a coloured object is a
// picture on it.
const masked = (sprite) => `url("${B.pixel.crispUrl(sprite)}")`;
const pictured = (sprite) => B.pixel.dataUrl(sprite);

const PAN_LABELS = { N: "North", E: "East", S: "South", W: "West" };
const VIEW_BUTTONS = [
  ["rotate", -1, "Turn left", "rotate-ccw"],
  ["rotate", 1, "Turn right", "rotate-cw"],
  ["zoom", -1, "Zoom out", "zoom-out"],
  ["zoom", 1, "Zoom in", "zoom-in"]
];
const LAYER_BUTTONS = [
  ["elevation", "Elevation", "layer-elev"],
  ["marks", "Marks", "layer-marks"],
  ["decor", "Decor", "layer-decor"]
];
const SHAPE_LABELS = { block: "Block", ramp: "Ramp", stairs: "Stairs" };
const FILE_BUTTONS = [
  ["save", "Save", "file-save", ["save"]],
  ["open", "Open", "file-open", null],
  ["clear", "Clear", "clear", null]
];
const LAYER_NAMES = LAYER_BUTTONS.map(([name]) => name);
const GROUPS = ["pan", "view", "layers", "shape", "color", "decor", "marks", "file"];
const PAN_GRID = ["", "N", "", "W", "", "E", "", "S", ""];
const ARROW_GRID = [
  "arrow-nw", "arrow-n", "arrow-ne",
  "arrow-w", "", "arrow-e",
  "arrow-sw", "arrow-s", "arrow-se"
];

// Every button the toolbar offers: the act and arg it is found by, the label
// and glyph it shows, the handler call a click makes, and the calls input.js
// may bind a key to.
const of = (spec) => ({ ...spec, calls: spec.calls || (spec.fires ? [spec.fires] : []) });

const BUTTONS = [
  ...Object.keys(PAN_LABELS).map((dir) => of({
    act: "pan", arg: dir, label: PAN_LABELS[dir],
    shows: masked(B.icons.arrow(dir)), fires: ["pan", dir]
  })),
  ...VIEW_BUTTONS.map(([act, step, label, glyph]) => of({
    act, arg: step, label, shows: masked(B.icons.sprite(glyph)), fires: [act, step]
  })),
  ...LAYER_BUTTONS.map(([name, label, glyph]) => of({
    act: "layer", arg: name, label, shows: masked(B.icons.sprite(glyph)),
    fires: ["toggleLayer", name]
  })),
  of({
    act: "opaque", arg: "", label: "Solid",
    shows: masked(B.icons.sprite("opaque")), fires: ["toggleOpaque"]
  }),
  ...B.SHAPES.map((shape) => of({
    act: "shape", arg: shape, label: SHAPE_LABELS[shape],
    shows: masked(B.icons.sprite(`shape-${shape}`)), fires: ["setShape", shape]
  })),
  of({
    act: "facing", arg: "", label: "Facing", shows: masked(B.icons.arrow(B.FACINGS[0])),
    fires: ["cycleFacing"], calls: [["cycleFacing", -1], ["cycleFacing", 1]]
  }),
  ...B.PALETTE.map((entry) => of({
    act: "color", arg: entry.key, label: entry.label,
    shows: pictured(B.tiles.swatch(entry.key)), fires: ["setColor", entry.key],
    calls: [["cycleColor", 1], ["cycleColor", -1]]
  })),
  ...B.DECOR.map((d) => of({
    act: "decor", arg: d.key, label: d.label,
    shows: pictured(B.decor.icon(d.key)), fires: ["setDecor", d.key]
  })),
  ...B.MARKS.map((m) => of({
    act: "mark", arg: m.key, label: m.label,
    shows: m.dir ? masked(B.icons.arrow(m.dir)) : pictured(B.marks.sprite(m.key, STILL_ROT)),
    fires: ["toggleMark", m.key]
  })),
  ...FILE_BUTTONS.map(([act, label, glyph, fires]) => of({
    act, arg: "", label, shows: masked(B.icons.sprite(glyph)), fires
  }))
];

const HANDLERS = [
  "pan", "rotate", "zoom", "toggleLayer", "toggleOpaque",
  "setShape", "cycleFacing", "setColor", "setDecor", "toggleMark",
  "save", "open", "clear"
];

function descend(el, found = []) {
  found.push(el);
  el.children.forEach((child) => descend(child, found));
  return found;
}

const buttons = (root) => descend(root).filter((el) => el.getAttribute(ACT_ATTR) !== null);
const hookOf = (btn) => `${btn.getAttribute(ACT_ATTR)} ${btn.getAttribute(ARG_ATTR)}`;
const pressedOf = (btn) => btn.getAttribute(PRESSED_ATTR);
const groupsOf = (root) => descend(root).filter((el) => el.getAttribute(GROUP_ATTR) !== null);

// What a button shows the reader, as a mask or as a picture.
function shownOn(btn) {
  for (const child of btn.children) {
    const mask = child.style.getPropertyValue(MASK);
    if (mask) return mask;
    if (child.src) return child.src;
  }
  return null;
}

// What sits in each place of a group: a button's arg, or nothing for a spacer.
const slotsOf = (root, name) => groupsOf(root)
  .find((el) => el.getAttribute(GROUP_ATTR) === name)
  .children.map((el) => el.getAttribute(ARG_ATTR) || "");

// A toolbar whose every handler records the call it was made by.
function rig() {
  const calls = [];
  const handlers = {};
  HANDLERS.forEach((name) => {
    handlers[name] = (...args) => { calls.push([name, ...args]); };
  });
  const bar = B.toolbar.build(handlers);
  const all = buttons(bar.el);
  return {
    bar,
    calls,
    picker: descend(bar.el).find((el) => el.tag === "input"),
    find(act, arg) {
      const btn = all.find((b) => hookOf(b) === `${act} ${arg}`);
      assert.ok(btn, `no ${act} ${arg} button`);
      return btn;
    }
  };
}

// The state app.js keeps, as sync() reads it.
function state(over = {}) {
  return {
    level: B.level.create(),
    layers: { elevation: true, marks: true, decor: true },
    opaque: true,
    color: B.DEFAULT_COLOR,
    selected: null,
    ...over
  };
}

// The same, with one tile selected, after `edit` has changed it.
function selecting(edit) {
  const level = B.level.create();
  B.level.add(level, CELL.x, CELL.y, ELEV);
  if (edit) {
    edit({
      shape: (s) => B.level.setShape(level, CELL.x, CELL.y, s),
      facing: (f) => B.level.setFacing(level, CELL.x, CELL.y, f),
      color: (c) => B.level.setColor(level, CELL.x, CELL.y, c),
      decor: (d) => B.level.setDecor(level, CELL.x, CELL.y, d),
      mark: (m) => B.level.toggleMark(level, CELL.x, CELL.y, m)
    });
  }
  return state({ level, selected: CELL });
}

describe("toolbar: the buttons", () => {
  it("hooks every button it offers with the act and the arg it acts on", () => {
    const hooks = buttons(rig().bar.el).map(hookOf);
    assert.deepEqual(hooks.sort(), BUTTONS.map((spec) => `${spec.act} ${spec.arg}`).sort());
  });

  it("titles each button with its label, then the key input.js binds to the same call", () => {
    const r = rig();
    for (const spec of BUTTONS) {
      const keys = spec.calls.map((call) => B.input.keyFor(...call)).filter(Boolean);
      const named = keys.length ? ` (${keys.join(EITHER_KEY)})` : "";
      assert.equal(r.find(spec.act, spec.arg).title, spec.label + named, `${spec.act} ${spec.arg}`);
    }
  });

  it("shows on each button the glyph, arrow or object it stands for", () => {
    const r = rig();
    for (const spec of BUTTONS) {
      assert.equal(shownOn(r.find(spec.act, spec.arg)), spec.shows, `${spec.act} ${spec.arg}`);
    }
  });

  it("groups the buttons for the stylesheet, the pan and mark arrows as compass roses", () => {
    const bar = rig().bar;
    assert.equal(bar.el.className, `${B.PREFIX}toolbar`);
    assert.deepEqual(groupsOf(bar.el).map((el) => el.getAttribute(GROUP_ATTR)), GROUPS);
    assert.deepEqual(slotsOf(bar.el, "pan"), PAN_GRID);
    const marks = slotsOf(bar.el, "marks");
    assert.deepEqual(marks.slice(0, GRID * GRID), ARROW_GRID);
    assert.deepEqual(marks.slice(GRID * GRID), B.MARKS.filter((m) => !m.dir).map((m) => m.key));
    for (const btn of buttons(bar.el)) assert.equal(btn.className, `${B.PREFIX}btn`);
  });

  it("offers one colour button per palette entry, in palette order", () => {
    assert.deepEqual(slotsOf(rig().bar.el, "color"), B.PALETTE.map((entry) => entry.key));
  });

  it("calls the handler a button stands for when it is clicked", () => {
    const r = rig();
    const clickable = BUTTONS.filter((spec) => spec.fires);
    for (const spec of clickable) r.find(spec.act, spec.arg).fire("click");
    assert.deepEqual(r.calls, clickable.map((spec) => spec.fires));
  });

  it("opens the hidden file picker from the open button and hands the chosen file over", () => {
    const r = rig();
    assert.equal(r.picker.type, "file");
    assert.equal(r.picker.hidden, true);
    r.find("open", "").fire("click");
    assert.equal(r.picker.clicks, 1);
    r.picker.files = [FILE];
    r.picker.fire("change");
    assert.deepEqual(r.calls, [["open", FILE]]);
    assert.equal(r.picker.value, "", "the picker is reset after a choice");
    r.picker.files = [];
    r.picker.fire("change");
    assert.deepEqual(r.calls, [["open", FILE]], "a choice of nothing opens nothing");
  });
});

describe("toolbar: sync", () => {
  it("presses the layer toggles the state has on, and the solid toggle with them", () => {
    const r = rig();
    const layers = { elevation: true, marks: false, decor: true };
    r.bar.sync(state({ layers, opaque: false }));
    for (const name of LAYER_NAMES) {
      assert.equal(pressedOf(r.find("layer", name)), layers[name] ? PRESSED : RELEASED, name);
    }
    assert.equal(pressedOf(r.find("opaque", "")), RELEASED);
    assert.equal(shownOn(r.find("opaque", "")), masked(B.icons.sprite("transparent")));

    const flipped = { elevation: false, marks: true, decor: false };
    r.bar.sync(state({ layers: flipped, opaque: true }));
    for (const name of LAYER_NAMES) {
      assert.equal(pressedOf(r.find("layer", name)), flipped[name] ? PRESSED : RELEASED, name);
    }
    assert.equal(pressedOf(r.find("opaque", "")), PRESSED);
    assert.equal(shownOn(r.find("opaque", "")), masked(B.icons.sprite("opaque")));
  });

  it("disables every tile-editing button, and no other, while no tile is selected", () => {
    const r = rig();
    const empty = [state(), state({ selected: BARE_CELL })];
    for (const nothing of empty) {
      r.bar.sync(nothing);
      for (const spec of BUTTONS) {
        const edits = TILE_ACTS.indexOf(spec.act) >= 0;
        assert.equal(r.find(spec.act, spec.arg).disabled, edits, `${spec.act} ${spec.arg}`);
      }
    }
  });

  it("presses the shape, the decor and the marks the selected tile carries", () => {
    const r = rig();
    const marks = ["rope", "arrow-e"];
    r.bar.sync(selecting((tile) => {
      tile.shape("ramp");
      tile.decor("rock");
      marks.forEach((mark) => tile.mark(mark));
    }));
    const carried = { shape: ["ramp"], decor: ["rock"], mark: marks };
    for (const spec of BUTTONS.filter((s) => s.act in carried)) {
      const btn = r.find(spec.act, spec.arg);
      const on = carried[spec.act].indexOf(spec.arg) >= 0;
      assert.equal(btn.disabled, false, `${spec.act} ${spec.arg}`);
      assert.equal(pressedOf(btn), on ? PRESSED : RELEASED, `${spec.act} ${spec.arg}`);
    }
  });

  it("presses the selected tile's colour, and the foreground while none is selected", () => {
    const r = rig();
    const pressedColors = () => B.PALETTE
      .filter((entry) => pressedOf(r.find("color", entry.key)) === PRESSED)
      .map((entry) => entry.key);

    r.bar.sync(state());
    assert.deepEqual(pressedColors(), [B.DEFAULT_COLOR], "the foreground it starts at");
    r.bar.sync(state({ color: FOREGROUND }));
    assert.deepEqual(pressedColors(), [FOREGROUND]);
    r.bar.sync(state({ color: FOREGROUND, selected: BARE_CELL }));
    assert.deepEqual(pressedColors(), [FOREGROUND], "a cell with no tile on it is no tile");

    const painted = selecting((tile) => tile.color(TILE_COLOR));
    r.bar.sync({ ...painted, color: FOREGROUND });
    assert.deepEqual(pressedColors(), [TILE_COLOR], "the tile's colour, not the foreground");
    for (const entry of B.PALETTE) {
      assert.equal(r.find("color", entry.key).disabled, false, entry.key);
    }

    const unpainted = selecting();
    delete B.level.get(unpainted.level, CELL.x, CELL.y).color;
    r.bar.sync({ ...unpainted, color: FOREGROUND });
    assert.deepEqual(pressedColors(), [FOREGROUND], "a tile from before the colours");
  });

  it("enables the facing button only on a slope, and shows the tile's facing on it", () => {
    const r = rig();
    const facing = r.find("facing", "");
    for (const shape of B.SHAPES) {
      r.bar.sync(selecting((tile) => {
        tile.shape(shape);
        tile.facing("E");
      }));
      assert.equal(facing.disabled, SLOPED_SHAPES.indexOf(shape) < 0, shape);
      assert.equal(shownOn(facing), masked(B.icons.arrow("E")), shape);
    }
    r.bar.sync(state());
    assert.equal(facing.disabled, true);
    assert.equal(shownOn(facing), masked(B.icons.arrow(B.FACINGS[0])));
  });
});

describe("toolbar: holding the clear button", () => {
  it("clears only once the button has been held for a full HOLD_MS", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const r = rig();
    const clear = r.find("clear", "");
    assert.equal(r.bar.el.style.getPropertyValue(HOLD_VAR), `${B.HOLD_MS}ms`);

    clear.fire("click");
    clear.fire("pointerdown", { button: SECONDARY_BUTTON });
    t.mock.timers.tick(B.HOLD_MS);
    assert.deepEqual(r.calls, [], "a click, or a press of another button, clears nothing");

    clear.fire("pointerdown", { button: PRIMARY_BUTTON });
    assert.equal(clear.classList.contains(HOLDING_CLASS), true);
    t.mock.timers.tick(B.HOLD_MS - 1);
    assert.deepEqual(r.calls, []);
    t.mock.timers.tick(1);
    assert.deepEqual(r.calls, [["clear"]]);
    assert.equal(clear.classList.contains(HOLDING_CLASS), false);
    t.mock.timers.tick(B.HOLD_MS);
    assert.deepEqual(r.calls, [["clear"]], "the hold clears once and no more");
  });

  it("cancels the hold when the pointer goes up, leaves, is cancelled, or the button blurs", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const type of ["pointerup", "pointerleave", "pointercancel", "blur"]) {
      const r = rig();
      const clear = r.find("clear", "");
      clear.fire("pointerdown", { button: PRIMARY_BUTTON });
      t.mock.timers.tick(B.HOLD_MS - 1);
      clear.fire(type);
      assert.equal(clear.classList.contains(HOLDING_CLASS), false, type);
      t.mock.timers.tick(B.HOLD_MS);
      assert.deepEqual(r.calls, [], type);
    }
  });

  it("holds from the keyboard too, where no second press starts a second hold", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const key of HOLD_KEYS) {
      const r = rig();
      const clear = r.find("clear", "");
      assert.equal(clear.fire("keydown", { key }).prevented, true, key);
      t.mock.timers.tick(HALF_HOLD_MS);
      clear.fire("keydown", { key, repeat: true });
      clear.fire("pointerdown", { button: PRIMARY_BUTTON });
      assert.deepEqual(r.calls, [], key);
      t.mock.timers.tick(HALF_HOLD_MS);
      assert.deepEqual(r.calls, [["clear"]], `${key}: the first hold clears on time`);
      t.mock.timers.tick(B.HOLD_MS);
      assert.deepEqual(r.calls, [["clear"]], `${key}: and no later hold clears again`);
    }
  });

  it("lets a keyboard hold go when the key comes up, and ignores every other key", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const key of HOLD_KEYS) {
      const r = rig();
      const clear = r.find("clear", "");
      clear.fire("keydown", { key });
      t.mock.timers.tick(HALF_HOLD_MS);
      clear.fire("keyup", { key });
      assert.equal(clear.classList.contains(HOLDING_CLASS), false, key);
      t.mock.timers.tick(B.HOLD_MS);
      assert.deepEqual(r.calls, [], key);
    }
    const r = rig();
    const clear = r.find("clear", "");
    assert.equal(clear.fire("keydown", { key: "c" }).prevented, false);
    t.mock.timers.tick(B.HOLD_MS);
    assert.deepEqual(r.calls, []);
  });

  it("never opens the context menu on the clear button", () => {
    assert.equal(rig().find("clear", "").fire("contextmenu").prevented, true);
  });
});
