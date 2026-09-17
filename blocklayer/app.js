/*
 * Blocklayer — the app entry. Builds the toolbar, the canvas, the hint row
 * and the status line into the mount, keeps the one state object the renderer
 * reads, and maps every toolbar action and pointer gesture onto a level or
 * view mutation: each one redraws, refreshes the toolbar, and — when the
 * level changed — saves it on that redraw. The level also goes out to a file
 * and comes back from one, by the picker or dropped on the canvas.
 */
(function () {
  "use strict";

  var B = window.BlockLayer;
  var root = B && document.getElementById(B.MOUNT_ID);
  if (!B || !root) return;

  var state = {
    level: loadLevel(),
    view: B.view.create(),
    layers: { elevation: true, marks: true, decor: true },
    opaque: true,
    selected: null,
    hover: null,
    hold: null
  };

  var canvas = null;
  var toolbar = null;
  var status = null;

  // ---- Persistence ---------------------------------------------------------
  // The try is for storage itself, which a browser may refuse to hand over.
  function stored() {
    try {
      return B.file.parse(window.localStorage.getItem(B.STORAGE_KEY));
    } catch (err) {
      return null;
    }
  }

  function loadLevel() {
    return stored() || B.demo.level();
  }

  var unsaved = false;

  function save() {
    try {
      window.localStorage.setItem(B.STORAGE_KEY, B.file.serialize(state.level));
    } catch (err) {
      // Storage refused the level; it lives on in memory until the next edit.
    }
  }

  // Edits are saved once per frame, on the redraw every edit schedules; the
  // page going away flushes what no frame has reached yet.
  function flushSave() {
    if (!unsaved) return;
    unsaved = false;
    save();
  }

  function watchLeaving() {
    window.addEventListener("pagehide", flushSave);
    window.addEventListener("beforeunload", flushSave);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) flushSave();
    });
  }

  // ---- Files ---------------------------------------------------------------
  var JSON_MIME = "application/json";
  var NOT_A_LEVEL = "not a level file";
  var DROPPING_CLASS = "is-dropping";
  var PAN_STEP = 1;                // tiles the camera moves per pan press

  var statusTimer = null;

  function showStatus(text) {
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { status.textContent = ""; }, B.STATUS_MS);
  }

  function saveFile() {
    var blob = new Blob([B.file.serialize(state.level)], { type: JSON_MIME });
    try {
      window.ExpPng.save(blob, B.file.FILE_NAME);
    } catch (err) {
      showStatus(err.message);
    }
  }

  function useLevel(level) {
    if (!level) {
      showStatus(NOT_A_LEVEL);
      return;
    }
    state.level = level;
    state.selected = null;
    state.hover = null;
    edited();
  }

  function openFile(file) {
    var reader = new FileReader();
    reader.onload = function () { useLevel(B.file.parse(String(reader.result))); };
    reader.onerror = function () { useLevel(null); };
    reader.readAsText(file);
  }

  function watchDrops(stage) {
    canvas.addEventListener("dragover", function (e) {
      e.preventDefault();
      stage.classList.add(DROPPING_CLASS);
    });
    canvas.addEventListener("dragleave", function () {
      stage.classList.remove(DROPPING_CLASS);
    });
    canvas.addEventListener("drop", function (e) {
      e.preventDefault();
      stage.classList.remove(DROPPING_CLASS);
      var files = e.dataTransfer ? e.dataTransfer.files : null;
      if (files && files.length) openFile(files[0]);
    });
  }

  // ---- Frame and picking ---------------------------------------------------
  function dpr() {
    return window.devicePixelRatio || 1;
  }

  // Visible-canvas pixels per base-scale pixel.
  function scale() {
    return state.view.zoom * dpr();
  }

  function resize() {
    var w = Math.round(canvas.clientWidth * dpr());
    var h = Math.round(canvas.clientHeight * dpr());
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    sched();
  }

  function watchSize(stage) {
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    else window.addEventListener("resize", resize);
    resize();
  }

  // The bitmap is stretched over the canvas's content box, inside its border.
  function pick(clientX, clientY) {
    var cssW = canvas.clientWidth;
    var cssH = canvas.clientHeight;
    if (!cssW || !cssH) return null;
    var s = scale();
    var rect = canvas.getBoundingClientRect();
    var frame = B.view.frame(canvas, s);
    var bx = (clientX - rect.left - canvas.clientLeft) * (canvas.width / cssW) / s;
    var by = (clientY - rect.top - canvas.clientTop) * (canvas.height / cssH) / s;
    return B.view.pick(state.view, state.level, bx - frame.ox, by - frame.oy);
  }

  // ---- Render --------------------------------------------------------------
  var rafId = null;

  function frame() {
    rafId = null;
    flushSave();
    B.render.draw(canvas, state, scale());
  }

  function sched() {
    if (rafId) return;
    rafId = requestAnimationFrame(frame);
  }

  function changed() {
    toolbar.sync(state);
    sched();
  }

  function edited() {
    unsaved = true;
    changed();
  }

  // ---- Mutations -----------------------------------------------------------
  // A mutation that answers false changed nothing, so there is nothing to save.
  function editSelected(mutate) {
    if (!state.selected) return;
    if (mutate(state.selected.x, state.selected.y) !== false) edited();
  }

  function remove(x, y) {
    if (!B.level.remove(state.level, x, y)) return;
    if (B.sameCell(state.selected, x, y)) state.selected = null;
    edited();
  }

  function clear() {
    B.level.clear(state.level);
    state.selected = null;
    edited();
  }

  // Everything the toolbar and the pointer can do; each reads the keys it needs.
  var handlers = {
    pan: function (facing) { B.view.pan(state.view, facing, PAN_STEP); changed(); },
    rotate: function (turns) { B.view.rotate(state.view, turns); changed(); },
    zoom: function (delta) { B.view.zoom(state.view, delta); changed(); },
    toggleLayer: function (name) {
      if (!(name in state.layers)) return;
      state.layers[name] = !state.layers[name];
      changed();
    },
    toggleOpaque: function () {
      state.opaque = !state.opaque;
      changed();
    },
    setShape: function (shape) {
      editSelected(function (x, y) { B.level.setShape(state.level, x, y, shape); });
    },
    cycleFacing: function () {
      editSelected(function (x, y) { B.level.cycleFacing(state.level, x, y); });
    },
    setDecor: function (key) {
      editSelected(function (x, y) { B.level.setDecor(state.level, x, y, key); });
    },
    toggleMark: function (key) {
      editSelected(function (x, y) { B.level.toggleMark(state.level, x, y, key); });
    },
    pick: pick,
    selected: function () { return state.selected; },
    hover: function (hit) {
      if (B.view.sameHit(hit, state.hover)) return;
      state.hover = hit;
      sched();
    },
    add: function (x, y) {
      B.level.add(state.level, x, y, B.NEW_TILE_ELEV);
      edited();
    },
    select: function (x, y) {
      state.selected = { x: x, y: y };
      changed();
    },
    deselect: function () {
      state.selected = null;
      changed();
    },
    raise: function (delta) {
      editSelected(function (x, y) {
        var tile = B.level.get(state.level, x, y);
        var before = tile ? tile.elev : null;
        return B.level.raise(state.level, x, y, delta) !== before;
      });
    },
    hold: function (x, y, progress) {
      state.hold = progress == null ? null : { x: x, y: y, progress: progress };
      sched();
    },
    remove: remove,
    save: saveFile,
    open: openFile,
    clear: clear
  };

  // ---- Skeleton ------------------------------------------------------------
  var HINTS = [
    { icon: "hint-add", word: "add" },
    { icon: "hint-wheel", word: "elevate" },
    { icon: "hint-remove", word: "remove" }
  ];

  var element = B.toolbar.element;

  function hintRow() {
    var row = element("div", "hint");
    HINTS.forEach(function (h) {
      var item = element("span", "hint-item");
      item.appendChild(B.toolbar.icon(h.icon));
      item.appendChild(document.createTextNode(h.word));
      row.appendChild(item);
    });
    return row;
  }

  function statusLine() {
    var line = element("div", "status");
    line.setAttribute("role", "status");
    return line;
  }

  function buildSkeleton(mount) {
    var layout = element("div", "layout");
    var stage = element("div", "stage");
    canvas = element("canvas", "canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Level");
    status = statusLine();
    stage.appendChild(canvas);
    stage.appendChild(hintRow());
    stage.appendChild(status);
    layout.appendChild(toolbar.el);
    layout.appendChild(stage);
    mount.appendChild(layout);
    return stage;
  }

  // ---- Boot ----------------------------------------------------------------
  toolbar = B.toolbar.build(handlers);
  var stage = buildSkeleton(root);
  B.input.attach(canvas, handlers);
  watchDrops(stage);
  watchSize(stage);
  watchLeaving();
  changed();
})();
