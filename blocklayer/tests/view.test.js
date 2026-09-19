"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load, tile } = require("./load");

const B = load(["config.js", "level.js", "view.js"]);
const V = B.view;
const L = B.level;

const ROTS = [0, 1, 2, 3];
const RANGE = [-3, -2, -1, 0, 1, 2, 3];

function viewAt(rot, pan = { x: 0, y: 0 }) {
  const view = V.create();
  view.rot = rot;
  view.pan = { ...pan };
  return view;
}

// A fresh view over a fresh level.
function scene() {
  return { view: V.create(), level: L.create() };
}

function tilesAt(cells) {
  return cells.map(([x, y]) => tile({ x, y }));
}

describe("view: create, rotate, zoom", () => {
  it("starts unrotated at the default zoom with no pan", () => {
    assert.deepEqual(V.create(), { rot: 0, zoom: B.ZOOM_DEFAULT, pan: { x: 0, y: 0 } });
  });

  it("rotates modulo four in either direction", () => {
    const view = V.create();
    assert.equal(V.rotate(view, 1), 1);
    assert.equal(V.rotate(view, 3), 0);
    assert.equal(V.rotate(view, -1), 3);
    assert.equal(V.rotate(view, -7), 0);
    assert.equal(view.rot, 0);
  });

  it("zooms within the configured range", () => {
    const view = V.create();
    assert.equal(V.zoom(view, 10), B.ZOOM_MAX);
    assert.equal(V.zoom(view, 1), B.ZOOM_MAX);
    assert.equal(V.zoom(view, -10), B.ZOOM_MIN);
    assert.equal(V.zoom(view, -1), B.ZOOM_MIN);
    assert.equal(V.zoom(view, 1), B.ZOOM_MIN + 1);
  });
});

describe("view: toView and fromView", () => {
  it("follows the rotation table", () => {
    assert.deepEqual(V.toView(0, 2, 3), { u: 2, v: 3 });
    assert.deepEqual(V.toView(1, 2, 3), { u: -3, v: 2 });
    assert.deepEqual(V.toView(2, 2, 3), { u: -2, v: -3 });
    assert.deepEqual(V.toView(3, 2, 3), { u: 3, v: -2 });
  });

  it("round-trips every cell at every rotation", () => {
    for (const rot of ROTS) {
      for (const x of RANGE) {
        for (const y of RANGE) {
          const p = V.toView(rot, x, y);
          assert.deepEqual(V.fromView(rot, p.u, p.v), { x, y }, `rot ${rot} (${x},${y})`);
          const w = V.fromView(rot, x, y);
          assert.deepEqual(V.toView(rot, w.x, w.y), { u: x, v: y }, `rot ${rot} (${x},${y})`);
        }
      }
    }
  });

  it("never yields a negative zero", () => {
    for (const rot of ROTS) {
      const p = V.toView(rot, 0, 0);
      const w = V.fromView(rot, 0, 0);
      assert.ok(Object.is(p.u, 0) && Object.is(p.v, 0), `toView rot ${rot}`);
      assert.ok(Object.is(w.x, 0) && Object.is(w.y, 0), `fromView rot ${rot}`);
    }
  });
});

describe("view: project", () => {
  it("puts the origin at the origin, +x down-right, +y down-left, +z up", () => {
    const view = V.create();
    assert.deepEqual(V.project(view, 0, 0, 0), { sx: 0, sy: 0 });
    assert.deepEqual(V.project(view, 1, 0, 0), { sx: B.TILE_W / 2, sy: B.TILE_H / 2 });
    assert.deepEqual(V.project(view, 0, 1, 0), { sx: -B.TILE_W / 2, sy: B.TILE_H / 2 });
    assert.deepEqual(V.project(view, 0, 0, 1), { sx: 0, sy: -B.BLOCK_H });
    assert.deepEqual(V.project(view, 0, 0, -3), { sx: 0, sy: 3 * B.BLOCK_H });
    assert.deepEqual(V.project(view, 2, 2, 0), { sx: 0, sy: 2 * B.TILE_H });
  });

  it("adds the pan", () => {
    const view = viewAt(0, { x: 5, y: -7 });
    assert.deepEqual(V.project(view, 1, 0, 0), { sx: B.TILE_W / 2 + 5, sy: B.TILE_H / 2 - 7 });
  });

  it("moves world north from up-right to down-right on a +1 turn", () => {
    const north = (rot) => V.project(viewAt(rot), 0, -1, 0);
    assert.deepEqual(north(0), { sx: B.TILE_W / 2, sy: -B.TILE_H / 2 });
    assert.deepEqual(north(1), { sx: B.TILE_W / 2, sy: B.TILE_H / 2 });
    assert.deepEqual(north(2), { sx: -B.TILE_W / 2, sy: B.TILE_H / 2 });
    assert.deepEqual(north(3), { sx: -B.TILE_W / 2, sy: -B.TILE_H / 2 });
  });
});

describe("view: cellAt", () => {
  it("finds the cell under a projected centre for many cells, rotations and heights", () => {
    for (const rot of ROTS) {
      const view = viewAt(rot, { x: 13, y: -21 });
      for (const x of RANGE) {
        for (const y of RANGE) {
          for (const z of RANGE) {
            const p = V.project(view, x, y, z);
            const cell = V.cellAt(view, p.sx, p.sy, z);
            assert.deepEqual(cell, { x, y }, `rot ${rot} (${x},${y},${z})`);
          }
        }
      }
    }
  });

  it("maps every point inside the top diamond to the same cell", () => {
    const view = viewAt(1);
    const p = V.project(view, 2, -1, 1);
    for (const [dx, dy] of [[0, 7], [0, -7], [15, 0], [-15, 0], [7, 3], [-6, -4]]) {
      assert.deepEqual(V.cellAt(view, p.sx + dx, p.sy + dy, 1), { x: 2, y: -1 }, `${dx},${dy}`);
    }
  });

  it("steps to the neighbour past the diamond's edge", () => {
    const view = V.create();
    const p = V.project(view, 0, 0, 0);
    assert.deepEqual(V.cellAt(view, p.sx + B.TILE_W / 2 + 1, p.sy + 1, 0), { x: 1, y: 0 });
    assert.deepEqual(V.cellAt(view, p.sx - B.TILE_W / 2 - 1, p.sy + 1, 0), { x: 0, y: 1 });
  });

  it("depends on the plane it is asked about", () => {
    const view = V.create();
    const p = V.project(view, 3, 3, 2);
    assert.deepEqual(V.cellAt(view, p.sx, p.sy, 2), { x: 3, y: 3 });
    assert.deepEqual(V.cellAt(view, p.sx, p.sy, 0), { x: 1, y: 1 });
  });
});

describe("view: order", () => {
  it("sorts back to front by u + v, then by u, without touching the input", () => {
    const tiles = tilesAt([[2, 0], [1, 1], [1, 0], [0, 1], [0, 0]]);
    const copy = tiles.slice();
    const sorted = V.order(V.create(), tiles);
    assert.deepEqual(sorted.map((t) => [t.x, t.y]), [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]]);
    assert.deepEqual(tiles, copy);
    assert.notEqual(sorted, tiles);
  });

  it("reverses when the view turns half way round", () => {
    const tiles = tilesAt([[0, 0], [1, 1], [2, 2]]);
    const sorted = V.order(viewAt(2), tiles);
    assert.deepEqual(sorted.map((t) => t.x), [2, 1, 0]);
  });

  it("breaks ties by u, not by world x, once turned", () => {
    const tiles = tilesAt([[-3, -3], [0, 0], [2, 2]]);
    const sorted = V.order(viewAt(1), tiles);
    assert.deepEqual(sorted.map((t) => t.x), [2, 0, -3]);
  });

  it("puts a larger u + v later at every rotation", () => {
    for (const rot of ROTS) {
      const tiles = tilesAt([[3, -2], [-1, 4], [0, 0], [-3, -3], [2, 2]]);
      const sorted = V.order(viewAt(rot), tiles);
      const depth = (t) => { const p = V.toView(rot, t.x, t.y); return p.u + p.v; };
      for (let i = 1; i < sorted.length; i++) {
        assert.ok(depth(sorted[i - 1]) <= depth(sorted[i]), `rot ${rot}`);
      }
    }
  });
});

describe("view: pick", () => {
  // The hole a ring of four neighbours leaves, which each of them paints over:
  //     .X.
  //     X.X
  //     .X.
  it("answers the empty cell a ring of four neighbours surrounds, over all of its floor", () => {
    const hole = { x: 1, y: -2 };
    const ring = [[0, -2], [2, -2], [1, -1], [1, -3]];
    const reachX = B.TILE_W / 2;
    const reachY = B.TILE_H / 2;
    for (const rot of ROTS) {
      for (const elev of [B.ELEV_MIN, B.NEW_TILE_ELEV, B.ELEV_MAX]) {
        const view = viewAt(rot, { x: 9, y: -5 });
        const level = L.create();
        for (const [x, y] of ring) L.add(level, x, y, elev);
        const p = V.project(view, hole.x, hole.y, B.FLOOR);
        assert.deepEqual(V.pick(view, level, p.sx, p.sy), { cell: hole }, `rot ${rot} elev ${elev}`);
        for (let dx = -reachX; dx <= reachX; dx++) {
          for (let dy = -reachY; dy <= reachY; dy++) {
            const name = `rot ${rot} elev ${elev} ${dx},${dy}`;
            const under = V.cellAt(view, p.sx + dx, p.sy + dy, B.FLOOR);
            if (!B.sameCell(under, hole.x, hole.y)) continue;
            assert.deepEqual(V.pick(view, level, p.sx + dx, p.sy + dy).cell, hole, name);
          }
        }
      }
    }
  });

  it("lets a tall tile in front hide a lower one behind it", () => {
    const { view, level } = scene();
    L.add(level, 0, 0, 0);
    const front = L.add(level, 1, 1, 3);
    const p = V.project(view, 0, 0, 0);
    assert.deepEqual(V.pick(view, level, p.sx, p.sy), { tile: front });
    assert.deepEqual(V.pick(view, level, p.sx, p.sy - 7), { tile: front });
  });

  it("returns the tile whose top face is under the point, not the one whose side is", () => {
    const { view, level } = scene();
    const behind = L.add(level, 0, 0, B.NEW_TILE_ELEV);
    const front = L.add(level, 1, 0, B.NEW_TILE_ELEV);
    const p = V.project(view, 0, 0, B.NEW_TILE_ELEV);
    const overlap = { sx: p.sx + 8, sy: p.sy + 8 };   // behind's side, front's top
    assert.deepEqual(V.pick(view, level, overlap.sx, overlap.sy), { tile: front });
    assert.deepEqual(V.pick(view, level, p.sx - 8, p.sy), { tile: behind });
    assert.deepEqual(V.pick(view, level, p.sx + 24, p.sy + 8), { tile: front });
  });

  it("returns the tile that is alone under the point", () => {
    const { view, level } = scene();
    const only = L.add(level, 2, -3, B.NEW_TILE_ELEV);
    const p = V.project(view, 2, -3, B.NEW_TILE_ELEV);
    assert.deepEqual(V.pick(view, level, p.sx + 4, p.sy + 20), { tile: only });
  });

  it("picks a tile by its top face at every rotation, whatever its shape or height", () => {
    const at = { x: 2, y: -1 };
    const TOP_FACE = [[0, 0], [0, -7], [0, 7], [15, 0], [-15, 0], [8, -3]];
    const MID_ELEV = 3;                  // clear of the floor; ELEV_MAX is the ceiling
    for (const rot of ROTS) {
      for (const elev of [MID_ELEV, B.ELEV_MAX]) {
        for (const shape of B.SHAPES) {
          const view = viewAt(rot, { x: 9, y: -5 });
          const level = L.create();
          const probe = L.add(level, at.x, at.y, elev);
          L.setShape(level, at.x, at.y, shape);
          const p = V.project(view, at.x, at.y, L.top(probe));
          for (const [dx, dy] of TOP_FACE) {
            const name = `rot ${rot} elev ${elev} ${shape} ${dx},${dy}`;
            assert.deepEqual(V.pick(view, level, p.sx + dx, p.sy + dy), { tile: probe }, name);
          }
        }
      }
    }
  });

  it("leaves the points past a column's top diamond to the floor the ray reaches", () => {
    const { view, level } = scene();
    const TALL = 4;
    L.add(level, 0, 0, TALL);
    const p = V.project(view, 0, 0, TALL);
    for (const [dx, dy] of [[17, 0], [-17, 0], [0, -9], [10, -4], [-10, -4]]) {
      const at = { sx: p.sx + dx, sy: p.sy + dy };
      const floor = V.cellAt(view, at.sx, at.sy, B.FLOOR);
      assert.deepEqual(V.pick(view, level, at.sx, at.sy), { cell: floor }, `${dx},${dy}`);
    }
  });

  it("picks a tall column by a side face, where the ray meets its cell lower down", () => {
    const { view, level } = scene();
    const TALL = 5;
    const tall = L.add(level, 0, 0, TALL);
    const p = V.project(view, 0, 0, TALL);
    for (let drop = 1; drop <= TALL; drop++) {
      for (const dx of [-8, 0, 8]) {
        const name = `${drop} blocks down, ${dx} across`;
        const got = V.pick(view, level, p.sx + dx, p.sy + drop * B.BLOCK_H);
        assert.deepEqual(got, { tile: tall }, name);
      }
    }
  });

  it("picks a tile with no blocks by its top face, which lies on the floor", () => {
    const { view, level } = scene();
    const flat = L.add(level, 0, 0, B.ELEV_MIN);
    const p = V.project(view, 0, 0, B.FLOOR);
    for (const [dx, dy] of [[0, 0], [0, -7], [0, 7], [15, 0], [-15, 0], [8, -3]]) {
      assert.deepEqual(V.pick(view, level, p.sx + dx, p.sy + dy), { tile: flat }, `${dx},${dy}`);
    }
    assert.deepEqual(V.pick(view, level, p.sx, p.sy - B.TILE_H), { cell: { x: -1, y: -1 } });
  });

  it("picks the cell whose floor is under the point, not the one whose top would be", () => {
    const view = viewAt(0, { x: 7, y: -3 });
    const level = L.create();
    const back = B.NEW_TILE_ELEV - B.FLOOR;
    for (const [x, y] of [[0, 0], [3, -2], [-4, 5]]) {
      const floor = V.project(view, x, y, B.FLOOR);
      const top = V.project(view, x, y, B.NEW_TILE_ELEV);
      assert.deepEqual(V.pick(view, level, floor.sx, floor.sy), { cell: { x, y } }, `(${x},${y})`);
      assert.deepEqual(V.pick(view, level, top.sx, top.sy),
        { cell: { x: x - back, y: y - back } }, `(${x},${y}) top`);
    }
  });

  // The cost of the ray: the low part of a short column's side face covers a
  // floor cell the ray meets before it reaches the column's own height.
  it("gives the cell whose floor a short column's side face covers to that cell", () => {
    const { view, level } = scene();
    L.add(level, 0, 0, B.NEW_TILE_ELEV);
    for (const [x, y] of [[0, -1], [-1, 0]]) {
      const p = V.project(view, x, y, B.FLOOR);
      const inward = p.sx > 0 ? -1 : 1;
      assert.deepEqual(V.pick(view, level, p.sx, p.sy), { cell: { x, y } }, `(${x},${y})`);
      assert.deepEqual(V.pick(view, level, p.sx + inward, p.sy), { cell: { x, y } }, `(${x},${y}) in`);
    }
  });

  it("hides the floor behind a column as far back as the column is tall", () => {
    const { view, level } = scene();
    const lone = L.add(level, 0, 0, B.NEW_TILE_ELEV);
    const reach = B.NEW_TILE_ELEV - B.FLOOR;
    for (let k = 1; k <= reach; k++) {
      const p = V.project(view, -k, -k, B.FLOOR);
      assert.deepEqual(V.pick(view, level, p.sx, p.sy), { tile: lone }, `${k} back`);
    }
    const clear = V.project(view, -reach - 1, -reach - 1, B.FLOOR);
    assert.deepEqual(V.pick(view, level, clear.sx, clear.sy),
      { cell: { x: -reach - 1, y: -reach - 1 } });
  });

  it("leaves the floor in front of a tile empty, since the ray stops at the floor", () => {
    const { view, level } = scene();
    const flat = L.add(level, 0, 0, B.ELEV_MIN);
    const front = { x: 1, y: 1 };        // the next cell toward the eye
    const p = V.project(view, front.x, front.y, B.FLOOR);
    const own = V.project(view, flat.x, flat.y, B.FLOOR);
    assert.deepEqual(V.pick(view, level, p.sx, p.sy), { cell: front });
    assert.deepEqual(V.pick(view, level, own.sx, own.sy), { tile: flat });
  });

  it("flags a point on the line between two empty cells as an edge", () => {
    const { view, level } = scene();
    const lone = L.add(level, 2, -1, 0);
    const p = V.project(view, 2, -1, B.FLOOR);
    const vertex = { sx: p.sx + B.TILE_W / 2, sy: p.sy };
    const onVertex = V.pick(view, level, vertex.sx, vertex.sy);
    assert.deepEqual(onVertex, { cell: { x: 3, y: -1 }, edge: true });
    assert.deepEqual(V.pick(view, level, vertex.sx + 1, vertex.sy), { cell: { x: 3, y: -2 } });
    const q = V.project(view, 3, -2, B.FLOOR);
    const edge = { sx: q.sx + B.TILE_W / 4, sy: q.sy + B.TILE_H / 4 };
    assert.deepEqual(V.pick(view, level, edge.sx, edge.sy), { cell: { x: 4, y: -2 }, edge: true });
    assert.deepEqual(V.pick(view, level, p.sx - 1, p.sy), { tile: lone });
  });

  it("finds the line between two neighbours at every rotation, panned, in either quadrant", () => {
    const pairs = [[[0, 0], [1, 0]], [[0, 0], [0, 1]], [[-2, -1], [-3, -1]], [[-2, -1], [-2, -2]]];
    for (const rot of ROTS) {
      const view = viewAt(rot, { x: 9, y: -5 });
      const level = L.create();
      for (const [a, b] of pairs) {
        const name = `rot ${rot} (${a})-(${b})`;
        const pa = V.project(view, a[0], a[1], B.FLOOR);
        const pb = V.project(view, b[0], b[1], B.FLOOR);
        const between = V.pick(view, level, (pa.sx + pb.sx) / 2, (pa.sy + pb.sy) / 2);
        assert.equal(between.edge, true, name);
        assert.ok([a, b].some(([x, y]) => between.cell.x === x && between.cell.y === y), name);
        assert.deepEqual(V.pick(view, level, pa.sx, pa.sy), { cell: { x: a[0], y: a[1] } }, name);
      }
    }
  });

  it("returns the empty cell on the floor plane, turned and panned", () => {
    const view = viewAt(1, { x: 9, y: 9 });
    const level = L.create();
    L.add(level, 5, 5);
    const p = V.project(view, 2, 3, B.FLOOR);
    assert.deepEqual(V.pick(view, level, p.sx, p.sy), { cell: { x: 2, y: 3 } });
  });

  it("finds the lowest column, of any shape, over every point of its own floor cell", () => {
    const PAST_DIAMOND = 4;              // px the sweep reaches beyond the floor diamond
    const reachX = B.TILE_W / 2 + PAST_DIAMOND;
    const reachY = B.TILE_H / 2 + PAST_DIAMOND;
    const at = { x: 1, y: -2 };
    for (const rot of ROTS) {
      for (const shape of B.SHAPES) {
        const view = viewAt(rot, { x: 9, y: -5 });
        const level = L.create();
        const low = L.add(level, at.x, at.y, B.ELEV_MIN);
        L.setShape(level, at.x, at.y, shape);
        const p = V.project(view, at.x, at.y, B.FLOOR);
        for (let dx = -reachX; dx <= reachX; dx++) {
          for (let dy = -reachY; dy <= reachY; dy++) {
            const name = `rot ${rot} ${shape} ${dx},${dy}`;
            const got = V.pick(view, level, p.sx + dx, p.sy + dy);
            assert.notEqual(got, null, name);
            const under = V.cellAt(view, p.sx + dx, p.sy + dy, B.FLOOR);
            if (B.sameCell(under, at.x, at.y)) assert.deepEqual(got, { tile: low }, name);
          }
        }
      }
    }
  });

  it("leaves a column's floor at its side vertices to the neighbours, on the grid line", () => {
    const { view, level } = scene();
    L.add(level, 0, 0, B.ELEV_MIN);
    const p = V.project(view, 0, 0, B.FLOOR);
    const right = V.pick(view, level, p.sx + B.TILE_W / 2, p.sy);
    const left = V.pick(view, level, p.sx - B.TILE_W / 2, p.sy);
    assert.deepEqual(right, { cell: { x: 1, y: 0 }, edge: true });
    assert.deepEqual(left, { cell: { x: 0, y: 1 }, edge: true });
  });

  it("never names a cell that holds a tile, at every rotation and pan", () => {
    const SWEEP = 24;                    // px either way from the patch's centre
    const patch = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
    for (const rot of ROTS) {
      for (const pan of [{ x: 0, y: 0 }, { x: 9, y: -5 }, { x: -13, y: 21 }]) {
        const view = viewAt(rot, pan);
        const level = L.create();
        patch.forEach(([x, y], i) => L.add(level, x, y, i % (B.ELEV_MAX + 1)));
        const p = V.project(view, 1, 1, B.FLOOR);
        for (let dx = -SWEEP; dx <= SWEEP; dx++) {
          for (let dy = -SWEEP; dy <= SWEEP; dy++) {
            const got = V.pick(view, level, p.sx + dx, p.sy + dy);
            if (!got.cell) continue;
            const name = `rot ${rot} pan ${pan.x},${pan.y} at ${dx},${dy}`;
            assert.equal(L.get(level, got.cell.x, got.cell.y), null, name);
          }
        }
      }
    }
  });
});

describe("view: within", () => {
  // Four tiles in a square, in an order no view puts them in, and one past
  // the square that its box never reaches at any rotation.
  const SQUARE = [[1, 1], [0, 0], [1, 0], [0, 1]];
  const OUTSIDE = [2, 2];
  const PANS = [{ x: 0, y: 0 }, { x: 9, y: -5 }];
  const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const REACH_X = 24;                  // px a probe box reaches across from its corner
  const REACH_Y = 12;                  // ...and down, which is not the same
  const ELEV = B.NEW_TILE_ELEV;

  function patch(rot, pan, cells) {
    const view = viewAt(rot, pan);
    const level = L.create();
    for (const [x, y] of cells) L.add(level, x, y, ELEV);
    return { view, level };
  }

  // Where a tile's top face's centre lands, as render.js places it.
  const topOf = (view, level, [x, y]) =>
    V.project(view, x, y, L.top(L.get(level, x, y)));

  // The box that just holds the top faces of the named cells.
  function boxOver(view, level, cells) {
    const tops = cells.map((cell) => topOf(view, level, cell));
    const xs = tops.map((p) => p.sx);
    const ys = tops.map((p) => p.sy);
    return {
      x0: Math.min(...xs), y0: Math.min(...ys),
      x1: Math.max(...xs), y1: Math.max(...ys)
    };
  }

  const cellsOf = (tiles) => tiles.map((t) => [t.x, t.y]);

  it("gathers the tiles the box holds, in the level's own order, turned and panned", () => {
    for (const rot of ROTS) {
      for (const pan of PANS) {
        const { view, level } = patch(rot, pan, SQUARE.concat([OUTSIDE]));
        const got = V.within(view, level, boxOver(view, level, SQUARE));
        assert.deepEqual(cellsOf(got), SQUARE, `rot ${rot} pan ${pan.x},${pan.y}`);
      }
    }
  });

  it("answers the tiles themselves, and nothing over an empty level", () => {
    const { view, level } = patch(0, PANS[0], SQUARE);
    const box = boxOver(view, level, SQUARE);
    assert.deepEqual(V.within(view, level, box), L.all(level));
    assert.deepEqual(V.within(view, L.create(), box), []);
  });

  it("holds a tile whose centre lies on a corner and drops it a pixel past, at every rotation", () => {
    for (const rot of ROTS) {
      const { view, level } = patch(rot, PANS[1], [[0, 0]]);
      const p = topOf(view, level, [0, 0]);
      for (const [dx, dy] of CORNERS) {
        const far = { x1: p.sx + dx * REACH_X, y1: p.sy + dy * REACH_Y };
        const on = { x0: p.sx, y0: p.sy, ...far };
        const past = { x0: p.sx + dx, y0: p.sy + dy, ...far };
        assert.equal(V.within(view, level, on).length, 1, `rot ${rot} on ${dx},${dy}`);
        assert.equal(V.within(view, level, past).length, 0, `rot ${rot} past ${dx},${dy}`);
      }
    }
  });

  it("holds a tile just inside an edge and drops the one just outside it", () => {
    const { view, level } = patch(0, PANS[0], [[0, 0], [1, 0]]);
    const near = topOf(view, level, [0, 0]);
    const far = topOf(view, level, [1, 0]);
    const reach = (edge) => ({ x0: near.sx, y0: near.sy - REACH_Y, x1: edge, y1: far.sy });
    assert.deepEqual(cellsOf(V.within(view, level, reach(far.sx))), [[0, 0], [1, 0]]);
    assert.deepEqual(cellsOf(V.within(view, level, reach(far.sx - 1))), [[0, 0]]);
  });

  it("reads the box's corners in either order", () => {
    const { view, level } = patch(0, PANS[0], SQUARE.concat([OUTSIDE]));
    const box = boxOver(view, level, SQUARE);
    const orders = [
      box,
      { x0: box.x1, y0: box.y1, x1: box.x0, y1: box.y0 },
      { x0: box.x1, y0: box.y0, x1: box.x0, y1: box.y1 },
      { x0: box.x0, y0: box.y1, x1: box.x1, y1: box.y0 }
    ];
    for (const corners of orders) {
      assert.deepEqual(cellsOf(V.within(view, level, corners)), SQUARE, JSON.stringify(corners));
    }
  });

  it("reads a slope by the top face a block over its elevation, as the renderer draws it", () => {
    const PROBE = 1;                   // px each way, so the box has a size
    const around = (p) =>
      ({ x0: p.sx - PROBE, y0: p.sy - PROBE, x1: p.sx + PROBE, y1: p.sy + PROBE });
    for (const shape of B.SHAPES) {
      const { view, level } = patch(0, PANS[0], [[0, 0]]);
      L.setShape(level, 0, 0, shape);
      const tile = L.get(level, 0, 0);
      assert.deepEqual(V.within(view, level, around(topOf(view, level, [0, 0]))), [tile], shape);
      const base = V.project(view, 0, 0, tile.elev);
      const onBase = L.sloped(tile) ? [] : [tile];
      assert.deepEqual(V.within(view, level, around(base)), onBase, shape);
    }
  });
});

describe("view: within a box of no size", () => {
  const pinned = (p) => ({ x0: p.sx, y0: p.sy, x1: p.sx, y1: p.sy });

  it("takes the tile under the corner, anywhere on its top face, as a click does", () => {
    const TOP_FACE = [[0, 0], [0, -7], [0, 7], [15, 0], [-15, 0], [8, -3]];
    for (const rot of ROTS) {
      const view = viewAt(rot, { x: 9, y: -5 });
      const level = L.create();
      const only = L.add(level, 1, -2, B.NEW_TILE_ELEV);
      const p = V.project(view, only.x, only.y, L.top(only));
      for (const [dx, dy] of TOP_FACE) {
        const corner = { sx: p.sx + dx, sy: p.sy + dy };
        const name = `rot ${rot} ${dx},${dy}`;
        assert.deepEqual(V.within(view, level, pinned(corner)), [only], name);
        assert.deepEqual(V.pick(view, level, corner.sx, corner.sy), { tile: only }, `${name} click`);
      }
    }
  });

  it("takes a tile the click reaches by a side face, which no box of top faces holds", () => {
    const view = V.create();
    const level = L.create();
    const TALL = 5;
    const tall = L.add(level, 0, 0, TALL);
    const top = V.project(view, 0, 0, TALL);
    const side = { sx: top.sx, sy: top.sy + TALL * B.BLOCK_H };
    assert.deepEqual(V.within(view, level, pinned(side)), [tall]);
    const REACH = 2;                   // px each way: a box with a size, over the same point
    assert.deepEqual(V.within(view, level, {
      x0: side.sx - REACH, y0: side.sy - REACH, x1: side.sx + REACH, y1: side.sy + REACH
    }), []);
  });

  it("takes nothing over an empty cell", () => {
    const { view, level } = scene();
    L.add(level, 3, 3, B.NEW_TILE_ELEV);
    const p = V.project(view, 0, 0, B.FLOOR);
    assert.deepEqual(V.within(view, level, pinned(p)), []);
    assert.deepEqual(V.within(V.create(), L.create(), pinned(p)), []);
  });

  it("is a box, not a click, when only one side has no length", () => {
    const view = V.create();
    const level = L.create();
    const near = L.add(level, 0, 0, B.NEW_TILE_ELEV);
    const far = L.add(level, 1, 1, B.NEW_TILE_ELEV);
    const a = V.project(view, near.x, near.y, L.top(near));
    const b = V.project(view, far.x, far.y, L.top(far));
    assert.equal(a.sx, b.sx, "the two tops share a column on screen");
    assert.deepEqual(V.within(view, level, { x0: a.sx, y0: a.sy, x1: b.sx, y1: b.sy }),
      [near, far]);
  });
});

describe("view: sameHit", () => {
  const onTile = (x, y, more = {}) => ({ tile: tile({ x, y, ...more }) });
  const onCell = (x, y) => ({ cell: { x, y } });
  const onEdge = (x, y) => ({ cell: { x, y }, edge: true });

  it("is true for nothing twice, a tile however edited, the same cell, the same edge", () => {
    const pairs = [
      [null, null],
      [onTile(1, 2), onTile(1, 2)],
      [onTile(1, 2), onTile(1, 2, { elev: 3, shape: "ramp", decor: "chest" })],
      [onCell(1, 2), onCell(1, 2)],
      [onEdge(1, 2), onEdge(1, 2)]
    ];
    for (const [a, b] of pairs) assert.equal(V.sameHit(a, b), true, JSON.stringify([a, b]));
  });

  it("is false against nothing, across kinds or cells, and between a cell and its edge", () => {
    const pairs = [
      [null, onTile(1, 2)], [onCell(1, 2), null],
      [onTile(1, 2), onCell(1, 2)], [onCell(1, 2), onTile(1, 2)],
      [onTile(1, 2), onTile(2, 1)], [onCell(1, 2), onCell(1, 3)],
      [onCell(1, 2), onEdge(1, 2)], [onEdge(1, 2), onCell(1, 2)]
    ];
    for (const [a, b] of pairs) assert.equal(V.sameHit(a, b), false, JSON.stringify([a, b]));
  });
});

describe("view: pan", () => {
  it("moves the scene down-left when the camera goes north at rot 0", () => {
    const view = V.create();
    V.pan(view, "N", 1);
    assert.deepEqual(view.pan, { x: -B.TILE_W / 2, y: B.TILE_H / 2 });
  });

  it("moves the scene up-left for the same key at rot 1", () => {
    const view = viewAt(1);
    V.pan(view, "N", 1);
    assert.deepEqual(view.pan, { x: -B.TILE_W / 2, y: -B.TILE_H / 2 });
  });

  it("shifts by the projected delta of one tile at every rotation", () => {
    for (const rot of ROTS) {
      for (const [facing, dx, dy] of [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]]) {
        const view = viewAt(rot, { x: 3, y: 4 });
        const delta = V.project(viewAt(rot), dx, dy, 0);
        V.pan(view, facing, 2);
        const expected = { x: 3 - 2 * delta.sx, y: 4 - 2 * delta.sy };
        assert.deepEqual(view.pan, expected, `rot ${rot} ${facing}`);
      }
    }
  });

  it("brings the tile the camera moved toward to the origin", () => {
    const view = viewAt(2);
    V.pan(view, "E", 3);
    assert.deepEqual(V.project(view, 3, 0, 0), { sx: 0, sy: 0 });
  });

  it("returns the pan and accumulates", () => {
    const view = V.create();
    V.pan(view, "N", 1);
    assert.deepEqual(V.pan(view, "S", 1), { x: 0, y: 0 });
  });

  it("ignores an unknown facing", () => {
    const view = V.create();
    V.pan(view, "up", 1);
    assert.deepEqual(view.pan, { x: 0, y: 0 });
  });
});

describe("view: viewFacing", () => {
  it("names the screen side the high edge is on for every facing and rotation", () => {
    const table = {
      0: { N: "ur", E: "dr", S: "dl", W: "ul" },
      1: { N: "dr", E: "dl", S: "ul", W: "ur" },
      2: { N: "dl", E: "ul", S: "ur", W: "dr" },
      3: { N: "ul", E: "ur", S: "dr", W: "dl" }
    };
    for (const rot of ROTS) {
      for (const facing of B.FACINGS) {
        assert.equal(V.viewFacing(rot, facing), table[rot][facing], `rot ${rot} ${facing}`);
      }
    }
  });
});

describe("view: frame", () => {
  const canvas = { width: 1000, height: 600 };

  it("halves a 1000x600 canvas at scale 2 and centres the origin", () => {
    assert.deepEqual(V.frame(canvas, 2), { w: 500, h: 300, ox: 250, oy: 150 });
  });

  it("rounds the base size up at scale 3", () => {
    assert.deepEqual(V.frame(canvas, 3), { w: 334, h: 200, ox: 167, oy: 100 });
  });

  it("keeps the origin on a whole pixel when the base size is odd", () => {
    assert.deepEqual(V.frame(canvas, 8), { w: 125, h: 75, ox: 62, oy: 37 });
  });
});

describe("view: basePoint", () => {
  const RECT = { left: 40, top: 10 };   // where the canvas sits on the page
  const CSS_W = 400;                    // the content box, in CSS px
  const CSS_H = 200;
  const RATIO = 2;                      // device pixels per CSS pixel
  const BORDER_X = 3;                   // px of border down the canvas's left side
  const BORDER_Y = 5;                   // ...and across its top
  const SCALE = 4;                      // zoom 2 at that ratio
  const HALF = 0.5;

  // A canvas whose bitmap covers its box at the device's ratio, with no border.
  function canvasAt(over = {}) {
    return {
      clientWidth: CSS_W,
      clientHeight: CSS_H,
      clientLeft: 0,
      clientTop: 0,
      width: CSS_W * RATIO,
      height: CSS_H * RATIO,
      getBoundingClientRect: () => ({ left: RECT.left, top: RECT.top }),
      ...over
    };
  }

  const bordered = () => canvasAt({ clientLeft: BORDER_X, clientTop: BORDER_Y });

  // The client point of (cx, cy) in the canvas's own content box, in CSS px.
  const client = (canvas, cx, cy) =>
    [RECT.left + canvas.clientLeft + cx, RECT.top + canvas.clientTop + cy];

  it("puts the frame's origin under the centre of the content box, border or none", () => {
    for (const canvas of [canvasAt(), bordered()]) {
      const middle = client(canvas, CSS_W * HALF, CSS_H * HALF);
      assert.deepEqual(V.basePoint(canvas, SCALE, middle[0], middle[1]), { x: 0, y: 0 });
    }
  });

  it("measures in base pixels, so the content box reaches half a frame each way", () => {
    const canvas = bordered();
    const frame = V.frame(canvas, SCALE);
    const topLeft = client(canvas, 0, 0);
    const bottomRight = client(canvas, CSS_W, CSS_H);
    assert.deepEqual(V.basePoint(canvas, SCALE, topLeft[0], topLeft[1]),
      { x: -frame.ox, y: -frame.oy });
    assert.deepEqual(V.basePoint(canvas, SCALE, bottomRight[0], bottomRight[1]),
      { x: frame.w - frame.ox, y: frame.h - frame.oy });
  });

  it("takes the border off, so the same client point falls further in on a bordered canvas", () => {
    const plain = V.basePoint(canvasAt(), SCALE, RECT.left + 100, RECT.top + 50);
    const inside = V.basePoint(bordered(), SCALE, RECT.left + 100, RECT.top + 50);
    assert.deepEqual({ x: plain.x - inside.x, y: plain.y - inside.y },
      { x: BORDER_X * RATIO / SCALE, y: BORDER_Y * RATIO / SCALE });
  });

  it("counts the bitmap's own pixels, not the box's, when the two differ", () => {
    const at = (canvas) => V.basePoint(canvas, SCALE, ...client(canvas, 100, 50));
    assert.deepEqual(at(canvasAt()), { x: -50, y: -25 });
    assert.deepEqual(at(canvasAt({ width: CSS_W, height: CSS_H })), { x: -25, y: -12.5 });
  });

  it("reads each side against its own bitmap, which rounding leaves at its own ratio", () => {
    const canvas = canvasAt({ width: CSS_W * RATIO, height: CSS_H });
    const point = client(canvas, 100, 50);
    assert.deepEqual(V.basePoint(canvas, SCALE, point[0], point[1]), { x: -50, y: -12.5 });
  });

  it("answers the same base point at any ratio, since the bitmap grows with it", () => {
    const wide = canvasAt({ width: CSS_W * RATIO * 2, height: CSS_H * RATIO * 2 });
    const point = client(wide, 100, 50);
    assert.deepEqual(V.basePoint(wide, SCALE * 2, point[0], point[1]),
      V.basePoint(canvasAt(), SCALE, point[0], point[1]));
  });

  it("has no answer for a canvas with no size", () => {
    for (const over of [{ clientWidth: 0 }, { clientHeight: 0 }]) {
      const canvas = canvasAt(over);
      assert.equal(V.basePoint(canvas, SCALE, RECT.left, RECT.top), null, JSON.stringify(over));
    }
  });

  it("hands pick the point it needs: a click on a tile's top face finds that tile", () => {
    const canvas = bordered();
    const frame = V.frame(canvas, SCALE);
    const { view, level } = scene();
    const tall = L.add(level, 1, -1, B.NEW_TILE_ELEV);
    const p = V.project(view, tall.x, tall.y, L.top(tall));
    // Back the other way: base px to the content box's own CSS px.
    const cx = (frame.ox + p.sx) * SCALE / RATIO;
    const cy = (frame.oy + p.sy) * SCALE / RATIO;
    const point = client(canvas, cx, cy);
    const at = V.basePoint(canvas, SCALE, point[0], point[1]);
    assert.deepEqual(at, { x: p.sx, y: p.sy });
    assert.deepEqual(V.pick(view, level, at.x, at.y), { tile: tall });
  });
});
