/*
 * Blocklayer — the app entry. Builds the toolbar, the canvas, the hint row
 * and the status line into the mount, keeps the one state object the renderer
 * reads, and maps every toolbar action and pointer gesture onto a level or
 * view mutation: each one redraws, refreshes the toolbar, and — when the
 * level changed — saves it. The level also goes out to a file and comes back
 * from one, by the picker or dropped on the canvas.
 */
(function () {
  "use strict";

  var B = window.BlockLayer;
  var root = B && document.getElementById(B.MOUNT_ID);
  if (!B || !root) return;

  var state = {
    level: loadLevel(),
    view: B.view.create(),
    scale: B.ZOOM_DEFAULT,
    layers: { elevation: true, marks: true, decor: true },
    opaque: true,
    selected: null,
    hover: null,
    hold: null
  };

  var canvas = null;
  var toolbar = null;

  // ---- Persistence ---------------------------------------------------------
  function stored() {
    try {
      var raw = window.localStorage.getItem(B.STORAGE_KEY);
      return raw ? B.level.fromJSON(JSON.parse(raw)) : null;
    } catch (err) {
      return null;
    }
  }

  function loadLevel() {
    return stored() || B.level.demo();
  }

  function save() {
    try {
      window.localStorage.setItem(B.STORAGE_KEY, JSON.stringify(B.level.toJSON(state.level)));
    } catch (err) {
      // Storage refused the level; it lives on in memory until the next edit.
    }
  }

  // ---- Files ---------------------------------------------------------------
  var JSON_MIME = "application/json";
  var NOT_A_LEVEL = "not a level file";
  var OBJECT_URL_TTL_MS = 5000;    // long enough for the browser to start the download
  var DROPPING_CLASS = "is-dropping";

  var statusTimer = null;

  function showStatus(text) {
    toolbar.status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { toolbar.status.textContent = ""; }, B.STATUS_MS);
  }

  function saveFile() {
    var url = URL.createObjectURL(new Blob([B.file.serialize(state.level)], { type: JSON_MIME }));
    var link = document.createElement("a");
    link.href = url;
    link.download = B.file.FILE_NAME;
    link.hidden = true;
    // Firefox acts on the click only for an anchor that is in the document.
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, OBJECT_URL_TTL_MS);
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

  function droppedLevel(transfer) {
    var files = transfer ? transfer.files : null;
    for (var i = 0; files && i < files.length; i++) {
      if (B.file.isLevelFile(files[i].name)) return files[i];
    }
    return null;
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
      var file = droppedLevel(e.dataTransfer);
      if (file) openFile(file);
    });
  }

  // ---- Frame and picking ---------------------------------------------------
  function devicePixelRatio() {
    return window.devicePixelRatio || 1;
  }

  function syncScale() {
    state.scale = state.view.zoom * devicePixelRatio();
  }

  function resize() {
    var w = Math.round(canvas.clientWidth * devicePixelRatio());
    var h = Math.round(canvas.clientHeight * devicePixelRatio());
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
    syncScale();
    var rect = canvas.getBoundingClientRect();
    var frame = B.view.frame(canvas, state.scale);
    var bx = (clientX - rect.left - canvas.clientLeft) * (canvas.width / cssW) / state.scale;
    var by = (clientY - rect.top - canvas.clientTop) * (canvas.height / cssH) / state.scale;
    return B.view.pick(state.view, state.level, bx - frame.ox, by - frame.oy);
  }

  // ---- Render --------------------------------------------------------------
  var rafId = null;

  function render() {
    syncScale();
    B.render.draw(canvas, state);
  }

  function sched() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = null; render(); });
  }

  function changed() {
    toolbar.sync(state);
    sched();
  }

  function edited() {
    save();
    changed();
  }

  // ---- Mutations -----------------------------------------------------------
  function sameCell(a, x, y) {
    return !!a && a.x === x && a.y === y;
  }

  function editSelected(mutate) {
    if (!state.selected) return;
    mutate(state.selected.x, state.selected.y);
    edited();
  }

  function remove(x, y) {
    if (!B.level.remove(state.level, x, y)) return;
    if (sameCell(state.selected, x, y)) state.selected = null;
    edited();
  }

  function clear() {
    B.level.clear(state.level);
    state.selected = null;
    edited();
  }

  var viewActions = {
    pan: function (facing) { B.view.pan(state.view, facing, B.PAN_STEP); changed(); },
    rotate: function (turns) { B.view.rotate(state.view, turns); changed(); },
    zoom: function (delta) { B.view.zoom(state.view, delta); changed(); }
  };

  var toolbarHandlers = {
    pan: viewActions.pan,
    rotate: viewActions.rotate,
    zoom: viewActions.zoom,
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
    save: saveFile,
    open: openFile,
    clear: clear
  };

  var inputHandlers = {
    pick: pick,
    selected: function () { return state.selected; },
    hover: function (hit) {
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
      editSelected(function (x, y) { B.level.raise(state.level, x, y, delta); });
    },
    hold: function (x, y, progress) {
      state.hold = progress == null ? null : { x: x, y: y, progress: progress };
      sched();
    },
    remove: remove,
    pan: viewActions.pan,
    rotate: viewActions.rotate,
    zoom: viewActions.zoom
  };

  // ---- Skeleton ------------------------------------------------------------
  function el(tag, name) {
    var node = document.createElement(tag);
    node.className = B.PREFIX + name;
    return node;
  }

  function buildSkeleton(mount) {
    var layout = el("div", "layout");
    var stage = el("div", "stage");
    canvas = el("canvas", "canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Level");
    stage.appendChild(canvas);
    stage.appendChild(toolbar.hint);
    stage.appendChild(toolbar.status);
    layout.appendChild(toolbar.el);
    layout.appendChild(stage);
    mount.appendChild(layout);
    return stage;
  }

  // ---- Boot ----------------------------------------------------------------
  toolbar = B.toolbar.build(toolbarHandlers);
  var stage = buildSkeleton(root);
  B.input.attach(canvas, inputHandlers);
  watchDrops(stage);
  watchSize(stage);
  changed();
})();
