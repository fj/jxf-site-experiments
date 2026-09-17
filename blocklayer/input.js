/*
 * Blocklayer — the pointer, wheel and keyboard on the canvas, read as editing
 * gestures: click or drag over empty cells to add, click a tile to select it,
 * wheel over the selection to elevate it, hold the right button to remove,
 * and keys that move the view, move the level, or edit the selected tile.
 * Nothing here knows the level; every gesture ends in one of the handlers.
 * keyFor() names the key bound to a handler call, for the toolbar's tooltips.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var PRIMARY_BUTTON = 0;
  var SECONDARY_BUTTON = 2;

  // Each key names the handler it calls and what it passes. The view keys go
  // by e.key, the tile keys by its lowercase form, and each tile key needs a
  // selected tile.
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

  var TILE_KEYS = {
    w: ["raise", 1],
    s: ["raise", -1],
    a: ["cycleFacing", -1],
    d: ["cycleFacing", 1],
    b: ["setShape", "block"],
    r: ["setShape", "ramp"],
    t: ["setShape", "stairs"],
    p: ["toggleMark", "teleport"],
    l: ["toggleMark", "rope"],
    // Y to the comma are a compass rose under the right hand, around the J
    // that marks a jump; each of the eight toggles an arrow.
    y: ["toggleMark", "arrow-nw"],
    u: ["toggleMark", "arrow-n"],
    i: ["toggleMark", "arrow-ne"],
    h: ["toggleMark", "arrow-w"],
    j: ["toggleMark", "jump"],
    k: ["toggleMark", "arrow-e"],
    n: ["toggleMark", "arrow-sw"],
    m: ["toggleMark", "arrow-s"],
    ",": ["toggleMark", "arrow-se"]
  };

  // 1 to 5 toggle the decor, in toolbar order.
  B.DECOR.forEach(function (d, i) { TILE_KEYS[String(i + 1)] = ["setDecor", d.key]; });

  // Shift makes the elevation keys act on every tile at once; no other key
  // does anything with Shift held.
  var SHIFT_LEVEL_KEYS = {
    w: ["raiseAll", 1],
    s: ["raiseAll", -1]
  };

  var REMOVE_KEYS = ["Delete", "Backspace"];      // swallowed even with no selection
  var REMOVE_SELECTED_KEY = "x";                  // ...and this one only with one
  var ARROW_KEY = "Arrow";                        // what an arrow key's e.key starts with
  var SHIFT_NAME = "Shift+";

  function boundKey(table, handler, arg) {
    var keys = Object.keys(table);
    for (var i = 0; i < keys.length; i++) {
      var action = table[keys[i]];
      if (action[0] === handler && action[1] === arg) return keys[i];
    }
    return null;
  }

  // A letter in upper case; an arrow key by its direction; the rest as typed.
  function keyName(key) {
    if (key.indexOf(ARROW_KEY) === 0) return key.slice(ARROW_KEY.length);
    return key.length === 1 ? key.toUpperCase() : key;
  }

  // The key bound to a handler call, as a tooltip names it: "R", "]", "Up",
  // "Shift+W"; null when none is.
  function keyFor(handler, arg) {
    var key = boundKey(VIEW_KEYS, handler, arg) || boundKey(TILE_KEYS, handler, arg);
    if (key) return keyName(key);
    key = boundKey(SHIFT_LEVEL_KEYS, handler, arg);
    return key ? SHIFT_NAME + keyName(key) : null;
  }

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

    // Whether there was an action to run.
    function run(action) {
      if (!action) return false;
      call(action);
      return true;
    }

    // Whether the key edited the level or the selected tile.
    function edit(e) {
      var key = e.key.toLowerCase();
      if (e.shiftKey) return run(SHIFT_LEVEL_KEYS[key]);
      if (!handlers.selected()) return false;
      if (TILE_KEYS[key]) return run(TILE_KEYS[key]);
      if (key !== REMOVE_SELECTED_KEY) return false;
      removeSelected();
      return true;
    }

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var view = VIEW_KEYS[e.key];
      if (view) call(view);
      else if (REMOVE_KEYS.indexOf(e.key) !== -1) removeSelected();
      else if (!edit(e)) return;
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

  B.input = { attach: attach, keyFor: keyFor };
})();
