"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const WIDTH = 400;
const HEIGHT = 300;
const SCALE = 2;
const PANS = [{ x: 0, y: 0 }, { x: 7, y: -3 }, { x: -40, y: 120 }];

// render.js over a recording pixel layer: every sprite module answers a
// tagged stand-in, and each draw of one is logged with its name and where the
// context's transform puts it. A pattern fill is logged too, by the name of
// the tile it repeats, and clearing the scene empties the log, as clearing a
// canvas empties it.
function stage() {
  const B = load(["config.js", "level.js", "view.js", "render.js"]);
  const draws = [];
  const fills = [];
  const ghostElevs = [];
  const tag = (name) => ({ name, ox: 0, oy: 0 });
  const gridTile = { name: "grid", canvas: { name: "grid" }, ox: 0, oy: 0 };
  const saved = [];
  let at = { x: 0, y: 0 };
  const scene = {
    globalAlpha: 1,
    fillStyle: null,
    imageSmoothingEnabled: true,
    clearRect() { draws.length = 0; fills.length = 0; },
    save() { saved.push(at); },
    restore() { if (saved.length) at = saved.pop(); },
    translate(x, y) { at = { x: at.x + x, y: at.y + y }; },
    createPattern: (image, repeat) => ({ image, repeat }),
    fillRect(x, y, w, h) {
      fills.push({ pattern: scene.fillStyle, at, x: at.x + x, y: at.y + y, w, h });
      draws.push([scene.fillStyle.image.name, at.x + x, at.y + y]);
    }
  };
  const out = { imageSmoothingEnabled: true, clearRect() {}, drawImage() {} };
  B.pixel = {
    canvas: (w, h) => ({ width: w, height: h }),
    context: () => scene,
    draw: (c, sprite, x, y) => { draws.push([sprite.name, at.x + x, at.y + y]); }
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
  const canvas = { width: WIDTH, height: HEIGHT, getContext: () => out };
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

  // Any lattice point aligns the pattern, so the test asks for a cell centre
  // rather than for cell (0, 0) itself.
  it("starts the pattern on whole pixels where a cell stands on the floor, as the view pans", () => {
    for (const pan of PANS) {
      const s = stage();
      s.state.view.pan = { ...pan };
      s.draw();
      const frame = s.frame();
      const at = s.fills[0].at;
      const start = { sx: at.x - frame.ox, sy: at.y - frame.oy };
      const cell = s.B.view.cellAt(s.state.view, start.sx, start.sy, s.B.FLOOR);
      const stands = s.B.view.project(s.state.view, cell.x, cell.y, s.B.FLOOR);
      const where = `pan ${pan.x}, ${pan.y}`;
      assert.ok(Number.isInteger(at.x) && Number.isInteger(at.y), where);
      assert.deepEqual([stands.sx, stands.sy], [start.sx, start.sy], where);
    }
  });
});
