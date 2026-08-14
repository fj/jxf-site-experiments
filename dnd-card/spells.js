/*
 * Player Card — the spells page.
 *
 * A spell list is read down while something else is happening, so a row says
 * three things and stops: which school the spell comes from, what it is
 * called, and what it does in a line. The school is a mark rather than a word,
 * because spelling out "Transmutation" ten times would take the room the
 * spell's own name needs, and a shape sorts a page faster than a word reads.
 * schools.js draws the marks; this file is the page kind they sit in — what a
 * blank one holds, how a row of it is drawn, and the ten rows of controls that
 * fill it.
 *
 * There are always ten rows, and a blank one prints blank. The card is meant
 * to be written on between sessions, and a list that grew and shrank with what
 * has been typed would leave nowhere to write the next spell down. Nothing is
 * printed on a row nobody has used yet — not even its school — because ink is
 * the one thing a pencil can't take back.
 *
 * A row is one line of type, and the description is what gives when there is
 * more of it than room: it may claim only its share of the column, it shrinks
 * into whatever the name leaves, and it is cut with an ellipsis once shrinking
 * reaches its floor. The name gives second, and only once even the
 * description's share won't hold it.
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

  // The mark keeps a column of its own down the left of the rows. Its radius
  // is the hit die's beside the hit dice: a companion to the line of type
  // rather than a picture in the margin.
  var SYMBOL_RADIUS = 22;
  var SYMBOL_INSET = 16;      // the stripe's left edge to the mark's box
  var SYMBOL_GAP = 18;        // the mark to the name

  var SYMBOL_HEAD = "SCHOOL";
  var TEXT_HEAD = "SPELL AND WHAT IT DOES";

  // The name is what the row is looked up by, so it takes the ink; what the
  // spell does follows in the muted tone, at the size of a caption.
  var NAME_SIZE = 32;
  var NAME_MIN_SIZE = 20;
  var DESCRIPTION_SIZE = 27;
  var DESCRIPTION_MIN_SIZE = 17;
  var TEXT_GAP = 16;          // the name to its description
  var TEXT_INSET = 14;        // the row's right margin
  // The most of the text column a description may claim before the name has to
  // start giving room back to it.
  var DESCRIPTION_SHARE = 0.55;
  var ELLIPSIS = "…";

  // ---- The page ---------------------------------------------------------------
  function firstSchool() { return D.schools.LIST[0].key; }

  function blankRow() { return { school: firstSchool(), name: "", description: "" }; }

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

  // As much of `str` as fits, with an ellipsis standing in for what it cost to
  // get there. Only reached once shrinking a run has hit its floor.
  function cut(ctx, str, run, room) {
    if (D.draw.measure(ctx, str, run) <= room) return str;
    var shown = str;
    while (shown && D.draw.measure(ctx, shown + ELLIPSIS, run) > room) shown = shown.slice(0, -1);
    return shown ? shown.replace(/\s+$/, "") + ELLIPSIS : "";
  }

  // ---- The body ----------------------------------------------------------------
  function render(frame, page) {
    var ctx = frame.ctx;
    var u = frame.u;
    var tone = frame.tone;
    var lift = D.sheet.RATIO.centeredLift;

    // The mark's column is as wide as the wider of the mark and the word over
    // it: a caption centred on a column narrower than itself runs into the one
    // beside it, and "SCHOOL" is wider than any mark.
    var symbolColumn = Math.max(u(2 * SYMBOL_RADIUS),
      D.draw.measure(ctx, SYMBOL_HEAD, frame.labelRun(frame.tone.muted)));
    var symbolCenterX = frame.left + u(SYMBOL_INSET) + symbolColumn / 2;
    var textLeft = frame.left + u(SYMBOL_INSET) + symbolColumn + u(SYMBOL_GAP);
    var textRight = frame.left + frame.width - u(TEXT_INSET);

    var lidHeight = D.sheet.sectionHeaderHeight(frame);
    var content = lidHeight + u(HEAD_HEIGHT) + ROW_COUNT * u(ROW_HEIGHT);
    var top = frame.top + Math.max(0, (frame.bottom - frame.top - content) / 2);
    var rowsTop = top + lidHeight + u(HEAD_HEIGHT);

    D.sheet.sectionHeader(frame, "SPELLS", top);
    drawHeads(top + lidHeight);
    D.sheet.rows(frame,
      { x: frame.left, y: rowsTop, width: frame.width, height: ROW_COUNT * u(ROW_HEIGHT) },
      { count: ROW_COUNT, rowHeight: u(ROW_HEIGHT) },
      function (row, index) { drawSpell(page.rows[index], row); });

    // The mark's column is named, or the page is eight shapes nobody
    // introduced.
    function drawHeads(headTop) {
      var head = frame.labelRun(tone.muted);
      var baseline = headTop + u(HEAD_HEIGHT) / 2 + head.size * lift;
      D.draw.text(ctx, SYMBOL_HEAD, symbolCenterX, baseline, head);
      head.align = "left";
      D.draw.text(ctx, TEXT_HEAD, textLeft, baseline, head);
    }

    function drawSpell(spell, row) {
      var name = written(spell.name).trim();
      var description = written(spell.description).trim();
      if (!name && !description) return;

      var middle = row.y + row.height / 2;
      D.schools.draw(ctx, schoolOf(spell), symbolCenterX, middle, u(SYMBOL_RADIUS),
        { color: tone.accent });

      var nameRun = {
        family: frame.body, weight: 700, size: u(NAME_SIZE),
        color: tone.ink, minSize: u(NAME_MIN_SIZE)
      };
      var descriptionRun = {
        family: frame.body, weight: 400, size: u(DESCRIPTION_SIZE),
        color: tone.muted, minSize: u(DESCRIPTION_MIN_SIZE)
      };

      // What the description asks for, up to its share: a short one leaves the
      // name nearly the whole column, and a long one is held to its share so
      // the name is shrunk only when it is itself the reason a row won't fit.
      var reserved = description
        ? u(TEXT_GAP) + Math.min(D.draw.measure(ctx, description, descriptionRun),
          (textRight - textLeft) * DESCRIPTION_SHARE)
        : 0;
      var nameRoom = textRight - textLeft - reserved;
      nameRun.size = D.draw.fitSize(ctx, name, nameRun, nameRoom);
      var nameWidth = D.draw.text(ctx, cut(ctx, name, nameRun, nameRoom), textLeft,
        middle + nameRun.size * lift, nameRun);

      if (!description) return;
      var left = textLeft + nameWidth + (nameWidth ? u(TEXT_GAP) : 0);
      descriptionRun.size = D.draw.fitSize(ctx, description, descriptionRun, textRight - left);
      D.draw.text(ctx, cut(ctx, description, descriptionRun, textRight - left), left,
        middle + descriptionRun.size * lift, descriptionRun);
    }
  }

  // ---- Controls -----------------------------------------------------------------
  var SCHOOL_CONTROL = "spellSchool-";
  var NAME_CONTROL = "spellName-";
  var DESCRIPTION_CONTROL = "spellDescription-";
  var ICON_OUT = "spellIcon-";

  // Each of a row's controls, and the field on the row it writes.
  var ROW_CONTROLS = [
    { prefix: SCHOOL_CONTROL, field: "school" },
    { prefix: NAME_CONTROL, field: "name" },
    { prefix: DESCRIPTION_CONTROL, field: "description" }
  ];

  // The column heads carry the captions, so the fields themselves are labelled
  // for anyone who can't see the heads — and a placeholder repeats the caption
  // for the narrow layout, where the heads are gone.
  function fieldHtml(name, label, placeholder, className) {
    return '<input type="text" class="' + U.PREFIX + "input " + className +
      '" data-ctl="' + name + '" aria-label="' + U.esc(label) +
      '" placeholder="' + U.esc(placeholder) + '">';
  }

  function rowHtml(index, options) {
    var ordinal = index + 1;
    return '<div class="experiment-ext-dndc-spell">' +
      '<div class="experiment-ext-dndc-spell-school">' +
      '<select class="' + U.PREFIX + 'select" data-ctl="' + SCHOOL_CONTROL + index +
      '" aria-label="Spell ' + ordinal + ' school">' + options + "</select>" +
      '<span class="experiment-ext-dndc-spell-icon" data-out="' + ICON_OUT + index + '"></span>' +
      "</div>" +
      fieldHtml(NAME_CONTROL + index, "Spell " + ordinal + " name", "Spell",
        "experiment-ext-dndc-spell-name") +
      fieldHtml(DESCRIPTION_CONTROL + index, "Spell " + ordinal + " description", "What it does",
        "experiment-ext-dndc-spell-description") +
      "</div>";
  }

  function html() {
    var options = U.options(D.schools.LIST.map(function (school) {
      return { value: school.key, label: school.label };
    }));
    var rows = "";
    for (var i = 0; i < ROW_COUNT; i++) rows += rowHtml(i, options);

    return U.group("Spells",
      '<p class="experiment-ext-dndc-note">Ten rows, always. One left empty prints as an empty ' +
      "row, ready for a spell nobody has learned yet. The card prints a school as its mark " +
      "rather than its name — the mark beside each picker is the one it prints.</p>" +
      '<div class="experiment-ext-dndc-spells">' +
      '<div class="experiment-ext-dndc-spell-head" aria-hidden="true">' +
      "<span>School</span><span>Spell</span><span>What it does</span></div>" +
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
      row[control.field] = target.value;
      if (control.field === "school") syncIcon(row, ctx.dom, index);
      ctx.render();
      return true;
    }
    return false;
  }

  D.pages.register({
    kind: KIND,
    label: "Spells",
    create: create,
    render: render,
    controls: {
      html: html,
      sync: sync,
      onControl: onControl
    }
  });
})();
