/*
 * Blocklayer — the toolbar: a column of pixel-art buttons that pan, turn and
 * zoom the view, show or hide its layers, and edit the selected tile's shape,
 * facing, decor and marks, and save, open or clear the level. The direction
 * buttons are a compass rose that does not turn with the view. The DOM is
 * built once; sync() sets every pressed and disabled state from the app's
 * state, and the two icons that follow it (solid, facing), leaving an icon
 * alone when it already shows the right glyph. element() and icon() lend the
 * toolbar's builders to the rest of the interface.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var ICON_SCALE = 2;                                  // CSS px per sprite px
  var HOLD_VAR = "--" + B.PREFIX + "hold";             // the fill animation's length
  var HOLDING_CLASS = "is-holding";
  var PRIMARY_BUTTON = 0;
  var HOLD_KEYS = [" ", "Enter"];
  var FILE_ACCEPT = ".json";
  var STILL_ROT = 0;                                   // a still mark is the same at every rotation
  var ICON_ATTR = "data-icon";                         // the glyph an icon shows
  var ARROW_ICON = "arrow-";                           // ...which for a compass arrow is this + dir

  // Each title ends with the key that does the same, as input.js binds it.
  var PAN_TITLES = { N: "North (Up)", E: "East (Right)", S: "South (Down)", W: "West (Left)" };
  var PAN_SLOTS = [null, "N", null, "W", null, "E", null, "S", null];
  var ARROW_SLOTS = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];

  var LAYER_BUTTONS = [
    { name: "elevation", title: "Elevation", icon: "layer-elev" },
    { name: "marks", title: "Marks", icon: "layer-marks" },
    { name: "decor", title: "Decor", icon: "layer-decor" }
  ];
  var SHAPE_TITLES = { block: "Block (B)", ramp: "Ramp (R)", stairs: "Stairs (T)" };
  var FACING_TITLE = "Facing (A/D)";
  var MARK_KEYS = {
    "arrow-nw": "Shift+Q", "arrow-n": "Shift+W", "arrow-ne": "Shift+E",
    "arrow-w": "Shift+A", "arrow-e": "Shift+D",
    "arrow-sw": "Shift+Z", "arrow-s": "Shift+S", "arrow-se": "Shift+C",
    "teleport": "P", "rope": "L", "jump": "J"
  };

  function titled(label, key) {
    return label + " (" + key + ")";
  }

  function element(tag, name) {
    var el = document.createElement(tag);
    el.className = B.PREFIX + name;
    return el;
  }

  function group(name) {
    var el = element("div", "group");
    el.setAttribute("data-group", name);
    return el;
  }

  function spacer() {
    var el = element("span", "spacer");
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  // data-act and data-arg are the hooks the driver and the tests find a button by.
  function button(act, arg, title, onClick) {
    var btn = element("button", "btn");
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

  // Coloured pixel art on a button: a decor object or a still mark.
  function image(parent, sprite) {
    var img = element("img", "image");
    img.alt = "";
    img.draggable = false;
    img.src = B.pixel.dataUrl(sprite);
    img.width = sprite.canvas.width * ICON_SCALE;
    img.height = sprite.canvas.height * ICON_SCALE;
    parent.appendChild(img);
  }

  // A UI glyph is a mask over the element's text colour, which the stylesheet
  // sets per theme; the key names the glyph so a repeat is skipped.
  function setIcon(span, key, sprite) {
    if (span.getAttribute(ICON_ATTR) === key) return;
    var url = "url(\"" + B.pixel.crispUrl(sprite) + "\")";
    span.setAttribute(ICON_ATTR, key);
    span.style.setProperty("mask-image", url);
    span.style.setProperty("-webkit-mask-image", url);
    span.style.width = sprite.canvas.width * ICON_SCALE + "px";
    span.style.height = sprite.canvas.height * ICON_SCALE + "px";
  }

  function setGlyph(span, name) {
    setIcon(span, name, B.icons.sprite(name));
  }

  function setArrow(span, dir) {
    setIcon(span, ARROW_ICON + dir, B.icons.arrow(dir));
  }

  function icon(name) {
    var span = element("span", "icon");
    setGlyph(span, name);
    return span;
  }

  function arrowIcon(dir) {
    var span = element("span", "icon");
    setArrow(span, dir);
    return span;
  }

  function press(btn, on) {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // A toggle that edits the selected tile: enabled when there is one, and
  // pressed when `on`.
  function syncToggle(btn, tile, on) {
    btn.disabled = !tile;
    press(btn, !!tile && !!on);
  }

  function opaqueIcon(opaque) {
    return opaque ? "opaque" : "transparent";
  }

  function selectedTile(state) {
    var sel = state.selected;
    return sel ? B.level.get(state.level, sel.x, sel.y) : null;
  }

  function markByDir(dir) {
    return B.MARKS.filter(function (m) { return m.dir === dir; })[0];
  }

  function panGroup(handlers) {
    var el = group("pan");
    PAN_SLOTS.forEach(function (facing) {
      if (!facing) return el.appendChild(spacer());
      var btn = button("pan", facing, PAN_TITLES[facing], function () { handlers.pan(facing); });
      btn.appendChild(arrowIcon(facing));
      el.appendChild(btn);
    });
    return el;
  }

  // A button that hands `run` its signed step.
  function stepButton(act, step, title, glyph, run) {
    var btn = button(act, step, title, function () { run(step); });
    btn.appendChild(icon(glyph));
    return btn;
  }

  function viewGroup(handlers) {
    var el = group("view");
    el.appendChild(stepButton("rotate", -1, "Turn left ([)", "rotate-ccw", handlers.rotate));
    el.appendChild(stepButton("rotate", 1, "Turn right (])", "rotate-cw", handlers.rotate));
    el.appendChild(stepButton("zoom", -1, "Zoom out (-)", "zoom-out", handlers.zoom));
    el.appendChild(stepButton("zoom", 1, "Zoom in (=)", "zoom-in", handlers.zoom));
    return el;
  }

  function layersGroup(refs, handlers) {
    var el = group("layers");
    LAYER_BUTTONS.forEach(function (l) {
      var btn = toggle("layer", l.name, l.title, function () { handlers.toggleLayer(l.name); });
      btn.appendChild(icon(l.icon));
      refs.layers[l.name] = btn;
      el.appendChild(btn);
    });
    refs.opaque = toggle("opaque", "", "Solid", function () { handlers.toggleOpaque(); });
    refs.opaqueIcon = icon(opaqueIcon(true));
    refs.opaque.appendChild(refs.opaqueIcon);
    el.appendChild(refs.opaque);
    return el;
  }

  function shapeGroup(refs, handlers) {
    var el = group("shape");
    B.SHAPES.forEach(function (shape) {
      var btn = toggle("shape", shape, SHAPE_TITLES[shape], function () {
        handlers.setShape(shape);
      });
      btn.appendChild(icon("shape-" + shape));
      refs.shapes[shape] = btn;
      el.appendChild(btn);
    });
    refs.facing = button("facing", "", FACING_TITLE, function () { handlers.cycleFacing(); });
    refs.facingIcon = arrowIcon(B.FACINGS[0]);
    refs.facing.appendChild(refs.facingIcon);
    el.appendChild(refs.facing);
    return el;
  }

  function decorGroup(refs, handlers) {
    var el = group("decor");
    B.DECOR.forEach(function (d, i) {
      var title = titled(d.label, i + 1);
      var btn = toggle("decor", d.key, title, function () { handlers.setDecor(d.key); });
      image(btn, B.decor.icon(d.key));
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
      var title = titled(m.label, MARK_KEYS[m.key]);
      var btn = toggle("mark", m.key, title, function () { handlers.toggleMark(m.key); });
      if (m.dir) btn.appendChild(arrowIcon(m.dir));
      else image(btn, B.marks.sprite(m.key, STILL_ROT));
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
    save.appendChild(icon("file-save"));
    el.appendChild(save);
    var open = button("open", "", "Open", function () { picker.click(); });
    open.appendChild(icon("file-open"));
    el.appendChild(open);
    refs.clear = button("clear", "", "Clear");
    refs.clear.appendChild(icon("clear"));
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
    var el = element("div", "toolbar");
    el.style.setProperty(HOLD_VAR, B.HOLD_MS + "ms");

    var refs = { layers: {}, shapes: {}, decor: {}, marks: {} };
    el.appendChild(panGroup(handlers));
    el.appendChild(viewGroup(handlers));
    el.appendChild(layersGroup(refs, handlers));
    el.appendChild(shapeGroup(refs, handlers));
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
      setGlyph(refs.opaqueIcon, opaqueIcon(state.opaque));
    }

    function syncTile(tile) {
      B.SHAPES.forEach(function (shape) {
        syncToggle(refs.shapes[shape], tile, tile && tile.shape === shape);
      });
      refs.facing.disabled = !tile || !B.level.sloped(tile);
      setArrow(refs.facingIcon, tile ? tile.facing : B.FACINGS[0]);
      B.DECOR.forEach(function (d) {
        syncToggle(refs.decor[d.key], tile, tile && tile.decor === d.key);
      });
      B.MARKS.forEach(function (m) {
        syncToggle(refs.marks[m.key], tile, tile && tile.marks.indexOf(m.key) >= 0);
      });
    }

    function sync(state) {
      syncLayers(state);
      syncTile(selectedTile(state));
    }

    return { el: el, sync: sync };
  }

  B.toolbar = {
    build: build,
    element: element,
    icon: icon
  };
})();
