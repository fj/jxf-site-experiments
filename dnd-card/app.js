/*
 * Player Card — a client-side player card generator for D&D 5.5E (app entry).
 *
 * Fill in a character, frame a picture, and download a PNG that prints at
 * 152 × 101 mm. Everything happens in the browser: the preview <canvas> holds
 * the bitmap at the chosen print resolution (CSS only scales it down to fit),
 * so the download is exactly what's on screen. The card sits above the
 * controls, at the full width of the page, because it is landscape.
 *
 * A character has a *set* of cards rather than one, so the panel is in three
 * parts: what every card in the set shares, the strip of cards themselves, and
 * the controls of whichever one is being edited. Only the third of those knows
 * anything card-shaped, and it doesn't know it either — it asks the page's kind
 * for its markup and hands its events back. Nothing in this file names a kind:
 * a new one is a new module that registers itself with D.pages and a line in
 * the manifest.
 *
 * This file owns the shared state, the DOM, and the wiring. The widgets come
 * from the shared control kit (ExpUI, ExpFonts, ExpPng); the card-specific
 * work lives in the modules the manifest loads before it:
 *   config.js   — sizing, fonts, themes, ranges     (DndCard.CARD_MM, …)
 *   data.js     — the 2024 PHB tables               (DndCard.SKILLS, …)
 *   rules.js    — modifiers, proficiency, totals    (DndCard.rules)
 *   dice.js     — the shape of each die             (DndCard.dice)
 *   draw.js     — canvas primitives                 (DndCard.draw)
 *   portrait.js — loading and framing the picture   (DndCard.portrait)
 *   sheet.js    — the frame every page draws in     (DndCard.sheet)
 *   pages.js    — the kinds, and a set of them      (DndCard.pages)
 *   card.js, …  — one module per kind of page
 *
 * State holds only what the player typed: the shared half here, the per-page
 * half on the page objects themselves. Everything derived — modifiers, saving
 * throws, skill totals, the pixel dimensions — is computed on the way into a
 * render, so there's no second copy to keep in step.
 */
(function () {
  "use strict";

  var D = window.DndCard;
  var U = window.ExpUI;
  var root = document.getElementById("experiment-ext-dndc");
  if (!root || !D || !U) return;

  var dom = U.dom(root);

  // The faces the card sets type in, in the order the panel offers them. Each
  // is a state field of the same name holding a key from D.FONTS.
  var FONT_CONTROLS = ["nameFont", "displayFont", "bodyFont"];

  // Progress the download reports. Encoding is a single opaque call, so these
  // are the boundaries between steps rather than a continuous measure.
  var STEP_RENDER = 0.15;
  var STEP_ENCODE = 0.55;
  var STEP_STAMP = 0.85;
  var STEP_DONE = 1;

  // The panel's own furniture: the block above the tabs, the tabs, and the
  // panel the active card's controls are built into.
  var EVERY_TITLE_ID = "experiment-ext-dndc-every-title";
  var PAGE_PANEL_ID = "experiment-ext-dndc-page";
  var TAB_ID_PREFIX = "experiment-ext-dndc-tab-";

  // ---- State (what the controls edit) ----------------------------------------
  // Everything here belongs to the whole set. What belongs to one card is on
  // that card, put there by its kind's create().
  var state = {
    name: "Thistle Quickfoot",
    species: "Halfling",
    className: "Rogue",
    subclass: "Thief",
    background: "Charlatan",
    level: 5,

    theme: "parchment",
    paper: "#f2e6cc",
    ink: "#2b2016",
    accent: "#7c2d1a",
    // The card reads as a sans by default; the name is the one line worth
    // setting in something with a flourish, so it has a face of its own.
    nameFont: "grenze-gotisch",
    displayFont: "fira-sans",
    bodyFont: "fira-sans",

    portraitUrl: "",
    zoom: 100,
    panX: 0,
    panY: 0,

    dpi: D.REF_DPI,

    pages: D.pages.initial(),
    active: 0
  };

  // The decoded picture. Kept out of `state` because it isn't a value the
  // controls edit — it's the result of loading one. `loadedUrl` records what
  // the current picture came from, so committing the URL field without having
  // changed it (any blur does that) doesn't refetch.
  var portraitImage = null;
  var loadedUrl = "";

  var canvas, ctx;

  // ---- The set ---------------------------------------------------------------
  function activePage() { return state.pages[state.active]; }

  function controlsOf(page) { return D.pages.definition(page.kind).controls || {}; }

  function activeLabel() { return D.pages.labelFor(state.pages, state.active); }

  function pageRegion() { return dom.el("#" + PAGE_PANEL_ID); }

  // What a page's control hooks are given: how to ask for a repaint, how to ask
  // for their own markup back, a DOM handle, and the character their numbers
  // come off. Built per call, so `identity` is never stale. The handle is
  // scoped to the page's own markup: every control in the mount is named in one
  // flat data-ctl namespace, and a card has no business reading — or
  // overwriting — the block above the tabs.
  function pageContext() {
    return {
      render: sched,
      rebuild: rebuildPage,
      dom: U.dom(pageRegion()),
      identity: buildIdentity()
    };
  }

  // …and for the same reason a page's hooks are offered only the events its own
  // controls raised.
  function inPage(target) {
    var region = pageRegion();
    return !!(target && region && region.contains(target));
  }

  function showPage(index) {
    var count = state.pages.length;
    state.active = ((index % count) + count) % count;
    renderTabs();
    rebuildPage();
    sched();
  }

  function addPage(kind) {
    state.pages.push(D.pages.create(kind));
    showPage(state.pages.length - 1);
  }

  function removePage(index) {
    if (!D.pages.removable(state.pages[index].kind)) return;
    state.pages.splice(index, 1);
    showPage(Math.min(index, state.pages.length - 1));
  }

  // ---- Derived model -----------------------------------------------------------
  function buildIdentity() {
    return {
      name: state.name,
      species: state.species,
      className: state.className,
      subclass: state.subclass,
      background: state.background,
      level: state.level,
      proficiencyBonus: D.rules.proficiencyBonus(state.level)
    };
  }

  function buildLook() {
    return {
      background: state.paper,
      ink: state.ink,
      accent: state.accent,
      nameFamily: D.familyOf(state.nameFont),
      displayFamily: D.familyOf(state.displayFont),
      bodyFamily: D.familyOf(state.bodyFont),
      portrait: { image: portraitImage, zoom: state.zoom, panX: state.panX, panY: state.panY }
    };
  }

  function outputSize() { return D.pixelsFor(state.dpi); }

  // ---- Render --------------------------------------------------------------------
  function render() {
    var size = outputSize();
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    D.sheet.render(ctx, size, activePage(), buildIdentity(), buildLook(), activeLabel());
    syncCaption();
  }

  // The canvas holds the print bitmap and CSS scales it into the column — say
  // so, so "what you see" reads as a zoomed view of the real output.
  function syncCaption() {
    var size = outputSize();
    var shown = canvas.getBoundingClientRect().width;
    var scale = shown ? shown / size.width : 1;
    dom.caption(
      activeLabel() + " · " +
      size.width + " × " + size.height + " px · " +
      D.CARD_MM.width + " × " + D.CARD_MM.height + " mm at " + state.dpi + " dpi" +
      (Math.abs(scale - 1) < 0.01 ? "" : " · preview scaled to " + Math.round(scale * 100) + "%"));
  }

  var rafId = null;
  function sched() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = null; render(); });
  }

  // ---- Download --------------------------------------------------------------------
  function fileSlug() {
    return String(state.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player";
  }

  function download() {
    // Ask before doing the work: where the answer is knowable, there's no
    // point rendering and encoding a card the browser won't be allowed to save.
    var blocked = window.ExpPng.saveBlocker();
    if (blocked) {
      dom.status(blocked, "error");
      return;
    }

    var size = outputSize();
    var startedAt = performance.now();
    dom.busy("download", "Rendering…");
    dom.status("");
    dom.progress(STEP_RENDER);
    render();

    dom.busy("download", "Encoding PNG…");
    dom.progress(STEP_ENCODE);
    window.ExpPng.encode(canvas).then(function (blob) {
      dom.busy("download", "Tagging " + state.dpi + " dpi…");
      dom.progress(STEP_STAMP);
      return window.ExpPng.withDensity(blob, state.dpi);
    }).then(function (blob) {
      dom.progress(STEP_DONE);
      window.ExpPng.save(blob, fileSlug() + "-card-" + size.width + "x" + size.height + ".png");
      // "Sent", not "saved": the browser takes it from here and tells no one
      // what it did with it. Naming where to look is the honest version.
      dom.status("Sent to your downloads · " + size.width + " × " + size.height +
        " px tagged " + state.dpi + " dpi · " + Math.round(performance.now() - startedAt) + " ms");
    }).catch(function (err) {
      dom.status(String(err && err.message || err), "error");
    }).then(function () {
      dom.ready("download");
      dom.progress(null);
    });
  }

  // ---- Portrait ----------------------------------------------------------------------
  function note(text, kind) {
    var node = dom.el('[data-out="portrait"]');
    node.textContent = text || "";
    node.classList.toggle("experiment-ext-dndc-note-error", kind === "error");
  }

  function usePortrait(image, source, description) {
    portraitImage = image;
    loadedUrl = source;
    note(description + " · " + image.naturalWidth + " × " + image.naturalHeight);
    sched();
  }

  function loadFile(file) {
    note("Reading " + file.name + "…");
    D.portrait.fromFile(file).then(function (image) {
      dom.ctl("portraitUrl").value = "";
      state.portraitUrl = "";
      usePortrait(image, "", file.name);
    }).catch(function (err) {
      note(String(err.message), "error");
    });
  }

  function loadUrl(url) {
    if (!url) { clearPortrait(); return; }
    note("Fetching…");
    D.portrait.fromUrl(url).then(function (image) {
      usePortrait(image, url, "Loaded");
    }).catch(function (err) {
      note(String(err.message), "error");
    });
  }

  function clearPortrait() {
    portraitImage = null;
    loadedUrl = "";
    state.portraitUrl = "";
    dom.ctl("portraitUrl").value = "";
    dom.ctl("portraitFile").value = "";
    note("");
    sched();
  }

  // ---- Controls -------------------------------------------------------------------------
  // Controls whose value changes the card's palette away from a named theme.
  var THEME_COLORS = ["paper", "ink", "accent"];

  // <select> values arrive as strings; these are the ones state holds as
  // numbers, because the card does arithmetic or geometry with them.
  var NUMERIC_SELECTS = ["dpi"];

  // An edit inside the active card's controls is the card's to make sense of;
  // anything else is the shared block's. A card's control that its own kind
  // declines stops here rather than falling through: the region decides whose
  // an edit is, not the kind's cooperation, or a row named `level` would set
  // the character's.
  function onControl(name, target, event) {
    var page = activePage();
    var controls = controlsOf(page);
    if (inPage(target)) {
      if (controls.onControl) controls.onControl(page, name, target, event, pageContext());
      return;
    }

    if (name === "portraitFile") {
      if (target.files && target.files[0]) loadFile(target.files[0]);
      return;
    }
    if (name === "portraitUrl") {
      state.portraitUrl = target.value;
      var url = target.value.trim();
      if (event.type === "change" && url !== loadedUrl) loadUrl(url);
      return;
    }

    state[name] = NUMERIC_SELECTS.indexOf(name) === -1 ? U.readControl(target) : +target.value;

    if (name === "theme") applyTheme(target.value);
    if (THEME_COLORS.indexOf(name) !== -1) {
      state.theme = "custom";
      dom.ctl("theme").value = "custom";
    }
    if (name === "className") syncSubclassChoices();
    syncReadouts();
    // What the shared block holds — the level above all — is what half the
    // numbers on a card are worked out from, so the card's own controls are
    // re-read whenever it changes.
    syncPage();
    sched();
  }

  function applyTheme(key) {
    var theme = D.themeOf(key);
    if (!theme.background) return; // "Custom…" keeps whatever is set
    state.paper = theme.background;
    state.ink = theme.ink;
    state.accent = theme.accent;
    dom.ctl("paper").value = state.paper;
    dom.ctl("ink").value = state.ink;
    dom.ctl("accent").value = state.accent;
  }

  function hit(event, selector) {
    return event.target.closest ? event.target.closest(selector) : null;
  }

  function onClick(event) {
    var page = activePage();
    var controls = controlsOf(page);
    if (inPage(event.target) && controls.onClick &&
      controls.onClick(page, event, pageContext())) return;

    var tab = hit(event, "[data-page]");
    if (tab) { showPage(+tab.dataset.page); return; }
    var step = hit(event, "[data-page-step]");
    if (step) { showPage(state.active + (+step.dataset.pageStep)); return; }
    var add = hit(event, "[data-add]");
    if (add) { addPage(add.dataset.add); return; }
    if (hit(event, "[data-page-remove]")) removePage(state.active);
  }

  // ---- Syncing controls and readouts -------------------------------------------------
  function syncReadouts() {
    dom.val("level", String(state.level));
    dom.val("zoom", state.zoom + "%");
    dom.val("panX", state.panX + "%");
    dom.val("panY", state.panY + "%");
    dom.el('[data-out="derived"]').textContent =
      "Proficiency bonus " + D.rules.signed(D.rules.proficiencyBonus(state.level));
  }

  // The subclasses worth suggesting depend on the class that's been typed.
  function syncSubclassChoices() {
    dom.el("#" + U.idFor("subclass") + "-list").innerHTML = U.options(D.subclassesFor(state.className));
  }

  var fontPickSync = {};

  function syncShared() {
    ["name", "species", "className", "subclass", "background", "portraitUrl",
      "level", "zoom", "panX", "panY",
      "theme", "paper", "ink", "accent"].forEach(function (name) {
        dom.ctl(name).value = state[name];
      });
    dom.ctl("dpi").value = String(state.dpi);
    FONT_CONTROLS.forEach(function (name) { fontPickSync[name](); });
    syncSubclassChoices();
    syncReadouts();
  }

  function syncPage() {
    var page = activePage();
    var controls = controlsOf(page);
    var ctx = pageContext();
    if (controls.sync) controls.sync(page, ctx.dom, ctx);
  }

  function initFontPick(name) {
    fontPickSync[name] = U.initFontPick(root, name, D.FONTS,
      function () { return state[name]; },
      function (key) { state[name] = key; sched(); });
  }

  // ---- Skeleton ---------------------------------------------------------------------
  // The block above the tabs: everything true of the whole set, whichever card
  // is on top.
  function everyCardHtml() {
    var resolutions = D.DPI_CHOICES.map(function (dpi) {
      var size = D.pixelsFor(dpi);
      return { value: String(dpi), label: dpi + " dpi — " + size.width + " × " + size.height + " px" };
    });

    return '<section class="experiment-ext-dndc-every" aria-labelledby="' + EVERY_TITLE_ID + '">' +
      '<h3 class="experiment-ext-dndc-region-title" id="' + EVERY_TITLE_ID + '">Every card</h3>' +
      '<div class="experiment-ext-dndc-region-body">' +

      U.group("Character",
        U.text("name", "Character name") +
        U.grid2(
          U.combo("species", "Species", D.SPECIES),
          U.combo("background", "Background", D.BACKGROUNDS)) +
        U.grid2(
          U.combo("className", "Class", D.classNames()),
          U.combo("subclass", "Subclass", D.subclassesFor(state.className))) +
        U.range("level", "Level", D.RANGES.level[0], D.RANGES.level[1]) +
        '<p class="experiment-ext-dndc-note" data-out="derived"></p>'
      ) +

      U.group("Portrait",
        '<div class="' + U.PREFIX + 'field">' +
        '<span class="' + U.PREFIX + 'field-label">Picture &mdash; the left third of the character card</span>' +
        '<input type="file" accept="image/*" class="experiment-ext-dndc-file" data-ctl="portraitFile">' +
        "</div>" +
        U.text("portraitUrl", "&hellip;or the address of one", { placeholder: "https://…", spellcheck: false }) +
        U.range("zoom", "Zoom", D.RANGES.zoom[0], D.RANGES.zoom[1]) +
        U.range("panX", "Pan across", D.RANGES.pan[0], D.RANGES.pan[1]) +
        U.range("panY", "Pan down", D.RANGES.pan[0], D.RANGES.pan[1]) +
        '<button type="button" class="experiment-ext-dndc-clear" data-ctl="portraitClear">Remove picture</button>' +
        '<p class="experiment-ext-dndc-note" data-out="portrait"></p>'
      ) +

      U.group("Look",
        U.select("theme", "Theme", D.THEMES.map(function (theme) {
          return { value: theme.key, label: theme.label };
        })) +
        U.fontPick("nameFont", D.FONTS, "Name font") +
        U.grid2(
          U.fontPick("displayFont", D.FONTS, "Display font"),
          U.fontPick("bodyFont", D.FONTS, "Body font")) +
        '<p class="experiment-ext-dndc-note">The character\'s name has a face of its own. ' +
        "The display font sets the headings and the numbers you read off the card; the body " +
        "font sets everything you read as words.</p>" +
        U.grid2(
          U.color("paper", "Paper"),
          U.color("ink", "Ink")) +
        U.color("accent", "Accent")
      ) +

      U.group("Output",
        U.select("dpi", "Print resolution", resolutions) +
        '<p class="experiment-ext-dndc-note">Every card is ' + D.CARD_MM.width + " &times; " +
        D.CARD_MM.height + "&nbsp;mm on paper. The PNG carries its resolution, so print " +
        "dialogs size it correctly instead of guessing.</p>"
      ) +

      "</div></section>";
  }

  function tabId(index) { return TAB_ID_PREFIX + index; }

  // One tab per card, and a button for every kind a reader may add. The
  // steppers are for a set too wide to point at: with one card there is
  // nowhere for them to go.
  function tabsHtml() {
    var tabs = state.pages.map(function (page, i) {
      return '<button type="button" role="tab" class="experiment-ext-dndc-tab" id="' + tabId(i) +
        '" data-page="' + i + '" aria-controls="' + PAGE_PANEL_ID +
        '" aria-selected="' + (i === state.active ? "true" : "false") + '">' +
        U.esc(D.pages.labelFor(state.pages, i)) + "</button>";
    }).join("");

    var adders = D.pages.addable().map(function (definition) {
      return '<button type="button" class="experiment-ext-dndc-add-card" data-add="' +
        U.esc(definition.kind) + '">+ ' + U.esc(definition.label) + "</button>";
    }).join("");

    return '<div class="experiment-ext-dndc-tabs">' +
      stepHtml(-1, "‹", "Previous card") +
      '<div class="experiment-ext-dndc-tablist" role="tablist" aria-label="Cards">' + tabs + "</div>" +
      stepHtml(1, "›", "Next card") +
      "</div>" +
      (adders ? '<div class="experiment-ext-dndc-add">' +
        '<span class="experiment-ext-dndc-add-label">Add a card</span>' + adders + "</div>" : "");
  }

  function stepHtml(delta, glyph, label) {
    return '<button type="button" class="experiment-ext-dndc-step" data-page-step="' + delta +
      '" aria-label="' + label + '"' + (state.pages.length < 2 ? " disabled" : "") + ">" +
      glyph + "</button>";
  }

  function pageHtml() {
    var page = activePage();
    var controls = controlsOf(page);
    return '<div class="experiment-ext-dndc-region-body">' +
      (controls.html ? controls.html(page, pageContext()) : "") +
      (D.pages.removable(page.kind)
        ? '<div class="experiment-ext-dndc-page-actions">' +
          '<button type="button" class="experiment-ext-dndc-clear" data-page-remove>Remove this card</button>' +
          "</div>"
        : "") +
      "</div>";
  }

  function renderTabs() {
    dom.el('[data-out="tabs"]').innerHTML = tabsHtml();
    pageRegion().setAttribute("aria-labelledby", tabId(state.active));
  }

  // A page's controls are built fresh every time one is shown, and again
  // whenever a kind asks for its own markup back, so a kind that binds anything
  // beyond an edit or a click — a drag, a key — is handed its region to bind it
  // to each time.
  function rebuildPage() {
    var region = pageRegion();
    var page = activePage();
    var controls = controlsOf(page);
    region.innerHTML = pageHtml();
    syncPage();
    if (controls.mounted) controls.mounted(page, region, pageContext());
  }

  function buildSkeleton(mount) {
    // The card comes first and the controls sit under it: a landscape card
    // wants the page's full width, which leaves no column to put them beside.
    mount.innerHTML = '<div class="' + U.PREFIX + 'layout">' +

      U.figure({ ariaLabel: "Live preview of the player card", button: "Download PNG" }) +

      '<div class="' + U.PREFIX + 'panel">' +
      everyCardHtml() +
      '<div class="experiment-ext-dndc-cards" data-out="tabs"></div>' +
      '<div class="experiment-ext-dndc-page" id="' + PAGE_PANEL_ID + '" role="tabpanel"></div>' +
      "</div></div>";
  }

  // ===========================================================================
  // Boot
  // ===========================================================================
  function start() {
    buildSkeleton(root);
    canvas = dom.canvas();
    ctx = canvas.getContext("2d");
    FONT_CONTROLS.forEach(function (name) { initFontPick(name); });
    syncShared();
    renderTabs();
    rebuildPage();

    U.bind(root, onControl);
    root.addEventListener("click", onClick);
    dom.ctl("download").addEventListener("click", download);
    dom.ctl("portraitClear").addEventListener("click", clearPortrait);
    U.dropTarget(dom.el("[data-preview]"), "image/", loadFile);

    render();
    // The caption's "preview scaled to N%" note tracks the preview's CSS
    // width, which changes with the window, not just with control edits.
    window.addEventListener("resize", syncCaption);
  }

  window.ExpFonts.boot(root, {
    label: "Loading fonts…",
    cssUrl: D.FONTS_CSS_URL,
    families: D.FONTS.map(function (font) { return font.family; }),
    weights: [400, 700],
    start: start,
    // Faces that arrive after the timeout change every measured width, so the
    // card has to be laid out again.
    onLate: sched
  });
})();
