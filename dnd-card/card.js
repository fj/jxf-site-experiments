/*
 * Player Card — the card layout.
 *
 * Draws a finished card from a resolved model (plain numbers and strings; the
 * rules arithmetic has already happened) and a look (three colors and three
 * font families — the character's name gets its own, since it's the one line
 * anybody would want set in something with a flourish). Every length below is
 * a design px on the 300 dpi card and is scaled by `u()`, so the same layout
 * renders at any output resolution.
 *
 * The card is landscape. The picture takes the left third at full height; the
 * remaining two thirds are a wide column carrying a stack of sections — who the
 * character is, then everything that changes during play, then what's fixed
 * for the session. Width is the plentiful axis and height the scarce one, so
 * the rows run long: six ability blocks abreast, skills in three columns. The
 * stack is measured before it's drawn and the slack shared out between the
 * sections, so a card with no subclass doesn't leave a hole and a long name
 * doesn't crowd anything.
 *
 * Anything that gets rubbed out and rewritten — hit points, temporary hit
 * points, hit dice, death saves, inspiration — is drawn as somewhere to write
 * rather than as a printed number: a paper-colored box, or a circle to fill.
 * Those sit together and high, above the ability blocks, because they're what
 * a hand reaches for mid-combat.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  // Page furniture
  var PAD = 36;
  var PORTRAIT_GUTTER = 30;
  var DIVIDER_WIDTH = 5;
  var SECTION_GAP_MIN = 16;
  var SECTION_GAP_MAX = 44;
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
  var BADGE_GUTTER = 26;    // between the badges and the name beside them

  // Small-caps section and field labels
  var LABEL_SIZE = 19;
  var LABEL_TRACKING = 0.14;

  // Rules between sections
  var RULE_ACCENT_THICKNESS = 4;
  var RULE_HAIRLINE_THICKNESS = 2;
  var RULE_SPACING = 10;

  // Somewhere to write: paper-colored rather than tinted like the panels, so a
  // blank one reads as "fill this in" and not as a printing fault.
  var WRITE_BOX_WIDTH = 108;
  var WRITE_BOX_HEIGHT = 78;
  var WRITE_BOX_RADIUS = 9;
  var WRITE_BOX_STROKE = 3;
  var WRITE_VALUE_SIZE = 52;

  // Vitals — a label, its box, and whatever the box counts against
  var VITALS_HEIGHT = 116;
  var VITALS_GAP = 14;        // between the three cells
  var VITALS_INSET = 16;      // inside a cell, before its label
  var VITALS_RUN_GAP = 12;    // between a cell's label, box and suffix
  var VITALS_SUFFIX_SIZE = 30;
  var VITALS_DIE_RADIUS = 19;
  var VITALS_DIE_GAP = 6;     // between the die's shape and its notation

  // Ability blocks — all six abreast, which is what the long edge buys
  var ABILITY_HEIGHT = 206;
  var ABILITY_GAP = 14;
  var ABILITY_COLUMNS = 6;
  var ABILITY_LABEL_BASELINE = 36;
  var ABILITY_MOD_BASELINE = 116;
  var ABILITY_MOD_SIZE = 64;
  var ABILITY_SCORE_BASELINE = 150;
  var ABILITY_SCORE_SIZE = 24;
  var ABILITY_DIVIDER_Y = 162;
  var ABILITY_SAVE_SIZE = 26;
  var SAVE_ROW_GAP = 9;
  var SAVE_DIAMOND_RADIUS = 17;

  // Death saves and heroic inspiration. Everything sits on one line — heading,
  // both tallies, inspiration — because every row this section doesn't take is
  // a row the skills get.
  var SITUATION_HEIGHT = 92;
  var SITUATION_INSET = 20;
  var SITUATION_GAP = 22;       // between the row's parts, and around the divider
  var DEATH_SAVE_SLOTS = 3;
  var DEATH_ROW_LABEL_SCALE = 0.9;
  var DEATH_PIP_RADIUS = 18;
  var DEATH_PIP_SPACING = 46;
  var DEATH_PIP_GAP = 16;       // between a tally's label and its first slot
  var INSPIRATION_PIP_RADIUS = 22;
  var INSPIRATION_GAP = 16;

  // Skills — the longest list on the card, and the one that takes whatever
  // height the sections above it leave.
  var SKILL_HEADER_HEIGHT = 38;
  var SKILL_HEADER_BASELINE = 22;
  var SKILL_HEADER_RULE_Y = 15;
  var SKILL_HEADER_PAD = 20;
  var SKILL_ROW_HEIGHT = 66;
  var SKILL_ROW_INSET = 4;
  var SKILL_COLUMN_GAP = 18;
  var SKILL_COLUMNS = 3;
  var SKILL_DIAMOND_RADIUS = 18;
  var SKILL_DIAMOND_GAP = 4;
  var SKILL_DIAMOND_X = SKILL_DIAMOND_RADIUS;  // flush with the stripe's edge
  var SKILL_NAME_GAP = 10;
  var SKILL_NAME_SIZE = 30;
  var SKILL_NAME_MIN_SIZE = 18;
  // The total ends the row, with the ability it comes off set under it and
  // flush to the same right edge. The two are centered on the stripe as one
  // block, so the middle of the row runs between them rather than through
  // either.
  var SKILL_MOD_SIZE = 30;
  var SKILL_MOD_RIGHT = 12;
  var SKILL_ABBR_SIZE = 15;
  var SKILL_ABBR_LEADING = 5;

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

  function render(ctx, output, model, look) {
    var u = function (design) { return design * (output.width / D.DESIGN.width); };
    var tone = tonesFor(look);
    var display = look.displayFamily;
    var body = look.bodyFamily;
    var nameFace = look.nameFamily;
    var bonusLabel = D.rules.signed(model.proficiencyBonus);

    function labelRun(color, size) {
      return {
        family: display, weight: 700, size: size || u(LABEL_SIZE),
        tracking: LABEL_TRACKING, color: color, align: "center"
      };
    }

    ctx.clearRect(0, 0, output.width, output.height);
    ctx.fillStyle = look.background;
    ctx.fillRect(0, 0, output.width, output.height);

    drawPortrait();

    var columnX = output.width * D.PORTRAIT_FRACTION + u(PORTRAIT_GUTTER);
    var columnWidth = output.width - u(PAD) - columnX;

    var metaLines = [
      { text: joinParts(["Level " + model.level, model.species, model.className]), color: tone.accent },
      { text: joinParts([model.subclass, model.background]), color: tone.muted }
    ].filter(function (line) { return line.text; });

    var badges = [
      { shape: "diamond", caption: "PROFICIENCY", value: bonusLabel },
      { shape: "shield", caption: "ARMOR CLASS", value: String(model.armorClass) },
      { shape: "wedge", caption: "INITIATIVE", value: D.rules.signed(model.initiative) }
    ];

    function badgeHeight() {
      return 2 * u(BADGE_RADIUS) + u(BADGE_CAPTION_GAP) + u(LABEL_SIZE * BADGE_CAPTION_SCALE);
    }

    // The band holds the name and the badges side by side, so it's as deep as
    // whichever is deeper — a character with nothing but a level to their name
    // still can't have the badges hanging out of it.
    function identityHeight() {
      return Math.max(u(NAME_SIZE) + metaLines.length * u(META_SIZE + META_GAP), badgeHeight());
    }

    layOut([
      { height: identityHeight(), draw: drawIdentity },
      { height: u(RULE_SPACING + RULE_HAIRLINE_THICKNESS), draw: drawRule },
      { height: u(VITALS_HEIGHT), draw: drawVitals },
      { height: u(SITUATION_HEIGHT), draw: drawSituation },
      { height: u(ABILITY_HEIGHT), draw: drawAbilities },
      {
        height: u(SKILL_HEADER_HEIGHT) + Math.ceil(model.skills.length / SKILL_COLUMNS) * u(SKILL_ROW_HEIGHT),
        draw: drawSkills
      }
    ]);

    // ---- Stack ---------------------------------------------------------------
    // Sections keep their natural heights and the leftover space is shared
    // between them, within limits, with any remainder split above and below.
    function layOut(stack) {
      var content = stack.reduce(function (sum, section) { return sum + section.height; }, 0);
      var available = output.height - 2 * u(PAD);
      var gapCount = Math.max(1, stack.length - 1);
      var gap = D.clamp((available - content) / gapCount, u(SECTION_GAP_MIN), u(SECTION_GAP_MAX));
      var top = u(PAD) + Math.max(0, (available - content - gap * gapCount) / 2);
      stack.forEach(function (section) {
        section.draw(top);
        top += section.height + gap;
      });
    }

    function drawPanel(rect) {
      D.draw.panel(ctx, rect, {
        fill: tone.panel, stroke: tone.rule, lineWidth: u(PANEL_STROKE), radius: u(PANEL_RADIUS)
      });
    }

    // Every proficiency marker on the card is the same thing: a diamond,
    // filled when the bonus applies and empty when it's yours to fill. What
    // one is worth is on the badge at the top of the card.
    function proficiencyDiamond(cx, cy, radius, applies) {
      D.draw.badge(ctx, "diamond", cx, cy, radius, {
        color: applies ? tone.accent : tone.rule,
        filled: applies
      });
    }

    // ---- Portrait ------------------------------------------------------------
    function drawPortrait() {
      var rect = { x: 0, y: 0, width: output.width * D.PORTRAIT_FRACTION, height: output.height };
      D.draw.bar(ctx, rect.x, rect.y, rect.width, rect.height, tone.portrait);

      if (look.portrait.image) {
        D.portrait.draw(ctx, rect, look.portrait.image, look.portrait);
      } else {
        D.portrait.drawPlaceholder(ctx, rect, {
          monogram: monogramFor(model.name),
          family: nameFace,
          ink: tone.muted,
          ring: tone.placeholderRing
        });
      }

      D.draw.bar(ctx, rect.width - u(DIVIDER_WIDTH), 0, u(DIVIDER_WIDTH), output.height, tone.accent);
    }

    // ---- Identity ------------------------------------------------------------
    // Who the character is, down the left of the band, and the three numbers
    // that start a fight, in the corner. The badges take their width first and
    // the name fits into what's left.
    function drawIdentity(top) {
      var height = identityHeight();
      var room = columnWidth - drawBadges(top, height) - u(BADGE_GUTTER);
      var name = String(model.name || "").trim() || "Unnamed";
      var run = {
        family: nameFace, weight: 700, size: u(NAME_SIZE), tracking: NAME_TRACKING,
        color: tone.ink, minSize: u(NAME_MIN_SIZE)
      };
      run.size = D.draw.fitSize(ctx, name, run, room);
      D.draw.text(ctx, name, columnX, top + u(NAME_SIZE) * BASELINE_RATIO, run);

      var cursor = top + u(NAME_SIZE) + u(META_GAP);
      metaLines.forEach(function (line) {
        var meta = {
          family: display, weight: 400, size: u(META_SIZE),
          tracking: META_TRACKING, color: line.color
        };
        meta.size = D.draw.fitSize(ctx, line.text, meta, room);
        D.draw.text(ctx, line.text, columnX, cursor + u(META_SIZE) * BASELINE_RATIO, meta);
        cursor += u(META_SIZE + META_GAP);
      });
    }

    // The corner block, right-aligned in the identity band. Returns the width
    // it took, so the name knows where to stop. Each badge is captioned: a
    // shape nobody has explained is a shape.
    function drawBadges(top, height) {
      var radius = u(BADGE_RADIUS);
      var caption = labelRun(tone.accent, u(LABEL_SIZE * BADGE_CAPTION_SCALE));
      // One cell width for all three, so they read as a set rather than as
      // three things that happen to be next to each other.
      var cell = badges.reduce(function (widest, badge) {
        return Math.max(widest, D.draw.measure(ctx, badge.caption, caption));
      }, 2 * radius);
      var total = cell * badges.length + u(BADGE_GAP) * (badges.length - 1);
      var centerY = top + (height - badgeHeight()) / 2 + radius;
      var left = columnX + columnWidth - total;

      badges.forEach(function (badge, i) {
        var centerX = left + i * (cell + u(BADGE_GAP)) + cell / 2;
        D.draw.badge(ctx, badge.shape, centerX, centerY, radius, {
          color: tone.accent,
          filled: true,
          label: badge.value,
          labelSize: u(BADGE_VALUE_SIZE),
          labelColor: tone.background,
          family: display
        });
        D.draw.text(ctx, badge.caption, centerX,
          centerY + radius + u(BADGE_CAPTION_GAP) + caption.size, caption);
      });
      return total;
    }

    function drawRule(top) {
      D.draw.bar(ctx, columnX, top, columnWidth, u(RULE_ACCENT_THICKNESS), tone.accent);
      D.draw.bar(ctx, columnX, top + u(RULE_SPACING), columnWidth, u(RULE_HAIRLINE_THICKNESS), tone.rule);
    }

    // ---- Vitals --------------------------------------------------------------
    // A cell reads "LABEL [box] / total". The label sits beside the box rather
    // than over it, which is what leaves the box wide enough to write a number
    // in twice over. Cells take the width their own contents need and share
    // whatever the column has left equally, so no fixed fractions have to be
    // kept in step with the labels.
    function drawVitals(top) {
      var height = u(VITALS_HEIGHT);
      var centerY = top + height / 2;
      var gap = u(VITALS_RUN_GAP);

      // Each part knows its own width and how to draw itself at an x, so a
      // cell is laid out by walking its parts once.
      function labelPart(caption) {
        var run = labelRun(tone.accent);
        run.align = "left";
        return part(D.draw.measure(ctx, caption, run), function (x) {
          D.draw.text(ctx, caption, x, baselineFor(run.size), run);
        });
      }

      function boxPart(value) {
        return part(u(WRITE_BOX_WIDTH), function (x) { writeBox(x, centerY, value); });
      }

      function totalPart(caption) {
        var run = { family: display, weight: 400, size: u(VITALS_SUFFIX_SIZE), color: tone.muted, align: "left" };
        return part(D.draw.measure(ctx, caption, run), function (x) {
          D.draw.text(ctx, caption, x, baselineFor(run.size), run);
        });
      }

      // The die you roll, as a shape and as its name. The notation is the one
      // place lowercase matters, and the display face may be a caps-only
      // roman — "d8" has to come out of the body face.
      function diePart(sides) {
        var radius = u(VITALS_DIE_RADIUS);
        var caption = "d" + sides;
        var run = { family: body, weight: 400, size: u(VITALS_SUFFIX_SIZE), color: tone.accent, align: "left" };
        var captionX = 2 * radius + u(VITALS_DIE_GAP);
        return part(captionX + D.draw.measure(ctx, caption, run), function (x) {
          D.dice.draw(ctx, sides, x + radius, centerY, radius, { color: tone.accent });
          D.draw.text(ctx, caption, x + captionX, baselineFor(run.size), run);
        });
      }

      function part(width, draw) { return { width: width, draw: draw }; }
      function baselineFor(size) { return centerY + size * CENTERED_BASELINE_LIFT; }

      var cells = [
        [labelPart("HIT POINTS"), boxPart(model.hitPoints), totalPart("/ " + model.hitPointsMax)],
        [labelPart("TEMP HP"), boxPart(model.temporaryHitPoints)],
        [labelPart("HIT DICE"), boxPart(model.hitDiceRemaining),
          totalPart("/ " + model.hitDiceTotal), diePart(model.hitDie)]
      ];

      var widths = cells.map(function (parts) {
        return parts.reduce(function (sum, p) { return sum + p.width; }, 0) + gap * (parts.length - 1);
      });
      var natural = widths.reduce(function (sum, width) { return sum + width + 2 * u(VITALS_INSET); }, 0);
      var slack = (columnWidth - u(VITALS_GAP) * (cells.length - 1) - natural) / cells.length;

      var x = columnX;
      cells.forEach(function (parts, i) {
        var width = widths[i] + 2 * u(VITALS_INSET) + slack;
        drawPanel({ x: x, y: top, width: width, height: height });
        var cursor = x + (width - widths[i]) / 2;
        parts.forEach(function (p) {
          p.draw(cursor);
          cursor += p.width + gap;
        });
        x += width + u(VITALS_GAP);
      });
    }

    // The box itself: an outline in the paper's own color, holding the value
    // when there is one and nothing at all when there isn't.
    function writeBox(x, centerY, value) {
      var width = u(WRITE_BOX_WIDTH);
      var height = u(WRITE_BOX_HEIGHT);
      D.draw.panel(ctx, { x: x, y: centerY - height / 2, width: width, height: height }, {
        fill: tone.background, stroke: tone.rule,
        lineWidth: u(WRITE_BOX_STROKE), radius: u(WRITE_BOX_RADIUS)
      });
      if (value == null) return;
      D.draw.text(ctx, String(value), x + width / 2, centerY + u(WRITE_VALUE_SIZE) * CENTERED_BASELINE_LIFT, {
        family: display, weight: 700, size: u(WRITE_VALUE_SIZE), color: tone.ink, align: "center"
      });
    }

    // ---- Abilities and saving throws -----------------------------------------
    function drawAbilities(top) {
      var width = (columnWidth - u(ABILITY_GAP) * (ABILITY_COLUMNS - 1)) / ABILITY_COLUMNS;
      model.abilities.forEach(function (ability, i) {
        var x = columnX + i * (width + u(ABILITY_GAP));
        var centerX = x + width / 2;

        drawPanel({ x: x, y: top, width: width, height: u(ABILITY_HEIGHT) });
        D.draw.text(ctx, ability.abbr, centerX, top + u(ABILITY_LABEL_BASELINE), labelRun(tone.accent));
        D.draw.text(ctx, D.rules.signed(ability.modifier), centerX, top + u(ABILITY_MOD_BASELINE),
          { family: display, weight: 700, size: u(ABILITY_MOD_SIZE), color: tone.ink, align: "center" });
        D.draw.text(ctx, String(ability.score), centerX, top + u(ABILITY_SCORE_BASELINE),
          { family: body, weight: 400, size: u(ABILITY_SCORE_SIZE), color: tone.muted, align: "center" });

        D.draw.bar(ctx, x + u(PANEL_STROKE), top + u(ABILITY_DIVIDER_Y), width - 2 * u(PANEL_STROKE),
          u(RULE_HAIRLINE_THICKNESS), tone.rule);
        // The save row is centered in what's left of the panel below the rule.
        drawSaveRow(ability, centerX, top + u((ABILITY_DIVIDER_Y + ABILITY_HEIGHT) / 2));
      });
    }

    // "◆ SAVE +5", centered as a group on `centerY`.
    function drawSaveRow(ability, centerX, centerY) {
      var radius = u(SAVE_DIAMOND_RADIUS);
      var caption = labelRun(tone.muted);
      var amount = { family: display, weight: 700, size: u(ABILITY_SAVE_SIZE), color: tone.ink };
      var gap = u(SAVE_ROW_GAP);
      var captionWidth = D.draw.measure(ctx, "SAVE", caption);
      var amountWidth = D.draw.measure(ctx, D.rules.signed(ability.save), amount);
      var total = 2 * radius + gap + captionWidth + gap + amountWidth;
      var left = centerX - total / 2;
      var baseline = centerY + u(ABILITY_SAVE_SIZE) * CENTERED_BASELINE_LIFT;

      proficiencyDiamond(left + radius, centerY, radius, ability.saveProficient);
      caption.align = "left";
      D.draw.text(ctx, "SAVE", left + 2 * radius + gap, baseline, caption);
      amount.align = "right";
      D.draw.text(ctx, D.rules.signed(ability.save), left + total, baseline, amount);
    }

    // ---- Death saves and heroic inspiration ------------------------------------
    // One line: the heading, both tallies, then inspiration past the divider.
    // Every label is to the left of the circles it names, which is what keeps
    // the circles big enough to mark and unmark all evening.
    function drawSituation(top) {
      var height = u(SITUATION_HEIGHT);
      var centerY = top + height / 2;
      var gap = u(SITUATION_GAP);
      drawPanel({ x: columnX, y: top, width: columnWidth, height: height });

      var heading = labelRun(tone.accent);
      heading.align = "left";
      var cursor = columnX + u(SITUATION_INSET);
      cursor += D.draw.text(ctx, "DEATH SAVES", cursor,
        centerY + heading.size * CENTERED_BASELINE_LIFT, heading) + gap;
      cursor += drawDeathTally("SUCCESSES", model.deathSuccesses, cursor, centerY, tone.ink) + gap;
      cursor += drawDeathTally("FAILURES", model.deathFailures, cursor, centerY, tone.accent) + gap;

      // The divider follows the tallies rather than sitting at a fixed
      // fraction, so a longer word can't push a circle under the next label.
      D.draw.bar(ctx, cursor, top + u(SITUATION_INSET), u(RULE_HAIRLINE_THICKNESS),
        height - 2 * u(SITUATION_INSET), tone.rule);
      drawInspiration((cursor + columnX + columnWidth) / 2, centerY);
    }

    // "SUCCESSES ○ ○ ○" — the slots follow the caption rather than sitting in
    // a fixed column, so the two tallies read as units wherever they're put.
    // Returns what the pair took, which is how the row places what comes next.
    function drawDeathTally(caption, marked, x, centerY, markedColor) {
      var run = labelRun(tone.muted, u(LABEL_SIZE) * DEATH_ROW_LABEL_SCALE);
      run.align = "left";
      var radius = u(DEATH_PIP_RADIUS);
      var captionWidth = D.draw.text(ctx, caption, x, centerY + run.size * CENTERED_BASELINE_LIFT, run);
      var first = x + captionWidth + u(DEATH_PIP_GAP) + radius;
      for (var i = 0; i < DEATH_SAVE_SLOTS; i++) {
        D.draw.pip(ctx, first + i * u(DEATH_PIP_SPACING), centerY, radius,
          { color: i < marked ? markedColor : tone.rule, filled: i < marked });
      }
      return captionWidth + u(DEATH_PIP_GAP) + 2 * radius + (DEATH_SAVE_SLOTS - 1) * u(DEATH_PIP_SPACING);
    }

    function drawInspiration(centerX, centerY) {
      var run = labelRun(tone.accent);
      run.align = "left";
      var radius = u(INSPIRATION_PIP_RADIUS);
      var width = D.draw.measure(ctx, "INSPIRATION", run) + u(INSPIRATION_GAP) + 2 * radius;
      var left = centerX - width / 2;
      D.draw.text(ctx, "INSPIRATION", left, centerY + run.size * CENTERED_BASELINE_LIFT, run);
      D.draw.pip(ctx, left + width - radius, centerY, radius,
        { color: model.inspiration ? tone.accent : tone.rule, filled: model.inspiration });
    }

    // ---- Skills ---------------------------------------------------------------
    function drawSkills(top) {
      drawSkillsHeader(top);

      var rowsTop = top + u(SKILL_HEADER_HEIGHT);
      var rows = Math.ceil(model.skills.length / SKILL_COLUMNS);
      var width = (columnWidth - u(SKILL_COLUMN_GAP) * (SKILL_COLUMNS - 1)) / SKILL_COLUMNS;

      var radius = u(SKILL_DIAMOND_RADIUS);
      var expertiseX = u(SKILL_DIAMOND_X) + 2 * radius + u(SKILL_DIAMOND_GAP);
      var nameX = expertiseX + radius + u(SKILL_NAME_GAP);

      function abbrRun() {
        return {
          family: display, weight: 400, size: u(SKILL_ABBR_SIZE),
          tracking: LABEL_TRACKING, color: tone.muted, align: "right"
        };
      }
      function modRun() {
        return { family: display, weight: 700, size: u(SKILL_MOD_SIZE), color: tone.ink, align: "right" };
      }
      function nameRun() {
        return {
          family: body, weight: 400, size: u(SKILL_NAME_SIZE),
          color: tone.ink, minSize: u(SKILL_NAME_MIN_SIZE)
        };
      }

      // The total over its ability tag. Each row is measured on its own, so a
      // card whose best skill is "+5" doesn't take room off every name to hold
      // a "+11".
      function clusterWidth(skill) {
        return Math.max(D.draw.measure(ctx, D.rules.signed(skill.modifier), modRun()),
          D.draw.measure(ctx, skill.abbr, abbrRun()));
      }
      var clusterHeight = (u(SKILL_MOD_SIZE) + u(SKILL_ABBR_SIZE)) * CAP_HEIGHT_RATIO +
        u(SKILL_ABBR_LEADING);

      // One size for every name — the tightest row sets it — because a list
      // where two entries are visibly smaller than the rest reads as a mistake.
      var nameSize = model.skills.reduce(function (smallest, skill) {
        var room = width - nameX - u(SKILL_MOD_RIGHT) - clusterWidth(skill) - u(SKILL_NAME_GAP);
        return Math.min(smallest, D.draw.fitSize(ctx, skill.label, nameRun(), room));
      }, u(SKILL_NAME_SIZE));

      model.skills.forEach(function (skill, i) {
        var row = i % rows;
        var x = columnX + Math.floor(i / rows) * (width + u(SKILL_COLUMN_GAP));
        var y = rowsTop + row * u(SKILL_ROW_HEIGHT);
        // Everything on the row is centered on the middle of the stripe: the
        // diamonds and the name each on their own, the total and its tag as
        // the pair they are.
        var middle = y + u(SKILL_ROW_HEIGHT) / 2;
        var right = x + width - u(SKILL_MOD_RIGHT);
        var modBaseline = middle - clusterHeight / 2 + u(SKILL_MOD_SIZE) * CAP_HEIGHT_RATIO;
        var abbrBaseline = modBaseline + u(SKILL_ABBR_LEADING) +
          u(SKILL_ABBR_SIZE) * CAP_HEIGHT_RATIO;

        // A zebra stripe keeps the eye on one line across the row's width.
        if (row % 2 === 0) {
          D.draw.panel(ctx, {
            x: x, y: y + u(SKILL_ROW_INSET),
            width: width, height: u(SKILL_ROW_HEIGHT - 2 * SKILL_ROW_INSET)
          }, { fill: tone.panel, radius: u(PANEL_RADIUS / 2) });
        }

        // Two diamonds: proficiency, then expertise. Both marked means the
        // bonus counts twice, which is exactly what the two numbers show.
        proficiencyDiamond(x + u(SKILL_DIAMOND_X), middle, radius, skill.proficiency >= 1);
        proficiencyDiamond(x + expertiseX, middle, radius, skill.proficiency >= 2);

        var name = nameRun();
        name.size = nameSize;
        D.draw.text(ctx, skill.label, x + nameX, middle + nameSize * CENTERED_BASELINE_LIFT, name);
        D.draw.text(ctx, D.rules.signed(skill.modifier), right, modBaseline, modRun());
        D.draw.text(ctx, skill.abbr, right, abbrBaseline, abbrRun());
      });
    }

    // "SKILLS —————————————": a rule from the heading to the edge of the
    // column, giving the longest list on the card a lid.
    function drawSkillsHeader(top) {
      var heading = labelRun(tone.accent);
      heading.align = "left";
      var headingWidth = D.draw.text(ctx, "SKILLS", columnX, top + u(SKILL_HEADER_BASELINE), heading);
      var ruleX = columnX + headingWidth + u(SKILL_HEADER_PAD);
      var ruleWidth = columnX + columnWidth - ruleX;
      if (ruleWidth > 0) {
        D.draw.bar(ctx, ruleX, top + u(SKILL_HEADER_RULE_Y), ruleWidth, u(RULE_HAIRLINE_THICKNESS), tone.rule);
      }
    }
  }

  D.card = { render: render };
})();
