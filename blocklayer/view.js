/*
 * Blocklayer — the camera: where a world cell lands on the base canvas after
 * rotation and pan, the depth order tiles are drawn in, and the way back from
 * a pointer to the tile or the empty cell under it. Pure arithmetic; the only
 * thing read from a canvas is its size.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var TURNS = 4;                                  // quarter turns in a full circle
  var HALF = 0.5;                                 // of a cell: where one cell meets the next
  var HALF_TILE_W = B.TILE_W / 2;                 // base px, a diamond's centre to its side vertex
  var HALF_TILE_H = B.TILE_H / 2;                 // ...and to its top or bottom vertex
  var DIRS_PER_VIEW_FACING = B.DIRECTIONS.length / B.VIEW_FACINGS.length;
  var STEP = {                                    // one cell toward each world facing
    N: { x: 0, y: -1 },
    E: { x: 1, y: 0 },
    S: { x: 0, y: 1 },
    W: { x: -1, y: 0 }
  };

  function create() {
    return { rot: 0, zoom: B.ZOOM_DEFAULT, pan: { x: 0, y: 0 } };
  }

  function rotate(view, turns) {
    view.rot = (((view.rot + turns) % TURNS) + TURNS) % TURNS;
    return view.rot;
  }

  function zoom(view, delta) {
    view.zoom = B.clamp(view.zoom + delta, B.ZOOM_MIN, B.ZOOM_MAX);
    return view.zoom;
  }

  // One quarter turn clockwise on screen. 0 - v rather than -v keeps 0 as +0.
  function turn(p) {
    return { u: 0 - p.v, v: p.u };
  }

  function toView(rot, x, y) {
    var p = { u: x, v: y };
    for (var i = 0; i < rot; i++) p = turn(p);
    return p;
  }

  function fromView(rot, u, v) {
    var p = { u: u, v: v };
    for (var i = 0; i < (TURNS - rot) % TURNS; i++) p = turn(p);
    return { x: p.u, y: p.v };
  }

  function project(view, x, y, z) {
    var p = toView(view.rot, x, y);
    return {
      sx: (p.u - p.v) * HALF_TILE_W + view.pan.x,
      sy: (p.u + p.v) * HALF_TILE_H - z * B.BLOCK_H + view.pan.y
    };
  }

  // Math.round(-0.3) is -0, and a cell index should not carry a sign.
  function nearest(n) {
    var r = Math.round(n);
    return r === 0 ? 0 : r;
  }

  function unproject(view, sx, sy, z) {
    var across = (sx - view.pan.x) / B.TILE_W;
    var down = (sy - view.pan.y + z * B.BLOCK_H) / B.TILE_H;
    return { u: down + across, v: down - across };
  }

  function cellAt(view, sx, sy, z) {
    var p = unproject(view, sx, sy, z);
    return fromView(view.rot, nearest(p.u), nearest(p.v));
  }

  function halfway(n) {
    return n - Math.floor(n) === HALF;
  }

  // Half-way between two cell centres in u or v: on the line between cells.
  function onGridLine(view, sx, sy, z) {
    var p = unproject(view, sx, sy, z);
    return halfway(p.u) || halfway(p.v);
  }

  function order(view, tiles) {
    return tiles.map(function (tile) {
      var p = toView(view.rot, tile.x, tile.y);
      return { tile: tile, depth: p.u + p.v, u: p.u };
    }).sort(function (a, b) {
      return a.depth - b.depth || a.u - b.u;
    }).map(function (entry) {
      return entry.tile;
    });
  }

  // The first tile the ray from the eye through the point meets, else the cell
  // of the floor under it: where a new column's base would stand. The cell the
  // point falls in at each height, from the top down, is that ray. The floor is
  // the last step, so the cell it answers with is always empty.
  function pick(view, level, sx, sy) {
    for (var z = B.ELEV_MAX; z >= B.FLOOR; z--) {
      var cell = cellAt(view, sx, sy, z);
      var tile = B.level.get(level, cell.x, cell.y);
      if (tile && B.level.top(tile) >= z) return { tile: tile };
    }
    var empty = { cell: cellAt(view, sx, sy, B.FLOOR) };
    if (onGridLine(view, sx, sy, B.FLOOR)) empty.edge = true;
    return empty;
  }

  // Whether two picks name the same thing: the same tile, or the same empty
  // cell reached the same way (on a grid line or off it).
  function sameHit(a, b) {
    if (!a || !b) return a === b;
    if (a.tile || b.tile) return !!a.tile && !!b.tile && B.sameCell(a.tile, b.tile.x, b.tile.y);
    return B.sameCell(a.cell, b.cell.x, b.cell.y) && !a.edge === !b.edge;
  }

  function pan(view, facing, tiles) {
    var step = STEP[facing];
    if (!step) return view.pan;
    var from = project(view, 0, 0, 0);
    var to = project(view, step.x, step.y, 0);
    view.pan.x -= (to.sx - from.sx) * tiles;
    view.pan.y -= (to.sy - from.sy) * tiles;
    return view.pan;
  }

  function viewFacing(rot, facing) {
    return B.VIEW_FACINGS[B.facingDir(rot, facing) / DIRS_PER_VIEW_FACING];
  }

  function frame(canvas, scale) {
    var w = Math.ceil(canvas.width / scale);
    var h = Math.ceil(canvas.height / scale);
    return { w: w, h: h, ox: Math.floor(w / 2), oy: Math.floor(h / 2) };
  }

  B.view = {
    create: create,
    rotate: rotate,
    zoom: zoom,
    pan: pan,
    toView: toView,
    fromView: fromView,
    project: project,
    cellAt: cellAt,
    order: order,
    pick: pick,
    sameHit: sameHit,
    viewFacing: viewFacing,
    frame: frame
  };
})();
