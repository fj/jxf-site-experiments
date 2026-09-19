/*
 * Blocklayer — the app entry. Builds the toolbar, the canvas, the hint row
 * and the status line into the mount, keeps the one state object the renderer
 * reads, and maps every toolbar action and pointer gesture onto a call to the
 * modules that hold the rules: each one redraws, refreshes the toolbar, and —
 * when the level changed — saves it on that redraw. The level also goes out to
 * a file and comes back from one, by the picker or dropped on the canvas.
 * Wiring only; what a gesture means belongs to the module it calls.
 */
(function () {
  "use strict";

  var B = window.BlockLayer;
  var root = B && document.getElementById(B.MOUNT_ID);
  if (!B || !root) return;

  var storage = B.store.from(window);

  var state = {
    level: B.store.read(storage),
    view: B.view.create(),
    layers: { elevation: true, marks: true, decor: true },
    opaque: true,
    newElev: B.NEW_TILE_ELEV,
    color: B.DEFAULT_COLOR,
    selection: [],
    box: null,
    hover: null,
    hold: null
  };

  var canvas = null;
  var toolbar = null;
  var status = null;

  // ---- Persistence ---------------------------------------------------------
  var unsaved = false;

  // Edits are saved once per frame, on the redraw every edit schedules; the
  // page going away flushes what no frame has reached yet.
  function flushSave() {
    if (!unsaved) return;
    unsaved = false;
    B.store.write(storage, state.level);
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
    setSelection([]);
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

  // Where a client point falls in the space the view projects into.
  function at(clientX, clientY) {
    return B.view.basePoint(canvas, scale(), clientX, clientY);
  }

  function pick(clientX, clientY) {
    var p = at(clientX, clientY);
    return p && B.view.pick(state.view, state.level, p.x, p.y);
  }

  // Two client corners as a rectangle in the same space, in the order swept:
  // both the renderer and view.within read them either way round.
  function baseBox(x0, y0, x1, y1) {
    var a = at(x0, y0);
    var b = at(x1, y1);
    return a && b ? { x0: a.x, y0: a.y, x1: b.x, y1: b.y } : null;
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
  // Every selected tile takes the mutation, and the lot is saved once. A
  // mutation that answers false left its tile alone.
  function editSelection(mutate) {
    var any = false;
    state.selection.forEach(function (cell) {
      if (mutate(cell.x, cell.y) !== false) any = true;
    });
    if (any) edited();
  }

  // The one writer of the selection.
  function setSelection(cells) {
    state.selection = cells;
  }

  // ...and the toolbar and the canvas follow it at once, unless the selection
  // module answered with the very list that was there.
  function selectCells(cells) {
    if (cells === state.selection) return;
    setSelection(cells);
    changed();
  }

  // The height the next tile gets, which the elevation keys move when there is
  // no tile to move instead. It is not part of the level, so nothing is saved.
  function setNewElev(delta) {
    var elev = B.clamp(state.newElev + delta, B.ELEV_MIN, B.ELEV_MAX);
    if (elev === state.newElev) return;
    state.newElev = elev;
    changed();
  }

  function remove(x, y) {
    if (!B.level.remove(state.level, x, y)) return;
    setSelection(B.selection.remove(state.selection, x, y));
    edited();
  }

  function clear() {
    B.level.clear(state.level);
    setSelection([]);
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
      editSelection(function (x, y) { B.level.setShape(state.level, x, y, shape); });
    },
    cycleFacing: function (step) {
      editSelection(function (x, y) {
        if (!B.level.sloped(B.level.get(state.level, x, y))) return false;
        B.level.cycleFacing(state.level, x, y, step);
      });
    },
    setDecor: function (key) {
      editSelection(function (x, y) { B.level.setDecor(state.level, x, y, key); });
    },
    // The foreground colour: what a new tile gets, and what the selection is
    // painted. Like the zoom it is view state, so only the tiles save it.
    setColor: function (key) {
      state.color = key;
      if (!state.selection.length) {
        changed();
        return;
      }
      editSelection(function (x, y) { B.level.setColor(state.level, x, y, key); });
    },
    toggleMark: function (key) {
      editSelection(function (x, y) { B.level.toggleMark(state.level, x, y, key); });
    },
    pick: pick,
    selection: function () { return state.selection; },
    color: function () { return state.color; },
    hover: function (hit) {
      if (B.view.sameHit(hit, state.hover)) return;
      state.hover = hit;
      sched();
    },
    add: function (x, y) {
      B.level.add(state.level, x, y, state.newElev, state.color);
      edited();
    },
    select: function (x, y) {
      selectCells(B.selection.only(x, y));
    },
    toggleSelect: function (x, y) {
      selectCells(B.selection.toggle(state.selection, x, y));
    },
    // A sweep's two client corners: every tile inside joins the selection.
    selectBox: function (x0, y0, x1, y1) {
      var box = baseBox(x0, y0, x1, y1);
      if (!box) return;
      selectCells(B.selection.add(state.selection, B.view.within(state.view, state.level, box)));
    },
    // The rectangle the sweep is drawing, for the renderer; box(null) ends it.
    box: function (x0, y0, x1, y1) {
      state.box = x0 == null ? null : baseBox(x0, y0, x1, y1);
      sched();
    },
    deselect: function () {
      selectCells([]);
    },
    // The selection moves as one, so it keeps its shape: one tile with no room
    // holds the rest back.
    raise: function (delta) {
      if (!state.selection.length) {
        setNewElev(delta);
        return;
      }
      if (B.level.raiseCells(state.level, state.selection, delta)) edited();
    },
    raiseAll: function (delta) {
      if (B.level.raiseAll(state.level, delta)) edited();
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
