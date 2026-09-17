/*
 * Blocklayer — the toolbar: a column of pixel-art buttons that pan, turn and
 * zoom the view, show or hide its layers, and edit the selected tile's shape,
 * facing, decor and marks, and save, open or clear the level. The DOM is
 * built once; sync() sets every pressed and disabled state and every icon
 * from the app's state, leaving an icon alone when it already shows the right
 * sprite. element() and icon() lend the toolbar's builders to the rest of the
 * interface.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var ICON_SCALE = 2;                                  // CSS px per sprite px
  var HOLD_VAR = "--" + B.PREFIX + "hold";             // the fill animation's length
  var HOLDING_CLASS = "is-holding";
  var PRIMARY_BUTTON = 0;
  var FLAT_SHAPE = "block";                            // the one shape with no facing
  var HOLD_KEYS = [" ", "Enter"];
  var FILE_ACCEPT = ".json";
  var UNTURNED = 0;                                    // the rotation icons are built for
  var ICON_ATTR = "data-icon";                         // the glyph an icon shows

  var FACING_TITLES = { N: "North", E: "East", S: "South", W: "West" };
  var PAN_SLOTS = [null, "N", null, "W", null, "E", null, "S", null];
  var ARROW_SLOTS = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];

  // act names the handler each view button calls, with arg.
  var VIEW_BUTTONS = [
    { act: "rotate", arg: -1, title: "Turn left", icon: "rotate-ccw" },
    { act: "rotate", arg: 1, title: "Turn right", icon: "rotate-cw" },
    { act: "zoom", arg: -1, title: "Zoom out", icon: "zoom-out" },
    { act: "zoom", arg: 1, title: "Zoom in", icon: "zoom-in" }
  ];
  var LAYER_BUTTONS = [
    { name: "elevation", title: "Elevation", icon: "layer-elev" },
    { name: "marks", title: "Marks", icon: "layer-marks" },
    { name: "decor", title: "Decor", icon: "layer-decor" }
  ];
  var SHAPE_TITLES = { block: "Block", ramp: "Ramp", stairs: "Stairs" };

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

  function setSprite(img, sprite) {
    var url = B.pixel.dataUrl(sprite);
    if (img.src === url) return;
    img.src = url;
    img.width = sprite.canvas.width * ICON_SCALE;
    img.height = sprite.canvas.height * ICON_SCALE;
  }

  // Coloured pixel art on a button: a decor object or an arrow.
  function image(parent, sprite) {
    var img = element("img", "image");
    img.alt = "";
    img.draggable = false;
    setSprite(img, sprite);
    parent.appendChild(img);
    return img;
  }

  // A UI glyph is a mask over the element's text colour, which the stylesheet
  // sets per theme.
  function setIcon(span, name) {
    if (span.getAttribute(ICON_ATTR) === name) return;
    var sprite = B.icons.sprite(name);
    var url = "url(\"" + B.pixel.crispUrl(sprite) + "\")";
    span.setAttribute(ICON_ATTR, name);
    span.style.setProperty("mask-image", url);
    span.style.setProperty("-webkit-mask-image", url);
    span.style.width = sprite.canvas.width * ICON_SCALE + "px";
    span.style.height = sprite.canvas.height * ICON_SCALE + "px";
  }

  function icon(name) {
    var span = element("span", "icon");
    setIcon(span, name);
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

  function panGroup(refs, handlers) {
    var el = group("pan");
    PAN_SLOTS.forEach(function (facing) {
      if (!facing) return el.appendChild(spacer());
      var btn = button("pan", facing, FACING_TITLES[facing], function () { handlers.pan(facing); });
      refs.pan[facing] = image(btn, B.marks.arrow(B.facingDir(UNTURNED, facing)));
      el.appendChild(btn);
    });
    return el;
  }

  function viewGroup(handlers) {
    var el = group("view");
    VIEW_BUTTONS.forEach(function (v) {
      var run = handlers[v.act];
      var btn = button(v.act, v.arg, v.title, function () { run(v.arg); });
      btn.appendChild(icon(v.icon));
      el.appendChild(btn);
    });
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
    refs.facing = button("facing", "", "Facing", function () { handlers.cycleFacing(); });
    refs.facingIcon = image(refs.facing, B.marks.arrow(B.facingDir(UNTURNED, B.FACINGS[0])));
    el.appendChild(refs.facing);
    return el;
  }

  function decorGroup(refs, handlers) {
    var el = group("decor");
    B.DECOR.forEach(function (d) {
      var btn = toggle("decor", d.key, d.label, function () { handlers.setDecor(d.key); });
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
      var btn = toggle("mark", m.key, m.label, function () { handlers.toggleMark(m.key); });
      refs.marks[m.key] = { button: btn, image: image(btn, B.marks.sprite(m.key, UNTURNED)) };
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

    var refs = { pan: {}, layers: {}, shapes: {}, decor: {}, marks: {} };
    el.appendChild(panGroup(refs, handlers));
    el.appendChild(viewGroup(handlers));
    el.appendChild(layersGroup(refs, handlers));
    el.appendChild(shapeGroup(refs, handlers));
    el.appendChild(decorGroup(refs, handlers));
    el.appendChild(marksGroup(refs, handlers));
    var picker = filePicker(function (file) { handlers.open(file); });
    el.appendChild(fileGroup(refs, handlers, picker));
    attachHold(refs.clear, function () { handlers.clear(); });

    function syncView(rot) {
      B.FACINGS.forEach(function (facing) {
        setSprite(refs.pan[facing], B.marks.arrow(B.facingDir(rot, facing)));
      });
      B.MARKS.forEach(function (m) {
        if (m.dir) setSprite(refs.marks[m.key].image, B.marks.sprite(m.key, rot));
      });
    }

    function syncLayers(state) {
      LAYER_BUTTONS.forEach(function (l) {
        press(refs.layers[l.name], !!state.layers[l.name]);
      });
      press(refs.opaque, !!state.opaque);
      setIcon(refs.opaqueIcon, opaqueIcon(state.opaque));
    }

    function syncTile(tile, rot) {
      B.SHAPES.forEach(function (shape) {
        syncToggle(refs.shapes[shape], tile, tile && tile.shape === shape);
      });
      refs.facing.disabled = !tile || tile.shape === FLAT_SHAPE;
      var facing = tile ? tile.facing : B.FACINGS[0];
      setSprite(refs.facingIcon, B.marks.arrow(B.facingDir(rot, facing)));
      B.DECOR.forEach(function (d) {
        syncToggle(refs.decor[d.key], tile, tile && tile.decor === d.key);
      });
      B.MARKS.forEach(function (m) {
        syncToggle(refs.marks[m.key].button, tile, tile && tile.marks.indexOf(m.key) >= 0);
      });
    }

    function sync(state) {
      var rot = state.view.rot;
      syncView(rot);
      syncLayers(state);
      syncTile(selectedTile(state), rot);
    }

    return { el: el, sync: sync };
  }

  B.toolbar = {
    build: build,
    element: element,
    icon: icon
  };
})();
