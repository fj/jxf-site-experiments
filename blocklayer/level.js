/*
 * Blocklayer — the level: tiles on an integer grid, each a column of blocks
 * with a shape, a facing, at most one decor object and a list of marks. Every
 * edit clamps or ignores what the rules forbid, and a level read back from
 * storage is validated one tile at a time. Pure data; nothing here draws.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var FORMAT_VERSION = 1;
  var DEFAULT_SHAPE = B.SHAPES[0];
  var DEFAULT_FACING = B.FACINGS[0];
  var SLOPED_SHAPES = ["ramp", "stairs"];      // their top is one block above elev
  var DECOR_KEYS = B.DECOR.map(function (d) { return d.key; });
  var MARK_KEYS = B.MARKS.map(function (m) { return m.key; });

  function create() {
    return { tiles: {} };
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

  function makeTile(x, y, elev) {
    return {
      x: x,
      y: y,
      elev: elev,
      shape: DEFAULT_SHAPE,
      facing: DEFAULT_FACING,
      decor: null,
      marks: []
    };
  }

  function add(level, x, y, elev) {
    var existing = get(level, x, y);
    if (existing) return existing;
    if (elev === undefined) elev = B.NEW_TILE_ELEV;
    var tile = makeTile(x, y, B.clamp(elev, B.ELEV_MIN, B.ELEV_MAX));
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

  function cycleFacing(level, x, y) {
    var tile = get(level, x, y);
    if (!tile) return null;
    var next = (B.FACINGS.indexOf(tile.facing) + 1) % B.FACINGS.length;
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
  function readTile(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!isInteger(raw.x) || !isInteger(raw.y) || !isInteger(raw.elev)) return null;
    if (raw.elev < B.ELEV_MIN || raw.elev > B.ELEV_MAX) return null;
    if (B.SHAPES.indexOf(raw.shape) < 0 || B.FACINGS.indexOf(raw.facing) < 0) return null;
    var decor = raw.decor === undefined ? null : raw.decor;
    if (decor !== null && DECOR_KEYS.indexOf(decor) < 0) return null;
    var tile = makeTile(raw.x, raw.y, raw.elev);
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
    key: key,
    get: get,
    all: all,
    count: count,
    add: add,
    remove: remove,
    clear: clear,
    top: top,
    maxElev: maxElev,
    raise: raise,
    setShape: setShape,
    setFacing: setFacing,
    cycleFacing: cycleFacing,
    setDecor: setDecor,
    toggleMark: toggleMark,
    toJSON: toJSON,
    fromJSON: fromJSON
  };
})();
