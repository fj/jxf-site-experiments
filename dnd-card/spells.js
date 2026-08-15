/*
 * Player Card — the spells page.
 *
 * A spell list is read down while something else is happening, so a row says
 * four things and stops: which school the spell comes from, what level it is
 * cast at, what it is called, and what it does in a line. The school is a mark
 * rather than a word, because spelling out "Transmutation" ten times would take
 * the room the spell's own name needs, and a shape sorts a page faster than a
 * word reads. schools.js draws the marks; this file is the page kind they sit
 * in — what a blank one holds, how a row of it is drawn, and the ten rows of
 * controls that fill it.
 *
 * The card prints the rows by level and then by name, because at the table a
 * spell is looked for by the slot there is one of left. The panel keeps them in
 * the order they were typed: a row that jumped up the list as its name was
 * being typed would be a row nobody could finish typing into. So the sort is
 * the card's, and the ten slots are the reader's.
 *
 * There are always ten rows, and a blank one prints blank — sorted to the
 * bottom, where the room to write another spell down belongs. The card is meant
 * to be written on between sessions, and a list that grew and shrank with what
 * has been typed would leave nowhere to write the next one. Nothing is printed
 * on a row nobody has used yet — not even its school — because ink is the one
 * thing a pencil can't take back.
 *
 * A row is a run of type set by D.sheet.namedLine, which wraps it down the row
 * at the size it was asked for rather than shrinking it, and cuts what a row
 * that deep still cannot hold.
 *
 * Every length below is a design px on the 300 dpi card and is scaled by the
 * frame's `u()`, so the same layout renders at any output resolution.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};
  var U = window.ExpUI;

  var KIND = "spells";
  var ROW_COUNT = 10;

  // The list is a lid, a line of column heads, and then the rows. Ten rows at
  // this height fill the body under the header band with a little air left
  // over, which the block is centered in.
  var HEAD_HEIGHT = 30;
  var ROW_HEIGHT = 82;

  // The mark keeps a column of its own down the left of the rows, and the
  // level a narrower one beside it. The mark's radius is the hit die's beside
  // the hit dice: a companion to the line of type rather than a picture in the
  // margin.
  var SYMBOL_RADIUS = 22;
  var SYMBOL_INSET = 16;      // the stripe's left edge to the mark's box
  var SYMBOL_GAP = 18;        // the mark to the level
  var LEVEL_GAP = 18;         // the level to the name

  var SYMBOL_HEAD = "SCHOOL";
  var LEVEL_HEAD = "LVL";
  var TEXT_HEAD = "SPELL AND DESCRIPTION";

  // A cantrip is level zero in the arithmetic and not a level at all at the
  // table, so the column says so in a letter rather than printing a nought
  // among the numbers.
  var CANTRIP_MARK = "C";

  // The level is set in the display face beside the mark: the pair of them is
  // what the row is classified by, and both are read before the name.
  var LEVEL_SIZE = 30;

  // The name is what the row is looked up by, so it takes the ink; what the
  // spell does follows in the muted tone, at the size of a caption.
  var NAME_SIZE = 32;
  var DESCRIPTION_SIZE = 27;
  var TEXT_INSET = 14;        // the row's right margin

  // ---- The page ---------------------------------------------------------------
  function firstSchool() { return D.schools.LIST[0].key; }

  function blankRow() {
    return { school: firstSchool(), level: D.RANGES.spellLevel[0], name: "", description: "" };
  }

  function create() {
    var rows = [];
    for (var i = 0; i < ROW_COUNT; i++) rows.push(blankRow());
    return { rows: rows };
  }

  // A row's own words: page state is plain data, and a field may be missing.
  // Only the card trims them — trimming what is in a control would take a
  // space back out from under the reader as they type it.
  function written(value) { return String(value == null ? "" : value); }

  // The card draws the first mark for a key it doesn't know, so everything
  // else has to say the same thing: a row showing one school and printing
  // another is worse than a row showing the wrong one.
  function schoolOf(row) {
    for (var i = 0; i < D.schools.LIST.length; i++) {
      if (D.schools.LIST[i].key === row.school) return row.school;
    }
    return firstSchool();
  }

  function levelOf(row) {
    var level = Math.round(Number(row.level));
    return isFinite(level) ? D.clampR(level, D.RANGES.spellLevel) : D.RANGES.spellLevel[0];
  }

  function markFor(level) {
    return level === D.RANGES.spellLevel[0] ? CANTRIP_MARK : String(level);
  }

  function isBlank(row) {
    return !written(row.name).trim() && !written(row.description).trim();
  }

  // What the card prints, in the order it prints it: the spells somebody has
  // written down, by level and then by name, and then the rows nobody has used
  // yet. Ties keep the order they were typed in, so a list of unnamed spells at
  // one level doesn't shuffle as it is filled in.
  function ordered(page) {
    var used = [];
    var blank = [];
    page.rows.forEach(function (row, index) {
      (isBlank(row) ? blank : used).push({ row: row, index: index });
    });
    used.sort(function (a, b) {
      var byLevel = levelOf(a.row) - levelOf(b.row);
      if (byLevel) return byLevel;
      var one = written(a.row.name).trim().toLowerCase();
      var two = written(b.row.name).trim().toLowerCase();
      if (one !== two) return one < two ? -1 : 1;
      return a.index - b.index;
    });
    return used.concat(blank).map(function (held) { return held.row; });
  }

  // ---- The body ----------------------------------------------------------------
  function render(frame, page) {
    var ctx = frame.ctx;
    var u = frame.u;
    var tone = frame.tone;
    var lift = D.sheet.RATIO.centeredLift;
    var head = frame.labelRun(tone.muted);

    // Each column is as wide as the wider of what it holds and the word over
    // it: a caption centred on a column narrower than itself runs into the one
    // beside it, and "SCHOOL" is wider than any mark.
    var symbolColumn = Math.max(u(2 * SYMBOL_RADIUS), D.draw.measure(ctx, SYMBOL_HEAD, head));
    var levelColumn = Math.max(widestMark(ctx, levelRun(frame)),
      D.draw.measure(ctx, LEVEL_HEAD, head));
    var symbolCenterX = frame.left + u(SYMBOL_INSET) + symbolColumn / 2;
    var levelCenterX = frame.left + u(SYMBOL_INSET) + symbolColumn + u(SYMBOL_GAP) + levelColumn / 2;
    var textLeft = frame.left + u(SYMBOL_INSET) + symbolColumn + u(SYMBOL_GAP) +
      levelColumn + u(LEVEL_GAP);
    var textRight = frame.left + frame.width - u(TEXT_INSET);

    var lidHeight = D.sheet.sectionHeaderHeight(frame);
    var content = lidHeight + u(HEAD_HEIGHT) + ROW_COUNT * u(ROW_HEIGHT);
    var top = frame.top + Math.max(0, (frame.bottom - frame.top - content) / 2);
    var rowsTop = top + lidHeight + u(HEAD_HEIGHT);
    var sorted = ordered(page);

    D.sheet.sectionHeader(frame, "SPELLS", top);
    drawHeads(top + lidHeight);
    D.sheet.rows(frame,
      { x: frame.left, y: rowsTop, width: frame.width, height: ROW_COUNT * u(ROW_HEIGHT) },
      { count: ROW_COUNT, rowHeight: u(ROW_HEIGHT) },
      function (row, index) { drawSpell(sorted[index], row); });

    // The columns are named, or the page is eight shapes and a stray digit
    // nobody introduced.
    function drawHeads(headTop) {
      var baseline = headTop + u(HEAD_HEIGHT) / 2 + head.size * lift;
      D.draw.text(ctx, SYMBOL_HEAD, symbolCenterX, baseline, head);
      D.draw.text(ctx, LEVEL_HEAD, levelCenterX, baseline, head);
      var left = frame.labelRun(tone.muted);
      left.align = "left";
      D.draw.text(ctx, TEXT_HEAD, textLeft, baseline, left);
    }

    function drawSpell(spell, row) {
      if (isBlank(spell)) return;

      var middle = row.y + row.height / 2;
      var level = levelRun(frame);
      D.schools.draw(ctx, schoolOf(spell), symbolCenterX, middle, u(SYMBOL_RADIUS),
        { color: tone.accent });
      D.draw.text(ctx, markFor(levelOf(spell)), levelCenterX, middle + level.size * lift, level);

      D.sheet.namedLine(frame, {
        name: written(spell.name).trim(),
        description: written(spell.description).trim(),
        left: textLeft, right: textRight, middle: middle, height: row.height,
        nameSize: u(NAME_SIZE), descriptionSize: u(DESCRIPTION_SIZE)
      });
    }
  }

  function levelRun(frame) {
    return {
      family: frame.display, weight: 700, size: frame.u(LEVEL_SIZE),
      color: frame.tone.accent, align: "center"
    };
  }

  // The column holds whichever mark is widest, not whichever one this page
  // happens to use: ten rows of cantrips would otherwise set a column that a
  // single 9th-level spell overflows.
  function widestMark(ctx, run) {
    var widest = 0;
    for (var level = D.RANGES.spellLevel[0]; level <= D.RANGES.spellLevel[1]; level++) {
      widest = Math.max(widest, D.draw.measure(ctx, markFor(level), run));
    }
    return widest;
  }

  // ---- Controls -----------------------------------------------------------------
  var SCHOOL_CONTROL = "spellSchool-";
  var LEVEL_CONTROL = "spellLevel-";
  var NAME_CONTROL = "spellName-";
  var DESCRIPTION_CONTROL = "spellDescription-";
  var ICON_OUT = "spellIcon-";

  var LEVEL_LABEL = "Cantrip";

  // Each of a row's controls, and the field on the row it writes. A level is
  // arithmetic — it is what the card sorts by — so it doesn't stay the string
  // a <select> hands over.
  var ROW_CONTROLS = [
    { prefix: SCHOOL_CONTROL, field: "school" },
    { prefix: LEVEL_CONTROL, field: "level", number: true },
    { prefix: NAME_CONTROL, field: "name" },
    { prefix: DESCRIPTION_CONTROL, field: "description" }
  ];

  function levelOptions() {
    var range = D.RANGES.spellLevel;
    var options = [];
    for (var level = range[0]; level <= range[1]; level++) {
      options.push({
        value: String(level),
        label: level === range[0] ? LEVEL_LABEL : D.rules.ordinal(level)
      });
    }
    return options;
  }

  // The column heads carry the captions, so the fields themselves are labelled
  // for anyone who can't see the heads — and a placeholder repeats the caption
  // for the narrow layout, where the heads are gone.
  function fieldHtml(name, label, placeholder, className) {
    return '<input type="text" class="' + U.PREFIX + "input " + className +
      '" data-ctl="' + name + '" aria-label="' + U.esc(label) +
      '" placeholder="' + U.esc(placeholder) + '">';
  }

  function pickerHtml(name, label, options, className) {
    return '<select class="' + U.PREFIX + "select " + className + '" data-ctl="' + name +
      '" aria-label="' + U.esc(label) + '">' + options + "</select>";
  }

  function rowHtml(index, schools, levels) {
    var ordinal = index + 1;
    return '<div class="experiment-ext-dndc-spell">' +
      '<div class="experiment-ext-dndc-spell-school">' +
      pickerHtml(SCHOOL_CONTROL + index, "Spell " + ordinal + " school", schools, "") +
      '<span class="experiment-ext-dndc-spell-icon" data-out="' + ICON_OUT + index + '"></span>' +
      "</div>" +
      pickerHtml(LEVEL_CONTROL + index, "Spell " + ordinal + " level", levels,
        "experiment-ext-dndc-spell-level") +
      fieldHtml(NAME_CONTROL + index, "Spell " + ordinal + " name", "Spell",
        "experiment-ext-dndc-spell-name") +
      U.proseBox(DESCRIPTION_CONTROL + index, {
        ariaLabel: "Spell " + ordinal + " description",
        placeholder: "Description",
        className: "experiment-ext-dndc-spell-description"
      }) +
      "</div>";
  }

  function html() {
    var schools = U.options(D.schools.LIST.map(function (school) {
      return { value: school.key, label: school.label };
    }));
    var levels = U.options(levelOptions());
    var rows = "";
    for (var i = 0; i < ROW_COUNT; i++) rows += rowHtml(i, schools, levels);

    return U.group("Spells",
      '<p class="experiment-ext-dndc-note">Ten rows, always. One left empty prints as an empty ' +
      "row, ready for a spell nobody has learned yet. The card prints a school as its mark " +
      "rather than its name — the mark beside each picker is the one it prints — and prints " +
      "the rows by level and then by name, whatever order you type them in.</p>" +
      '<div class="experiment-ext-dndc-spells">' +
      '<div class="experiment-ext-dndc-spell-head" aria-hidden="true">' +
      "<span>School</span><span>Level</span><span>Spell</span><span>Description</span></div>" +
      rows + "</div>",
      { key: "spells" });
  }

  // The mark beside the picker is the one the card prints, drawn from the same
  // geometry and stroked in currentColor so it follows the panel into dark mode.
  function syncIcon(row, dom, index) {
    dom.el('[data-out="' + ICON_OUT + index + '"]').innerHTML = D.schools.svg(schoolOf(row));
  }

  function sync(page, dom) {
    for (var index = 0; index < ROW_COUNT; index++) {
      var row = page.rows[index];
      dom.ctl(SCHOOL_CONTROL + index).value = schoolOf(row);
      dom.ctl(LEVEL_CONTROL + index).value = String(levelOf(row));
      dom.ctl(NAME_CONTROL + index).value = written(row.name);
      dom.ctl(DESCRIPTION_CONTROL + index).value = written(row.description);
      syncIcon(row, dom, index);
    }
  }

  function onControl(page, name, target, event, ctx) {
    for (var i = 0; i < ROW_CONTROLS.length; i++) {
      var control = ROW_CONTROLS[i];
      if (name.indexOf(control.prefix) !== 0) continue;
      var index = +name.slice(control.prefix.length);
      var row = page.rows[index];
      if (!row) return false;
      row[control.field] = control.number ? +target.value : target.value;
      if (control.field === "school") syncIcon(row, ctx.dom, index);
      ctx.render();
      return true;
    }
    return false;
  }

  // A saved page: ten rows again whatever the file held, each one a school the
  // marks know, a level in range, and text that is text.
  function load(raw) {
    var read = D.read;
    var rows = read.rows(raw.rows, ROW_COUNT).map(function (saved) {
      return {
        school: schoolOf(saved),
        level: read.whole(saved.level, D.RANGES.spellLevel, D.RANGES.spellLevel[0]),
        name: read.text(saved.name, ""),
        description: read.text(saved.description, "")
      };
    });
    while (rows.length < ROW_COUNT) rows.push(blankRow());
    return { rows: rows };
  }

  D.pages.register({
    kind: KIND,
    label: "Spells",
    create: create,
    render: render,
    load: load,
    controls: {
      html: html,
      sync: sync,
      onControl: onControl
    }
  });
})();
