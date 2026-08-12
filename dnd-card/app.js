/*
 * Player Card — a client-side player card generator for D&D 5.5E (app entry).
 *
 * Fill in a character, frame a picture, and download a PNG that prints at
 * 152 × 101 mm. Everything happens in the browser: the preview <canvas> holds
 * the bitmap at the chosen print resolution (CSS only scales it down to fit),
 * so the download is exactly what's on screen. The card sits above the
 * controls, at the full width of the page, because it is landscape.
 *
 * This file owns the control state, the DOM, and the wiring. The widgets come
 * from the shared control kit (ExpUI, ExpFonts, ExpPng); the card-specific
 * work lives in the modules the manifest loads before it:
 *   config.js   — sizing, fonts, themes, ranges     (DndCard.CARD_MM, …)
 *   data.js     — the 2024 PHB tables               (DndCard.SKILLS, …)
 *   rules.js    — modifiers, proficiency, totals    (DndCard.rules)
 *   dice.js     — the shape of each die             (DndCard.dice)
 *   draw.js     — canvas primitives                 (DndCard.draw)
 *   portrait.js — loading and framing the picture   (DndCard.portrait)
 *   card.js     — the card layout                   (DndCard.card)
 *
 * State holds only what the player typed. Everything derived — modifiers,
 * saving throws, skill totals, the pixel dimensions — is computed on the way
 * into a render, so there's no second copy to keep in step.
 */
(function () {
  "use strict";

  var D = window.DndCard;
  var U = window.ExpUI;
  var root = document.getElementById("experiment-ext-dndc");
  if (!root || !D || !U) return;

  var dom = U.dom(root);

  var ABILITY_CONTROL = "ability:";
  var SAVE_CONTROL = "save:";

  // The faces the card sets type in, in the order the panel offers them. Each
  // is a state field of the same name holding a key from D.FONTS.
  var FONT_CONTROLS = ["nameFont", "displayFont", "bodyFont"];

  // A skill's two markers, in the order they're drawn. The index is how many
  // times the proficiency bonus counts once that marker is the last one filled.
  var PROFICIENCY_STEPS = [
    { step: 1, label: "proficient" },
    { step: 2, label: "expertise" }
  ];

  // Progress the download reports. Encoding is a single opaque call, so these
  // are the boundaries between steps rather than a continuous measure.
  var STEP_RENDER = 0.15;
  var STEP_ENCODE = 0.55;
  var STEP_STAMP = 0.85;
  var STEP_DONE = 1;

  // ---- State (what the controls edit) ----------------------------------------
  var state = {
    name: "Thistle Quickfoot",
    species: "Halfling",
    className: "Rogue",
    subclass: "Thief",
    background: "Charlatan",
    level: 5,

    // The three the card leaves a box for. null is a value in its own right:
    // it prints the box empty, for a pencil.
    hitPoints: 32,
    temporaryHitPoints: null,
    hitDiceRemaining: 4,

    hitPointsMax: 38,
    hitDie: 8,
    // What it takes to hit you comes off what you're wearing, so it's typed.
    // Initiative isn't here: it's the Dexterity modifier, so the card works it
    // out like every other number it can.
    armorClass: 15,

    deathSuccesses: 0,
    deathFailures: 0,
    inspiration: true,

    abilities: { str: 10, dex: 17, con: 13, int: 12, wis: 14, cha: 10 },
    saves: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
    skills: {
      acrobatics: 1, deception: 1, insight: 1, perception: 1,
      "sleight-of-hand": 2, stealth: 2
    },

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

    dpi: D.REF_DPI
  };

  // The decoded picture. Kept out of `state` because it isn't a value the
  // controls edit — it's the result of loading one. `loadedUrl` records what
  // the current picture came from, so committing the URL field without having
  // changed it (any blur does that) doesn't refetch.
  var portraitImage = null;
  var loadedUrl = "";

  var canvas, ctx;

  // ---- Derived model -----------------------------------------------------------
  function abilityScore(key) { return state.abilities[key]; }

  function abilityByKey(key) {
    for (var i = 0; i < D.ABILITIES.length; i++) if (D.ABILITIES[i].key === key) return D.ABILITIES[i];
    return D.ABILITIES[0];
  }

  function skillProficiency(key) { return state.skills[key] || 0; }

  function buildModel() {
    return {
      name: state.name,
      species: state.species,
      className: state.className,
      subclass: state.subclass,
      background: state.background,
      level: state.level,
      proficiencyBonus: D.rules.proficiencyBonus(state.level),

      hitPoints: state.hitPoints,
      hitPointsMax: state.hitPointsMax,
      temporaryHitPoints: state.temporaryHitPoints,
      hitDiceRemaining: state.hitDiceRemaining,
      hitDiceTotal: state.level,
      hitDie: state.hitDie,
      armorClass: state.armorClass,
      initiative: D.rules.initiative(abilityScore("dex")),

      deathSuccesses: state.deathSuccesses,
      deathFailures: state.deathFailures,
      inspiration: state.inspiration,

      abilities: D.ABILITIES.map(function (ability) {
        var score = abilityScore(ability.key);
        return {
          abbr: ability.abbr,
          score: score,
          modifier: D.rules.modifier(score),
          saveProficient: !!state.saves[ability.key],
          save: D.rules.savingThrow(score, state.saves[ability.key], state.level)
        };
      }),

      skills: D.SKILLS.map(function (skill) {
        return {
          label: skill.label,
          abbr: abilityByKey(skill.ability).abbr,
          proficiency: skillProficiency(skill.key),
          modifier: D.rules.skillCheck(abilityScore(skill.ability), skillProficiency(skill.key), state.level)
        };
      })
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
    D.card.render(ctx, size, buildModel(), buildLook());
    syncCaption();
  }

  // The canvas holds the print bitmap and CSS scales it into the column — say
  // so, so "what you see" reads as a zoomed view of the real output.
  function syncCaption() {
    var size = outputSize();
    var shown = canvas.getBoundingClientRect().width;
    var scale = shown ? shown / size.width : 1;
    dom.caption(
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
  // Numbers commit differently from everything else: a half-typed value like
  // "" or "1" on its way to "18" shouldn't snap to the range's floor, so a
  // number only takes effect while typing if it's already in range, and is
  // clamped and written back when the field commits (blur or Enter).
  //
  // A `blank` field has one state more: empty, which is not zero. Zero hit
  // points is a character at nought and dying; an empty box is one nobody has
  // written in yet, and that's what the card prints.
  function readNumber(target, event, field, apply) {
    var raw = target.value.trim();
    var range = field.range;
    if (raw === "" && field.blank) { apply(null); return; }

    var parsed = Number(raw);
    var usable = raw !== "" && isFinite(parsed);
    if (event.type === "input" && (!usable || parsed < range[0] || parsed > range[1])) return;
    var value = D.clampR(usable ? Math.round(parsed) : range[0], range);
    if (event.type === "change") target.value = value;
    apply(value);
  }

  // The numbers typed rather than dragged. `blank` marks the ones the card
  // draws a box for, which is exactly the set a player rubs out mid-session.
  var NUMBER_FIELDS = {
    hitPoints: { range: D.RANGES.hitPoints, blank: true },
    temporaryHitPoints: { range: D.RANGES.hitPoints, blank: true },
    hitDiceRemaining: { range: D.RANGES.hitDice, blank: true },
    hitPointsMax: { range: D.RANGES.hitPoints },
    armorClass: { range: D.RANGES.armorClass }
  };

  // A character can't have more hit dice than levels, so that field's ceiling
  // moves with the level slider rather than being fixed in the markup.
  function fieldFor(name) {
    var field = NUMBER_FIELDS[name];
    if (name !== "hitDiceRemaining") return field;
    return { range: [D.RANGES.hitDice[0], state.level], blank: field.blank };
  }

  // Controls whose value changes the card's palette away from a named theme.
  var THEME_COLORS = ["paper", "ink", "accent"];

  // <select> values arrive as strings; these are the ones state holds as
  // numbers, because the card does arithmetic or geometry with them.
  var NUMERIC_SELECTS = ["dpi", "hitDie"];

  function onControl(name, target, event) {
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
    if (name.indexOf(ABILITY_CONTROL) === 0) {
      var abilityKey = name.slice(ABILITY_CONTROL.length);
      readNumber(target, event, { range: D.RANGES.score }, function (value) {
        state.abilities[abilityKey] = value;
        syncAbilities();
        syncSkills();
        sched();
      });
      return;
    }
    if (name.indexOf(SAVE_CONTROL) === 0) {
      state.saves[name.slice(SAVE_CONTROL.length)] = target.checked;
      syncAbilities();
      sched();
      return;
    }
    if (NUMBER_FIELDS[name]) {
      readNumber(target, event, fieldFor(name), function (value) {
        state[name] = value;
        sched();
      });
      return;
    }

    state[name] = NUMERIC_SELECTS.indexOf(name) === -1 ? U.readControl(target) : +target.value;

    if (name === "theme") applyTheme(target.value);
    if (THEME_COLORS.indexOf(name) !== -1) {
      state.theme = "custom";
      dom.ctl("theme").value = "custom";
    }
    if (name === "className") syncSubclassChoices();
    if (name === "level") {
      if (state.hitDiceRemaining != null) {
        state.hitDiceRemaining = Math.min(state.hitDiceRemaining, state.level);
        dom.ctl("hitDiceRemaining").value = state.hitDiceRemaining;
      }
      syncAbilities();
      syncSkills();
    }
    syncReadouts();
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

  function onProficiencyClick(event) {
    var button = event.target.closest ? event.target.closest("[data-prof]") : null;
    if (!button) return;
    var key = button.dataset.prof;
    state.skills[key] = D.rules.toggleProficiency(skillProficiency(key), +button.dataset.step);
    syncSkills();
    sched();
  }

  // ---- Syncing controls and readouts -------------------------------------------------
  function syncReadouts() {
    var bonus = D.rules.proficiencyBonus(state.level);
    dom.val("level", String(state.level));
    dom.val("deathSuccesses", String(state.deathSuccesses));
    dom.val("deathFailures", String(state.deathFailures));
    dom.val("zoom", state.zoom + "%");
    dom.val("panX", state.panX + "%");
    dom.val("panY", state.panY + "%");
    dom.el('[data-out="die"]').innerHTML = D.dice.svg(state.hitDie);
    dom.el('[data-out="derived"]').textContent =
      "Proficiency bonus " + D.rules.signed(bonus) + " · " + state.level + " hit dice";
  }

  function syncAbilities() {
    D.ABILITIES.forEach(function (ability) {
      var score = abilityScore(ability.key);
      dom.val("mod:" + ability.key, D.rules.signed(D.rules.modifier(score)));
      dom.val("save:" + ability.key,
        D.rules.signed(D.rules.savingThrow(score, state.saves[ability.key], state.level)));
    });
    // Initiative has no field of its own — it follows Dexterity — so this is
    // where the card's third badge gets to say where its number came from.
    dom.el('[data-out="initiative"]').textContent = "Initiative " +
      D.rules.signed(D.rules.initiative(abilityScore("dex"))) + ", from Dexterity.";
  }

  // A marker here shows the bonus filling it is worth — the card leaves its own
  // diamonds empty and prints the number once, but this is where the clicking
  // happens. Each carries its own on/off state for assistive technology.
  function syncSkills() {
    var bonus = D.rules.signed(D.rules.proficiencyBonus(state.level));
    D.SKILLS.forEach(function (skill) {
      var proficiency = skillProficiency(skill.key);
      PROFICIENCY_STEPS.forEach(function (marker) {
        var button = dom.el('[data-prof="' + skill.key + '"][data-step="' + marker.step + '"]');
        var applies = proficiency >= marker.step;
        button.firstChild.textContent = bonus;
        button.dataset.on = applies ? "true" : "false";
        button.setAttribute("aria-pressed", applies ? "true" : "false");
        button.setAttribute("aria-label", skill.label + ": " + marker.label);
      });
      dom.val("skill:" + skill.key,
        D.rules.signed(D.rules.skillCheck(abilityScore(skill.ability), proficiency, state.level)));
    });
  }

  // The subclasses worth suggesting depend on the class that's been typed.
  function syncSubclassChoices() {
    dom.el("#" + U.idFor("subclass") + "-list").innerHTML = U.options(D.subclassesFor(state.className));
  }

  var fontPickSync = {};

  function syncControls() {
    // A blank field is state.<name> === null; writing that straight onto an
    // input would put the word "null" in it.
    ["name", "species", "className", "subclass", "background", "portraitUrl",
      "hitPoints", "hitPointsMax", "temporaryHitPoints", "hitDiceRemaining", "armorClass",
      "level", "deathSuccesses", "deathFailures", "zoom", "panX", "panY",
      "theme", "paper", "ink", "accent"].forEach(function (name) {
        dom.ctl(name).value = state[name] == null ? "" : state[name];
      });
    dom.ctl("inspiration").checked = state.inspiration;
    dom.ctl("dpi").value = String(state.dpi);
    dom.ctl("hitDie").value = String(state.hitDie);
    D.ABILITIES.forEach(function (ability) {
      dom.ctl(ABILITY_CONTROL + ability.key).value = abilityScore(ability.key);
      dom.ctl(SAVE_CONTROL + ability.key).checked = !!state.saves[ability.key];
    });
    FONT_CONTROLS.forEach(function (name) { fontPickSync[name](); });
    syncSubclassChoices();
    syncAbilities();
    syncSkills();
    syncReadouts();
  }

  function initFontPick(name) {
    fontPickSync[name] = U.initFontPick(root, name, D.FONTS,
      function () { return state[name]; },
      function (key) { state[name] = key; sched(); });
  }

  // ---- Skeleton ---------------------------------------------------------------------
  // Three bare numbers in a row don't say which is which; the header does. The
  // checkbox's column is the one it doesn't name, because what that box does is
  // worth more words than a column head has room for.
  function abilitiesHtml() {
    return '<div class="experiment-ext-dndc-abilities">' +
      '<div class="experiment-ext-dndc-ability-head" aria-hidden="true">' +
      "<span></span><span>Score</span><span>Mod</span><span></span><span>Save</span></div>" +
      D.ABILITIES.map(abilityRowHtml).join("") + "</div>";
  }

  function abilityRowHtml(ability) {
    var scoreId = "experiment-ext-dndc-" + ability.key;
    return '<div class="experiment-ext-dndc-ability">' +
      '<label class="experiment-ext-dndc-ability-name" for="' + scoreId + '">' + ability.label + "</label>" +
      '<input type="number" class="' + U.PREFIX + 'input" id="' + scoreId + '" data-ctl="' +
      ABILITY_CONTROL + ability.key + '" min="' + D.RANGES.score[0] + '" max="' + D.RANGES.score[1] + '">' +
      '<span class="experiment-ext-dndc-derived" data-val="mod:' + ability.key + '"></span>' +
      '<label class="' + U.PREFIX + 'check"><input type="checkbox" data-ctl="' + SAVE_CONTROL + ability.key + '"> Proficient</label>' +
      '<span class="experiment-ext-dndc-derived" data-val="save:' + ability.key + '"></span>' +
      "</div>";
  }

  // A field the card prints as a box: the dash stands in for the empty box
  // you'd get by leaving it alone.
  function writeIn(range) {
    return { min: range[0], max: range[1], placeholder: "—" };
  }

  // The die beside its own name: "d8" is what you call it, the octahedron is
  // what you pick up. It's chosen, not worked out from the class — multiclass
  // characters and homebrew both have more than one answer.
  function hitDieFieldHtml() {
    var options = D.dice.SIDES.map(function (sides) {
      return { value: String(sides), label: "d" + sides };
    });
    return '<div class="experiment-ext-dndc-die">' + U.select("hitDie", "Hit die", options) +
      '<span class="experiment-ext-dndc-die-icon" data-out="die"></span></div>';
  }

  function profMarkerHtml(skill, marker) {
    return '<button type="button" class="experiment-ext-dndc-prof" data-prof="' + skill.key +
      '" data-step="' + marker.step + '" title="' + U.esc(skill.label + ": " + marker.label) +
      '"><span aria-hidden="true"></span></button>';
  }

  function skillRowHtml(skill) {
    return '<div class="experiment-ext-dndc-skill">' +
      PROFICIENCY_STEPS.map(function (marker) { return profMarkerHtml(skill, marker); }).join("") +
      '<span class="experiment-ext-dndc-skill-name">' + U.esc(skill.label) + "</span>" +
      '<span class="experiment-ext-dndc-skill-ability">' + abilityByKey(skill.ability).abbr + "</span>" +
      '<span class="experiment-ext-dndc-derived" data-val="skill:' + skill.key + '"></span>' +
      "</div>";
  }

  function buildSkeleton(mount) {
    var resolutions = D.DPI_CHOICES.map(function (dpi) {
      var size = D.pixelsFor(dpi);
      return { value: String(dpi), label: dpi + " dpi — " + size.width + " × " + size.height + " px" };
    });

    // The card comes first and the controls sit under it: a landscape card
    // wants the page's full width, which leaves no column to put them beside.
    mount.innerHTML = '<div class="' + U.PREFIX + 'layout">' +

      U.figure({ ariaLabel: "Live preview of the player card", button: "Download PNG" }) +

      '<div class="' + U.PREFIX + 'panel">' +

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
        '<span class="' + U.PREFIX + 'field-label">Picture &mdash; the left third of the card</span>' +
        '<input type="file" accept="image/*" class="experiment-ext-dndc-file" data-ctl="portraitFile">' +
        "</div>" +
        U.text("portraitUrl", "&hellip;or the address of one", { placeholder: "https://…", spellcheck: false }) +
        U.range("zoom", "Zoom", D.RANGES.zoom[0], D.RANGES.zoom[1]) +
        U.range("panX", "Pan across", D.RANGES.pan[0], D.RANGES.pan[1]) +
        U.range("panY", "Pan down", D.RANGES.pan[0], D.RANGES.pan[1]) +
        '<button type="button" class="experiment-ext-dndc-clear" data-ctl="portraitClear">Remove picture</button>' +
        '<p class="experiment-ext-dndc-note" data-out="portrait"></p>'
      ) +

      U.group("Vitals",
        U.grid2(
          U.number("hitPoints", "Hit points", writeIn(D.RANGES.hitPoints)),
          U.number("hitPointsMax", "Maximum", { min: D.RANGES.hitPoints[0], max: D.RANGES.hitPoints[1] })) +
        U.grid2(
          U.number("temporaryHitPoints", "Temporary", writeIn(D.RANGES.hitPoints)),
          U.number("hitDiceRemaining", "Hit dice left", writeIn(D.RANGES.hitDice))) +
        U.grid2(
          U.number("armorClass", "Armor class",
            { min: D.RANGES.armorClass[0], max: D.RANGES.armorClass[1] }),
          hitDieFieldHtml()) +
        '<p class="experiment-ext-dndc-note">Hit points, temporary hit points and hit dice ' +
        "are boxes on the card rather than printed numbers. Leave one empty and it prints " +
        "empty, ready for a pencil.</p>" +
        '<p class="experiment-ext-dndc-note" data-out="initiative"></p>'
      ) +

      U.group("Situational",
        U.range("deathSuccesses", "Death saves", D.RANGES.deathSaves[0], D.RANGES.deathSaves[1]) +
        U.range("deathFailures", "Failures", D.RANGES.deathSaves[0], D.RANGES.deathSaves[1]) +
        U.check("inspiration", "Heroic inspiration")
      ) +

      U.group("Abilities &amp; saving throws",
        '<p class="experiment-ext-dndc-note">Checking a box adds your proficiency bonus to that ' +
        "saving throw — it doesn’t turn the save on, and the card marks it with a filled " +
        "diamond.</p>" +
        abilitiesHtml()
      ) +

      U.group("Skills",
        '<p class="experiment-ext-dndc-note">Fill the first diamond for proficiency and both for ' +
        "expertise. Each one adds your proficiency bonus, which the card prints once, in the " +
        "diamond beside the character’s name.</p>" +
        '<div class="experiment-ext-dndc-skills">' + D.SKILLS.map(skillRowHtml).join("") + "</div>",
        { key: "skills" }
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
        '<p class="experiment-ext-dndc-note">Always ' + D.CARD_MM.width + " &times; " + D.CARD_MM.height +
        "&nbsp;mm on paper. The PNG carries its resolution, so print dialogs size it correctly " +
        "instead of guessing.</p>"
      ) +

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
    syncControls();

    U.bind(root, onControl);
    root.addEventListener("click", onProficiencyClick);
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
