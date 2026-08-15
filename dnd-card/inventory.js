/*
 * Player Card — the inventory page.
 *
 * What the character is carrying. The card prints ten rows whatever the list
 * holds, and a row nobody has typed into prints as an empty one: this is a card
 * that gets written on at the table, and the room to note down the dagger you
 * just picked up has to already be there. So the ten rows are the card's, and
 * the list is the reader's — they add an item, take one off, and put the rest
 * in the order they want to read them in, which is the order the card prints.
 * rowlist.js runs that list; this file says what a row of it holds.
 *
 * A row reads left to right as three questions and an answer: is it worn or
 * held (a square), is it attuned (a triangle), how many (a box to write the
 * number in), and then the item itself — its name, and what it is after it in
 * the muted tone. The three marks are the same shapes the character card uses
 * for its tallies, and a mark says nothing about itself, so the rows are
 * headed by the names of their columns and each column is as wide as the wider
 * of its mark and its name.
 *
 * The rows share out everything the headings leave, so ten of them always
 * reach the bottom of the card: the taller the row, the more room there is to
 * write in it.
 *
 * Every length below is a design px on the 300 dpi card and is scaled by the
 * frame's `u()`, so the same layout renders at any output resolution.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};
  var U = window.ExpUI;

  var KIND = "inventory";

  // As many rows as fill the card at a size a hand can write in, which is also
  // as many as the list can hold: an eleventh would have nowhere to print.
  var ROW_COUNT = 10;

  // The column headings, over the marks they name.
  var HEADING_HEIGHT = 34;
  var HEADING_BASELINE = 22;
  var COLUMN_GAP = 24;
  // The last column holds the name and the description both, so it is headed
  // by what the pair of them is rather than by either one's own label.
  var ITEM_CAPTION = "ITEM";

  // The marks. A triangle inscribed in a circle looks smaller than a square
  // inscribed in the same one, so it gets the larger radius to read as its
  // equal.
  var TICK_RADIUS = 20;
  var TRIANGLE_RADIUS = 22;

  // Somewhere to write a count: two digits comfortably, three at a squeeze,
  // which is more of anything than a character carries. It is this deep so the
  // number written in it comes out at the size of the item's name rather than
  // over it — how many matters less than what.
  var QUANTITY_BOX_WIDTH = 84;
  var QUANTITY_BOX_HEIGHT = 50;

  // The item: its name, then what it is.
  var NAME_SIZE = 34;
  var NAME_MIN_SIZE = 22;
  var DESCRIPTION_SIZE = 26;
  var DESCRIPTION_MIN_SIZE = 18;
  var SEPARATOR = "  ·  ";
  // The strip of the row the description is always left, so a long name cannot
  // crowd it out of existence.
  var DESCRIPTION_MIN_WIDTH = 220;
  var ELLIPSIS = "…";

  // A quantity is a count of things in a pack: a whole number, and no sensible
  // one is larger than this.
  var QUANTITY_RANGE = [0, 999];

  // ---- The row ------------------------------------------------------------------
  // The two marks, named once: what each one means, the shape that means it —
  // on the card and in the panel both — and how big that shape is drawn. The
  // row's state, the card's columns and the panel's buttons all come from here,
  // so a mark cannot be one thing in one place and something else in another.
  //
  // The card sizes its column from the label; the panel's is a fixed
  // `$dndc-item-mark-width` in style.scss, so a label longer than "Equipped"
  // has to be given that width too.
  var TICK_FIELDS = [
    {
      field: "equipped", label: "Equipped",
      shape: "square", mark: "tickBox", radius: TICK_RADIUS
    },
    {
      field: "attuned", label: "Attuned",
      shape: "triangle", mark: "triangleBox", radius: TRIANGLE_RADIUS
    }
  ];

  var TEXT_FIELDS = [
    { field: "name", label: "Name" },
    { field: "description", label: "Description" }
  ];

  var QUANTITY_FIELD = { field: "quantity", label: "Qty" };

  function fieldNames(fields) {
    return fields.map(function (field) { return field.field; });
  }

  var TICK_FIELD_NAMES = fieldNames(TICK_FIELDS);
  var TEXT_FIELD_NAMES = fieldNames(TEXT_FIELDS);

  // The one kind of row this page has, which "add a row" offers by name.
  var ITEM = "item";

  function blankRow() {
    var row = { quantity: null, name: "", description: "" };
    TICK_FIELDS.forEach(function (tick) { row[tick.field] = false; });
    return row;
  }

  // A list whose only control is "add a row" says nothing about what a row is,
  // so a fresh page starts with a blank one to fill in. The card prints the
  // other nine either way.
  function create() {
    return { rows: [blankRow()] };
  }

  // A row by the index the markup wrote, or null when that names no row of
  // this page. Both control hooks are offered every event their own region
  // raised, and null is how one says the event was somebody else's.
  function rowAt(page, index) {
    return page.rows[index] || null;
  }

  // The largest cut of `str` that fits, with an ellipsis saying it was cut.
  // Shrinking to fit has a floor, and a string long enough to pass it has to
  // give somewhere; an ellipsis is that decision showing, where a string
  // running off the edge would read as a printing fault.
  function ellipsize(ctx, str, run, maxWidth) {
    if (D.draw.measure(ctx, str, run) <= maxWidth) return str;
    var cut = str;
    while (cut && D.draw.measure(ctx, cut + ELLIPSIS, run) > maxWidth) cut = cut.slice(0, -1);
    cut = cut.replace(/\s+$/, "");
    return cut ? cut + ELLIPSIS : "";
  }

  // ---- The body ----------------------------------------------------------------
  function render(frame, page) {
    var ctx = frame.ctx;
    var u = frame.u;
    var tone = frame.tone;
    var lift = D.sheet.RATIO.centeredLift;

    var top = frame.top + D.sheet.sectionHeader(frame, "CARRIED", frame.top);
    var columns = layOutColumns();
    top += drawHeadings(top);

    var height = frame.bottom - top;
    D.sheet.rows(frame, { x: frame.left, y: top, width: frame.width, height: height },
      { count: ROW_COUNT, rowHeight: height / ROW_COUNT },
      // A row the list hasn't got is drawn blank rather than left out: its
      // marks and its box are the room to write in at the table.
      function (row, index) { drawRow(page.rows[index] || blankRow(), row); });

    function headingRun() {
      return frame.labelRun(tone.muted);
    }

    function centerOf(column) { return column.x + column.width / 2; }

    // Left to right, each mark's column as wide as the wider of the mark and
    // the word over it; the item takes everything left. The words are the
    // fields' own labels, so the card and the panel head the same columns with
    // the same names.
    function layOutColumns() {
      var run = headingRun();
      var x = frame.left;
      function column(caption, markWidth) {
        var width = Math.max(markWidth, D.draw.measure(ctx, caption, run));
        var placed = { caption: caption, x: x, width: width };
        x += width + u(COLUMN_GAP);
        return placed;
      }
      var marks = TICK_FIELDS.map(function (tick) {
        return column(tick.label.toUpperCase(), 2 * u(tick.radius));
      });
      var quantity = column(QUANTITY_FIELD.label.toUpperCase(), u(QUANTITY_BOX_WIDTH));
      return {
        marks: marks,
        quantity: quantity,
        item: { caption: ITEM_CAPTION, x: x, width: frame.left + frame.width - x }
      };
    }

    function drawHeadings(y) {
      var baseline = y + u(HEADING_BASELINE);
      columns.marks.concat([columns.quantity]).forEach(function (column) {
        D.draw.text(ctx, column.caption, centerOf(column), baseline, headingRun());
      });
      var itemRun = headingRun();
      itemRun.align = "left";
      D.draw.text(ctx, columns.item.caption, columns.item.x, baseline, itemRun);
      return u(HEADING_HEIGHT);
    }

    function drawRow(item, row) {
      var middle = row.y + row.height / 2;
      TICK_FIELDS.forEach(function (tick, i) {
        D.sheet[tick.mark](frame, centerOf(columns.marks[i]), middle,
          u(tick.radius), item[tick.field]);
      });
      D.sheet.writeBox(frame, {
        x: centerOf(columns.quantity) - u(QUANTITY_BOX_WIDTH) / 2,
        y: middle - u(QUANTITY_BOX_HEIGHT) / 2,
        width: u(QUANTITY_BOX_WIDTH),
        height: u(QUANTITY_BOX_HEIGHT)
      }, item.quantity);
      drawItem(item, middle);
    }

    // The row is one line, so a name and a description longer than it have to
    // give somewhere. The description gives first: it is left the strip above
    // and shrinks into whatever the name doesn't want, because what you scan a
    // list of gear for is the name of the thing. The name only shrinks once
    // the description is down to that strip, and only a name still too wide at
    // its smallest is cut — a row you can't identify is a row you can't use.
    function drawItem(item, middle) {
      var column = columns.item;
      var name = {
        family: frame.body, weight: 400, size: u(NAME_SIZE),
        color: tone.ink, minSize: u(NAME_MIN_SIZE)
      };
      var description = {
        family: frame.body, weight: 400, size: u(DESCRIPTION_SIZE),
        color: tone.muted, minSize: u(DESCRIPTION_MIN_SIZE)
      };
      var separator = item.name && item.description ? SEPARATOR : "";
      var separatorWidth = D.draw.measure(ctx, separator, description);
      var reserved = item.description ? separatorWidth + u(DESCRIPTION_MIN_WIDTH) : 0;
      var nameRoom = column.width - reserved;
      var baseline = middle + u(NAME_SIZE) * lift;

      name.size = D.draw.fitSize(ctx, item.name, name, nameRoom);
      var nameWidth = D.draw.text(ctx, ellipsize(ctx, item.name, name, nameRoom),
        column.x, baseline, name);
      if (!item.description) return;

      var room = column.width - nameWidth - separatorWidth;
      D.draw.text(ctx, separator, column.x + nameWidth, baseline, description);
      description.size = D.draw.fitSize(ctx, item.description, description, room);
      D.draw.text(ctx, ellipsize(ctx, item.description, description, room),
        column.x + nameWidth + separatorWidth, baseline, description);
    }
  }

  // ---- Controls -----------------------------------------------------------------
  // The rows are a D.rowList: it owns the handle, the remove button and the
  // "add a row" bar, and this page owns the five controls between them, in the
  // card's own order.
  //
  // Every one of those names a field of one of the rows — "name:3" is the
  // fourth row's name — so one name and one parse serve them all.
  var FIELD_SEPARATOR = ":";

  function controlName(field, index) { return field + FIELD_SEPARATOR + index; }

  // The index comes back as a number, because a label saying which row of how
  // many is arithmetic and "3" + 1 is "31".
  function parseControl(name) {
    var parts = String(name).split(FIELD_SEPARATOR);
    return parts.length === 2 ? { field: parts[0], index: +parts[1] } : null;
  }

  // A count is blank until someone writes one in, and blank is a value of its
  // own: the card prints that box empty.
  var QUANTITY_FIELD_SPEC = { range: QUANTITY_RANGE, blank: true };

  // An item is what it is called, and a row nobody has named yet is still one
  // the handles have to be able to say what they are moving.
  var UNNAMED = "an unnamed item";

  function titleOf(row) {
    return row.name.trim() || UNNAMED;
  }

  // ---- Control markup ------------------------------------------------------------
  // Five controls in a row say no more about themselves than three marks on the
  // card do, so the list is headed the same way the card is. These are the
  // captions alone: the list hangs them in a row of its own, which is what
  // holds each one over the column it names. Each says which column that is,
  // so the stylesheet reaches for that rather than counting cells.
  function headingCellHtml(field) {
    return '<span data-column="' + field.field + '">' + field.label + "</span>";
  }

  function headHtml() {
    return TICK_FIELDS.concat([QUANTITY_FIELD], TEXT_FIELDS).map(headingCellHtml).join("");
  }

  function rowLabel(index, field) { return "Item " + (index + 1) + ": " + field.label.toLowerCase(); }

  // The marks as the shapes they are on the card, filled by the same rule.
  // aria-pressed carries the state for anyone not seeing the fill. Which row a
  // mark is on is the row's to say rather than the button's: the list has
  // already written that on the box around it.
  function tickHtml(index, tick) {
    return '<button type="button" class="experiment-ext-dndc-tick" data-shape="' + tick.shape +
      '" data-tick="' + tick.field + '" aria-pressed="false" aria-label="' +
      U.esc(rowLabel(index, tick)) + '"><span aria-hidden="true"></span></button>';
  }

  function textHtml(index, field) {
    return '<input type="text" class="' + U.PREFIX + "input experiment-ext-dndc-item-" + field.field +
      '" data-ctl="' + controlName(field.field, index) + '" placeholder="' + U.esc(field.label) +
      '" aria-label="' + U.esc(rowLabel(index, field)) + '">';
  }

  // The dash stands in for the empty box the card prints when nothing is typed.
  function quantityHtml(index) {
    return '<input type="number" class="' + U.PREFIX + 'input experiment-ext-dndc-item-quantity"' +
      ' data-ctl="' + controlName(QUANTITY_FIELD.field, index) + '" min="' + QUANTITY_RANGE[0] +
      '" max="' + QUANTITY_RANGE[1] + '" placeholder="—" aria-label="' +
      U.esc(rowLabel(index, QUANTITY_FIELD)) + '">';
  }

  function fieldsHtml(row, index) {
    return TICK_FIELDS.map(function (tick) { return tickHtml(index, tick); }).join("") +
      quantityHtml(index) +
      TEXT_FIELDS.map(function (field) { return textHtml(index, field); }).join("");
  }

  var LIST = {
    key: KIND,
    max: ROW_COUNT,
    types: [{ type: ITEM, label: "Item", create: blankRow }],
    rowClass: "experiment-ext-dndc-row-item",
    note: "A row you haven't added prints as an empty one, which is somewhere to write at the " +
      "table. The square marks what is worn or held, the triangle what is attuned.",
    title: titleOf,
    fields: fieldsHtml,
    head: headHtml()
  };

  function html(page) {
    return U.group("Items", D.rowList.html(LIST, page), { key: KIND });
  }

  // ---- Syncing controls ----------------------------------------------------------
  function syncTick(row, index, field, dom) {
    var button = dom.el('[data-row="' + index + '"] [data-tick="' + field + '"]');
    var on = !!row[field];
    button.dataset.on = on ? "true" : "false";
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function sync(page, dom) {
    page.rows.forEach(function (row, index) {
      TICK_FIELDS.forEach(function (tick) { syncTick(row, index, tick.field, dom); });
      // A blank count is null; writing that onto an input puts the word "null"
      // in it.
      dom.ctl(controlName(QUANTITY_FIELD.field, index)).value =
        row.quantity == null ? "" : row.quantity;
      TEXT_FIELDS.forEach(function (field) {
        dom.ctl(controlName(field.field, index)).value = row[field.field];
      });
    });
    D.rowList.sync(LIST, page, dom);
  }

  function onControl(page, name, target, event, ctx) {
    var control = parseControl(name);
    var row = control && rowAt(page, control.index);
    if (!row) return false;

    if (control.field === QUANTITY_FIELD.field) {
      U.readNumber(target, event, QUANTITY_FIELD_SPEC, function (value) {
        row.quantity = value;
        ctx.render();
      });
      return true;
    }
    if (TEXT_FIELD_NAMES.indexOf(control.field) !== -1) {
      row[control.field] = target.value;
      // The handles carry the item's name, which is being typed as they say it.
      D.rowList.retitle(LIST, page, ctx.dom, control.index);
      ctx.render();
      return true;
    }
    return false;
  }

  // A mark is this page's; everything else about a row is the list's.
  function onClick(page, event, ctx) {
    var button = event.target.closest ? event.target.closest("[data-tick]") : null;
    if (!button) return D.rowList.onClick(LIST, page, event, ctx);

    var field = button.dataset.tick;
    var index = D.rowList.rowIndex(button);
    var row = index == null ? null : rowAt(page, index);
    if (!row || TICK_FIELD_NAMES.indexOf(field) === -1) return false;

    row[field] = !row[field];
    syncTick(row, index, field, ctx.dom);
    ctx.render();
    return true;
  }

  function mounted(page, element, ctx) {
    D.rowList.mounted(LIST, page, element, ctx);
  }

  // A row nobody has written anything into, which the card prints exactly as
  // it prints one the list hasn't got.
  function isBlank(row) {
    return row.quantity == null && !row.name && !row.description &&
      TICK_FIELDS.every(function (tick) { return !row[tick.field]; });
  }

  // A saved page: the rows it held, no more of them than the card prints, each
  // mark a mark and each count a count or the blank that prints an empty box.
  //
  // Blank rows on the end are dropped. Every file written before the list could
  // be added to holds ten rows whatever was typed into them, and one arriving
  // full is one nothing can be added to until nine empty rows are deleted by
  // hand. The card prints the same ten either way, so this costs the reader
  // nothing and gives them back the room to add a row. A page left with none is
  // a blank page rather than an empty one, because that is what "add a row" has
  // to start from.
  function load(raw) {
    var read = D.read;
    if (!Array.isArray(raw.rows)) return create();
    var rows = read.rows(raw.rows, ROW_COUNT).map(function (saved) {
      var row = blankRow();
      TICK_FIELDS.forEach(function (tick) { row[tick.field] = read.flag(saved[tick.field]); });
      row.quantity = read.countOrBlank(saved.quantity, QUANTITY_RANGE);
      TEXT_FIELDS.forEach(function (field) {
        row[field.field] = read.text(saved[field.field], "");
      });
      return row;
    });
    while (rows.length && isBlank(rows[rows.length - 1])) rows.pop();
    return rows.length ? { rows: rows } : create();
  }

  D.pages.register({
    kind: KIND,
    label: "Inventory",
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
