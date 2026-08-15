/*
 * Player Card — a list of rows the reader builds.
 *
 * Some of a character's pages are a list whose order is the card's order: what
 * they can do, and what they are carrying. The reader adds a row, takes one
 * off, and puts the rest in the order they want to read them in mid-turn — so
 * every one of those pages wants the same three things around each row and the
 * same two ways of moving it, and this is where they live.
 *
 * A row is a box, because it is a thing that gets picked up and put down
 * somewhere else: the handle that moves it on the left, the page's own fields
 * in the middle, and the button that takes it off the card on the right. A
 * drag and the arrow keys do the same thing and end in the same move, so a
 * reader with a mouse and a reader with a keyboard are doing one gesture.
 *
 * A page hands in a *list*: how many rows its card has room for, the kinds of
 * row it offers, what to call a row in a label, and the fields that fill one.
 * The rows are the page's own `page.rows`, one list to a page, and so are the
 * control names on the fields, because only the page knows what a row of it
 * holds. Adding or removing a row changes which controls exist, so both ask
 * for the markup back rather than editing it in place, and the indices those
 * names carry are written afresh.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};
  var U = window.ExpUI;

  var HANDLE_GLYPH = "⠿";
  var REMOVE_GLYPH = "×";
  var DROP_CLASS = "experiment-ext-dndc-row-over";

  // A list's own controls, told apart from the rest of the region it is
  // mounted in — which holds the page's other controls and the card's.
  function within(list, selector) {
    return '[data-list="' + list.key + '"] ' + selector;
  }

  function hintId(list) { return "experiment-ext-dndc-" + list.key + "-hint"; }

  function closestTo(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  // The row a node sits in, for a page whose own controls are inside one.
  function rowIndex(target) {
    var row = closestTo(target, "[data-row]");
    return row ? +row.dataset.row : null;
  }

  function typeOf(list, type) {
    for (var i = 0; i < list.types.length; i++) {
      if (list.types[i].type === type) return list.types[i];
    }
    return null;
  }

  // ---- Markup -------------------------------------------------------------------
  // A handle says what it moves and where that is now, so a move made from the
  // keyboard is announced as the row's new position when focus follows it.
  function moveLabel(list, page, index) {
    return "Move " + list.title(page.rows[index]) +
      " (row " + (index + 1) + " of " + page.rows.length + ")";
  }

  function removeLabel(list, page, index) {
    return "Remove " + list.title(page.rows[index]);
  }

  // The shape of a row: something in the handle's place, the fields, something
  // in the remove button's. The heading strip is built through here too, so a
  // caption cannot end up over a column the rows don't have.
  function shell(list, extraClass, attributes, lead, fields, trail) {
    return '<div class="experiment-ext-dndc-row' + (list.rowClass ? " " + list.rowClass : "") +
      (extraClass ? " " + extraClass : "") + '"' + attributes + ">" +
      lead + '<div class="experiment-ext-dndc-row-fields">' + fields + "</div>" + trail +
      "</div>";
  }

  function handleHtml(list, page, index) {
    return '<button type="button" class="experiment-ext-dndc-handle" draggable="true" data-move="' +
      index + '" aria-describedby="' + hintId(list) + '" aria-label="' +
      U.esc(moveLabel(list, page, index)) + '"><span aria-hidden="true">' + HANDLE_GLYPH +
      "</span></button>";
  }

  function removeHtml(list, page, index) {
    return '<button type="button" class="experiment-ext-dndc-remove" data-remove-row="' + index +
      '" aria-label="' + U.esc(removeLabel(list, page, index)) + '"><span aria-hidden="true">' +
      REMOVE_GLYPH + "</span></button>";
  }

  function rowHtml(list, page, row, index) {
    return shell(list, "", ' data-row="' + index + '"',
      handleHtml(list, page, index), list.fields(row, index), removeHtml(list, page, index));
  }

  // `list.head` is the caption cells for a list whose fields say nothing about
  // themselves — a column of marks needs the words over it. They are hung in a
  // row of their own, with nothing where the two buttons go, so they sit over
  // the columns they name; it just isn't drawn as a row.
  var HEAD_CLASS = "experiment-ext-dndc-row-head";
  var EMPTY_CELL = "<span></span>";

  function headHtml(list) {
    return list.head
      ? shell(list, HEAD_CLASS, ' aria-hidden="true"', EMPTY_CELL, list.head, EMPTY_CELL)
      : "";
  }

  function addHtml(list, page) {
    var full = page.rows.length >= list.max;
    return '<div class="experiment-ext-dndc-add-row">' +
      '<span class="experiment-ext-dndc-add-row-label">Add a row</span>' +
      list.types.map(function (kind) {
        return '<button type="button" class="experiment-ext-dndc-add-row-button" data-add-row="' +
          kind.type + '"' + (full ? " disabled" : "") + ">+ " + U.esc(kind.label) + "</button>";
      }).join("") +
      (full ? '<span class="experiment-ext-dndc-note">Full — remove a row to add another.</span>' : "") +
      "</div>";
  }

  // What the handles do and how many rows there is room for is true of every
  // list; whatever else is true of this one, the page says in its own note.
  function hintHtml(list) {
    return '<p class="experiment-ext-dndc-note" id="' + hintId(list) + '">Drag a handle to ' +
      "reorder a row, or press the up and down arrow keys while it has focus. Up to " +
      list.max + " rows fit on a card." + (list.note ? " " + list.note : "") + "</p>";
  }

  // The hint, the rows and the bar that adds one are wrapped together, so that
  // everything a list owns — the add buttons included — is reachable by the
  // list it belongs to.
  function html(list, page) {
    return '<div class="experiment-ext-dndc-list" data-list="' + list.key + '">' +
      hintHtml(list) +
      '<div class="experiment-ext-dndc-rows">' +
      headHtml(list) +
      page.rows.map(function (row, index) { return rowHtml(list, page, row, index); }).join("") +
      "</div>" +
      addHtml(list, page) +
      "</div>";
  }

  // The two buttons carry the row's name, which the reader is free to change
  // while they are on screen.
  function retitle(list, page, dom, index) {
    dom.el(within(list, '[data-move="' + index + '"]'))
      .setAttribute("aria-label", moveLabel(list, page, index));
    dom.el(within(list, '[data-remove-row="' + index + '"]'))
      .setAttribute("aria-label", removeLabel(list, page, index));
  }

  function sync(list, page, dom) {
    page.rows.forEach(function (row, index) { retitle(list, page, dom, index); });
  }

  // ---- Adding, removing and reordering --------------------------------------------
  function focusIn(ctx, selector) {
    var node = ctx.dom.el(selector);
    if (node && node.focus) node.focus();
  }

  // The first thing in a row that can be typed into, whichever of the three
  // kinds of box that turns out to be.
  function firstField(list, index) {
    return ["input", "select", "textarea"].map(function (tag) {
      return within(list, '[data-row="' + index + '"] ' + tag);
    }).join(", ");
  }

  function addRow(list, page, type, ctx) {
    var kind = typeOf(list, type);
    if (!kind) return false;
    if (page.rows.length < list.max) {
      page.rows.push(kind.create(page));
      ctx.rebuild();
      // The reader adds a row in order to fill it in, so that is where they are
      // put down.
      focusIn(ctx, firstField(list, page.rows.length - 1));
      ctx.render();
    }
    return true;
  }

  function removeRow(list, page, index, ctx) {
    if (index < 0 || index >= page.rows.length) return false;
    page.rows.splice(index, 1);
    ctx.rebuild();
    // Whatever moved up into the gap, or the add buttons once the last row has
    // gone: never nothing, which is where focus would otherwise land.
    var next = Math.min(index, page.rows.length - 1);
    focusIn(ctx, next < 0 ? within(list, "[data-add-row]") : within(list, '[data-move="' + next + '"]'));
    ctx.render();
    return true;
  }

  // Focus follows the row rather than staying at the position the handle was
  // at, so a reader moving a row three places up presses the same key three
  // times. Both ends are a no-op, and nothing is rebuilt for one.
  function move(list, page, from, to, ctx) {
    if (from === to || to < 0 || to >= page.rows.length) return false;
    page.rows.splice(to, 0, page.rows.splice(from, 1)[0]);
    ctx.rebuild();
    focusIn(ctx, within(list, '[data-move="' + to + '"]'));
    ctx.render();
    return true;
  }

  function onClick(list, page, event, ctx) {
    var add = closestTo(event.target, within(list, "[data-add-row]"));
    if (add) return addRow(list, page, add.dataset.addRow, ctx);
    var remove = closestTo(event.target, within(list, "[data-remove-row]"));
    if (remove) return removeRow(list, page, +remove.dataset.removeRow, ctx);
    return false;
  }

  // A drag and the arrow keys both end in move(). The list is the node to bind
  // to: the region around it outlives a rebuild, while the list is thrown away
  // by one, and listeners bound to it go with it rather than piling up a set
  // per rebuild.
  function mounted(list, page, element, ctx) {
    var node = element.querySelector('[data-list="' + list.key + '"]');
    if (!node) return;
    var from = null;

    function handleAt(target) {
      var handle = closestTo(target, "[data-move]");
      return handle ? +handle.dataset.move : null;
    }

    // Which row the pointer is over, and only while a handle is being dragged:
    // a file dragged onto the panel is not a reorder.
    function rowUnder(event) {
      return from == null ? null : rowIndex(event.target);
    }

    function markDrop(index) {
      clearDrop();
      var row = node.querySelector('[data-row="' + index + '"]');
      if (row) row.classList.add(DROP_CLASS);
    }

    function clearDrop() {
      var marked = node.querySelectorAll("." + DROP_CLASS);
      for (var i = 0; i < marked.length; i++) marked[i].classList.remove(DROP_CLASS);
    }

    node.addEventListener("keydown", function (event) {
      var index = handleAt(event.target);
      if (index == null) return;
      var step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (!step) return;
      event.preventDefault();   // an arrow key on a button scrolls the page
      move(list, page, index, index + step, ctx);
    });

    node.addEventListener("dragstart", function (event) {
      from = handleAt(event.target);
      if (from == null) return;
      event.dataTransfer.effectAllowed = "move";
      // Firefox starts no drag at all unless the transfer carries something.
      event.dataTransfer.setData("text/plain", String(from));
    });

    node.addEventListener("dragover", function (event) {
      var over = rowUnder(event);
      if (over == null) return;
      event.preventDefault();   // not preventing the default is how a drop is refused
      event.dataTransfer.dropEffect = "move";
      markDrop(over);
    });

    node.addEventListener("drop", function (event) {
      var over = rowUnder(event);
      if (over == null) return;
      event.preventDefault();
      var moved = from;
      clearDrop();
      from = null;
      move(list, page, moved, over, ctx);
    });

    node.addEventListener("dragend", function () {
      from = null;
      clearDrop();
    });
  }

  D.rowList = {
    html: html,
    sync: sync,
    retitle: retitle,
    onClick: onClick,
    mounted: mounted,
    rowIndex: rowIndex
  };
})();
