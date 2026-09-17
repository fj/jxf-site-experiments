/*
 * Blocklayer — the toolbar: a column of pixel-art buttons that pan, turn and
 * zoom the view, show or hide its layers, and edit the selected tile's shape,
 * facing, decor and marks, and save, open or clear the level. The DOM is
 * built once; sync() refreshes pressed and disabled states from the app's
 * state and redraws only the icons that turn with the view. icon() lends the
 * toolbar's themed-icon pair to the rest of the interface.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var ICON_SCALE = 2;                                  // CSS px per sprite px
  var HOLD_VAR = "--" + B.PREFIX + "hold";             // the fill animation's length
  var HOLDING_CLASS = "is-holding";
  var PRIMARY_BUTTON = 0;
  var FLAT_SHAPE = "block";                            // the one shape with no facing
  var DIRS_PER_FACING = B.DIRECTIONS.length / B.FACINGS.length;
  var HOLD_KEYS = [" ", "Enter"];
  var FILE_ACCEPT = ".json";

  var FACING_TITLES = { N: "North", E: "East", S: "South", W: "West" };
  var PAN_SLOTS = [null, "N", null, "W", null, "E", null, "S", null];
  var ARROW_SLOTS = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];

  var VIEW_BUTTONS = [
    { act: "rotate", arg: "-1", title: "Turn left", icon: "rotate-ccw" },
    { act: "rotate", arg: "1", title: "Turn right", icon: "rotate-cw" },
    { act: "zoom", arg: "-1", title: "Zoom out", icon: "zoom-out" },
    { act: "zoom", arg: "1", title: "Zoom in", icon: "zoom-in" }
  ];
  var LAYER_BUTTONS = [
    { name: "elevation", title: "Elevation", icon: "layer-elev" },
    { name: "marks", title: "Marks", icon: "layer-marks" },
    { name: "decor", title: "Decor", icon: "layer-decor" }
  ];
  var OPAQUE_ICONS = { "true": "opaque", "false": "transparent" };
  var SHAPE_TITLES = { block: "Block", ramp: "Ramp", stairs: "Stairs" };
  var FILE_BUTTONS = [
    { act: "save", title: "Save", icon: "file-save" },
    { act: "open", title: "Open", icon: "file-open" }
  ];

  // What a click on each data-act does; clear is absent because it needs a hold.
  function actions(handlers, picker) {
    return {
      pan: function (arg) { handlers.pan(arg); },
      rotate: function (arg) { handlers.rotate(Number(arg)); },
      zoom: function (arg) { handlers.zoom(Number(arg)); },
      layer: function (arg) { handlers.toggleLayer(arg); },
      opaque: function () { handlers.toggleOpaque(); },
      shape: function (arg) { handlers.setShape(arg); },
      facing: function () { handlers.cycleFacing(); },
      decor: function (arg) { handlers.setDecor(arg); },
      mark: function (arg) { handlers.toggleMark(arg); },
      save: function () { handlers.save(); },
      open: function () { picker.click(); }
    };
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

  function button(act, arg, title) {
    var btn = element("button", "btn");
    btn.type = "button";
    btn.setAttribute("data-act", act);
    btn.setAttribute("data-arg", arg);
    btn.title = title;
    return btn;
  }

  function toggle(act, arg, title) {
    var btn = button(act, arg, title);
    btn.setAttribute("aria-pressed", "false");
    return btn;
  }

  function setSprite(img, sprite) {
    img.src = B.pixel.dataUrl(sprite);
    img.width = sprite.canvas.width * ICON_SCALE;
    img.height = sprite.canvas.height * ICON_SCALE;
  }

  function image(parent, sprite, theme) {
    var img = element("img", "icon");
    if (theme) img.classList.add("is-" + theme);
    img.alt = "";
    img.draggable = false;
    setSprite(img, sprite);
    parent.appendChild(img);
    return img;
  }

  // A UI icon is one image per theme; the stylesheet shows the right one.
  function themedIcons(parent, name) {
    return {
      light: image(parent, B.icons.sprite(name, B.COLORS.inkLight), "light"),
      dark: image(parent, B.icons.sprite(name, B.COLORS.inkDark), "dark")
    };
  }

  function setThemedIcons(pair, name) {
    setSprite(pair.light, B.icons.sprite(name, B.COLORS.inkLight));
    setSprite(pair.dark, B.icons.sprite(name, B.COLORS.inkDark));
  }

  // The same pair, detached, for a home outside the toolbar.
  function icon(name) {
    var pair = document.createDocumentFragment();
    themedIcons(pair, name);
    return pair;
  }

  function press(btn, on) {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function facingDir(rot, facing) {
    return B.screenDir(rot, DIRS_PER_FACING * B.FACINGS.indexOf(facing));
  }

  function selectedTile(state) {
    var sel = state.selected;
    return sel ? B.level.get(state.level, sel.x, sel.y) : null;
  }

  function markByDir(dir) {
    return B.MARKS.filter(function (m) { return m.dir === dir; })[0];
  }

  function panGroup(refs, rot) {
    var el = group("pan");
    PAN_SLOTS.forEach(function (facing) {
      if (!facing) return el.appendChild(spacer());
      var btn = button("pan", facing, FACING_TITLES[facing]);
      refs.pan[facing] = image(btn, B.marks.arrow(facingDir(rot, facing)));
      el.appendChild(btn);
    });
    return el;
  }

  function viewGroup() {
    var el = group("view");
    VIEW_BUTTONS.forEach(function (v) {
      var btn = button(v.act, v.arg, v.title);
      themedIcons(btn, v.icon);
      el.appendChild(btn);
    });
    return el;
  }

  function layersGroup(refs, opaque) {
    var el = group("layers");
    LAYER_BUTTONS.forEach(function (l) {
      var btn = toggle("layer", l.name, l.title);
      themedIcons(btn, l.icon);
      refs.layers[l.name] = btn;
      el.appendChild(btn);
    });
    refs.opaque = toggle("opaque", "", "Solid");
    refs.opaqueIcons = themedIcons(refs.opaque, OPAQUE_ICONS[String(opaque)]);
    el.appendChild(refs.opaque);
    return el;
  }

  function shapeGroup(refs, rot, facing) {
    var el = group("shape");
    B.SHAPES.forEach(function (shape) {
      var btn = toggle("shape", shape, SHAPE_TITLES[shape]);
      themedIcons(btn, "shape-" + shape);
      refs.shapes[shape] = btn;
      el.appendChild(btn);
    });
    refs.facing = button("facing", "", "Facing");
    refs.facingIcon = image(refs.facing, B.marks.arrow(facingDir(rot, facing)));
    el.appendChild(refs.facing);
    return el;
  }

  function decorGroup(refs) {
    var el = group("decor");
    B.DECOR.forEach(function (d) {
      var btn = toggle("decor", d.key, d.label);
      image(btn, B.decor.icon(d.key));
      refs.decor[d.key] = btn;
      el.appendChild(btn);
    });
    return el;
  }

  function marksGroup(refs, rot) {
    var el = group("marks");
    var arrows = ARROW_SLOTS.map(function (dir) { return dir ? markByDir(dir) : null; });
    var others = B.MARKS.filter(function (m) { return !m.dir; });
    arrows.concat(others).forEach(function (m) {
      if (!m) return el.appendChild(spacer());
      var btn = toggle("mark", m.key, m.label);
      refs.marks[m.key] = { button: btn, image: image(btn, B.marks.sprite(m.key, rot)) };
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

  function fileGroup(refs, picker) {
    var el = group("file");
    FILE_BUTTONS.forEach(function (f) {
      var btn = button(f.act, "", f.title);
      themedIcons(btn, f.icon);
      el.appendChild(btn);
    });
    refs.clear = button("clear", "", "Clear");
    themedIcons(refs.clear, "clear");
    el.appendChild(refs.clear);
    el.appendChild(picker);
    return el;
  }

  function dispatch(event, run) {
    var target = event.target;
    var btn = target.closest ? target.closest("button[data-act]") : null;
    if (!btn || btn.disabled) return;
    var action = run[btn.getAttribute("data-act")];
    if (action) action(btn.getAttribute("data-arg"));
  }

  // The clear button fires only after a full hold, by pointer or by a held key.
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
    var last = { rot: 0, opaque: true, facingDir: facingDir(0, B.FACINGS[0]) };

    el.appendChild(panGroup(refs, last.rot));
    el.appendChild(viewGroup());
    el.appendChild(layersGroup(refs, last.opaque));
    el.appendChild(shapeGroup(refs, last.rot, B.FACINGS[0]));
    el.appendChild(decorGroup(refs));
    el.appendChild(marksGroup(refs, last.rot));
    var picker = filePicker(function (file) { handlers.open(file); });
    el.appendChild(fileGroup(refs, picker));

    var run = actions(handlers, picker);
    el.addEventListener("click", function (e) { dispatch(e, run); });
    attachHold(refs.clear, function () { handlers.clear(); });

    function syncRotation(rot) {
      if (rot === last.rot) return;
      last.rot = rot;
      B.FACINGS.forEach(function (facing) {
        setSprite(refs.pan[facing], B.marks.arrow(facingDir(rot, facing)));
      });
      B.MARKS.forEach(function (m) {
        if (m.dir) setSprite(refs.marks[m.key].image, B.marks.sprite(m.key, rot));
      });
    }

    function syncLayers(state) {
      LAYER_BUTTONS.forEach(function (l) {
        press(refs.layers[l.name], !!state.layers[l.name]);
      });
      var opaque = !!state.opaque;
      press(refs.opaque, opaque);
      if (opaque !== last.opaque) {
        last.opaque = opaque;
        setThemedIcons(refs.opaqueIcons, OPAQUE_ICONS[String(opaque)]);
      }
    }

    function syncTile(tile, rot) {
      B.SHAPES.forEach(function (shape) {
        var btn = refs.shapes[shape];
        btn.disabled = !tile;
        press(btn, !!tile && tile.shape === shape);
      });
      refs.facing.disabled = !tile || tile.shape === FLAT_SHAPE;
      var dir = facingDir(rot, tile ? tile.facing : B.FACINGS[0]);
      if (dir !== last.facingDir) {
        last.facingDir = dir;
        setSprite(refs.facingIcon, B.marks.arrow(dir));
      }
      B.DECOR.forEach(function (d) {
        var btn = refs.decor[d.key];
        btn.disabled = !tile;
        press(btn, !!tile && tile.decor === d.key);
      });
      B.MARKS.forEach(function (m) {
        var btn = refs.marks[m.key].button;
        btn.disabled = !tile;
        press(btn, !!tile && tile.marks.indexOf(m.key) >= 0);
      });
    }

    function sync(state) {
      var rot = state.view.rot;
      syncRotation(rot);
      syncLayers(state);
      syncTile(selectedTile(state), rot);
    }

    return { el: el, sync: sync };
  }

  B.toolbar = {
    build: build,
    icon: icon
  };
})();
