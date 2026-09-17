"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const WIDTH = 400;
const HEIGHT = 300;
const SCALE = 2;
const COMPASS_SIZE = 24;        // the stand-in compass, which the badge sits under

// render.js over a recording pixel layer: every sprite module answers a
// tagged stand-in, and each draw of one is logged with its name and position.
function stage() {
  const B = load(["config.js", "level.js", "view.js", "render.js"]);
  const draws = [];
  const ghostElevs = [];
  const labels = [];
  const tag = (name, size = 0) => ({ name, ox: 0, oy: 0, canvas: { width: size, height: size } });
  const ctx = { globalAlpha: 1, imageSmoothingEnabled: true, clearRect() {}, drawImage() {} };
  B.pixel = {
    canvas: (w, h) => ({ width: w, height: h }),
    context: () => ctx,
    draw: (c, sprite, x, y) => { draws.push([sprite.name, x, y]); }
  };
  B.tiles = {
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
  const canvas = { width: WIDTH, height: HEIGHT, getContext: () => ctx };
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
    ghostElevs,
    labels,
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
    assert.deepEqual(s.names(), [
      "column", "ghost", "column", "label", "label", "compass", "label"
    ]);
  });

  it("is a column at the height a new tile gets, where that tile's top would be", () => {
    const s = stage();
    s.state.newElev = s.B.ELEV_MAX;
    s.state.hover = { cell: { x: 1, y: 1 } };
    s.draw();
    const frame = s.frame();
    const top = s.B.view.project(s.state.view, 1, 1, s.B.ELEV_MAX);
    assert.deepEqual(s.draws[0], ["ghost", frame.ox + top.sx, frame.oy + top.sy]);
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
