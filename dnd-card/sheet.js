/*
 * Player Card — the page frame every card is drawn inside.
 *
 * A character is a set of pages rather than one card, and every page is the
 * same physical card: the same size, the same paper, the same band across the
 * top saying whose it is. Only the body below that band differs. So the frame
 * here draws everything the pages have in common — the background, the
 * portrait strip when a page asks for one, the identity band with whatever
 * sits in its top right corner, and the rule under them — and hands back the
 * rect a page's own renderer draws into.
 *
 * That `frame` is what a body renderer needs and no more: the scale from
 * design px on the 300 dpi card to output px, the tones mixed from the theme's
 * three colors, the three faces, and the content rect. The furniture below all
 * takes the frame, so no page kind re-derives a tone, a scale or a radius.
 *
 * The header keeps a fixed rhythm rather than sharing out slack the way a body
 * does, because a set gets printed together: a band that moved with the length
 * of each page's contents would land somewhere different on every card.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  // Page furniture
  var PAD = 36;
  var PORTRAIT_GUTTER = 30;
  var DIVIDER_WIDTH = 5;
  var PANEL_RADIUS = 12;
  var PANEL_STROKE = 2;

  // Where a baseline sits inside the line box a section reserves for it.
  var BASELINE_RATIO = 0.76;
  // How much of its nominal size a face's capitals take up, near enough to
  // stack lines by — and so, where a baseline sits when the text is centered
  // on a point instead of in a line box.
  var CAP_HEIGHT_RATIO = 0.7;
  var CENTERED_BASELINE_LIFT = CAP_HEIGHT_RATIO / 2;

  // Identity
  var NAME_SIZE = 76;
  var NAME_MIN_SIZE = 32;
  var NAME_TRACKING = 0.02;
  var META_SIZE = 28;
  var META_GAP = 10;
  var META_TRACKING = 0.1;
  var SEPARATOR = "   ·   ";

  // The three numbers you want before anything else happens: what you add when
  // you're good at something, what it takes to hit you, and who goes first.
  // They sit in the top right corner, each in its own shape. The proficiency
  // bonus is printed here rather than inside every diamond it applies to —
  // those are there to be filled in, and a number in each of eighteen of them
  // is the same number eighteen times.
  var BADGE_RADIUS = 52;
  var BADGE_VALUE_SIZE = 46;
  var BADGE_CAPTION_SCALE = 0.85;
  var BADGE_CAPTION_GAP = 8;
  var BADGE_GAP = 18;
  var CORNER_GUTTER = 26;    // between the corner block and the name beside it

  // A page that carries no badges says which page it is instead, so a printed
  // set can be sorted without reading it.
  var PAGE_LABEL_SIZE = 40;

  // Small-caps section and field labels
  var LABEL_SIZE = 19;
  var LABEL_TRACKING = 0.14;

  // The rule under the identity band, and the rhythm around it: the band, a
  // gap, the rule, the same gap, then the page's body.
  var RULE_ACCENT_THICKNESS = 4;
  var RULE_HAIRLINE_THICKNESS = 2;
  var RULE_SPACING = 10;
  var HEADER_GAP = 22;

  // Somewhere to write: paper-colored rather than tinted like the panels, so a
  // blank one reads as "fill this in" and not as a printing fault. The value
  // is sized off the box, so a box small enough for a quantity holds its
  // number the way a wide one holds a hit point total.
  var WRITE_BOX_RADIUS = 9;
  var WRITE_BOX_STROKE = 3;
  var WRITE_VALUE_RATIO = 2 / 3;

  // "TITLE ————": a heading with a rule running off it, giving a list a lid.
  var SECTION_HEADER_HEIGHT = 38;
  var SECTION_HEADER_BASELINE = 22;
  var SECTION_HEADER_RULE_Y = 15;
  var SECTION_HEADER_PAD = 20;

  // A zebra stripe sits inside its row, so consecutive stripes stay apart.
  var ROW_INSET = 4;

  // "Fireball — a burst of flame", wrapped down the row it sits in. Lines are
  // stacked at this multiple of their own type size, so the leading a row
  // spends its depth on scales with what is set in it. Tight, because the
  // depth a line of leading costs is a line of description nobody gets to
  // read — and tight enough that a full block still clears its own stripe.
  var LINE_SEPARATOR = "—";
  var LINE_LEADING = 1.15;
  var ELLIPSIS = "…";

  // Tally marks: a square for a thing that's on, a triangle for a second
  // thing that's on, both hollow until they are.
  var TALLY_STROKE_RATIO = 0.22;   // of the radius
  var TALLY_CORNER_RATIO = 0.18;
  // An equilateral triangle inscribed in the marker's circle, point up.
  var TRIANGLE_HALF_BASE = Math.sqrt(3) / 2;
  var TRIANGLE_BASE_DROP = 0.5;

  // Cards tiled onto one bitmap, with this much paper around and between them.
  var CONTACT_GUTTER = 48;

  // How far each derived tone sits between the theme's background and its ink.
  // Muted text is still text — a score, a total, an ability tag — so it sits
  // past the halfway mark rather than fading toward the paper.
  var TONE_MUTED = 0.58;
  var TONE_PANEL = 0.07;
  var TONE_RULE = 0.22;
  var TONE_PORTRAIT = 0.14;
  var TONE_PLACEHOLDER_RING = 0.3;

  function tonesFor(look) {
    var toward = function (t) { return D.draw.mix(look.background, look.ink, t); };
    return {
      ink: look.ink,
      accent: look.accent,
      background: look.background,
      muted: toward(TONE_MUTED),
      panel: toward(TONE_PANEL),
      rule: toward(TONE_RULE),
      portrait: toward(TONE_PORTRAIT),
      placeholderRing: toward(TONE_PLACEHOLDER_RING)
    };
  }

  function monogramFor(name) {
    var trimmed = String(name || "").trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
  }

  function joinParts(parts) {
    return parts.filter(function (part) { return part && String(part).trim(); })
      .map(function (part) { return String(part).trim().toUpperCase(); })
      .join(SEPARATOR);
  }

  // Who the character is, in two lines under the name: what they are, then the
  // finer print. Either can come out empty, and an empty one takes no room.
  function metaLinesFor(identity, tone) {
    return [
      {
        text: joinParts(["Level " + identity.level, identity.species, identity.className]),
        color: tone.accent
      },
      { text: joinParts([identity.subclass, identity.background]), color: tone.muted }
    ].filter(function (line) { return line.text; });
  }

  function badgeBlockHeight(u) {
    return 2 * u(BADGE_RADIUS) + u(BADGE_CAPTION_GAP) + u(LABEL_SIZE * BADGE_CAPTION_SCALE);
  }

  // The band holds the name and the corner block side by side, so it's as deep
  // as whichever is deeper — a character with nothing but a level to their name
  // still can't have the badges hanging out of it. The badges' depth counts
  // even on a page that has none, which is what keeps every page of a set
  // banded to the same depth.
  function bandHeight(u, lines) {
    return Math.max(u(NAME_SIZE) + lines.length * u(META_SIZE + META_GAP), badgeBlockHeight(u));
  }

  // ---- The frame -------------------------------------------------------------
  // `identity` is the shared character: name, species, className, subclass,
  // background, level and proficiencyBonus. `look` is the theme's three colors,
  // the three families, and the portrait with its framing. `opts` is what the
  // page kind asks of its header:
  //   portrait: true            reserve and draw the left third for the picture
  //   badges: [{shape, caption, value}]   the top right block
  //   label: "INVENTORY 2"      drawn top right instead, when there are no badges
  function makeFrame(ctx, output, identity, look, opts) {
    opts = opts || {};
    var u = function (design) { return design * (output.width / D.DESIGN.width); };
    var tone = tonesFor(look);
    var f = {
      ctx: ctx,
      output: output,
      u: u,
      tone: tone,
      display: look.displayFamily,
      body: look.bodyFamily,
      nameFace: look.nameFamily,
      labelRun: function (color, size) {
        return {
          family: look.displayFamily, weight: 700, size: size || u(LABEL_SIZE),
          tracking: LABEL_TRACKING, color: color, align: "center"
        };
      }
    };

    ctx.clearRect(0, 0, output.width, output.height);
    ctx.fillStyle = look.background;
    ctx.fillRect(0, 0, output.width, output.height);

    if (opts.portrait) drawPortrait(f, identity, look);

    f.left = opts.portrait ? output.width * D.PORTRAIT_FRACTION + u(PORTRAIT_GUTTER) : u(PAD);
    f.width = output.width - u(PAD) - f.left;

    var lines = metaLinesFor(identity, tone);
    var height = bandHeight(u, lines);
    var corner = opts.badges
      ? drawBadges(f, opts.badges, u(PAD), height)
      : drawPageLabel(f, opts.label, u(PAD), height);
    drawIdentity(f, identity, lines, u(PAD), corner);

    var ruleTop = u(PAD) + height + u(HEADER_GAP);
    drawRule(f, ruleTop);

    f.top = ruleTop + u(RULE_SPACING + RULE_HAIRLINE_THICKNESS) + u(HEADER_GAP);
    f.bottom = output.height - u(PAD);
    return f;
  }

  function drawPortrait(frame, identity, look) {
    var ctx = frame.ctx;
    var output = frame.output;
    var rect = { x: 0, y: 0, width: output.width * D.PORTRAIT_FRACTION, height: output.height };
    D.draw.bar(ctx, rect.x, rect.y, rect.width, rect.height, frame.tone.portrait);

    if (look.portrait.image) {
      D.portrait.draw(ctx, rect, look.portrait.image, look.portrait);
    } else {
      D.portrait.drawPlaceholder(ctx, rect, {
        monogram: monogramFor(identity.name),
        family: frame.nameFace,
        ink: frame.tone.muted,
        ring: frame.tone.placeholderRing
      });
    }

    D.draw.bar(ctx, rect.width - frame.u(DIVIDER_WIDTH), 0, frame.u(DIVIDER_WIDTH),
      output.height, frame.tone.accent);
  }

  // The name down the left of the band, with the meta lines under it. The
  // corner block took its width first and the name fits into what's left.
  function drawIdentity(frame, identity, lines, top, cornerWidth) {
    var ctx = frame.ctx;
    var u = frame.u;
    var room = frame.width - cornerWidth - u(CORNER_GUTTER);
    var name = String(identity.name || "").trim() || "Unnamed";
    var run = {
      family: frame.nameFace, weight: 700, size: u(NAME_SIZE), tracking: NAME_TRACKING,
      color: frame.tone.ink, minSize: u(NAME_MIN_SIZE)
    };
    run.size = D.draw.fitSize(ctx, name, run, room);
    D.draw.text(ctx, name, frame.left, top + u(NAME_SIZE) * BASELINE_RATIO, run);

    var cursor = top + u(NAME_SIZE) + u(META_GAP);
    lines.forEach(function (line) {
      var meta = {
        family: frame.display, weight: 400, size: u(META_SIZE),
        tracking: META_TRACKING, color: line.color
      };
      meta.size = D.draw.fitSize(ctx, line.text, meta, room);
      D.draw.text(ctx, line.text, frame.left, cursor + u(META_SIZE) * BASELINE_RATIO, meta);
      cursor += u(META_SIZE + META_GAP);
    });
  }

  // The corner block, right-aligned in the identity band. Returns the width it
  // took, so the name knows where to stop. Each badge is captioned: a shape
  // nobody has explained is a shape.
  function drawBadges(frame, badges, top, height) {
    var ctx = frame.ctx;
    var u = frame.u;
    var radius = u(BADGE_RADIUS);
    var caption = frame.labelRun(frame.tone.accent, u(LABEL_SIZE * BADGE_CAPTION_SCALE));
    // One cell width for all of them, so they read as a set rather than as
    // things that happen to be next to each other.
    var cell = badges.reduce(function (widest, badge) {
      return Math.max(widest, D.draw.measure(ctx, badge.caption, caption));
    }, 2 * radius);
    var total = cell * badges.length + u(BADGE_GAP) * (badges.length - 1);
    var centerY = top + (height - badgeBlockHeight(u)) / 2 + radius;
    var left = frame.left + frame.width - total;

    badges.forEach(function (badge, i) {
      var centerX = left + i * (cell + u(BADGE_GAP)) + cell / 2;
      D.draw.badge(ctx, badge.shape, centerX, centerY, radius, {
        color: frame.tone.accent,
        filled: true,
        label: badge.value,
        labelSize: u(BADGE_VALUE_SIZE),
        labelColor: frame.tone.background,
        family: frame.display
      });
      D.draw.text(ctx, badge.caption, centerX,
        centerY + radius + u(BADGE_CAPTION_GAP) + caption.size, caption);
    });
    return total;
  }

  function drawPageLabel(frame, label, top, height) {
    if (!label) return 0;
    var run = frame.labelRun(frame.tone.accent, frame.u(PAGE_LABEL_SIZE));
    run.align = "right";
    D.draw.text(frame.ctx, label, frame.left + frame.width,
      top + height / 2 + run.size * CENTERED_BASELINE_LIFT, run);
    return D.draw.measure(frame.ctx, label, run);
  }

  function drawRule(frame, top) {
    var u = frame.u;
    D.draw.bar(frame.ctx, frame.left, top, frame.width, u(RULE_ACCENT_THICKNESS), frame.tone.accent);
    D.draw.bar(frame.ctx, frame.left, top + u(RULE_SPACING), frame.width,
      u(RULE_HAIRLINE_THICKNESS), frame.tone.rule);
  }

  // ---- Furniture -------------------------------------------------------------

  function panel(frame, rect) {
    D.draw.panel(frame.ctx, rect, {
      fill: frame.tone.panel, stroke: frame.tone.rule,
      lineWidth: frame.u(PANEL_STROKE), radius: frame.u(PANEL_RADIUS)
    });
  }

  function sectionHeaderHeight(frame) {
    return frame.u(SECTION_HEADER_HEIGHT);
  }

  // "SKILLS —————————": a rule from the heading to the edge of the column.
  // Returns the height it reserves, which is where the rows under it start.
  function sectionHeader(frame, title, top) {
    var u = frame.u;
    var heading = frame.labelRun(frame.tone.accent);
    heading.align = "left";
    var width = D.draw.text(frame.ctx, title, frame.left, top + u(SECTION_HEADER_BASELINE), heading);
    var ruleX = frame.left + width + u(SECTION_HEADER_PAD);
    var ruleWidth = frame.left + frame.width - ruleX;
    if (ruleWidth > 0) {
      D.draw.bar(frame.ctx, ruleX, top + u(SECTION_HEADER_RULE_Y), ruleWidth,
        u(RULE_HAIRLINE_THICKNESS), frame.tone.rule);
    }
    return sectionHeaderHeight(frame);
  }

  // Rows filling `rect`, striped alternately so the eye stays on one line
  // across a row's width. `drawRow` gets each row's own rect and its index.
  function rows(frame, rect, opts, drawRow) {
    var inset = frame.u(ROW_INSET);
    for (var i = 0; i < opts.count; i++) {
      var y = rect.y + i * opts.rowHeight;
      if (i % 2 === 0) {
        D.draw.panel(frame.ctx, {
          x: rect.x, y: y + inset, width: rect.width, height: opts.rowHeight - 2 * inset
        }, { fill: frame.tone.panel, radius: frame.u(PANEL_RADIUS) / 2 });
      }
      drawRow({ x: rect.x, y: y, width: rect.width, height: opts.rowHeight }, i);
    }
  }

  // A word wider than the column it is set in is cut into pieces that fit,
  // rather than left to run off the edge of the card.
  function wordPieces(ctx, word, run, room) {
    var pieces = [];
    var rest = word;
    while (D.draw.measure(ctx, rest, run) > room) {
      var kept = rest;
      while (kept.length > 1 && D.draw.measure(ctx, kept, run) > room) kept = kept.slice(0, -1);
      pieces.push(kept);
      rest = rest.slice(kept.length);
    }
    if (rest) pieces.push(rest);
    return pieces;
  }

  // The words of a run of styled text in reading order, each carrying the run
  // it is set in. `glue` is a word that may not open a line: an em dash at the
  // head of one reads as a dash rather than as the join it is. `joined` is the
  // tail of a word that had to be split, which takes no space before it.
  function wordsOf(ctx, segments, room) {
    var words = [];
    segments.forEach(function (segment) {
      segment.text.split(/\s+/).forEach(function (word) {
        if (!word) return;
        wordPieces(ctx, word, segment.run, room).forEach(function (piece, i) {
          words.push({
            text: piece,
            run: segment.run,
            width: D.draw.measure(ctx, piece, segment.run),
            glue: i === 0 && !!segment.glue,
            joined: i > 0
          });
        });
      });
    });
    return words;
  }

  // Greedily: a word joins the line being built while there is room for it and
  // opens the next one when there isn't. A line is as tall as the largest type
  // set on it, so a name and the start of its description share one line's
  // depth rather than each claiming their own.
  function wrapWords(ctx, words, room) {
    var lines = [];
    var line = null;
    words.forEach(function (word) {
      var gap = line && !word.joined
        ? D.draw.measure(ctx, " ", line.words[line.words.length - 1].run) : 0;
      if (line && (word.glue || line.width + gap + word.width <= room)) {
        word.gap = gap;
        line.words.push(word);
        line.width += gap + word.width;
        line.size = Math.max(line.size, word.run.size);
        return;
      }
      word.gap = 0;
      line = { words: [word], width: word.width, size: word.run.size };
      lines.push(line);
    });
    return lines;
  }

  function lineHeight(line) { return line.size * LINE_LEADING; }

  function blockHeight(lines) {
    return lines.reduce(function (total, line) { return total + lineHeight(line); }, 0);
  }

  // As many lines as the row is deep, and never fewer than one: a row with
  // something written on it has to say something.
  function linesWithin(lines, room) {
    var used = 0;
    for (var i = 0; i < lines.length; i++) {
      used += lineHeight(lines[i]);
      if (i && used > room) return lines.slice(0, i);
    }
    return lines;
  }

  // The last line of a block that had more to say ends in an ellipsis, which
  // is that decision showing, where a sentence that merely stopped would read
  // as a printing fault. Whole words go when there is no room for even one
  // character of them and their ellipsis.
  function ellipsize(ctx, line, room) {
    while (line.words.length) {
      var last = line.words[line.words.length - 1];
      var head = line.width - last.gap - last.width;
      var kept = last.text;
      while (kept && head + last.gap + D.draw.measure(ctx, kept + ELLIPSIS, last.run) > room) {
        kept = kept.slice(0, -1);
      }
      if (kept) {
        last.text = kept + ELLIPSIS;
        return;
      }
      line.width = head;
      line.words.pop();
    }
  }

  // Each line is centered in a box of its own depth, so a single line lands
  // exactly where an unwrapped one used to.
  function drawWrapped(frame, lines, left, top) {
    var y = top;
    lines.forEach(function (line) {
      var height = lineHeight(line);
      var x = left;
      line.words.forEach(function (word) {
        x += word.gap;
        D.draw.text(frame.ctx, word.text, x,
          y + height / 2 + word.run.size * CENTERED_BASELINE_LIFT, word.run);
        x += word.width;
      });
      y += height;
    });
  }

  // A row of a list: what it is called, and then what it is. The name takes
  // the ink because it is what the row gets looked up by; the description
  // follows in the muted tone after an em dash.
  //
  // Both are set at the size they were asked for and wrapped across as many
  // lines as `height` holds, centered on `middle`. Type that shrank to fit
  // would let the longest description on a card decide how legible the
  // shortest one is; type that wraps keeps every row at one size and spends
  // the row's depth instead. What will not fit even wrapped is cut.
  function namedLine(frame, line) {
    var ctx = frame.ctx;
    var name = String(line.name == null ? "" : line.name).trim();
    var description = String(line.description == null ? "" : line.description).trim();
    if (!name && !description) return;

    var nameRun = {
      family: frame.body, weight: 700, size: line.nameSize, color: frame.tone.ink
    };
    var tailRun = {
      family: frame.body, weight: 400, size: line.descriptionSize, color: frame.tone.muted
    };
    var segments = [];
    if (name) segments.push({ text: name, run: nameRun });
    if (name && description) segments.push({ text: LINE_SEPARATOR, run: tailRun, glue: true });
    if (description) segments.push({ text: description, run: tailRun });

    var room = line.right - line.left;
    var wrapped = wrapWords(ctx, wordsOf(ctx, segments, room), room);
    var shown = linesWithin(wrapped, line.height);
    if (shown.length < wrapped.length) ellipsize(ctx, shown[shown.length - 1], room);
    drawWrapped(frame, shown, line.left, line.middle - blockHeight(shown) / 2);
  }

  // A box in the paper's own color, holding the value when there is one and
  // nothing at all when there isn't.
  function writeBox(frame, rect, value) {
    D.draw.panel(frame.ctx, rect, {
      fill: frame.tone.background, stroke: frame.tone.rule,
      lineWidth: frame.u(WRITE_BOX_STROKE), radius: frame.u(WRITE_BOX_RADIUS)
    });
    if (value == null || value === "") return;
    var size = rect.height * WRITE_VALUE_RATIO;
    D.draw.text(frame.ctx, String(value), rect.x + rect.width / 2,
      rect.y + rect.height / 2 + size * CENTERED_BASELINE_LIFT, {
        family: frame.display, weight: 700, size: size, color: frame.tone.ink, align: "center"
      });
  }

  // A tally mark, hollow while it's yours to fill and solid once it is. The
  // card's circles are D.draw.pip; these are the two shapes a row needs beside
  // them, and being different shapes is how a row says which is which.
  function tally(frame, radius, on, trace) {
    var ctx = frame.ctx;
    ctx.save();
    ctx.lineWidth = Math.max(1, radius * TALLY_STROKE_RATIO);
    ctx.strokeStyle = on ? frame.tone.accent : frame.tone.rule;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineJoin = "round";
    trace();
    if (on) ctx.fill(); else ctx.stroke();
    ctx.restore();
  }

  function tickBox(frame, cx, cy, radius, on) {
    tally(frame, radius, on, function () {
      D.draw.pathRoundedRect(frame.ctx, cx - radius, cy - radius, 2 * radius, 2 * radius,
        radius * TALLY_CORNER_RATIO);
    });
  }

  function triangleBox(frame, cx, cy, radius, on) {
    tally(frame, radius, on, function () {
      var ctx = frame.ctx;
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx + radius * TRIANGLE_HALF_BASE, cy + radius * TRIANGLE_BASE_DROP);
      ctx.lineTo(cx - radius * TRIANGLE_HALF_BASE, cy + radius * TRIANGLE_BASE_DROP);
      ctx.closePath();
    });
  }

  // ---- Entry points ----------------------------------------------------------

  // One page onto a canvas. `label` is the page's caption in the set it belongs
  // to (D.pages.labelFor); a page drawn on its own falls back to its kind's own
  // name, and a kind that asks for badges gets those instead.
  function render(ctx, output, page, identity, look, label) {
    var definition = D.pages.definition(page.kind);
    var asked = definition.frameOptions ? definition.frameOptions(page, identity) : {};
    // Copied rather than filled in, so what a kind asked for is never written
    // back to whatever it handed over.
    var opts = { portrait: asked.portrait, badges: asked.badges, label: asked.label };
    if (!opts.badges && !opts.label) {
      opts.label = String(label || definition.label).toUpperCase();
    }
    definition.render(makeFrame(ctx, output, identity, look, opts), page, identity);
  }

  // Every page tiled into one bitmap on the theme's paper, in page order, as
  // square a block as the count allows. Only this knows how big that comes
  // out, so it sizes the canvas itself and returns what it made.
  function contactSheet(ctx, pages, identity, look, dpi) {
    var card = D.pixelsFor(dpi);
    var gutter = CONTACT_GUTTER * card.width / D.DESIGN.width;
    var columns = Math.max(1, Math.ceil(Math.sqrt(pages.length)));
    var rowCount = Math.max(1, Math.ceil(pages.length / columns));
    var size = {
      width: Math.round(columns * card.width + (columns + 1) * gutter),
      height: Math.round(rowCount * card.height + (rowCount + 1) * gutter)
    };

    // Sizing a canvas resets its context, so it happens before any drawing; a
    // context that has no canvas of its own is taken as already sized.
    if (ctx.canvas) {
      ctx.canvas.width = size.width;
      ctx.canvas.height = size.height;
    }
    D.draw.bar(ctx, 0, 0, size.width, size.height, look.background);

    pages.forEach(function (page, i) {
      ctx.save();
      ctx.translate(gutter + (i % columns) * (card.width + gutter),
        gutter + Math.floor(i / columns) * (card.height + gutter));
      render(ctx, card, page, identity, look, D.pages.labelFor(pages, i));
      ctx.restore();
    });
    return size;
  }

  D.sheet = {
    // Ratios a body renderer needs to place type the way the frame does.
    RATIO: {
      baseline: BASELINE_RATIO,
      capHeight: CAP_HEIGHT_RATIO,
      centeredLift: CENTERED_BASELINE_LIFT
    },

    frame: makeFrame,
    render: render,
    contactSheet: contactSheet,

    panel: panel,
    sectionHeader: sectionHeader,
    sectionHeaderHeight: sectionHeaderHeight,
    rows: rows,
    namedLine: namedLine,
    writeBox: writeBox,
    tickBox: tickBox,
    triangleBox: triangleBox
  };
})();
