/*
 * Blocklayer — the level: a board of a stated size, holding a tile at some of
 * its cells, each a column of blocks with a colour, a shape, a facing, at most
 * one decor object and a list of marks. Every edit clamps or ignores what the
 * rules forbid, and a level read back from storage is validated one tile at a
 * time. Pure data; nothing here draws.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var FORMAT_VERSION = 2;                      // version 1 gave a tile no colour
  var DEFAULT_SHAPE = B.SHAPES[0];
  var DEFAULT_FACING = B.FACINGS[0];
  var SLOPED_SHAPES = ["ramp", "stairs"];      // their top is one block above elev
  var COLOR_KEYS = B.PALETTE.map(function (c) { return c.key; });
  var DECOR_KEYS = B.DECOR.map(function (d) { return d.key; });
  var MARK_KEYS = B.MARKS.map(function (m) { return m.key; });

  function clampSide(n, fallback) {
    if (typeof n !== "number" || !isFinite(n)) n = fallback;
    return B.clamp(Math.round(n), B.SIZE_MIN, B.SIZE_MAX);
  }

  function makeSize(w, h) {
    return { w: clampSide(w, B.SIZE_DEFAULT.w), h: clampSide(h, B.SIZE_DEFAULT.h) };
  }

  function create(w, h) {
    return { size: makeSize(w, h), tiles: {} };
  }

  function onBoard(size, x, y) {
    return x >= 0 && y >= 0 && x < size.w && y < size.h;
  }

  function inside(level, x, y) {
    return onBoard(level.size, x, y);
  }

  function key(x, y) {
    return x + "," + y;
  }

  function get(level, x, y) {
    return level.tiles[key(x, y)] || null;
  }

  function all(level) {
    return Object.keys(level.tiles).map(function (k) { return level.tiles[k]; });
  }

  function count(level) {
    return Object.keys(level.tiles).length;
  }

  function makeTile(x, y, elev, color) {
    return {
      x: x,
      y: y,
      elev: elev,
      color: color,
      shape: DEFAULT_SHAPE,
      facing: DEFAULT_FACING,
      decor: null,
      marks: []
    };
  }

  function knownColor(color) {
    return COLOR_KEYS.indexOf(color) >= 0;
  }

  function add(level, x, y, elev, color) {
    var existing = get(level, x, y);
    if (existing) return existing;
    if (!inside(level, x, y)) return null;
    if (elev === undefined) elev = B.NEW_TILE_ELEV;
    if (!knownColor(color)) color = B.DEFAULT_COLOR;
    var tile = makeTile(x, y, B.clamp(elev, B.ELEV_MIN, B.ELEV_MAX), color);
    level.tiles[key(x, y)] = tile;
    return tile;
  }

  function remove(level, x, y) {
    var k = key(x, y);
    if (!level.tiles[k]) return false;
    delete level.tiles[k];
    return true;
  }

  function clear(level) {
    level.tiles = {};
  }

  function sloped(tile) {
    return SLOPED_SHAPES.indexOf(tile.shape) >= 0;
  }

  function top(tile) {
    return tile.elev + (sloped(tile) ? 1 : 0);
  }

  function maxElev(tile) {
    return B.ELEV_MAX - (sloped(tile) ? 1 : 0);
  }

  function raise(level, x, y, delta) {
    var tile = get(level, x, y);
    if (!tile) return null;
    tile.elev = B.clamp(tile.elev + delta, B.ELEV_MIN, maxElev(tile));
    return tile.elev;
  }

  function canRaise(tile, delta) {
    var elev = tile.elev + delta;
    return elev >= B.ELEV_MIN && elev <= maxElev(tile);
  }

  // The tiles standing at those cells, each one once. A cell with no tile, and
  // a cell named a second time, is passed over.
  function tilesAt(level, cells) {
    var seen = {};
    var tiles = [];
    cells.forEach(function (cell) {
      var k = key(cell.x, cell.y);
      if (seen[k]) return;
      seen[k] = true;
      var tile = get(level, cell.x, cell.y);
      if (tile) tiles.push(tile);
    });
    return tiles;
  }

  // Every one of those tiles takes the step or none does, so the group keeps
  // its shape. Answers whether it moved.
  function raiseCells(level, cells, delta) {
    var tiles = tilesAt(level, cells);
    if (!tiles.length) return false;
    for (var i = 0; i < tiles.length; i++) {
      if (!canRaise(tiles[i], delta)) return false;
    }
    tiles.forEach(function (tile) { tile.elev += delta; });
    return true;
  }

  function raiseAll(level, delta) {
    return raiseCells(level, all(level), delta);
  }

  function setColor(level, x, y, color) {
    var tile = get(level, x, y);
    if (!tile) return null;
    if (knownColor(color)) tile.color = color;
    return tile.color;
  }

  function setShape(level, x, y, shape) {
    var tile = get(level, x, y);
    if (tile && B.SHAPES.indexOf(shape) >= 0) {
      tile.shape = shape;
      tile.elev = Math.min(tile.elev, maxElev(tile));
    }
    return tile;
  }

  function setFacing(level, x, y, facing) {
    var tile = get(level, x, y);
    if (!tile) return null;
    if (B.FACINGS.indexOf(facing) >= 0) tile.facing = facing;
    return tile.facing;
  }

  // step quarter turns clockwise (N, E, S, W); negative turns the other way.
  function cycleFacing(level, x, y, step) {
    var tile = get(level, x, y);
    if (!tile) return null;
    if (step === undefined) step = 1;
    var n = B.FACINGS.length;
    var next = (((B.FACINGS.indexOf(tile.facing) + step) % n) + n) % n;
    return setFacing(level, x, y, B.FACINGS[next]);
  }

  function setDecor(level, x, y, decor) {
    var tile = get(level, x, y);
    if (!tile) return null;
    if (decor === null || decor === tile.decor) tile.decor = null;
    else if (DECOR_KEYS.indexOf(decor) >= 0) tile.decor = decor;
    return tile.decor;
  }

  function toggleMark(level, x, y, mark) {
    var tile = get(level, x, y);
    if (!tile || MARK_KEYS.indexOf(mark) < 0) return false;
    var at = tile.marks.indexOf(mark);
    if (at < 0) tile.marks.push(mark);
    else tile.marks.splice(at, 1);
    return at < 0;
  }

  function byRowThenColumn(a, b) {
    return a.y - b.y || a.x - b.x;
  }

  function toJSON(level) {
    var tiles = all(level).sort(byRowThenColumn).map(function (t) {
      return {
        x: t.x,
        y: t.y,
        elev: t.elev,
        color: t.color,
        shape: t.shape,
        facing: t.facing,
        decor: t.decor,
        marks: t.marks.slice()
      };
    });
    return { version: FORMAT_VERSION, tiles: tiles };
  }

  function isInteger(n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n;
  }

  function readMarks(raw) {
    var marks = [];
    if (!Array.isArray(raw)) return marks;
    raw.forEach(function (mark) {
      if (MARK_KEYS.indexOf(mark) >= 0 && marks.indexOf(mark) < 0) marks.push(mark);
    });
    return marks;
  }

  // A tile from untrusted data, or null when any field but the marks is bad.
  // A file of version 1 names no colour, so a missing one reads as the default.
  function readTile(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!isInteger(raw.x) || !isInteger(raw.y) || !isInteger(raw.elev)) return null;
    if (raw.elev < B.ELEV_MIN || raw.elev > B.ELEV_MAX) return null;
    if (B.SHAPES.indexOf(raw.shape) < 0 || B.FACINGS.indexOf(raw.facing) < 0) return null;
    var color = raw.color === undefined ? B.DEFAULT_COLOR : raw.color;
    if (!knownColor(color)) return null;
    var decor = raw.decor === undefined ? null : raw.decor;
    if (decor !== null && DECOR_KEYS.indexOf(decor) < 0) return null;
    var tile = makeTile(raw.x, raw.y, raw.elev, color);
    tile.shape = raw.shape;
    tile.elev = Math.min(raw.elev, maxElev(tile));
    tile.facing = raw.facing;
    tile.decor = decor;
    tile.marks = readMarks(raw.marks);
    return tile;
  }

  function fromJSON(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.tiles)) return null;
    var level = create();
    data.tiles.forEach(function (raw) {
      var tile = readTile(raw);
      if (tile && !get(level, tile.x, tile.y)) level.tiles[key(tile.x, tile.y)] = tile;
    });
    return level;
  }

  B.level = {
    create: create,
    inside: inside,
    key: key,
    get: get,
    all: all,
    count: count,
    add: add,
    remove: remove,
    clear: clear,
    sloped: sloped,
    top: top,
    maxElev: maxElev,
    raise: raise,
    raiseCells: raiseCells,
    raiseAll: raiseAll,
    setColor: setColor,
    setShape: setShape,
    setFacing: setFacing,
    cycleFacing: cycleFacing,
    setDecor: setDecor,
    toggleMark: toggleMark,
    toJSON: toJSON,
    fromJSON: fromJSON
  };
})();
