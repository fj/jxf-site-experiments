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
 * the manifest. The picture is the one thing this file builds into a card's own
 * region, because only some cards carry one — and which ones is the kind's own
 * declaration, not a name written down here.
 *
 * This file owns the shared state, the DOM, and the wiring. The widgets come
 * from the shared control kit (ExpUI, ExpFonts); the card-specific work lives
 * in the modules the manifest loads before it:
 *   config.js   — sizing, fonts, themes, ranges     (DndCard.CARD_MM, …)
 *   data.js     — the 2024 PHB tables               (DndCard.SKILLS, …)
 *   rules.js    — modifiers, proficiency, totals    (DndCard.rules)
 *   dice.js     — the shape of each die             (DndCard.dice)
 *   schools.js  — the mark of each school of magic  (DndCard.schools)
 *   draw.js     — canvas primitives                 (DndCard.draw)
 *   portrait.js — loading and framing the picture   (DndCard.portrait)
 *   sheet.js    — the frame every page draws in     (DndCard.sheet)
 *   pages.js    — the kinds, and a set of them      (DndCard.pages)
 *   card.js, …  — one module per kind of page
 *   downloads.js — the set of pages as files        (DndCard.downloads)
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

  // The panel's own furniture: the block above the tabs, the tabs, and the
  // panel the active card's controls are built into.
  var EVERY_TITLE_ID = "experiment-ext-dndc-every-title";
  var PAGE_PANEL_ID = "experiment-ext-dndc-page";
  var TAB_ID_PREFIX = "experiment-ext-dndc-tab-";
  var CARDS_HINT_ID = "experiment-ext-dndc-cards-hint";
  var ADD_GLYPH = "+";

  // An arrow alone moves between the cards, which is what a tab strip promises;
  // held with a modifier it moves the card itself. Ctrl is the one that isn't
  // already spoken for by the browser or the platform on either.
  var MOVE_MODIFIER_LABEL = "Ctrl";
  var DROP_CLASS = "experiment-ext-dndc-tab-over";

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

  // A card moved is a card selected: the one that just moved is the one worth
  // looking at, and it is where the reader's attention already is. Both ends
  // are a no-op, and nothing is rebuilt for one.
  function movePage(from, to) {
    if (from === to || to < 0 || to >= state.pages.length) return false;
    state.pages.splice(to, 0, state.pages.splice(from, 1)[0]);
    showPage(to);
    return true;
  }

  // Focus follows the card rather than staying at the position it was dragged
  // from, so moving one three places is the same key pressed three times.
  function focusTab(index) {
    var tab = dom.el("#" + tabId(index));
    if (tab && tab.focus) tab.focus();
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
  // What the set can be downloaded as: the card on screen, every card as its
  // own file, or every card on one. Each hangs off one control and runs one of
  // D.downloads' jobs; `told` reads that job's summary back in the terms the
  // job worked in.
  var PRIMARY = "download";   // the figure's own button; the rest sit beside it

  var ACTIONS = [
    { name: PRIMARY, job: D.downloads.page, told: pixels },
    {
      name: "downloadAll", label: "Download all", job: D.downloads.set,
      told: function (summary) { return cardCount(summary.cards) + " · " + pixels(summary) + " each"; }
    },
    {
      name: "downloadSheet", label: "Download all as one", job: D.downloads.sheet,
      told: function (summary) { return cardCount(summary.cards) + " on one " + pixels(summary) + " sheet"; }
    }
  ];

  var ACTION_NAMES = ACTIONS.map(function (action) { return action.name; });

  function pixels(summary) { return summary.width + " × " + summary.height + " px"; }

  function cardCount(count) { return count + (count === 1 ? " card" : " cards"); }

  // The primary download names the card it will save, so its caption follows
  // the tab strip. The kit remembers a button's resting caption the first time
  // that button goes busy, so this is written back after a run as well.
  function syncDownloadLabel() {
    dom.ctl(PRIMARY).querySelector("span").textContent = "Download " + activeLabel();
  }

  function requestFor(name) {
    return {
      // The set as it stood when the button was pressed: a card added while an
      // archive is being built is not one of the cards in it, and neither is a
      // row typed into one after it. A page is plain data by contract, so
      // copying it copies everything the renderer will read off it — an array
      // of the same page objects would let an edit land in a card already
      // reported as saved.
      pages: JSON.parse(JSON.stringify(state.pages)),
      active: state.active,
      identity: buildIdentity(),
      look: buildLook(),
      dpi: state.dpi,
      report: function (label, fraction) {
        dom.busy(name, label);
        dom.progress(fraction);
      }
    };
  }

  function download(action) {
    // Ask before doing the work: where the answer is knowable, there's no
    // point rendering and encoding cards the browser won't be allowed to save.
    var blocked = action.job.blocker();
    if (blocked) {
      dom.status(blocked, "error");
      return;
    }

    var startedAt = performance.now();
    dom.status("");
    dom.disable(ACTION_NAMES, true);

    action.job.run(requestFor(action.name)).then(function (summary) {
      // "Sent", not "saved": the browser takes it from here and tells no one
      // what it did with it. Naming where to look is the honest version, and
      // reading the summary rather than the controls — still editable while a
      // file is being written — is what makes the rest of the sentence honest.
      dom.status("Sent to your downloads · " + action.told(summary) + " tagged " +
        summary.dpi + " dpi · " + Math.round(performance.now() - startedAt) + " ms");
    }).catch(function (err) {
      dom.status(String(err && err.message || err), "error");
    }).then(function () {
      dom.ready(action.name);
      dom.disable(ACTION_NAMES, false);
      dom.progress(null);
      syncDownloadLabel();
    });
  }

  // ---- Portrait ----------------------------------------------------------------------
  // The state and the decoded picture stay here even though the controls are
  // built into a card's own region: a picture outlives the tab it was chosen
  // on, and a fetch can finish long after the reader has moved to another card.
  // Which is why everything below reaches for its controls rather than assuming
  // them — on any other card there are none.
  var PICTURE_GROUP = '[data-group="picture"]';

  function inPicture(target) {
    return !!(target && target.closest && target.closest(PICTURE_GROUP));
  }

  function note(text, kind) {
    var node = dom.el('[data-out="portrait"]');
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("experiment-ext-dndc-note-error", kind === "error");
  }

  function syncPicture() {
    if (!dom.ctl("portraitUrl")) return;
    dom.ctl("portraitUrl").value = state.portraitUrl;
    ["zoom", "panX", "panY"].forEach(function (name) {
      dom.ctl(name).value = state[name];
      dom.val(name, state[name] + "%");
    });
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
      state.portraitUrl = "";
      syncPicture();
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
    syncPicture();
    if (dom.ctl("portraitFile")) dom.ctl("portraitFile").value = "";
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
  //
  // The picture's group is a region inside that one and is checked first: its
  // controls sit within a card but the picture is not the card's. Same rule one
  // level down, which leaves a kind free to call a row of its own `zoom`.
  function onControl(name, target, event) {
    if (inPicture(target)) { onPicture(name, target, event); return; }

    var page = activePage();
    var controls = controlsOf(page);
    if (inPage(target)) {
      if (controls.onControl) controls.onControl(page, name, target, event, pageContext());
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

  function onPicture(name, target, event) {
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
    state[name] = U.readControl(target);
    syncPicture();
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
    // The picture's own button, before the card is offered the click: it sits
    // in the card's region but is not the card's, like the rest of the picture.
    if (inPicture(event.target) && hit(event, '[data-ctl="portraitClear"]')) { clearPortrait(); return; }

    var page = activePage();
    var controls = controlsOf(page);
    if (inPage(event.target) && controls.onClick &&
      controls.onClick(page, event, pageContext())) return;

    var tab = hit(event, "[data-page]");
    if (tab) { showPage(+tab.dataset.page); return; }
    var step = hit(event, "[data-page-step]");
    if (step) { showPage(state.active + (+step.dataset.pageStep)); return; }
    if (hit(event, "[data-add-open]")) {
      var menu = addMenu();
      showAddMenu(!!menu && menu.hidden);
      return;
    }
    var add = hit(event, "[data-add]");
    if (add) { addPage(add.dataset.add); return; }
    if (hit(event, "[data-page-remove]")) removePage(state.active);
  }

  // ---- The card list as a list ------------------------------------------------
  // A drag and the arrow keys do the same thing, so they are bound together and
  // both end in movePage(). The strip is rebuilt from scratch whenever the set
  // changes, so these are bound once to the region around it, which isn't.
  function bindCardList(region) {
    var from = null;

    function tabAt(target) {
      var tab = target && target.closest ? target.closest("[data-page]") : null;
      return tab ? +tab.dataset.page : null;
    }

    function markDrop(index) {
      clearDrop();
      var tab = region.querySelector('[data-page="' + index + '"]');
      if (tab) tab.classList.add(DROP_CLASS);
    }

    function clearDrop() {
      var marked = region.querySelectorAll("." + DROP_CLASS);
      for (var i = 0; i < marked.length; i++) marked[i].classList.remove(DROP_CLASS);
    }

    // Which card the pointer is over, and only while a tab is being dragged: a
    // picture dragged onto the panel is not a reorder.
    function tabUnder(event) {
      return from == null ? null : tabAt(event.target);
    }

    region.addEventListener("keydown", function (event) {
      var index = tabAt(event.target);
      if (index == null) return;
      var step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (!step) return;
      event.preventDefault();   // an arrow key on a button scrolls the page
      if (event.ctrlKey || event.metaKey) movePage(index, index + step);
      else showPage(index + step);
      focusTab(state.active);
    });

    region.addEventListener("dragstart", function (event) {
      from = tabAt(event.target);
      if (from == null) return;
      event.dataTransfer.effectAllowed = "move";
      // Firefox starts no drag at all unless the transfer carries something.
      event.dataTransfer.setData("text/plain", String(from));
    });

    region.addEventListener("dragover", function (event) {
      var over = tabUnder(event);
      if (over == null) return;
      event.preventDefault();   // not preventing the default is how a drop is refused
      event.dataTransfer.dropEffect = "move";
      markDrop(over);
    });

    region.addEventListener("drop", function (event) {
      var over = tabUnder(event);
      if (over == null) return;
      event.preventDefault();
      var moved = from;
      clearDrop();
      from = null;
      movePage(moved, over);
    });

    region.addEventListener("dragend", function () {
      from = null;
      clearDrop();
    });
  }

  // ---- Syncing controls and readouts -------------------------------------------------
  function syncReadouts() {
    dom.val("level", String(state.level));
    dom.el('[data-out="derived"]').textContent =
      "Proficiency bonus " + D.rules.signed(D.rules.proficiencyBonus(state.level));
  }

  // The subclasses worth suggesting depend on the class that's been typed.
  function syncSubclassChoices() {
    dom.el("#" + U.idFor("subclass") + "-list").innerHTML = U.options(D.subclassesFor(state.className));
  }

  var fontPickSync = {};

  function syncShared() {
    ["name", "species", "className", "subclass", "background", "level",
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

  // One tab per card, then the button that adds another. The steppers are for a
  // set too wide to point at: with one card there is nowhere for them to go.
  //
  // A tab is also the card's handle: dragging one onto another moves the card
  // there, and so does holding a modifier and pressing an arrow, which is the
  // same gesture for anyone who isn't holding a mouse.
  function tabsHtml() {
    // One card is a set with no order to put it in, so nothing says how to.
    var orderable = state.pages.length > 1;
    var tabs = state.pages.map(function (page, i) {
      return '<button type="button" role="tab" class="experiment-ext-dndc-tab" id="' + tabId(i) +
        '" data-page="' + i + '" draggable="true" aria-controls="' + PAGE_PANEL_ID + '"' +
        (orderable ? ' aria-describedby="' + CARDS_HINT_ID + '"' : "") +
        ' aria-selected="' + (i === state.active ? "true" : "false") + '">' +
        U.esc(D.pages.labelFor(state.pages, i)) + "</button>";
    }).join("");

    return '<div class="experiment-ext-dndc-tabs">' +
      stepHtml(-1, "‹", "Previous card") +
      '<div class="experiment-ext-dndc-tablist" role="tablist" aria-label="Cards">' + tabs + "</div>" +
      addHtml() +
      stepHtml(1, "›", "Next card") +
      "</div>" +
      (orderable
        ? '<p class="experiment-ext-dndc-note" id="' + CARDS_HINT_ID + '">' +
          "Drag a tab to reorder the cards, or hold " + MOVE_MODIFIER_LABEL +
          " and press the left and right arrow keys while one has focus.</p>"
        : "");
  }

  function stepHtml(delta, glyph, label) {
    return '<button type="button" class="experiment-ext-dndc-step" data-page-step="' + delta +
      '" aria-label="' + label + '"' + (state.pages.length < 2 ? " disabled" : "") + ">" +
      glyph + "</button>";
  }

  // One "+" at the end of the list rather than a button per kind: the kinds are
  // what the reader is choosing between, and a menu is where a choice belongs.
  // It is markup and not state — the list is rebuilt whenever a card is added,
  // which is exactly when the menu should be shut anyway.
  function addHtml() {
    var kinds = D.pages.addable();
    if (!kinds.length) return "";
    return '<div class="experiment-ext-dndc-add">' +
      '<button type="button" class="experiment-ext-dndc-add-card" data-add-open ' +
      'aria-haspopup="menu" aria-expanded="false" aria-label="Add a card">' +
      '<span aria-hidden="true">' + ADD_GLYPH + "</span></button>" +
      '<div class="experiment-ext-dndc-add-menu" role="menu" data-add-menu hidden>' +
      kinds.map(function (definition) {
        return '<button type="button" role="menuitem" class="experiment-ext-dndc-add-choice" ' +
          'data-add="' + U.esc(definition.kind) + '">' + U.esc(definition.label) + "</button>";
      }).join("") +
      "</div></div>";
  }

  function addMenu() { return dom.el("[data-add-menu]"); }

  function showAddMenu(open) {
    var menu = addMenu();
    var button = dom.el("[data-add-open]");
    if (!menu || !button) return;
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) return;
    var first = menu.querySelector("[data-add]");
    if (first) first.focus();
  }

  // The picture is on one card, so its controls are on that card's tab rather
  // than in the block above. Which card that is, the kind says: a kind that
  // wants the reader to choose the set's picture declares it, so this names no
  // kind. Asking its renderer instead would tie one answer to the other — a
  // kind could not reserve the left third for art of its own without also
  // getting the file picker.
  function wantsPicture(page) {
    return !!D.pages.definition(page.kind).picture;
  }

  function pictureHtml() {
    return U.group("Picture",
      '<div class="' + U.PREFIX + 'field">' +
      '<span class="' + U.PREFIX + 'field-label">A picture &mdash; the left third of this card</span>' +
      '<input type="file" accept="image/*" class="experiment-ext-dndc-file" data-ctl="portraitFile">' +
      "</div>" +
      U.text("portraitUrl", "&hellip;or the address of one", { placeholder: "https://…", spellcheck: false }) +
      U.range("zoom", "Zoom", D.RANGES.zoom[0], D.RANGES.zoom[1]) +
      U.range("panX", "Pan across", D.RANGES.pan[0], D.RANGES.pan[1]) +
      U.range("panY", "Pan down", D.RANGES.pan[0], D.RANGES.pan[1]) +
      '<button type="button" class="experiment-ext-dndc-clear" data-ctl="portraitClear">Remove picture</button>' +
      '<p class="experiment-ext-dndc-note" data-out="portrait"></p>',
      { key: "picture" });
  }

  function pageHtml() {
    var page = activePage();
    var controls = controlsOf(page);
    return '<div class="experiment-ext-dndc-region-body">' +
      (wantsPicture(page) ? pictureHtml() : "") +
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
    syncDownloadLabel();
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
    syncPicture();
    syncPage();
    if (controls.mounted) controls.mounted(page, region, pageContext());
  }

  function buildSkeleton(mount) {
    // The card comes first and the controls sit under it: a landscape card
    // wants the page's full width, which leaves no column to put them beside.
    mount.innerHTML = '<div class="' + U.PREFIX + 'layout">' +

      U.figure({
        ariaLabel: "Live preview of the player card",
        // The primary button is captioned for the card it will save, which is
        // whichever one the tab strip is on; the others are the same whatever
        // is showing.
        button: "Download " + activeLabel(),
        actions: ACTIONS.filter(function (action) { return action.name !== PRIMARY; })
      }) +

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
    bindCardList(dom.el('[data-out="tabs"]'));
    // A menu left open over the panel is in the way of the panel. Anything that
    // isn't a click in it, or Escape from anywhere, shuts it.
    document.addEventListener("click", function (event) {
      var inside = event.target.closest ? event.target.closest(".experiment-ext-dndc-add") : null;
      if (!inside) showAddMenu(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") showAddMenu(false);
    });
    ACTIONS.forEach(function (action) {
      dom.ctl(action.name).addEventListener("click", function () { download(action); });
    });
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
