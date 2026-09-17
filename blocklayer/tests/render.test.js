"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const WIDTH = 400;
const HEIGHT = 300;
const SCALE = 2;
const PANS = [{ x: 0, y: 0 }, { x: 7, y: -3 }, { x: -40, y: 120 }];
const COMPASS_SIZE = 24;        // the stand-in compass, which the badge sits under

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
  const labels = [];
  const tag = (name, size = 0) => ({ name, ox: 0, oy: 0, canvas: { width: size, height: size } });
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
    label: (text) => { labels.push(text); return tag("label"); }
  };
  B.icons = { compass: () => tag("compass", COMPASS_SIZE) };
  B.decor = { sprite: () => tag("decor") };
  B.marks = { sprite: () => tag("mark") };
  const canvas = { width: WIDTH, height: HEIGHT, getContext: () => out };
  const state = {
    level: B.level.create(),
    view: B.view.create(),
    layers: { elevation: true, marks: true, decor: true },
    opaque: true,
    newElev: B.NEW_TILE_ELEV,
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
    labels,
    add: (x, y, elev) => B.level.add(state.level, x, y, elev),
    draw: () => B.render.draw(canvas, state, SCALE),
    names: () => draws.map((d) => d[0]),
    frame: () => B.view.frame(canvas, SCALE)
  };
}

// The new-tile badge is a label too, and always the last one drawn.
const columnLabels = (s) => s.labels.slice(0, -1);

describe("render: the elevation labels", () => {
  it("labels each column with its elevation, as a plain number", () => {
    const s = stage();
    s.add(0, 0, s.B.ELEV_MIN);
    s.add(1, 1, s.B.ELEV_MAX);
    s.draw();
    assert.deepEqual(columnLabels(s), [String(s.B.ELEV_MIN), String(s.B.ELEV_MAX)]);
  });

  it("draws no label while the elevation layer is off", () => {
    const s = stage();
    s.add(0, 0, s.B.ELEV_MIN);
    s.state.layers.elevation = false;
    s.draw();
    assert.deepEqual(columnLabels(s), []);
  });
});

describe("render: the ghost", () => {
  it("takes its turn in depth order: after the column behind it, before the one in front", () => {
    const s = stage();
    s.add(0, 0);
    s.add(2, 2);
    s.state.hover = { cell: { x: 1, y: 1 } };
    s.draw();
    assert.deepEqual(s.names(), [
      "grid", "column", "ghost", "column", "label", "label", "compass", "label"
    ]);
  });

  it("is a column at the height a new tile gets, where that tile's top would be", () => {
    const s = stage();
    s.state.newElev = s.B.ELEV_MAX;
    s.state.hover = { cell: { x: 1, y: 1 } };
    s.draw();
    const frame = s.frame();
    const top = s.B.view.project(s.state.view, 1, 1, s.B.ELEV_MAX);
    const ghost = s.draws.find((d) => d[0] === "ghost");
    assert.deepEqual(ghost, ["ghost", frame.ox + top.sx, frame.oy + top.sy]);
    assert.deepEqual(s.ghostElevs, [s.B.ELEV_MAX]);
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
    assert.deepEqual(s.names(),
      ["grid", "column", "ghost", "label", "compass", "label"]);
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

describe("render: the new-tile badge", () => {
  it("chips the height a new tile gets under the compass, with nothing hovered", () => {
    const s = stage();
    s.state.newElev = s.B.ELEV_MAX;
    s.draw();
    const compass = s.draws.find((d) => d[0] === "compass");
    const badge = s.draws[s.draws.length - 1];
    assert.equal(s.labels.pop(), "+" + s.B.ELEV_MAX);
    assert.equal(badge[0], "label");
    assert.equal(badge[1], compass[1]);
    assert.ok(badge[2] > compass[2] + COMPASS_SIZE, "below the compass");
  });

  it("signs the height once, so a below-ground height still reads as a height", () => {
    const s = stage();
    s.state.newElev = s.B.ELEV_MIN;
    s.draw();
    const text = s.labels.pop();
    assert.ok(!text.includes("+-"), text);
    assert.ok(text.endsWith(String(s.B.ELEV_MIN)), text);
  });

  it("is drawn over a hovered tile too, and follows the height as it moves", () => {
    const s = stage();
    s.add(0, 0);
    s.state.hover = { tile: { x: 0, y: 0 } };
    s.state.newElev = s.B.ELEV_MAX - 1;
    s.draw();
    assert.equal(s.names().pop(), "label");
    assert.equal(s.labels.pop(), "+" + (s.B.ELEV_MAX - 1));
  });
});
