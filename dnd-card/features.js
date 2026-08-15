/*
 * Player Card — the features page.
 *
 * What a character can *do* that isn't a number on the character card: the
 * class feature with three uses a day, the trait their species gets, and the
 * spell slots a caster spends. No two characters have the same list and no
 * list survives a level, so this is the one page whose rows the reader builds:
 * added, removed, and put in the order they want to read them in mid-turn.
 *
 * Eight rows is the cap because eight is what the card's height holds at a size
 * a name and its description are both legible at across a table. A ninth would
 * mean either a row nobody can read or a second card, and a second card is what
 * the tab strip is for. A row longer than one line wraps into the depth its
 * row has rather than shrinking, and what still will not fit is cut.
 *
 * A row comes in two shapes. A general row is a run of empty boxes to tick off
 * as the uses go, then a name and what it does. A spellcasting row is that same
 * run of boxes for one spell level's slots, which is the same gesture during
 * play and so is drawn the same way. The boxes print empty on purpose: a card
 * that printed today's remaining uses would be wrong by the first short rest,
 * and these are somewhere to put a pencil mark instead.
 *
 * The boxes come first because they are what a hand reaches for mid-turn, and
 * they keep a column as wide as the row that wants the most of them, so the
 * names beside them line up as a column rather than a ragged edge.
 *
 * Every length below is a design px on the 300 dpi card and is scaled by the
 * frame's `u()`, so the same layout renders at any output resolution.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};
  var U = window.ExpUI;

  var KIND = "features";
  var GENERAL = "general";
  var SPELLCASTING = "spellcasting";
  var SPELLCASTING_LABEL = "SPELLCASTING";
  var TITLE = "FEATURES & TRAITS";

  var MAX_ROWS = 8;
  // What a caster starts a level with; the level itself is picked to be one
  // they haven't got a row for yet.
  var DEFAULT_SLOTS = 2;

  // Row layout. The rows share out the whole column under the header, so a
  // card's rows are the same height whether the reader filled in two or eight.
  var ROW_INSET = 20;
  var NAME_SIZE = 34;
  var DESCRIPTION_SIZE = 26;
  var LEVEL_SIZE = 34;
  var LABEL_GAP = 18;

  // The tally: boxes big enough to tick with a pencil, spaced enough to count
  // at a glance.
  var TALLY_RADIUS = 16;
  var TALLY_SPACING = 46;
  var TALLY_GAP = 26;      // between the last box and the text column

  // ---- The page ---------------------------------------------------------------
  // The two shapes a row comes in, in the order the "add a row" buttons offer
  // them. `create` gets the page, because what a sensible new row holds can
  // depend on what is already on it.
  var ROW_TYPES = [
    {
      type: GENERAL,
      label: "Feature",
      create: function () { return { type: GENERAL, uses: 0, name: "", description: "" }; }
    },
    {
      type: SPELLCASTING,
      label: "Spellcasting",
      create: function (page) {
        return { type: SPELLCASTING, level: freeLevel(page), slots: DEFAULT_SLOTS };
      }
    }
  ];

  function rowType(type) {
    for (var i = 0; i < ROW_TYPES.length; i++) if (ROW_TYPES[i].type === type) return ROW_TYPES[i];
    return null;
  }

  // One row per spell level is how a caster fills this page in, so a new
  // spellcasting row takes the lowest level that hasn't got one yet.
  function freeLevel(page) {
    var range = D.RANGES.featureSlotLevel;
    for (var level = range[0]; level < range[1]; level++) {
      if (!hasLevel(page, level)) return level;
    }
    return range[1];
  }

  function hasLevel(page, level) {
    return page.rows.some(function (row) {
      return row.type === SPELLCASTING && row.level === level;
    });
  }

  // A page whose only control is "add a row" says nothing about what a row is,
  // so a fresh one starts with a blank general row to fill in.
  function create() {
    return { rows: [rowType(GENERAL).create()] };
  }

  // ---- The body ----------------------------------------------------------------
  function render(frame, page) {
    var top = frame.top + D.sheet.sectionHeader(frame, TITLE, frame.top);
    var height = frame.bottom - top;
    var column = tallyColumn(frame, page);
    D.sheet.rows(frame,
      { x: frame.left, y: top, width: frame.width, height: height },
      { count: MAX_ROWS, rowHeight: height / MAX_ROWS },
      function (rect, index) {
        if (page.rows[index]) drawRow(frame, page.rows[index], rect, column);
      });
  }

  // The room the boxes take on every row, which is the room the row wanting
  // the most of them takes. A page with no boxes anywhere gives it all back to
  // the names.
  function tallyColumn(frame, page) {
    var most = page.rows.reduce(function (widest, row) {
      return Math.max(widest, tallyOf(row));
    }, 0);
    return most ? tallyWidth(frame, most) + frame.u(TALLY_GAP) : 0;
  }

  function drawRow(frame, row, rect, column) {
    var inset = frame.u(ROW_INSET);
    var middle = rect.y + rect.height / 2;
    var left = rect.x + inset;

    drawTally(frame, tallyOf(row), left, middle);
    if (row.type === SPELLCASTING) drawSpellcasting(frame, row, left + column, middle);
    else drawGeneral(frame, row, left + column, rect.x + rect.width - inset, rect);
  }

  // What the card can be sure of is how many boxes there are, never how many
  // are left, so every box is drawn empty.
  function tallyOf(row) {
    return row.type === SPELLCASTING
      ? D.clampR(row.slots, D.RANGES.featureSlots)
      : D.clampR(row.uses, D.RANGES.featureUses);
  }

  function tallyWidth(frame, count) {
    return count > 0 ? 2 * frame.u(TALLY_RADIUS) + (count - 1) * frame.u(TALLY_SPACING) : 0;
  }

  function drawTally(frame, count, left, centerY) {
    var radius = frame.u(TALLY_RADIUS);
    for (var i = 0; i < count; i++) {
      D.sheet.tickBox(frame, left + radius + i * frame.u(TALLY_SPACING), centerY, radius, false);
    }
  }

  // The whole row is the description's to wrap into, so the depth it is given
  // is the row's own rather than the one line the name sits on.
  function drawGeneral(frame, row, left, right, rect) {
    D.sheet.namedLine(frame, {
      name: row.name,
      description: row.description,
      left: left, right: right,
      middle: rect.y + rect.height / 2, height: rect.height,
      nameSize: frame.u(NAME_SIZE), descriptionSize: frame.u(DESCRIPTION_SIZE)
    });
  }

  function drawSpellcasting(frame, row, left, middle) {
    var lift = D.sheet.RATIO.centeredLift;
    var label = frame.labelRun(frame.tone.accent);
    label.align = "left";
    var width = D.draw.text(frame.ctx, SPELLCASTING_LABEL, left, middle + label.size * lift, label);
    D.draw.text(frame.ctx, D.rules.ordinal(row.level), left + width + frame.u(LABEL_GAP),
      middle + frame.u(LEVEL_SIZE) * lift, {
        family: frame.display, weight: 700, size: frame.u(LEVEL_SIZE),
        color: frame.tone.ink, align: "left"
      });
  }

  // ---- Controls -----------------------------------------------------------------
  // One block per row: the handle that moves it, its own fields, and the button
  // that takes it off the card. Adding or removing a row changes which controls
  // exist, so both ask for the markup back rather than editing it in place.
  var HINT_ID = "experiment-ext-dndc-feature-hint";
  var HANDLE_GLYPH = "⠿";
  var REMOVE_GLYPH = "×";
  var UNTITLED = "an unnamed feature";

  var ROW_CONTROL = /^row-(\d+)-([a-z]+)$/;
  var TEXT_FIELDS = ["name", "description"];
  var NUMBER_FIELDS = [
    { field: "uses", range: "featureUses" },
    { field: "slots", range: "featureSlots" },
    { field: "level", range: "featureSlotLevel" }
  ];

  function ctlName(index, field) { return "row-" + index + "-" + field; }

  function rangeFor(field) {
    for (var i = 0; i < NUMBER_FIELDS.length; i++) {
      if (NUMBER_FIELDS[i].field === field) return D.RANGES[NUMBER_FIELDS[i].range];
    }
    return null;
  }

  function titleOf(row) {
    if (row.type === SPELLCASTING) return D.rules.ordinal(row.level) + "-level spell slots";
    return row.name.trim() || UNTITLED;
  }

  // A handle says what it moves and where that is now, so a move made from the
  // keyboard is announced as the row's new position when focus follows it.
  function moveLabel(page, index) {
    return "Move " + titleOf(page.rows[index]) +
      " (row " + (index + 1) + " of " + page.rows.length + ")";
  }

  function removeLabel(page, index) {
    return "Remove " + titleOf(page.rows[index]);
  }

  function levelOptions() {
    var range = D.RANGES.featureSlotLevel;
    var options = [];
    for (var level = range[0]; level <= range[1]; level++) {
      options.push({ value: String(level), label: D.rules.ordinal(level) });
    }
    return options;
  }

  // The count comes first, where the boxes it prints are: a row's controls read
  // left to right the way the row does. It is typed rather than dragged because
  // it is a small whole number somebody already knows — a slider is for finding
  // a value, and this one is looked up.
  function countHtml(index, field, caption, range) {
    return U.number(ctlName(index, field), caption, { min: range[0], max: range[1] });
  }

  function fieldsHtml(row, index) {
    if (row.type === SPELLCASTING) {
      return countHtml(index, "slots", "Slots", D.RANGES.featureSlots) +
        U.select(ctlName(index, "level"), "Spell level", levelOptions());
    }
    return countHtml(index, "uses", "Uses", D.RANGES.featureUses) +
      U.text(ctlName(index, "name"), "Feature") +
      U.prose(ctlName(index, "description"), "Description");
  }

  function rowHtml(page, row, index) {
    return '<div class="experiment-ext-dndc-feature" data-row="' + index + '">' +
      '<button type="button" class="experiment-ext-dndc-handle" draggable="true" data-move="' +
      index + '" aria-describedby="' + HINT_ID + '" aria-label="' +
      U.esc(moveLabel(page, index)) + '"><span aria-hidden="true">' + HANDLE_GLYPH + "</span></button>" +
      '<div class="experiment-ext-dndc-feature-fields">' + fieldsHtml(row, index) + "</div>" +
      '<button type="button" class="experiment-ext-dndc-remove" data-remove-row="' + index +
      '" aria-label="' + U.esc(removeLabel(page, index)) + '"><span aria-hidden="true">' +
      REMOVE_GLYPH + "</span></button>" +
      "</div>";
  }

  function addHtml(page) {
    var full = page.rows.length >= MAX_ROWS;
    return '<div class="experiment-ext-dndc-add-row">' +
      '<span class="experiment-ext-dndc-add-row-label">Add a row</span>' +
      ROW_TYPES.map(function (kind) {
        return '<button type="button" class="experiment-ext-dndc-add-row-button" data-add-row="' +
          kind.type + '"' + (full ? " disabled" : "") + ">+ " + U.esc(kind.label) + "</button>";
      }).join("") +
      (full ? '<span class="experiment-ext-dndc-note">Full — remove a row to add another.</span>' : "") +
      "</div>";
  }

  function html(page) {
    return U.group("Features",
      '<p class="experiment-ext-dndc-note" id="' + HINT_ID + '">Drag a handle to reorder a row, ' +
      "or press the up and down arrow keys while it has focus. Up to " + MAX_ROWS +
      " rows fit on a card. The card prints that many boxes down the left of the row, empty, " +
      "to tick off during play.</p>" +
      '<div class="experiment-ext-dndc-features" data-features>' +
      page.rows.map(function (row, index) { return rowHtml(page, row, index); }).join("") +
      "</div>" +
      addHtml(page),
      { key: "features" });
  }

  // The two buttons carry the row's name, which the reader is free to change
  // while they are on screen.
  function retitle(page, dom, index) {
    dom.el('[data-move="' + index + '"]').setAttribute("aria-label", moveLabel(page, index));
    dom.el('[data-remove-row="' + index + '"]').setAttribute("aria-label", removeLabel(page, index));
  }

  function sync(page, dom) {
    page.rows.forEach(function (row, index) {
      if (row.type === SPELLCASTING) {
        dom.ctl(ctlName(index, "slots")).value = String(row.slots);
        dom.ctl(ctlName(index, "level")).value = String(row.level);
      } else {
        dom.ctl(ctlName(index, "uses")).value = String(row.uses);
        dom.ctl(ctlName(index, "name")).value = row.name;
        dom.ctl(ctlName(index, "description")).value = row.description;
      }
      retitle(page, dom, index);
    });
  }

  function onControl(page, name, target, event, ctx) {
    var match = ROW_CONTROL.exec(name);
    if (!match) return false;
    var index = +match[1];
    var field = match[2];
    var row = page.rows[index];
    if (!row || !(field in row)) return false;

    if (TEXT_FIELDS.indexOf(field) !== -1) {
      row[field] = target.value;
      retitle(page, ctx.dom, index);
      ctx.render();
      return true;
    }

    var range = rangeFor(field);
    if (!range) return false;
    U.readNumber(target, event, { range: range }, function (value) {
      row[field] = value;
      retitle(page, ctx.dom, index);
      ctx.render();
    });
    return true;
  }

  // ---- Adding, removing and reordering --------------------------------------------
  function closestTo(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  function focusIn(ctx, selector) {
    var node = ctx.dom.el(selector);
    if (node && node.focus) node.focus();
  }

  function addRow(page, type, ctx) {
    var kind = rowType(type);
    if (!kind) return false;
    if (page.rows.length < MAX_ROWS) {
      page.rows.push(kind.create(page));
      ctx.rebuild();
      // The reader adds a row in order to fill it in, so that is where they are
      // put down.
      focusIn(ctx, '[data-row="' + (page.rows.length - 1) + '"] input, [data-row="' +
        (page.rows.length - 1) + '"] select');
      ctx.render();
    }
    return true;
  }

  function removeRow(page, index, ctx) {
    if (index < 0 || index >= page.rows.length) return false;
    page.rows.splice(index, 1);
    ctx.rebuild();
    // Whatever moved up into the gap, or the add buttons once the last row has
    // gone: never nothing, which is where focus would otherwise land.
    var next = Math.min(index, page.rows.length - 1);
    focusIn(ctx, next < 0 ? "[data-add-row]" : '[data-move="' + next + '"]');
    ctx.render();
    return true;
  }

  // Focus follows the row rather than staying at the position the handle was
  // at, so a reader moving a row three places up presses the same key three
  // times. Both ends are a no-op, and nothing is rebuilt for one.
  function move(page, from, to, ctx) {
    if (from === to || to < 0 || to >= page.rows.length) return false;
    page.rows.splice(to, 0, page.rows.splice(from, 1)[0]);
    ctx.rebuild();
    focusIn(ctx, '[data-move="' + to + '"]');
    ctx.render();
    return true;
  }

  function onClick(page, event, ctx) {
    var add = closestTo(event.target, "[data-add-row]");
    if (add) return addRow(page, add.dataset.addRow, ctx);
    var remove = closestTo(event.target, "[data-remove-row]");
    if (remove) return removeRow(page, +remove.dataset.removeRow, ctx);
    return false;
  }

  // A drag and the arrow keys do the same thing, so they are bound together and
  // both end in move(). The list is the node to bind to: the region around it
  // outlives a rebuild, while this list is thrown away by one, and listeners
  // bound to it go with it rather than piling up a set per rebuild.
  var DROP_CLASS = "experiment-ext-dndc-feature-over";

  function mounted(page, element, ctx) {
    var list = element.querySelector("[data-features]");
    if (!list) return;
    var from = null;

    function handleAt(target) {
      var handle = closestTo(target, "[data-move]");
      return handle ? +handle.dataset.move : null;
    }

    // Which row the pointer is over, and only while a handle is being dragged:
    // a file dragged onto the panel is not a reorder.
    function rowUnder(event) {
      if (from == null) return null;
      var row = closestTo(event.target, "[data-row]");
      return row ? +row.dataset.row : null;
    }

    function markDrop(index) {
      clearDrop();
      var row = list.querySelector('[data-row="' + index + '"]');
      if (row) row.classList.add(DROP_CLASS);
    }

    function clearDrop() {
      var marked = list.querySelectorAll("." + DROP_CLASS);
      for (var i = 0; i < marked.length; i++) marked[i].classList.remove(DROP_CLASS);
    }

    list.addEventListener("keydown", function (event) {
      var index = handleAt(event.target);
      if (index == null) return;
      var step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (!step) return;
      event.preventDefault();   // an arrow key on a button scrolls the page
      move(page, index, index + step, ctx);
    });

    list.addEventListener("dragstart", function (event) {
      from = handleAt(event.target);
      if (from == null) return;
      event.dataTransfer.effectAllowed = "move";
      // Firefox starts no drag at all unless the transfer carries something.
      event.dataTransfer.setData("text/plain", String(from));
    });

    list.addEventListener("dragover", function (event) {
      var over = rowUnder(event);
      if (over == null) return;
      event.preventDefault();   // not preventing the default is how a drop is refused
      event.dataTransfer.dropEffect = "move";
      markDrop(over);
    });

    list.addEventListener("drop", function (event) {
      var over = rowUnder(event);
      if (over == null) return;
      event.preventDefault();
      var moved = from;
      clearDrop();
      from = null;
      move(page, moved, over, ctx);
    });

    list.addEventListener("dragend", function () {
      from = null;
      clearDrop();
    });
  }

  // A saved page: the rows it held, each one of a shape this page knows, and no
  // more of them than a card has room for. A file with no rows at all is a
  // blank page rather than an empty one, because that is what "add a row" has
  // to start from.
  function load(raw) {
    var read = D.read;
    if (!Array.isArray(raw.rows)) return create();
    return {
      rows: read.rows(raw.rows, MAX_ROWS).map(function (saved) {
        var type = read.choice(saved.type, ROW_TYPES.map(function (kind) { return kind.type; }),
          GENERAL);
        if (type === SPELLCASTING) {
          return {
            type: SPELLCASTING,
            level: read.whole(saved.level, D.RANGES.featureSlotLevel, D.RANGES.featureSlotLevel[0]),
            slots: read.whole(saved.slots, D.RANGES.featureSlots, DEFAULT_SLOTS)
          };
        }
        return {
          type: GENERAL,
          uses: read.whole(saved.uses, D.RANGES.featureUses, 0),
          name: read.text(saved.name, ""),
          description: read.text(saved.description, "")
        };
      })
    };
  }

  D.pages.register({
    kind: KIND,
    label: "Features",
    create: create,
    render: render,
    load: load,
    controls: {
      html: html,
      sync: sync,
      onControl: onControl,
      onClick: onClick,
      mounted: mounted
    }
  });
})();
