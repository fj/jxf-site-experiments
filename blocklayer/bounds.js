/*
 * Blocklayer — the board's bounds: the compact row under the canvas where the
 * reader sets the width and the height in tiles. A change reports the two
 * numbers to the app, which resizes the level; sync() then shows the size the
 * level really took, so a number the rules refused snaps back. The only
 * numbers the interface shows; the toolbar stays icons only.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var CTL_ATTR = "data-ctl";        // the hook the tests and the driver find a control by
  var TIMES = "×";             // between the width and the height
  var WHOLE_TILES = 1;              // the step a number input takes
  var DECIMAL = 10;

  var FIELDS = [
    { ctl: "width", label: "Width in tiles", of: function (size) { return size.w; } },
    { ctl: "height", label: "Height in tiles", of: function (size) { return size.h; } }
  ];

  var element = B.toolbar.element;

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

    el.appendChild(inputs[0]);
    el.appendChild(times());
    el.appendChild(inputs[1]);

    function commit() {
      handlers.resize(typed(inputs[0], shown.w), typed(inputs[1], shown.h));
    }

    inputs.forEach(function (input) { input.addEventListener("change", commit); });

    function sync(state) {
      shown = state.size;
      FIELDS.forEach(function (spec, i) { inputs[i].value = spec.of(shown); });
    }

    return { el: el, sync: sync };
  }

  function build(handlers) {
    var sizeRow = row(handlers);
    return {
      row: sizeRow.el,
      sync: function (state) { sizeRow.sync(state); }
    };
  }

  B.bounds = { build: build };
})();
