"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const WIDTH = 400;
const HEIGHT = 300;
const SCALE = 2;
const PANS = [{ x: 0, y: 0 }, { x: 7, y: -3 }, { x: -40, y: 120 }];
const COMPASS_SIZE = 24;        // the stand-in compass, which the badge sits under
const DECOR_OY = 20;            // ...and how tall the stand-in decor object stands
const FULL_ALPHA = 1;
const TRANSPARENT_ALPHA = 0.45; // how solid render.js draws a see-through tile
const TILE_ELEV = 2;            // blocks under a tile, so a top read wrong lands elsewhere
const HOLD_PROGRESS = 0.4;      // part way through the hold that removes a tile
const WEDGE_OF = { block: null, ramp: "ramp", stairs: "stairs" };
const MARKS_PER_ROW = 3;        // marks render.js lays in a row before it starts another

// render.js over a recording pixel layer: every sprite module answers a
// tagged stand-in, and each draw of one is logged with its name, where it
// lands and how solid the scene was drawing at. What each sprite was asked for
// is logged under the same name. A tiled fill is logged like a draw, with the
// rect it covers, and clearing the scene empties both logs, as clearing a
// canvas empties it.
function stage() {
  const B = load(["config.js", "level.js", "view.js", "render.js"]);
  const draws = [];
  const fills = [];
  const calls = new Map();
  const record = (name, ...args) => {
    if (!calls.has(name)) calls.set(name, []);
    calls.get(name).push(args);
  };
  const tag = (name, { size = 0, oy = 0 } = {}) =>
    ({ name, ox: 0, oy, canvas: { width: size, height: size } });
  const gridTile = tag("grid");
  const scene = {
    globalAlpha: FULL_ALPHA,
    imageSmoothingEnabled: true,
    clearRect() { draws.length = 0; fills.length = 0; calls.clear(); }
  };
  const out = { imageSmoothingEnabled: true, clearRect() {}, drawImage() {} };
  const logDraw = (sprite, x, y) => {
    draws.push({ name: sprite.name, x, y, alpha: scene.globalAlpha });
  };
  B.pixel = {
    canvas: (w, h) => ({ width: w, height: h }),
    context: () => scene,
    draw: (c, sprite, x, y) => { logDraw(sprite, x, y); },
    drawTiled: (c, sprite, x, y, w, h) => {
      logDraw(sprite, x, y);
      fills.push({ sprite, x, y, w, h });
    }
  };
  B.tiles = {
    grid: () => gridTile,
    column: () => tag("column"),
    ramp: (elev, viewFacing) => { record("ramp", elev, viewFacing); return tag("ramp"); },
    stairs: (elev, viewFacing) => { record("stairs", elev, viewFacing); return tag("stairs"); },
    ghost: (elev) => { record("ghost", elev); return tag("ghost"); },
    outline: (shape, viewFacing, kind) => {
      record("outline", shape, viewFacing, kind);
      return tag("outline");
    },
    holdMask: (progress) => { record("hold", progress); return tag("hold"); },
    label: (text) => { record("label", text); return tag("label"); }
  };
  B.icons = { compass: () => tag("compass", { size: COMPASS_SIZE }) };
  B.decor = { sprite: (key) => { record("decor", key); return tag("decor", { oy: DECOR_OY }); } };
  B.marks = { sprite: (key, rot) => { record("mark", key, rot); return tag("mark"); } };
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
    asked: (name) => calls.get(name) || [],
    add: (x, y, elev) => B.level.add(state.level, x, y, elev),
    draw: () => B.render.draw(canvas, state, SCALE),
    names: () => draws.map((d) => d.name),
    frame: () => B.view.frame(canvas, SCALE)
  };
}

const labelsDrawn = (s) => s.asked("label").map(([text]) => text);

// The new-tile badge is a label too, and always the last one drawn.
const columnLabels = (s) => labelsDrawn(s).slice(0, -1);
const badgeLabel = (s) => labelsDrawn(s).pop();

const drawsNamed = (s, name) => s.draws.filter((d) => d.name === name);

const drawNamed = (s, name) => {
  const found = drawsNamed(s, name);
  assert.equal(found.length, 1, `${found.length} ${name} draws`);
  return found[0];
};

// Where a tile's anchor, the centre of its top diamond, lands on the base
// canvas.
const anchorOf = (s, tile) => {
  const frame = s.frame();
  const p = s.B.view.project(s.state.view, tile.x, tile.y, tile.elev);
  return [frame.ox + p.sx, frame.oy + p.sy];
};

// A tile of the given shape, facing east, with the view turned a quarter, so
// the facing the view reads is not the tile's own.
const turnedTile = (s, x, y, shape) => {
  const tile = s.add(x, y, TILE_ELEV);
  s.B.level.setShape(s.state.level, x, y, shape);
  s.B.level.setFacing(s.state.level, x, y, "E");
  s.B.view.rotate(s.state.view, 1);
  return tile;
};

const viewFacingOf = (s, tile) => s.B.view.viewFacing(s.state.view.rot, tile.facing);

const decorOn = (s, x, y) => {
  const key = s.B.DECOR[0].key;
  s.B.level.setDecor(s.state.level, x, y, key);
  return key;
};

const marksOn = (s, x, y, count) => {
  const keys = s.B.MARKS.slice(0, count).map((m) => m.key);
  keys.forEach((key) => s.B.level.toggleMark(s.state.level, x, y, key));
  return keys;
};

// The marks drawn, gathered into the rows they lie in, the lowest row first.
const markRows = (s) => {
  const rows = new Map();
  drawsNamed(s, "mark").forEach(({ x, y }) => {
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
  });
  return [...rows.keys()].sort((a, b) => b - a)
    .map((y) => ({ y, xs: rows.get(y).sort((a, b) => a - b) }));
};

const middleOf = (xs) => (xs[0] + xs[xs.length - 1]) / 2;

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
    assert.deepEqual(drawNamed(s, "ghost"),
      { name: "ghost", x: frame.ox + top.sx, y: frame.oy + top.sy, alpha: FULL_ALPHA });
    assert.deepEqual(s.asked("ghost"), [[s.B.ELEV_MAX]]);
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
    assert.equal(s.fills[0].sprite, s.B.tiles.grid());
  });

  it("covers the whole base canvas", () => {
    const s = stage();
    s.draw();
    const frame = s.frame();
    assert.deepEqual([s.fills[0].w, s.fills[0].h], [frame.w, frame.h]);
  });

  // Any lattice point aligns the pattern, so the test asks for a cell centre
  // rather than for cell (0, 0) itself.
  it("anchors the pattern where a cell stands on the floor, as the view pans", () => {
    for (const pan of PANS) {
      const s = stage();
      s.state.view.pan = { ...pan };
      s.draw();
      const frame = s.frame();
      const fill = s.fills[0];
      const start = { sx: fill.x - frame.ox, sy: fill.y - frame.oy };
      const cell = s.B.view.cellAt(s.state.view, start.sx, start.sy, s.B.FLOOR);
      const stands = s.B.view.project(s.state.view, cell.x, cell.y, s.B.FLOOR);
      assert.deepEqual([stands.sx, stands.sy], [start.sx, start.sy], `pan ${pan.x}, ${pan.y}`);
    }
  });
});

describe("render: the new-tile badge", () => {
  it("chips the height a new tile gets under the compass, with nothing hovered", () => {
    const s = stage();
    s.state.newElev = s.B.ELEV_MAX;
    s.draw();
    const compass = drawNamed(s, "compass");
    const badge = s.draws[s.draws.length - 1];
    assert.equal(badgeLabel(s), "+" + s.B.ELEV_MAX);
    assert.equal(badge.name, "label");
    assert.equal(badge.x, compass.x);
    assert.ok(badge.y > compass.y + COMPASS_SIZE, "below the compass");
  });

  it("spells every height in the range with a sign, so the chip reads as a height", () => {
    for (const bound of ["ELEV_MIN", "ELEV_MAX"]) {
      const s = stage();
      s.state.newElev = s.B[bound];
      s.draw();
      assert.equal(badgeLabel(s), "+" + s.B[bound], bound);
    }
  });

  it("is drawn over a hovered tile too, and follows the height as it moves", () => {
    const s = stage();
    s.add(0, 0);
    s.state.hover = { tile: { x: 0, y: 0 } };
    s.state.newElev = s.B.ELEV_MAX - 1;
    s.draw();
    assert.equal(s.names().pop(), "label");
    assert.equal(badgeLabel(s), "+" + (s.B.ELEV_MAX - 1));
  });
});

describe("render: the order a tile is drawn in", () => {
  it("draws every overlay over the column, so nothing a tile carries is buried", () => {
    const s = stage();
    const tile = turnedTile(s, 0, 0, "ramp");
    decorOn(s, 0, 0);
    marksOn(s, 0, 0, 1);
    s.state.selected = { x: tile.x, y: tile.y };
    s.state.hold = { x: tile.x, y: tile.y, progress: HOLD_PROGRESS };
    s.draw();
    assert.deepEqual(s.names(), [
      "grid", "column", "ramp", "hold", "outline", "decor", "mark", "label", "compass", "label"
    ]);
  });
});

describe("render: the see-through tiles", () => {
  it("draws a column see-through while the tiles are not opaque, and solid while they are", () => {
    for (const [opaque, alpha] of [[false, TRANSPARENT_ALPHA], [true, FULL_ALPHA]]) {
      const s = stage();
      s.add(0, 0, TILE_ELEV);
      s.state.opaque = opaque;
      s.draw();
      assert.equal(drawNamed(s, "column").alpha, alpha, `opaque ${opaque}`);
    }
  });

  it("sees through the wedge of a sloped tile as it does the column under it", () => {
    const s = stage();
    turnedTile(s, 0, 0, "ramp");
    s.state.opaque = false;
    s.draw();
    assert.equal(drawNamed(s, "ramp").alpha, TRANSPARENT_ALPHA);
  });

  it("draws what stands on a see-through tile solid, so a mark on it stays legible", () => {
    const s = stage();
    const tile = s.add(0, 0, TILE_ELEV);
    decorOn(s, 0, 0);
    marksOn(s, 0, 0, 1);
    s.state.opaque = false;
    s.state.selected = { x: tile.x, y: tile.y };
    s.state.hold = { x: tile.x, y: tile.y, progress: HOLD_PROGRESS };
    s.draw();
    const over = s.draws.filter((d) => d.name !== "column");
    assert.deepEqual(new Set(over.map((d) => d.name)),
      new Set(["grid", "hold", "outline", "decor", "mark", "label", "compass"]));
    for (const { name, alpha } of over) assert.equal(alpha, FULL_ALPHA, name);
  });
});

describe("render: the wedge a sloped tile stands on", () => {
  it("draws a ramp its wedge and a flight of stairs its own, and a block neither", () => {
    assert.deepEqual(Object.keys(WEDGE_OF), stage().B.SHAPES);
    for (const [shape, wedge] of Object.entries(WEDGE_OF)) {
      const s = stage();
      const tile = turnedTile(s, 0, 0, shape);
      s.draw();
      const names = s.names();
      assert.deepEqual(names.filter((name) => name === "ramp" || name === "stairs"),
        wedge ? [wedge] : [], shape);
      if (!wedge) continue;
      const { x, y } = drawNamed(s, wedge);
      assert.deepEqual([x, y], anchorOf(s, tile), shape);
      assert.ok(names.indexOf(wedge) > names.indexOf("column"), `${shape}: over its column`);
    }
  });

  it("cuts the wedge to the tile's elevation and to the facing the view sees", () => {
    const s = stage();
    const tile = turnedTile(s, 0, 0, "ramp");
    s.draw();
    assert.deepEqual(s.asked("ramp"), [[tile.elev, viewFacingOf(s, tile)]]);
    assert.notEqual(viewFacingOf(s, tile), s.B.view.viewFacing(0, tile.facing));
  });
});

describe("render: the hold mask", () => {
  it("wipes the held tile at the progress the hold carries, and no other tile", () => {
    const s = stage();
    const held = s.add(0, 0, TILE_ELEV);
    s.add(1, 1, TILE_ELEV);
    s.state.hold = { x: held.x, y: held.y, progress: HOLD_PROGRESS };
    s.draw();
    const { x, y } = drawNamed(s, "hold");
    assert.deepEqual([x, y], anchorOf(s, held));
    assert.deepEqual(s.asked("hold"), [[HOLD_PROGRESS]]);
  });

  it("wipes no tile while nothing is held", () => {
    const s = stage();
    s.add(0, 0, TILE_ELEV);
    s.draw();
    assert.deepEqual(drawsNamed(s, "hold"), []);
  });
});

describe("render: the highlight ring", () => {
  it("rings the selected tile, with its shape and the facing the view sees", () => {
    const s = stage();
    const tile = turnedTile(s, 0, 0, "ramp");
    s.add(1, 1, TILE_ELEV);
    s.state.selected = { x: tile.x, y: tile.y };
    s.draw();
    const { x, y } = drawNamed(s, "outline");
    assert.deepEqual([x, y], anchorOf(s, tile));
    assert.deepEqual(s.asked("outline"), [[tile.shape, viewFacingOf(s, tile), "select"]]);
  });

  it("rings the hovered tile in the hover ring", () => {
    const s = stage();
    const tile = turnedTile(s, 0, 0, "stairs");
    s.add(1, 1, TILE_ELEV);
    s.state.hover = { tile: tile };
    s.draw();
    const { x, y } = drawNamed(s, "outline");
    assert.deepEqual([x, y], anchorOf(s, tile));
    assert.deepEqual(s.asked("outline"), [[tile.shape, viewFacingOf(s, tile), "hover"]]);
  });

  it("rings the selected tile as selected while the pointer hovers it too", () => {
    const s = stage();
    const tile = s.add(0, 0, TILE_ELEV);
    s.state.selected = { x: tile.x, y: tile.y };
    s.state.hover = { tile: tile };
    s.draw();
    assert.deepEqual(s.asked("outline"), [[tile.shape, viewFacingOf(s, tile), "select"]]);
  });

  it("rings no tile while none is selected and none hovered", () => {
    const s = stage();
    s.add(0, 0, TILE_ELEV);
    s.draw();
    assert.deepEqual(drawsNamed(s, "outline"), []);
  });
});

describe("render: the decor a tile carries", () => {
  it("stands the tile's own decor object on its top face", () => {
    const s = stage();
    const tile = s.add(0, 0, TILE_ELEV);
    const key = decorOn(s, 0, 0);
    s.draw();
    const { x, y } = drawNamed(s, "decor");
    assert.deepEqual([x, y], anchorOf(s, tile));
    assert.deepEqual(s.asked("decor"), [[key]]);
  });

  it("stands a slope's decor a block over the tile's elevation, where its top is", () => {
    const s = stage();
    const tile = turnedTile(s, 0, 0, "ramp");
    decorOn(s, 0, 0);
    s.draw();
    const [cx, cy] = anchorOf(s, tile);
    const { x, y } = drawNamed(s, "decor");
    assert.deepEqual([x, y], [cx, cy - s.B.BLOCK_H]);
  });

  it("stands no decor while the decor layer is off", () => {
    const s = stage();
    s.add(0, 0, TILE_ELEV);
    decorOn(s, 0, 0);
    s.state.layers.decor = false;
    s.draw();
    assert.deepEqual(drawsNamed(s, "decor"), []);
    assert.deepEqual(s.asked("decor"), []);
  });
});

describe("render: the marks a tile carries", () => {
  it("lays the marks in rows of three that stack up from the tile's top", () => {
    const s = stage();
    const tile = s.add(0, 0, TILE_ELEV);
    const keys = marksOn(s, 0, 0, MARKS_PER_ROW + 1);
    s.draw();
    const [cx, cy] = anchorOf(s, tile);
    const rows = markRows(s);
    assert.equal(drawsNamed(s, "mark").length, keys.length);
    assert.deepEqual(rows.map((row) => row.xs.length), [MARKS_PER_ROW, 1]);
    assert.equal(rows[0].y, cy, "the first row lies on the tile's top");
    assert.ok(rows[1].y < rows[0].y, "the next row stacks over it");
    for (const row of rows) assert.equal(middleOf(row.xs), cx, `the row at ${row.y}`);
    const [left, middle, right] = rows[0].xs;
    assert.ok(left < middle && middle < right, "a full row spreads across the tile");
    assert.equal(middle - left, right - middle, "evenly spaced");
  });

  it("lifts the marks clear of a decor object that shares the tile", () => {
    const bare = stage();
    bare.add(0, 0, TILE_ELEV);
    marksOn(bare, 0, 0, 1);
    bare.draw();

    const shared = stage();
    shared.add(0, 0, TILE_ELEV);
    marksOn(shared, 0, 0, 1);
    decorOn(shared, 0, 0);
    shared.draw();

    const lift = markRows(bare)[0].y - markRows(shared)[0].y;
    assert.ok(lift > DECOR_OY, `lifted ${lift}, over a decor object ${DECOR_OY} tall`);
  });

  it("turns every mark with the view, so it points where its direction points on screen", () => {
    const s = stage();
    s.add(0, 0, TILE_ELEV);
    const keys = marksOn(s, 0, 0, 1);
    s.B.view.rotate(s.state.view, 1);
    s.draw();
    assert.deepEqual(s.asked("mark"), [[keys[0], s.state.view.rot]]);
  });

  it("lays no mark while the marks layer is off", () => {
    const s = stage();
    s.add(0, 0, TILE_ELEV);
    marksOn(s, 0, 0, 1);
    s.state.layers.marks = false;
    s.draw();
    assert.deepEqual(drawsNamed(s, "mark"), []);
  });
});
