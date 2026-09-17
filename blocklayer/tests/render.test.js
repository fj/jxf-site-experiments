"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const WIDTH = 400;
const HEIGHT = 300;
const SCALE = 2;
const PANS = [{ x: 0, y: 0 }, { x: 7, y: -3 }, { x: -40, y: 120 }];

const wrap = (n, size) => ((n % size) + size) % size;

// render.js over a recording pixel layer: every sprite module answers a
// tagged stand-in, and each draw of one is logged with its name and position.
// A pattern fill is logged too, by the name of the tile it repeats.
function stage() {
  const B = load(["config.js", "level.js", "view.js", "render.js"]);
  const draws = [];
  const fills = [];
  const ghostElevs = [];
  const tag = (name) => ({ name, ox: 0, oy: 0 });
  const gridTile = { name: "grid", canvas: { name: "grid" }, ox: 0, oy: 0 };
  let at = { x: 0, y: 0 };
  const ctx = {
    globalAlpha: 1,
    fillStyle: null,
    imageSmoothingEnabled: true,
    clearRect() {},
    drawImage() {},
    save() {},
    restore() { at = { x: 0, y: 0 }; },
    translate(x, y) { at = { x, y }; },
    createPattern: (image, repeat) => ({ image, repeat }),
    fillRect(x, y, w, h) {
      fills.push({ pattern: ctx.fillStyle, at, x: at.x + x, y: at.y + y, w, h });
      draws.push([ctx.fillStyle.image.name, at.x + x, at.y + y]);
    }
  };
  B.pixel = {
    canvas: (w, h) => ({ width: w, height: h }),
    context: () => ctx,
    draw: (c, sprite, x, y) => { draws.push([sprite.name, x, y]); }
  };
  B.tiles = {
    grid: () => gridTile,
    column: () => tag("column"),
    ramp: () => tag("ramp"),
    stairs: () => tag("stairs"),
    ghost: (elev) => { ghostElevs.push(elev); return tag("ghost"); },
    outline: () => tag("outline"),
    holdMask: () => tag("hold"),
    label: () => tag("label")
  };
  B.icons = { compass: () => tag("compass") };
  B.decor = { sprite: () => tag("decor") };
  B.marks = { sprite: () => tag("mark") };
  const canvas = { width: WIDTH, height: HEIGHT, getContext: () => ctx };
  const state = {
    level: B.level.create(),
    view: B.view.create(),
    layers: { elevation: true, marks: true, decor: true },
    opaque: true,
    selected: null,
    hover: null,
    hold: null
  };
  return {
    B,
    state,
    draws,
    fills,
    ghostElevs,
    add: (x, y) => B.level.add(state.level, x, y),
    draw: () => B.render.draw(canvas, state, SCALE),
    names: () => draws.map((d) => d[0]),
    frame: () => B.view.frame(canvas, SCALE)
  };
}

describe("render: the ghost", () => {
  it("takes its turn in depth order: after the column behind it, before the one in front", () => {
    const s = stage();
    s.add(0, 0);
    s.add(2, 2);
    s.state.hover = { cell: { x: 1, y: 1 } };
    s.draw();
    assert.deepEqual(s.names(),
      ["grid", "column", "ghost", "column", "label", "label", "compass"]);
  });

  it("is the new-tile column, with its top centre where that tile's would be", () => {
    const s = stage();
    s.state.hover = { cell: { x: 1, y: 1 } };
    s.draw();
    const frame = s.frame();
    const top = s.B.view.project(s.state.view, 1, 1, s.B.NEW_TILE_ELEV);
    const ghost = s.draws.find((d) => d[0] === "ghost");
    assert.deepEqual(ghost, ["ghost", frame.ox + top.sx, frame.oy + top.sy]);
    assert.deepEqual(s.ghostElevs, [s.B.NEW_TILE_ELEV]);
  });

  it("is not drawn over a hovered tile, nor with nothing hovered", () => {
    for (const hover of [null, { tile: { x: 0, y: 0 } }]) {
      const s = stage();
      s.add(0, 0);
      s.state.hover = hover;
      s.draw();
      assert.ok(!s.names().includes("ghost"), JSON.stringify(hover));
      assert.equal(s.names().filter((n) => n === "column").length, 1, JSON.stringify(hover));
    }
  });

  it("leaves the level as it was", () => {
    const s = stage();
    s.add(0, 0);
    s.state.hover = { cell: { x: 1, y: 1 } };
    s.draw();
    assert.equal(s.B.level.count(s.state.level), 1);
  });
});

describe("render: the floor grid", () => {
  it("repeats the grid tile under everything else, before the first column", () => {
    const s = stage();
    s.add(0, 0);
    s.state.hover = { cell: { x: 1, y: 1 } };
    s.draw();
    assert.deepEqual(s.names(), ["grid", "column", "ghost", "label", "compass"]);
    assert.equal(s.fills.length, 1);
    assert.deepEqual(s.fills[0].pattern, { image: s.B.tiles.grid().canvas, repeat: "repeat" });
  });

  it("covers the whole base canvas, whichever way it is aligned", () => {
    for (const pan of PANS) {
      const s = stage();
      s.state.view.pan = { ...pan };
      s.draw();
      const frame = s.frame();
      const fill = s.fills[0];
      const where = `pan ${pan.x}, ${pan.y}`;
      assert.ok(fill.x <= 0 && fill.y <= 0, where);
      assert.ok(fill.x + fill.w >= frame.w && fill.y + fill.h >= frame.h, where);
    }
  });

  it("lands a lattice point, on whole pixels, where cell (0, 0) stands on the floor", () => {
    for (const pan of PANS) {
      const s = stage();
      s.state.view.pan = { ...pan };
      s.draw();
      const frame = s.frame();
      const floor = s.B.view.project(s.state.view, 0, 0, s.B.FLOOR);
      const at = s.fills[0].at;
      const where = `pan ${pan.x}, ${pan.y}`;
      assert.ok(Number.isInteger(at.x) && Number.isInteger(at.y), where);
      assert.equal(wrap(at.x - (frame.ox + floor.sx), s.B.TILE_W), 0, where);
      assert.equal(wrap(at.y - (frame.oy + floor.sy), s.B.TILE_H), 0, where);
    }
  });
});
