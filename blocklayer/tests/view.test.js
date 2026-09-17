"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const B = load();
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

function tile(x, y, elev = 0, shape = "block") {
  return { x, y, elev, shape, facing: "N", decor: null, marks: [] };
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
    const tiles = [tile(2, 0), tile(1, 1), tile(1, 0), tile(0, 1), tile(0, 0)];
    const copy = tiles.slice();
    const sorted = V.order(V.create(), tiles);
    assert.deepEqual(sorted.map((t) => [t.x, t.y]), [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]]);
    assert.deepEqual(tiles, copy);
    assert.notEqual(sorted, tiles);
  });

  it("reverses when the view turns half way round", () => {
    const tiles = [tile(0, 0), tile(1, 1), tile(2, 2)];
    const sorted = V.order(viewAt(2), tiles);
    assert.deepEqual(sorted.map((t) => t.x), [2, 1, 0]);
  });

  it("breaks ties by u, not by world x, once turned", () => {
    const tiles = [tile(-3, -3), tile(0, 0), tile(2, 2)];
    const sorted = V.order(viewAt(1), tiles);
    assert.deepEqual(sorted.map((t) => t.x), [2, 0, -3]);
  });

  it("puts a larger u + v later at every rotation", () => {
    for (const rot of ROTS) {
      const tiles = [tile(3, -2), tile(-1, 4), tile(0, 0), tile(-3, -3), tile(2, 2)];
      const sorted = V.order(viewAt(rot), tiles);
      const depth = (t) => { const p = V.toView(rot, t.x, t.y); return p.u + p.v; };
      for (let i = 1; i < sorted.length; i++) {
        assert.ok(depth(sorted[i - 1]) <= depth(sorted[i]), `rot ${rot}`);
      }
    }
  });
});

describe("view: hit", () => {
  const view = V.create();
  const block = tile(0, 0, 0);
  const columnH = (0 - B.FLOOR) * B.BLOCK_H;

  it("is true inside the top diamond and on its upper outline", () => {
    const inside = [[0, 0], [0, -7], [10, 0], [-10, 0], [15, 0], [8, -3], [0, 7]];
    const upperEdge = [[0, -8], [8, -4], [-8, -4]];
    for (const [dx, dy] of [...inside, ...upperEdge]) {
      assert.equal(V.hit(view, block, dx, dy), true, `${dx},${dy}`);
    }
  });

  it("is true on the side faces down to the floor", () => {
    for (const [dx, dy] of [[0, 40], [-15, 20], [15, 20], [0, columnH + 8], [15, columnH]]) {
      assert.equal(V.hit(view, block, dx, dy), true, `${dx},${dy}`);
    }
  });

  it("is false just outside the silhouette, its side vertices included", () => {
    const outside = [[17, 0], [-17, 0], [0, -9], [10, -4], [-10, -4], [16, -1]];
    const sideVertices = [[16, 0], [-16, 0], [16, columnH]];
    for (const [dx, dy] of [...outside, ...sideVertices]) {
      assert.equal(V.hit(view, block, dx, dy), false, `${dx},${dy}`);
    }
  });

  it("is false below the column's bottom", () => {
    for (const [dx, dy] of [[0, columnH + 9], [10, columnH + 4], [16, columnH + 1]]) {
      assert.equal(V.hit(view, block, dx, dy), false, `${dx},${dy}`);
    }
  });

  it("rises one block for a ramp or stairs but still stands on the same floor", () => {
    for (const shape of ["ramp", "stairs"]) {
      const sloped = tile(0, 0, 0, shape);
      assert.equal(V.hit(view, sloped, 0, -B.BLOCK_H - 4), true, shape);
      assert.equal(V.hit(view, sloped, 0, columnH + 8), true, shape);
      assert.equal(V.hit(view, sloped, 0, columnH + 9), false, shape);
    }
    assert.equal(V.hit(view, block, 0, -B.BLOCK_H - 4), false);
  });

  it("follows the tile through rotation and pan", () => {
    const turned = viewAt(3, { x: 40, y: -30 });
    const t = tile(2, -1, 1);
    const p = V.project(turned, 2, -1, 1);
    assert.equal(V.hit(turned, t, p.sx, p.sy), true);
    assert.equal(V.hit(turned, t, p.sx + B.TILE_W / 2 + 1, p.sy), false);
  });
});

describe("view: pick", () => {
  it("lets a tall tile in front hide a lower one behind it", () => {
    const view = V.create();
    const level = L.create();
    L.add(level, 0, 0, 0);
    const front = L.add(level, 1, 1, 3);
    const p = V.project(view, 0, 0, 0);
    assert.deepEqual(V.pick(view, level, p.sx, p.sy), { tile: front });
    assert.deepEqual(V.pick(view, level, p.sx, p.sy - 7), { tile: front });
  });

  it("returns the front-most tile where two overlap and each where they do not", () => {
    const view = V.create();
    const level = L.create();
    const behind = L.add(level, 0, 0, 0);
    const front = L.add(level, 1, 0, 0);
    const overlap = { sx: 8, sy: 8 };
    assert.equal(V.hit(view, behind, overlap.sx, overlap.sy), true);
    assert.equal(V.hit(view, front, overlap.sx, overlap.sy), true);
    assert.deepEqual(V.pick(view, level, overlap.sx, overlap.sy), { tile: front });
    assert.deepEqual(V.pick(view, level, -8, 0), { tile: behind });
    assert.deepEqual(V.pick(view, level, 24, 8), { tile: front });
  });

  it("returns the tile that is alone under the point", () => {
    const view = V.create();
    const level = L.create();
    const only = L.add(level, 2, -3, -1);
    const p = V.project(view, 2, -3, -1);
    assert.deepEqual(V.pick(view, level, p.sx + 4, p.sy + 20), { tile: only });
  });

  it("gives the empty cell beside a lone tile its own centre, and the tile one pixel in", () => {
    const view = V.create();
    const level = L.create();
    const lone = L.add(level, 0, 0, 0);
    for (const [x, y] of [[1, 0], [0, 1]]) {
      const p = V.project(view, x, y, B.NEW_TILE_ELEV);
      const inward = p.sx > 0 ? -1 : 1;
      assert.deepEqual(V.pick(view, level, p.sx, p.sy), { cell: { x, y } }, `(${x},${y})`);
      assert.deepEqual(V.pick(view, level, p.sx + inward, p.sy), { tile: lone }, `(${x},${y})`);
    }
  });

  it("flags a point on the line between two empty cells as an edge", () => {
    const view = V.create();
    const level = L.create();
    const lone = L.add(level, 2, -1, 0);
    const p = V.project(view, 2, -1, 0);
    const vertex = { sx: p.sx + B.TILE_W / 2, sy: p.sy };
    assert.deepEqual(V.pick(view, level, vertex.sx, vertex.sy), { cell: { x: 3, y: -1 }, edge: true });
    assert.deepEqual(V.pick(view, level, vertex.sx + 1, vertex.sy), { cell: { x: 3, y: -2 } });
    const q = V.project(view, 3, -2, 0);
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
        const pa = V.project(view, a[0], a[1], B.NEW_TILE_ELEV);
        const pb = V.project(view, b[0], b[1], B.NEW_TILE_ELEV);
        const between = V.pick(view, level, (pa.sx + pb.sx) / 2, (pa.sy + pb.sy) / 2);
        assert.equal(between.edge, true, name);
        assert.ok([a, b].some(([x, y]) => between.cell.x === x && between.cell.y === y), name);
        assert.deepEqual(V.pick(view, level, pa.sx, pa.sy), { cell: { x: a[0], y: a[1] } }, name);
      }
    }
  });

  it("returns the empty cell on the new-tile plane", () => {
    const view = viewAt(1, { x: 9, y: 9 });
    const level = L.create();
    L.add(level, 5, 5);
    const p = V.project(view, 2, 3, B.NEW_TILE_ELEV);
    assert.deepEqual(V.pick(view, level, p.sx, p.sy), { cell: { x: 2, y: 3 } });
  });

  it("returns null when the cell is occupied but its column was not hit", () => {
    const view = V.create();
    const level = L.create();
    L.add(level, 0, 0, -3);
    const p = V.project(view, 0, 0, B.NEW_TILE_ELEV);
    assert.equal(V.pick(view, level, p.sx, p.sy), null);
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
