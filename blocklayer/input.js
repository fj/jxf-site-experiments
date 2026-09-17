/*
 * Blocklayer — the pointer, wheel and keyboard on the canvas, read as editing
 * gestures: click or drag over empty cells to add, click a tile to select it,
 * wheel over the selection to elevate it, hold the right button to remove.
 * Nothing here knows the level; every gesture ends in one of the handlers.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var PRIMARY_BUTTON = 0;
  var SECONDARY_BUTTON = 2;

  var PAN_KEYS = { ArrowUp: "N", ArrowRight: "E", ArrowDown: "S", ArrowLeft: "W" };
  var ROTATE_KEYS = { "[": -1, "]": 1 };
  var ZOOM_KEYS = { "-": -1, "=": 1, "+": 1 };
  var REMOVE_KEYS = ["Delete", "Backspace"];
  var DESELECT_KEY = "Escape";

  function own(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
  }

  function sameCell(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y;
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

    function addCell(cell) {
      lastCell = cell;
      handlers.add(cell.x, cell.y);
    }

    function endDrag() {
      dragging = false;
      lastCell = null;
    }

    function startHold(tile) {
      hold = { x: tile.x, y: tile.y, start: performance.now(), raf: 0 };
      handlers.hold(hold.x, hold.y, 0);
      hold.raf = requestAnimationFrame(tickHold);
    }

    function tickHold(now) {
      if (!hold) return;
      var progress = B.clamp((now - hold.start) / B.HOLD_MS, 0, 1);
      if (progress < 1) {
        handlers.hold(hold.x, hold.y, progress);
        hold.raf = requestAnimationFrame(tickHold);
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
      cancelAnimationFrame(held.raf);
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
        if (hit && hit.cell) addCell(hit.cell);
        else if (hit && hit.tile) handlers.select(hit.tile.x, hit.tile.y);
      } else if (hit && hit.tile) {
        startHold(hit.tile);
      }
    }

    function onMove(e) {
      var hit = pick(e);
      handlers.hover(hit);
      if (dragging && hit && hit.cell && !hit.edge && !sameCell(lastCell, hit.cell)) {
        addCell(hit.cell);
      }
      if (hold && !(hit && hit.tile && sameCell(hold, hit.tile))) cancelHold();
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
      if (!e.deltaY || !hit || !hit.tile || !sameCell(hit.tile, selected)) return;
      e.preventDefault();
      handlers.raise(e.deltaY < 0 ? 1 : -1);
      handlers.hover(pick(e));
    }

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var key = e.key;
      if (own(PAN_KEYS, key)) handlers.pan(PAN_KEYS[key]);
      else if (own(ROTATE_KEYS, key)) handlers.rotate(ROTATE_KEYS[key]);
      else if (own(ZOOM_KEYS, key)) handlers.zoom(ZOOM_KEYS[key]);
      else if (REMOVE_KEYS.indexOf(key) !== -1) removeSelected();
      else if (key === DESELECT_KEY) handlers.deselect();
      else return;
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
