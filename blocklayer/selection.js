/*
 * Blocklayer — the selection: which cells are chosen, and what joining,
 * toggling or leaving makes of them. Every answer is a list of its own, so one
 * handed out stays whole while the level is edited under it, and an operation
 * that changes nothing answers the very list it was given. holds() is the one
 * reader of a selection, which the renderer and the pointer ask as well.
 * Cells only; nothing here reads a tile's fields or the page.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  // The selection holds cells, never the tiles themselves, which an edit or a
  // removal could leave behind.
  function cell(x, y) {
    return { x: x, y: y };
  }

  // Whether a list of cells, or of the tiles standing on them, holds (x, y).
  function holds(cells, x, y) {
    return cells.some(function (at) { return B.sameCell(at, x, y); });
  }

  function only(x, y) {
    return [cell(x, y)];
  }

  // Those tiles or cells join the list; the ones it already holds keep their
  // place, and a cell named twice joins once.
  function add(cells, joining) {
    var next = cells.slice();
    joining.forEach(function (at) {
      if (!holds(next, at.x, at.y)) next.push(cell(at.x, at.y));
    });
    return next.length === cells.length ? cells : next;
  }

  function remove(cells, x, y) {
    if (!holds(cells, x, y)) return cells;
    return cells.filter(function (at) { return !B.sameCell(at, x, y); });
  }

  // The cell joins as the newest of the list, or leaves it.
  function toggle(cells, x, y) {
    return holds(cells, x, y) ? remove(cells, x, y) : cells.concat(only(x, y));
  }

  B.selection = {
    holds: holds,
    only: only,
    add: add,
    remove: remove,
    toggle: toggle
  };
})();
