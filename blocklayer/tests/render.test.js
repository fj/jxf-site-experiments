"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const WIDTH = 400;
const HEIGHT = 300;
const SCALE = 2;
const PANS = [{ x: 0, y: 0 }, { x: 7, y: -3 }, { x: -40, y: 120 }];
const ROTS = [0, 1, 2, 3];      // the quarter turns the view is read at
const COMPASS_SIZE = 24;        // the stand-in compass, which the badge sits under
const DECOR_OY = 20;            // ...and how tall the stand-in decor object stands
const FULL_ALPHA = 1;
const TRANSPARENT_ALPHA = 0.45; // how solid render.js draws a see-through tile
const TILE_ELEV = 2;            // blocks under a tile, so a top read wrong lands elsewhere
const HOLD_PROGRESS = 0.4;      // part way through the hold that removes a tile
const WEDGE_OF = { block: null, ramp: "ramp", stairs: "stairs" };
const MARKS_PER_ROW = 3;        // marks render.js lays in a row before it starts another
const SELECTED = [[0, 0], [1, 1], [2, 0]];   // cells a sweep took
const UNSELECTED = [3, 3];                   // ...and one it left out
// A sweep in base px around the frame's origin, wider than it is tall and off
// centre, so a corner read the wrong way round lands elsewhere.
const BOX = { x0: -30, y0: -11, x1: 41, y1: 26 };
const SUB_PIXEL = 0.4;                       // a sweep corner between two pixels
const NO_INK = "none";                       // the fill colour the scene starts at

// render.js over a recording pixel layer: every sprite module answers a
// tagged stand-in, and each draw of one is logged with its name, where it
// lands and how solid the scene was drawing at. What each sprite was asked for
// is logged under the same name. A tiled fill is logged like a draw, with the
// rect it covers, a plain fill on the scene is logged as a "rect" with its
// colour, and clearing the scene empties both logs, as clearing a canvas
// empties it.
function stage() {
  const B = load(["config.js", "level.js", "view.js", "render.js"]);
  // The change that turns the selection into a list adds this to config.js.
  B.inCells = (cells, x, y) => cells.some((cell) => cell.x === x && cell.y === y);
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
  const saved = [];
  const scene = {
    globalAlpha: FULL_ALPHA,
    imageSmoothingEnabled: true,
    fillStyle: NO_INK,
    save() { saved.push(scene.fillStyle); },
    restore() { scene.fillStyle = saved.pop(); },
    fillRect(x, y, w, h) {
      draws.push({ name: "rect", x, y, w, h, color: scene.fillStyle, alpha: scene.globalAlpha });
    },
    clearRect() { draws.length = 0; fills.length = 0; calls.clear(); }
  };
  const blits = [];
  const out = {
    imageSmoothingEnabled: true,
    clearRect(x, y, w, h) { blits.push({ cleared: [x, y, w, h] }); },
    drawImage(image, x, y, w, h) {
      blits.push({ image, x, y, w, h, smoothing: out.imageSmoothingEnabled });
    }
  };
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
    column: (color, elev) => { record("column", color, elev); return tag("column"); },
    ramp: (color, elev, viewFacing) => {
      record("ramp", color, elev, viewFacing);
      return tag("ramp");
    },
    stairs: (color, elev, viewFacing) => {
      record("stairs", color, elev, viewFacing);
      return tag("stairs");
    },
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
    selection: [],
    box: null,
    hover: null,
    hold: null
  };
  return {
    B,
    state,
    draws,
    fills,
    blits,
    ink: () => scene.fillStyle,
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

// Where each highlight ring landed, sorted, so the depth order does not matter.
const ringedAt = (s) => drawsNamed(s, "outline").map((d) => [d.x, d.y]).sort();

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
    s.state.selection = [{ x: tile.x, y: tile.y }];
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
    s.state.selection = [{ x: tile.x, y: tile.y }];
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
    assert.deepEqual(s.asked("ramp"), [[tile.color, tile.elev, viewFacingOf(s, tile)]]);
    assert.notEqual(viewFacingOf(s, tile), s.B.view.viewFacing(0, tile.facing));
  });
});

describe("render: the colour a tile is drawn in", () => {
  it("draws each column in the tile's own colour, not in one its height names", () => {
    const s = stage();
    const colors = s.B.PALETTE.map((c) => c.key);
    colors.forEach((color, x) => s.B.level.add(s.state.level, x, 0, TILE_ELEV, color));
    s.draw();
    assert.deepEqual(s.asked("column"), colors.map((color) => [color, TILE_ELEV]));
  });

  it("draws the wedge of a sloped tile in the same colour as the column under it", () => {
    for (const shape of ["ramp", "stairs"]) {
      const s = stage();
      const color = s.B.PALETTE.map((c) => c.key).find((key) => key !== s.B.DEFAULT_COLOR);
      const tile = turnedTile(s, 0, 0, shape);
      s.B.level.setColor(s.state.level, tile.x, tile.y, color);
      s.draw();
      assert.deepEqual(s.asked("column"), [[color, tile.elev]], shape);
      assert.deepEqual(s.asked(shape), [[color, tile.elev, viewFacingOf(s, tile)]], shape);
    }
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
    s.state.selection = [{ x: tile.x, y: tile.y }];
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

  it("rings every tile the selection holds, and no other", () => {
    const s = stage();
    const picked = SELECTED.map(([x, y]) => s.add(x, y, TILE_ELEV));
    s.add(...UNSELECTED, TILE_ELEV);
    s.state.selection = SELECTED.map(([x, y]) => ({ x: x, y: y }));
    s.draw();
    assert.deepEqual(ringedAt(s), picked.map((tile) => anchorOf(s, tile)).sort());
    assert.deepEqual(s.asked("outline"),
      picked.map((tile) => [tile.shape, viewFacingOf(s, tile), "select"]));
  });

  it("rings the selected tile as selected while the pointer hovers it too", () => {
    const s = stage();
    const tile = s.add(0, 0, TILE_ELEV);
    s.state.selection = [{ x: tile.x, y: tile.y }];
    s.state.hover = { tile: tile };
    s.draw();
    assert.deepEqual(s.asked("outline"), [[tile.shape, viewFacingOf(s, tile), "select"]]);
  });

  // (0, 0) is drawn first, so the two rings come in this order.
  it("rings a hovered tile the selection leaves out in the hover ring", () => {
    const s = stage();
    const picked = s.add(0, 0, TILE_ELEV);
    const over = s.add(1, 1, TILE_ELEV);
    s.state.selection = [{ x: picked.x, y: picked.y }];
    s.state.hover = { tile: over };
    s.draw();
    assert.deepEqual(s.asked("outline"), [
      [picked.shape, viewFacingOf(s, picked), "select"],
      [over.shape, viewFacingOf(s, over), "hover"]
    ]);
  });

  it("rings no tile while the selection is empty and none is hovered", () => {
    const s = stage();
    s.add(0, 0, TILE_ELEV);
    s.draw();
    assert.deepEqual(drawsNamed(s, "outline"), []);
  });
});

describe("render: the box a sweep draws", () => {
  const rectsOf = (s) => drawsNamed(s, "rect");

  // Every pixel the rects cover, so the box is read as a picture and not as
  // the calls that drew it.
  const pixelsOf = (rects) => {
    const lit = new Set();
    for (const r of rects) {
      for (let x = r.x; x < r.x + r.w; x++) {
        for (let y = r.y; y < r.y + r.h; y++) lit.add(`${x},${y}`);
      }
    }
    return lit;
  };

  const ringOf = (x0, y0, x1, y1) => {
    const lit = new Set();
    for (let x = x0; x <= x1; x++) { lit.add(`${x},${y0}`); lit.add(`${x},${y1}`); }
    for (let y = y0; y <= y1; y++) { lit.add(`${x0},${y}`); lit.add(`${x1},${y}`); }
    return lit;
  };

  const swept = (s) => {
    const frame = s.frame();
    return ringOf(frame.ox + BOX.x0, frame.oy + BOX.y0, frame.ox + BOX.x1, frame.oy + BOX.y1);
  };

  it("lines the swept rectangle, one pixel wide, around the frame's origin", () => {
    const s = stage();
    s.state.box = { ...BOX };
    s.draw();
    assert.deepEqual(pixelsOf(rectsOf(s)), swept(s));
  });

  it("lines the same rectangle whichever corners the sweep hands it", () => {
    const corners = [
      { x0: BOX.x1, y0: BOX.y1, x1: BOX.x0, y1: BOX.y0 },
      { x0: BOX.x1, y0: BOX.y0, x1: BOX.x0, y1: BOX.y1 },
      { x0: BOX.x0, y0: BOX.y1, x1: BOX.x1, y1: BOX.y0 }
    ];
    for (const box of corners) {
      const s = stage();
      s.state.box = box;
      s.draw();
      assert.deepEqual(pixelsOf(rectsOf(s)), swept(s), JSON.stringify(box));
    }
  });

  it("snaps a sweep between pixels onto the whole-pixel grid", () => {
    const s = stage();
    s.state.box = { x0: BOX.x0 - SUB_PIXEL, y0: BOX.y0 - SUB_PIXEL, x1: BOX.x1, y1: BOX.y1 };
    s.draw();
    for (const r of rectsOf(s)) {
      assert.deepEqual([r.x, r.y], [Math.round(r.x), Math.round(r.y)], JSON.stringify(r));
    }
    assert.deepEqual(pixelsOf(rectsOf(s)), swept(s));
  });

  it("draws the box in the select colour, dashed with the outline colour", () => {
    const s = stage();
    s.state.box = { ...BOX };
    s.draw();
    const inks = rectsOf(s).map((r) => r.color);
    assert.equal(inks[0], s.B.COLORS.select, "the first dash is the select colour");
    assert.deepEqual(new Set(inks), new Set([s.B.COLORS.select, s.B.COLORS.outline]));
  });

  it("leaves the scene's ink as it found it, so nothing later fills in the box's colour", () => {
    const s = stage();
    s.state.box = { ...BOX };
    const before = s.ink();
    s.draw();
    assert.equal(s.ink(), before);
  });

  it("draws the box over the scene and under the compass and the badge", () => {
    const s = stage();
    s.add(0, 0, TILE_ELEV);
    s.state.box = { ...BOX };
    s.draw();
    const names = s.names();
    assert.ok(names.indexOf("rect") > names.indexOf("label"), "over the elevation labels");
    assert.ok(names.lastIndexOf("rect") < names.indexOf("compass"), "under the compass");
    assert.equal(names[names.length - 1], "label", "the badge is still drawn last");
  });

  it("draws no box while no sweep is running", () => {
    const s = stage();
    s.add(0, 0, TILE_ELEV);
    s.draw();
    assert.deepEqual(rectsOf(s), []);
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
    for (const rot of ROTS) {
      const s = stage();
      s.add(0, 0, TILE_ELEV);
      const keys = marksOn(s, 0, 0, 1);
      s.B.view.rotate(s.state.view, rot);
      s.draw();
      assert.deepEqual(s.asked("mark"), [[keys[0], rot]], `rot ${rot}`);
    }
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

describe("render: the blit to the visible canvas", () => {
  const blitOf = (s) => s.blits.find((b) => b.image);

  it("stretches the base scene over the canvas by the scale it is given", () => {
    const s = stage();
    s.draw();
    const frame = s.frame();
    const blit = blitOf(s);
    assert.deepEqual([blit.x, blit.y], [0, 0]);
    assert.deepEqual([blit.w, blit.h], [frame.w * SCALE, frame.h * SCALE]);
  });

  it("turns smoothing off first, so a pixel stays a square", () => {
    const s = stage();
    s.draw();
    assert.equal(blitOf(s).smoothing, false);
  });

  it("clears the canvas before it blits, so nothing shows through", () => {
    const s = stage();
    s.draw();
    const [cleared, blit] = s.blits;
    assert.deepEqual(cleared.cleared, [0, 0, WIDTH, HEIGHT]);
    assert.ok(blit.image, "the scene follows the clear");
  });
});
