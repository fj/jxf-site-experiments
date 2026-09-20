/*
 * Blocklayer — the pointer, wheel and keyboard on the canvas, read as editing
 * gestures: click or drag over empty cells to add, click a tile to select it,
 * Ctrl or Cmd with a click to toggle a tile in the selection, Shift with a
 * drag to sweep every tile in a box into it, wheel over the selection to
 * elevate it, hold the right button to remove, press the right button off the
 * selection to deselect, and keys that move the view, move the level, step the
 * foreground colour, or edit the selection.
 * Nothing here knows the level; every gesture ends in one of the handlers.
 * Every hover reports what is under the pointer, whether Alt is held and where
 * the pointer is, and Alt coming or going picks the same point again, so what
 * reads the hover follows the key without a move.
 * keyFor() names the key bound to a handler call, for the toolbar's tooltips.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var PRIMARY_BUTTON = 0;
  var SECONDARY_BUTTON = 2;

  // Each key names the handler it calls and what it passes. The view keys go
  // by e.key and the rest by its lowercase form. A level key acts whatever is
  // selected; a tile key needs a selection.
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

  // The elevation keys raise and lower the selection, or the height a new tile
  // gets when nothing is selected.
  var LEVEL_KEYS = {
    w: ["raise", 1],
    s: ["raise", -1]
  };

  var CYCLE_COLOR = "cycleColor";   // the step input.js turns into a setColor

  // C steps the foreground colour on through the palette and Shift+C steps it
  // back, each ending in the setColor a swatch click makes.
  var COLOR_KEYS = {
    c: [CYCLE_COLOR, 1]
  };

  var TILE_KEYS = {
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

  // 1 to 6 toggle the decor, in toolbar order.
  B.DECOR.forEach(function (d, i) { TILE_KEYS[String(i + 1)] = ["setDecor", d.key]; });

  // Shift makes the elevation keys act on every tile at once.
  var SHIFT_LEVEL_KEYS = {
    w: ["raiseAll", 1],
    s: ["raiseAll", -1]
  };

  var SHIFT_COLOR_KEYS = {
    c: [CYCLE_COLOR, -1]
  };

  var REMOVE_KEYS = ["Delete", "Backspace"];      // swallowed even with no selection
  var REMOVE_SELECTED_KEY = "x";                  // ...and this one only with one
  var ARROW_KEY = "Arrow";                        // what an arrow key's e.key starts with
  var SHIFT_NAME = "Shift+";
  var NO_SCROLL = { preventScroll: true };        // how the canvas takes focus

  function boundKey(table, handler, arg) {
    var keys = Object.keys(table);
    for (var i = 0; i < keys.length; i++) {
      var action = table[keys[i]];
      if (action[0] === handler && action[1] === arg) return keys[i];
    }
    return null;
  }

  // The palette key `step` places on from `from`, wrapping at each end.
  function steppedColor(from, step) {
    var keys = B.PALETTE.map(function (entry) { return entry.key; });
    var n = keys.length;
    return keys[(((keys.indexOf(from) + step) % n) + n) % n];
  }

  // A letter in upper case; an arrow key by its direction; the rest as typed.
  function keyName(key) {
    if (key.indexOf(ARROW_KEY) === 0) return key.slice(ARROW_KEY.length);
    return key.length === 1 ? key.toUpperCase() : key;
  }

  // The key bound to a handler call, as a tooltip names it: "R", "]", "Up",
  // "Shift+W"; null when none is.
  function keyFor(handler, arg) {
    var key = boundKey(VIEW_KEYS, handler, arg) ||
      boundKey(LEVEL_KEYS, handler, arg) ||
      boundKey(COLOR_KEYS, handler, arg) ||
      boundKey(TILE_KEYS, handler, arg);
    if (key) return keyName(key);
    key = boundKey(SHIFT_LEVEL_KEYS, handler, arg) ||
      boundKey(SHIFT_COLOR_KEYS, handler, arg);
    return key ? SHIFT_NAME + keyName(key) : null;
  }

  function attach(canvas, handlers) {
    var dragging = false;
    var lastCell = null;
    var hold = null;
    var sweep = null;       // where a shift drag began, in client space
    var alt = false;
    var last = null;        // where the pointer was, in client space

    // Every hover reports the same three things beside the hit: whether Alt is
    // held and where the pointer is.
    function report(hit, x, y) {
      handlers.hover(hit, alt, x, y);
    }

    // Each pointer event carries the key's state, so Alt held before the
    // pointer arrives counts as held.
    function hover(hit, e) {
      alt = !!e.altKey;
      last = { clientX: e.clientX, clientY: e.clientY };
      report(hit, e.clientX, e.clientY);
    }

    // The pointer has left: nothing is under it, and no place to look again.
    function hoverNothing(e) {
      alt = !!e.altKey;
      last = null;
      report(null, e.clientX, e.clientY);
    }

    // Alt comes and goes with the pointer still. What is under the pointer is
    // picked afresh, so an edit between the two reports cannot leave a stale
    // hit behind.
    function trackAlt(e) {
      if (!!e.altKey === alt) return;
      alt = !!e.altKey;
      if (last) report(pick(last), last.clientX, last.clientY);
    }

    // The page has lost the keyboard, so the key is no longer held whatever
    // the reader does next.
    function dropAlt() {
      trackAlt({ altKey: false });
    }

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

    // The copy outlives the removals, which take each cell out of the
    // selection as they go.
    function removeSelected() {
      handlers.selection().slice().forEach(function (cell) {
        handlers.remove(cell.x, cell.y);
      });
    }

    // The selection survives a right button only on a tile it holds.
    function dropSelection(tile) {
      var cells = handlers.selection();
      if (!cells.length) return;
      if (tile && B.selection.holds(cells, tile.x, tile.y)) return;
      handlers.deselect();
    }

    // The box the sweep covers so far, from the press to the pointer. Both
    // box() and selectBox() take the two corners in client space, as the
    // pointer gives them, and in that order.
    function trackSweep(e) {
      handlers.box(sweep.x, sweep.y, e.clientX, e.clientY);
    }

    // Takes the box off the canvas and answers where the sweep began.
    function clearSweep() {
      var from = sweep;
      sweep = null;
      if (from) handlers.box(null);
      return from;
    }

    // A release inside the canvas sweeps every tile in the box into the
    // selection; one outside it selects nothing.
    function endSweep(e) {
      var from = clearSweep();
      if (from && inside(e)) handlers.selectBox(from.x, from.y, e.clientX, e.clientY);
    }

    // Ctrl, or Cmd on a Mac, makes a press toggle the tile under it in the
    // selection. Over an empty cell it does nothing at all, so a press that
    // builds a selection can never lay a tile by accident. Shift makes the
    // press sweep a box instead, which lays no tiles either.
    function leftDown(e, hit) {
      var tile = hit && hit.tile;
      if (e.ctrlKey || e.metaKey) {
        if (tile) handlers.toggleSelect(tile.x, tile.y);
        return;
      }
      if (e.shiftKey) {
        sweep = { x: e.clientX, y: e.clientY };
        return;
      }
      dragging = true;
      lastCell = null;
      if (hit && hit.cell) hover(addCell(e, hit.cell), e);
      else if (tile) handlers.select(tile.x, tile.y);
    }

    function onDown(e) {
      if (e.button !== PRIMARY_BUTTON && e.button !== SECONDARY_BUTTON) return;
      e.preventDefault();
      // Focus scrolls the canvas into view unless it is told not to, which
      // would move the page under the press and pick the wrong cell.
      canvas.focus(NO_SCROLL);
      canvas.setPointerCapture(e.pointerId);
      var hit = pick(e);
      if (e.button === PRIMARY_BUTTON) {
        leftDown(e, hit);
        return;
      }
      var tile = hit && hit.tile;
      dropSelection(tile);
      if (tile) startHold(tile);
    }

    function onMove(e) {
      if (sweep) trackSweep(e);
      var hit = pick(e);
      var cell = hit && hit.cell;
      var tile = hit && hit.tile;
      if (dragging && cell && !hit.edge && !B.sameCell(lastCell, cell.x, cell.y)) {
        hit = addCell(e, cell);
      }
      hover(hit, e);
      if (hold && !(tile && B.sameCell(hold, tile.x, tile.y))) cancelHold();
    }

    function onUp(e) {
      if (e.button === PRIMARY_BUTTON) {
        endDrag();
        endSweep(e);
      }
      if (e.button === SECONDARY_BUTTON) cancelHold();
    }

    function onCancel() {
      endDrag();
      clearSweep();
      cancelHold();
    }

    function onLeave(e) {
      cancelHold();
      hoverNothing(e);
    }

    function onWheel(e) {
      var hit = pick(e);
      if (!e.deltaY || !hit || !hit.tile) return;
      if (!B.selection.holds(handlers.selection(), hit.tile.x, hit.tile.y)) return;
      e.preventDefault();
      handlers.raise(e.deltaY < 0 ? 1 : -1);
      hover(pick(e), e);
    }

    // A colour step resolves into the setColor call a swatch click makes: it
    // reads the foreground back and paints with the palette key beside it.
    function colorAction(action) {
      return action && ["setColor", steppedColor(handlers.color(), action[1])];
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
      if (e.shiftKey) return run(SHIFT_LEVEL_KEYS[key] || colorAction(SHIFT_COLOR_KEYS[key]));
      if (run(LEVEL_KEYS[key] || colorAction(COLOR_KEYS[key]))) return true;
      if (!handlers.selection().length) return false;
      if (TILE_KEYS[key]) return run(TILE_KEYS[key]);
      if (key !== REMOVE_SELECTED_KEY) return false;
      removeSelected();
      return true;
    }

    function onKey(e) {
      trackAlt(e);
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
    // Alt is watched on the window, not the canvas: the reader may never have
    // clicked the picture, and a page that loses focus never sees the key go.
    window.addEventListener("keydown", trackAlt);
    window.addEventListener("keyup", trackAlt);
    window.addEventListener("blur", dropAlt);
  }

  B.input = { attach: attach, keyFor: keyFor, CYCLE_COLOR: CYCLE_COLOR };
})();
