/*
 * Blocklayer — the toolbar: a column of pixel-art buttons that pan, turn and
 * zoom the view, show or hide its layers, and edit the selected tiles' shape,
 * facing, colour, decor and marks, and save, open or clear the level. A toggle
 * is pressed only when every selected tile carries its value, so a selection
 * that disagrees shows none pressed. The colour buttons pick the foreground
 * when no tile is selected. The direction buttons are a compass rose that does
 * not turn with the view. The DOM is built once; sync() sets every pressed and
 * disabled state from the app's state, and the two icons that follow it
 * (solid, facing), leaving an icon alone when it already shows the right
 * glyph. The elements, the icons and the words all come from parts.js.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};
  var P = B.parts;

  var HOLD_VAR = "--" + B.PREFIX + "hold";             // the fill animation's length
  var HOLDING_CLASS = "is-holding";
  var PRIMARY_BUTTON = 0;
  var HOLD_KEYS = [" ", "Enter"];
  var FILE_ACCEPT = ".json";
  var STILL_ROT = 0;                                   // a still mark is the same at every rotation

  var PAN_LABELS = { N: "North", E: "East", S: "South", W: "West" };
  var PAN_SLOTS = [null, "N", null, "W", null, "E", null, "S", null];
  var ARROW_SLOTS = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];

  var LAYER_BUTTONS = [
    { name: "elevation", title: "Elevation", icon: "layer-elev" },
    { name: "marks", title: "Marks", icon: "layer-marks" },
    { name: "decor", title: "Decor", icon: "layer-decor" }
  ];
  var FACING_LABEL = "Facing";
  var EITHER_KEY = "/";                                // between two keys in one title

  // A button's title: its label, then the key that does the same when
  // input.js binds one.
  function titled(label, key) {
    return key ? label + " (" + key + ")" : label;
  }

  function group(name) {
    var el = P.element("div", "group");
    el.setAttribute("data-group", name);
    return el;
  }

  function spacer() {
    var el = P.element("span", "spacer");
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  // data-act and data-arg are the hooks the driver and the tests find a button by.
  function button(act, arg, title, onClick) {
    var btn = P.element("button", "btn");
    btn.type = "button";
    btn.setAttribute("data-act", act);
    btn.setAttribute("data-arg", arg);
    btn.title = title;
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
  }

  function toggle(act, arg, title, onClick) {
    var btn = button(act, arg, title, onClick);
    btn.setAttribute("aria-pressed", "false");
    return btn;
  }

  function press(btn, on) {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // A toggle that edits the selection: enabled while it holds a tile, and
  // pressed while every tile in it carries the value.
  function syncToggle(btn, tiles, carries) {
    btn.disabled = !tiles.length;
    press(btn, tiles.length > 0 && tiles.every(carries));
  }

  function opaqueIcon(opaque) {
    return opaque ? "opaque" : "transparent";
  }

  function tileAt(state, cell) {
    return cell ? B.level.get(state.level, cell.x, cell.y) : null;
  }

  function selectedTiles(state) {
    var tiles = [];
    state.selection.forEach(function (cell) {
      var tile = tileAt(state, cell);
      if (tile) tiles.push(tile);
    });
    return tiles;
  }

  // The tile a button that shows one value reads: the one on the last cell the
  // selection took.
  function anchorTile(state) {
    return tileAt(state, state.selection[state.selection.length - 1]);
  }

  // A tile from before the colours carries none; it reads as the foreground.
  function colorOf(tile, foreground) {
    return tile.color || foreground;
  }

  // The colour every selected tile carries, the foreground while none is
  // selected, and nothing while they disagree.
  function shownColor(tiles, foreground) {
    var shown = tiles.length ? colorOf(tiles[0], foreground) : foreground;
    for (var i = 1; i < tiles.length; i++) {
      if (colorOf(tiles[i], foreground) !== shown) return null;
    }
    return shown;
  }

  function markByDir(dir) {
    return B.MARKS.filter(function (m) { return m.dir === dir; })[0];
  }

  function panGroup(handlers) {
    var el = group("pan");
    PAN_SLOTS.forEach(function (facing) {
      if (!facing) return el.appendChild(spacer());
      var title = titled(PAN_LABELS[facing], B.input.keyFor("pan", facing));
      var btn = button("pan", facing, title, function () { handlers.pan(facing); });
      btn.appendChild(P.arrowIcon(facing));
      el.appendChild(btn);
    });
    return el;
  }

  // A button that hands `run` its signed step; act is the handler's name too.
  function stepButton(act, step, label, glyph, run) {
    var title = titled(label, B.input.keyFor(act, step));
    var btn = button(act, step, title, function () { run(step); });
    btn.appendChild(P.icon(glyph));
    return btn;
  }

  function viewGroup(handlers) {
    var el = group("view");
    el.appendChild(stepButton("rotate", -1, "Turn left", "rotate-ccw", handlers.rotate));
    el.appendChild(stepButton("rotate", 1, "Turn right", "rotate-cw", handlers.rotate));
    el.appendChild(stepButton("zoom", -1, "Zoom out", "zoom-out", handlers.zoom));
    el.appendChild(stepButton("zoom", 1, "Zoom in", "zoom-in", handlers.zoom));
    return el;
  }

  function layersGroup(refs, handlers) {
    var el = group("layers");
    LAYER_BUTTONS.forEach(function (l) {
      var btn = toggle("layer", l.name, l.title, function () { handlers.toggleLayer(l.name); });
      btn.appendChild(P.icon(l.icon));
      refs.layers[l.name] = btn;
      el.appendChild(btn);
    });
    refs.opaque = toggle("opaque", "", "Solid", function () { handlers.toggleOpaque(); });
    refs.opaqueIcon = P.icon(opaqueIcon(true));
    refs.opaque.appendChild(refs.opaqueIcon);
    el.appendChild(refs.opaque);
    return el;
  }

  function shapeGroup(refs, handlers) {
    var el = group("shape");
    B.SHAPES.forEach(function (shape) {
      var title = titled(P.shapeLabel(shape), B.input.keyFor("setShape", shape));
      var btn = toggle("shape", shape, title, function () { handlers.setShape(shape); });
      btn.appendChild(P.icon("shape-" + shape));
      refs.shapes[shape] = btn;
      el.appendChild(btn);
    });
    var keyFor = B.input.keyFor;
    var turnKeys = keyFor("cycleFacing", -1) + EITHER_KEY + keyFor("cycleFacing", 1);
    refs.facing = button("facing", "", titled(FACING_LABEL, turnKeys), function () {
      handlers.cycleFacing();
    });
    refs.facingIcon = P.arrowIcon(B.FACINGS[0]);
    refs.facing.appendChild(refs.facingIcon);
    el.appendChild(refs.facing);
    return el;
  }

  // The palette, in order. A colour button is never disabled: with no tile
  // selected it picks the colour a new tile gets.
  function colorGroup(refs, handlers) {
    var el = group("color");
    var keyFor = B.input.keyFor;
    var step = B.input.CYCLE_COLOR;
    var stepKeys = keyFor(step, 1) + EITHER_KEY + keyFor(step, -1);
    B.PALETTE.forEach(function (entry) {
      var btn = toggle("color", entry.key, titled(entry.label, stepKeys), function () {
        handlers.setColor(entry.key);
      });
      P.image(btn, B.tiles.swatch(entry.key));
      refs.colors[entry.key] = btn;
      el.appendChild(btn);
    });
    return el;
  }

  function decorGroup(refs, handlers) {
    var el = group("decor");
    B.DECOR.forEach(function (d) {
      var title = titled(d.label, B.input.keyFor("setDecor", d.key));
      var btn = toggle("decor", d.key, title, function () { handlers.setDecor(d.key); });
      P.image(btn, B.decor.icon(d.key));
      refs.decor[d.key] = btn;
      el.appendChild(btn);
    });
    return el;
  }

  function marksGroup(refs, handlers) {
    var el = group("marks");
    var arrows = ARROW_SLOTS.map(function (dir) { return dir ? markByDir(dir) : null; });
    var others = B.MARKS.filter(function (m) { return !m.dir; });
    arrows.concat(others).forEach(function (m) {
      if (!m) return el.appendChild(spacer());
      var title = titled(m.label, B.input.keyFor("toggleMark", m.key));
      var btn = toggle("mark", m.key, title, function () { handlers.toggleMark(m.key); });
      if (m.dir) btn.appendChild(P.arrowIcon(m.dir));
      else P.image(btn, B.marks.sprite(m.key, STILL_ROT));
      refs.marks[m.key] = btn;
      el.appendChild(btn);
    });
    return el;
  }

  // The open button's picker, reset after each choice so the same file can be
  // chosen twice in a row.
  function filePicker(onOpen) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = FILE_ACCEPT;
    input.hidden = true;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.value = "";
      if (file) onOpen(file);
    });
    return input;
  }

  // The clear button has no click: it fires only after a full hold.
  function fileGroup(refs, handlers, picker) {
    var el = group("file");
    var save = button("save", "", "Save", function () { handlers.save(); });
    save.appendChild(P.icon("file-save"));
    el.appendChild(save);
    var open = button("open", "", "Open", function () { picker.click(); });
    open.appendChild(P.icon("file-open"));
    el.appendChild(open);
    refs.clear = button("clear", "", "Clear");
    refs.clear.appendChild(P.icon("clear"));
    el.appendChild(refs.clear);
    el.appendChild(picker);
    return el;
  }

  // A full hold, by pointer or by a held key, fires the clear.
  function attachHold(btn, onClear) {
    var timer = null;

    function start() {
      if (timer !== null) return;
      btn.classList.add(HOLDING_CLASS);
      timer = setTimeout(function () {
        timer = null;
        btn.classList.remove(HOLDING_CLASS);
        onClear();
      }, B.HOLD_MS);
    }

    function cancel() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      btn.classList.remove(HOLDING_CLASS);
    }

    btn.addEventListener("pointerdown", function (e) {
      if (e.button === PRIMARY_BUTTON) start();
    });
    btn.addEventListener("pointerup", cancel);
    btn.addEventListener("pointerleave", cancel);
    btn.addEventListener("pointercancel", cancel);
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    btn.addEventListener("keydown", function (e) {
      if (HOLD_KEYS.indexOf(e.key) < 0) return;
      e.preventDefault();
      if (!e.repeat) start();
    });
    btn.addEventListener("keyup", function (e) {
      if (HOLD_KEYS.indexOf(e.key) >= 0) cancel();
    });
    btn.addEventListener("blur", cancel);
  }

  function build(handlers) {
    var el = P.element("div", "toolbar");
    el.style.setProperty(HOLD_VAR, B.HOLD_MS + "ms");

    var refs = { layers: {}, shapes: {}, colors: {}, decor: {}, marks: {} };
    el.appendChild(panGroup(handlers));
    el.appendChild(viewGroup(handlers));
    el.appendChild(layersGroup(refs, handlers));
    el.appendChild(shapeGroup(refs, handlers));
    el.appendChild(colorGroup(refs, handlers));
    el.appendChild(decorGroup(refs, handlers));
    el.appendChild(marksGroup(refs, handlers));
    var picker = filePicker(function (file) { handlers.open(file); });
    el.appendChild(fileGroup(refs, handlers, picker));
    attachHold(refs.clear, function () { handlers.clear(); });

    function syncLayers(state) {
      LAYER_BUTTONS.forEach(function (l) {
        press(refs.layers[l.name], !!state.layers[l.name]);
      });
      press(refs.opaque, !!state.opaque);
      P.setGlyph(refs.opaqueIcon, opaqueIcon(state.opaque));
    }

    // One slope in the selection is enough to turn, and the arrow shows the
    // anchor's facing.
    function syncTiles(tiles, anchor) {
      B.SHAPES.forEach(function (shape) {
        syncToggle(refs.shapes[shape], tiles, function (tile) {
          return tile.shape === shape;
        });
      });
      refs.facing.disabled = !tiles.some(function (tile) { return B.level.sloped(tile); });
      P.setArrow(refs.facingIcon, anchor ? anchor.facing : B.FACINGS[0]);
      B.DECOR.forEach(function (d) {
        syncToggle(refs.decor[d.key], tiles, function (tile) {
          return tile.decor === d.key;
        });
      });
      B.MARKS.forEach(function (m) {
        syncToggle(refs.marks[m.key], tiles, function (tile) {
          return tile.marks.indexOf(m.key) >= 0;
        });
      });
    }

    function syncColors(shown) {
      B.PALETTE.forEach(function (entry) {
        press(refs.colors[entry.key], entry.key === shown);
      });
    }

    function sync(state) {
      var tiles = selectedTiles(state);
      syncLayers(state);
      syncTiles(tiles, anchorTile(state));
      syncColors(shownColor(tiles, state.color));
    }

    return { el: el, sync: sync };
  }

  B.toolbar = { build: build };
})();
