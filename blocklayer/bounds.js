/*
 * Blocklayer — the board's bounds: the compact row under the canvas where the
 * reader sets the width and the height in tiles, and the modal over the canvas
 * that asks before a shrink drops the tiles outside the new board. A change
 * reports the two numbers to the app, which resizes the level or holds the
 * resize pending the reader's word; sync() then shows the size the level
 * really took, so a number the rules refused snaps back, and leaves what the
 * reader typed alone while the modal asks about it. The modal traps the
 * keyboard: Escape cancels, Enter goes ahead, and Tab stays inside. The only
 * numbers the interface shows; the toolbar stays icons only.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var CTL_ATTR = "data-ctl";        // the hook the tests and the driver find a control by
  var TIMES = "×";             // between the width and the height
  var WHOLE_TILES = 1;              // the step a number input takes
  var DECIMAL = 10;

  var CONFIRM_LABEL = "Resize";
  var CANCEL_LABEL = "Cancel";
  var ONE_TILE = 1;
  var LOSES_ONE = " tile falls outside the new board.";
  var LOSES_MANY = " tiles fall outside the new board.";
  var TEXT_ID = B.PREFIX + "resize-text";     // what names the dialog to a screen reader

  var ESCAPE_KEY = "Escape";
  var ENTER_KEY = "Enter";
  var TAB_KEY = "Tab";

  var FIELDS = [
    { ctl: "width", label: "Width in tiles", of: function (size) { return size.w; } },
    { ctl: "height", label: "Height in tiles", of: function (size) { return size.h; } }
  ];

  var element = B.parts.element;

  function field(spec) {
    var input = element("input", "size-input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = B.SIZE_MIN;
    input.max = B.SIZE_MAX;
    input.step = WHOLE_TILES;
    input.setAttribute(CTL_ATTR, spec.ctl);
    input.setAttribute("aria-label", spec.label);
    return input;
  }

  function times() {
    var el = element("span", "size-times");
    el.textContent = TIMES;
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  // What the reader left in the box, or `fallback` when it is no number.
  function typed(input, fallback) {
    var n = parseInt(input.value, DECIMAL);
    return isFinite(n) ? n : fallback;
  }

  function row(handlers) {
    var el = element("div", "size");
    var inputs = FIELDS.map(field);
    var shown = null;
    var touched = inputs[0];        // the box whose change asked for the resize

    el.appendChild(inputs[0]);
    el.appendChild(times());
    el.appendChild(inputs[1]);

    function commit(input) {
      touched = input;
      handlers.resize(typed(inputs[0], shown.w), typed(inputs[1], shown.h));
    }

    inputs.forEach(function (input) {
      input.addEventListener("change", function () { commit(input); });
    });

    function sync(state) {
      if (state.pending) return;    // the modal asks about what the reader typed
      shown = state.size;
      FIELDS.forEach(function (spec, i) { inputs[i].value = spec.of(shown); });
    }

    return {
      el: el,
      sync: sync,
      focus: function () { touched.focus(); }
    };
  }

  function dialogButton(ctl, label, onClick) {
    var btn = element("button", "modal-btn");
    btn.type = "button";
    btn.setAttribute(CTL_ATTR, ctl);
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  // What a shrink would cost, in one sentence.
  function warning(lost) {
    return lost + (lost === ONE_TILE ? LOSES_ONE : LOSES_MANY);
  }

  // The question a lossy shrink asks. `done` takes the focus back once the
  // modal is answered, so the keyboard never lands outside the interface.
  function modal(handlers, done) {
    var el = element("div", "modal");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", TEXT_ID);
    el.hidden = true;

    var box = element("div", "modal-box");
    var text = element("p", "modal-text");
    text.id = TEXT_ID;
    var buttons = element("div", "modal-buttons");
    var cancel = dialogButton("cancel", CANCEL_LABEL, function () {
      handlers.cancelResize();
    });
    var confirm = dialogButton("confirm", CONFIRM_LABEL, function () {
      handlers.confirmResize();
    });
    buttons.appendChild(cancel);
    buttons.appendChild(confirm);
    box.appendChild(text);
    box.appendChild(buttons);
    el.appendChild(box);

    var order = [cancel, confirm];
    var at = 0;

    function focusAt(i) {
      at = i;
      order[i].focus();
    }

    function stepFocus(delta) {
      var n = order.length;
      focusAt((((at + delta) % n) + n) % n);
    }

    order.forEach(function (btn, i) {
      btn.addEventListener("focus", function () { at = i; });
    });

    el.addEventListener("keydown", function (e) {
      if (e.key === ESCAPE_KEY) handlers.cancelResize();
      else if (e.key === ENTER_KEY) handlers.confirmResize();
      else if (e.key === TAB_KEY) stepFocus(e.shiftKey ? -1 : 1);
      else return;
      e.preventDefault();
    });

    function sync(state) {
      if (!state.pending) {
        if (el.hidden) return;
        el.hidden = true;
        done();
        return;
      }
      text.textContent = warning(state.pending.lost);
      if (!el.hidden) return;
      el.hidden = false;
      focusAt(order.indexOf(confirm));
    }

    return { el: el, sync: sync };
  }

  function build(handlers) {
    var sizeRow = row(handlers);
    var asking = modal(handlers, sizeRow.focus);
    return {
      row: sizeRow.el,
      modal: asking.el,
      sync: function (state) {
        sizeRow.sync(state);
        asking.sync(state);
      }
    };
  }

  B.bounds = { build: build };
})();
