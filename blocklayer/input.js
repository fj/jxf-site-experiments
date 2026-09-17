/*
 * Blocklayer — the pointer, wheel and keyboard on the canvas, read as editing
 * gestures: click or drag over empty cells to add, click a tile to select it,
 * wheel over the selection to elevate it, hold the right button to remove,
 * and keys that move the view or edit the selected tile. Nothing here knows
 * the level; every gesture ends in one of the handlers.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var PRIMARY_BUTTON = 0;
  var SECONDARY_BUTTON = 2;

  // Each key names the handler it calls and what it passes.
  var VIEW_KEYS = {
    ArrowUp: ["pan", "N"],
    ArrowRight: ["pan", "E"],
    ArrowDown: ["pan", "S"],
    ArrowLeft: ["pan", "W"],
    "[": ["rotate", -1],
    "]": ["rotate", 1],
    "-": ["zoom", -1],
    "=": ["zoom", 1],
    "+": ["zoom", 1],
    Escape: ["deselect"]
  };

  // By lowercase key, without Shift; each needs a selected tile. remove is
  // handed the tile's cell, the rest find it themselves.
  var TILE_KEYS = {
    w: ["raise", 1],
    s: ["raise", -1],
    a: ["cycleFacing", -1],
    d: ["cycleFacing", 1],
    b: ["setShape", "block"],
    r: ["setShape", "ramp"],
    t: ["setShape", "stairs"],
    "1": ["setDecor", "chest"],
    "2": ["setDecor", "rock"],
    "3": ["setDecor", "crystal-blue"],
    "4": ["setDecor", "crystal-yellow"],
    "5": ["setDecor", "crystal-red"],
    p: ["toggleMark", "teleport"],
    l: ["toggleMark", "rope"],
    j: ["toggleMark", "jump"],
    x: ["remove"]
  };

  // With Shift, the keys around S mirror the compass; each toggles an arrow.
  var SHIFT_MARK_KEYS = {
    q: "arrow-nw", w: "arrow-n", e: "arrow-ne",
    a: "arrow-w", d: "arrow-e",
    z: "arrow-sw", s: "arrow-s", c: "arrow-se"
  };

  var REMOVE_KEYS = ["Delete", "Backspace"];      // swallowed even with no selection
  var REMOVE = "remove";

  function attach(canvas, handlers) {
    var dragging = false;
    var lastCell = null;
    var hold = null;

    function inside(e) {
      var rect = canvas.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX < rect.right &&
        e.clientY >= rect.top && e.clientY < rect.bottom;
    }

    function pick(e) {
      return inside(e) ? handlers.pick(e.clientX, e.clientY) : null;
    }

    // Adds the cell, then answers what is under the pointer now: the new tile.
    function addCell(e, cell) {
      lastCell = cell;
      handlers.add(cell.x, cell.y);
      return pick(e);
    }

    function endDrag() {
      dragging = false;
      lastCell = null;
    }

    function startHold(tile) {
      hold = { x: tile.x, y: tile.y, start: window.performance.now(), raf: 0 };
      handlers.hold(hold.x, hold.y, 0);
      hold.raf = window.requestAnimationFrame(tickHold);
    }

    function tickHold(now) {
      if (!hold) return;
      var progress = B.clamp((now - hold.start) / B.HOLD_MS, 0, 1);
      if (progress < 1) {
        handlers.hold(hold.x, hold.y, progress);
        hold.raf = window.requestAnimationFrame(tickHold);
        return;
      }
      var held = hold;
      hold = null;
      handlers.remove(held.x, held.y);
      handlers.hold(held.x, held.y, null);
    }

    function cancelHold() {
      if (!hold) return;
      var held = hold;
      hold = null;
      window.cancelAnimationFrame(held.raf);
      handlers.hold(held.x, held.y, null);
    }

    function removeSelected() {
      var selected = handlers.selected();
      if (selected) handlers.remove(selected.x, selected.y);
    }

    function onDown(e) {
      if (e.button !== PRIMARY_BUTTON && e.button !== SECONDARY_BUTTON) return;
      e.preventDefault();
      canvas.focus();
      canvas.setPointerCapture(e.pointerId);
      var hit = pick(e);
      if (e.button === PRIMARY_BUTTON) {
        dragging = true;
        lastCell = null;
        if (hit && hit.cell) handlers.hover(addCell(e, hit.cell));
        else if (hit && hit.tile) handlers.select(hit.tile.x, hit.tile.y);
      } else if (hit && hit.tile) {
        startHold(hit.tile);
      }
    }

    function onMove(e) {
      var hit = pick(e);
      var cell = hit && hit.cell;
      var tile = hit && hit.tile;
      if (dragging && cell && !hit.edge && !B.sameCell(lastCell, cell.x, cell.y)) {
        hit = addCell(e, cell);
      }
      handlers.hover(hit);
      if (hold && !(tile && B.sameCell(hold, tile.x, tile.y))) cancelHold();
    }

    function onUp(e) {
      if (e.button === PRIMARY_BUTTON) endDrag();
      if (e.button === SECONDARY_BUTTON) cancelHold();
    }

    function onCancel() {
      endDrag();
      cancelHold();
    }

    function onLeave() {
      cancelHold();
      handlers.hover(null);
    }

    function onWheel(e) {
      var hit = pick(e);
      var selected = handlers.selected();
      if (!e.deltaY || !hit || !hit.tile || !B.sameCell(selected, hit.tile.x, hit.tile.y)) return;
      e.preventDefault();
      handlers.raise(e.deltaY < 0 ? 1 : -1);
      handlers.hover(pick(e));
    }

    function call(action) {
      handlers[action[0]].apply(null, action.slice(1));
    }

    // Whether the key edited the selected tile.
    function editSelected(e) {
      var selected = handlers.selected();
      if (!selected) return false;
      var key = e.key.toLowerCase();
      var mark = e.shiftKey ? SHIFT_MARK_KEYS[key] : null;
      var action = e.shiftKey ? null : TILE_KEYS[key];
      if (mark) handlers.toggleMark(mark);
      else if (action && action[0] === REMOVE) handlers.remove(selected.x, selected.y);
      else if (action) call(action);
      else return false;
      return true;
    }

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var view = VIEW_KEYS[e.key];
      if (view) call(view);
      else if (REMOVE_KEYS.indexOf(e.key) !== -1) removeSelected();
      else if (!editSelected(e)) return;
      e.preventDefault();
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  B.input = { attach: attach };
})();
