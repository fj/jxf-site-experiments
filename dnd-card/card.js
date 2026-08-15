/*
 * Player Card — the character page.
 *
 * The one page every character has, and the only one that carries the picture
 * and the three corner badges. This file is a page kind like any other: it
 * registers what a blank character page holds, how its body is drawn, and what
 * controls edit it. Everything above the body — the paper, the portrait strip,
 * the name and its meta lines, the badges, the rule — belongs to the frame in
 * sheet.js, which hands this a rect and the scale to draw in it.
 *
 * The body is a stack of sections: everything that changes during play, then
 * what's fixed for the session. Width is the plentiful axis and height the
 * scarce one, so the rows run long: six ability blocks abreast, skills in
 * three columns. The stack is measured before it's drawn and the slack shared
 * out between the sections, so a card whose skills fit easily doesn't leave a
 * hole at the bottom.
 *
 * Anything that gets rubbed out and rewritten — hit points, temporary hit
 * points, hit dice, death saves, inspiration — is drawn as somewhere to write
 * rather than as a printed number: a paper-colored box, or a circle to fill.
 * Those sit together and high, above the ability blocks, because they're what
 * a hand reaches for mid-combat.
 *
 * Every length below is a design px on the 300 dpi card and is scaled by the
 * frame's `u()`, so the same layout renders at any output resolution.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};
  var U = window.ExpUI;

  var KIND = "character";

  // Section spacing — the body keeps its sections' natural heights and shares
  // out what's left, within these bounds.
  var SECTION_GAP_MIN = 16;
  var SECTION_GAP_MAX = 44;

  // Somewhere to write a number twice over: the label sits beside the box
  // rather than over it, which is what leaves the box this wide.
  var WRITE_BOX_WIDTH = 108;
  var WRITE_BOX_HEIGHT = 78;

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
  var ABILITY_DIVIDER_THICKNESS = 2;
  var ABILITY_DIVIDER_INSET = 2;   // clear of the panel's own outline
  var ABILITY_SAVE_SIZE = 26;
  var SAVE_ROW_GAP = 9;
  var SAVE_DIAMOND_RADIUS = 17;

  // Death saves and heroic inspiration. Everything sits on one line — heading,
  // both tallies, inspiration — because every row this section doesn't take is
  // a row the skills get.
  var SITUATION_HEIGHT = 92;
  var SITUATION_INSET = 20;
  var SITUATION_GAP = 22;       // between the row's parts, and around the divider
  var SITUATION_DIVIDER_THICKNESS = 2;
  var DEATH_SAVE_SLOTS = 3;
  var DEATH_ROW_LABEL_SCALE = 0.9;
  var DEATH_PIP_RADIUS = 18;
  var DEATH_PIP_SPACING = 46;
  var DEATH_PIP_GAP = 16;       // between a tally's label and its first slot
  var INSPIRATION_PIP_RADIUS = 22;
  var INSPIRATION_GAP = 16;

  // Skills — the longest list on the card, and the one that takes whatever
  // height the sections above it leave.
  var SKILL_ROW_HEIGHT = 66;
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

  // ---- The page ---------------------------------------------------------------
  // Everything the character card alone owns. Who the character is — name,
  // species, class, level — is shared by every page of the set, so it isn't
  // here.
  function create() {
    return {
      kind: KIND,

      // The three the card leaves a box for. null is a value in its own right:
      // it prints the box empty, for a pencil.
      hitPoints: 32,
      temporaryHitPoints: null,
      hitDiceRemaining: 4,

      hitPointsMax: 38,
      hitDie: 8,
      // What it takes to hit you comes off what you're wearing, so it's typed.
      // Initiative isn't here: it's the Dexterity modifier, so the card works
      // it out like every other number it can.
      armorClass: 15,

      deathSuccesses: 0,
      deathFailures: 0,
      inspiration: true,

      abilities: { str: 10, dex: 17, con: 13, int: 12, wis: 14, cha: 10 },
      saves: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
      skills: {
        acrobatics: 1, deception: 1, insight: 1, perception: 1,
        "sleight-of-hand": 2, stealth: 2
      }
    };
  }

  // The picture and the three numbers you want before anything else happens.
  function frameOptions(page, identity) {
    return {
      portrait: true,
      badges: [
        { shape: "diamond", caption: "PROFICIENCY", value: D.rules.signed(identity.proficiencyBonus) },
        { shape: "shield", caption: "ARMOR CLASS", value: String(page.armorClass) },
        { shape: "wedge", caption: "INITIATIVE", value: D.rules.signed(initiativeOf(page)) }
      ]
    };
  }

  // ---- Derived numbers ---------------------------------------------------------
  // Worked out on the way into a render or a readout, never stored, so there's
  // no second copy to keep in step.
  function abilityByKey(key) {
    for (var i = 0; i < D.ABILITIES.length; i++) if (D.ABILITIES[i].key === key) return D.ABILITIES[i];
    return D.ABILITIES[0];
  }

  function scoreOf(page, key) { return page.abilities[key]; }

  function proficiencyOf(page, key) { return page.skills[key] || 0; }

  function initiativeOf(page) { return D.rules.initiative(scoreOf(page, "dex")); }

  // A character can't have more hit dice than levels. Both the card and the
  // control show what the level allows rather than the page being edited to
  // match it, so dice come back when a level does.
  function hitDiceLeft(page, identity) {
    return page.hitDiceRemaining == null
      ? null
      : Math.min(page.hitDiceRemaining, identity.level);
  }

  function abilitiesOf(page, identity) {
    return D.ABILITIES.map(function (ability) {
      var score = scoreOf(page, ability.key);
      return {
        abbr: ability.abbr,
        score: score,
        modifier: D.rules.modifier(score),
        saveProficient: !!page.saves[ability.key],
        save: D.rules.savingThrow(score, page.saves[ability.key], identity.level)
      };
    });
  }

  function skillsOf(page, identity) {
    return D.SKILLS.map(function (skill) {
      var proficiency = proficiencyOf(page, skill.key);
      return {
        label: skill.label,
        abbr: abilityByKey(skill.ability).abbr,
        proficiency: proficiency,
        modifier: D.rules.skillCheck(scoreOf(page, skill.ability), proficiency, identity.level)
      };
    });
  }

  // ---- The body ----------------------------------------------------------------
  function render(frame, page, identity) {
    var ctx = frame.ctx;
    var u = frame.u;
    var tone = frame.tone;
    var left = frame.left;
    var width = frame.width;
    var lift = D.sheet.RATIO.centeredLift;
    var abilities = abilitiesOf(page, identity);
    var skills = skillsOf(page, identity);

    layOut([
      { height: u(VITALS_HEIGHT), draw: drawVitals },
      { height: u(SITUATION_HEIGHT), draw: drawSituation },
      { height: u(ABILITY_HEIGHT), draw: drawAbilities },
      {
        height: D.sheet.sectionHeaderHeight(frame) +
          Math.ceil(skills.length / SKILL_COLUMNS) * u(SKILL_ROW_HEIGHT),
        draw: drawSkills
      }
    ]);

    // ---- Stack ---------------------------------------------------------------
    // Sections keep their natural heights and the leftover space is shared
    // between them, within limits, with any remainder split above and below.
    function layOut(stack) {
      var content = stack.reduce(function (sum, section) { return sum + section.height; }, 0);
      var available = frame.bottom - frame.top;
      var gapCount = Math.max(1, stack.length - 1);
      var gap = D.clamp((available - content) / gapCount, u(SECTION_GAP_MIN), u(SECTION_GAP_MAX));
      var top = frame.top + Math.max(0, (available - content - gap * gapCount) / 2);
      stack.forEach(function (section) {
        section.draw(top);
        top += section.height + gap;
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

    // ---- Vitals --------------------------------------------------------------
    // A cell reads "LABEL [box] / total". Cells take the width their own
    // contents need and share whatever the column has left equally, so no fixed
    // fractions have to be kept in step with the labels.
    function drawVitals(top) {
      var height = u(VITALS_HEIGHT);
      var centerY = top + height / 2;
      var gap = u(VITALS_RUN_GAP);

      // Each part knows its own width and how to draw itself at an x, so a
      // cell is laid out by walking its parts once.
      function labelPart(caption) {
        var run = frame.labelRun(tone.accent);
        run.align = "left";
        return part(D.draw.measure(ctx, caption, run), function (x) {
          D.draw.text(ctx, caption, x, baselineFor(run.size), run);
        });
      }

      function boxPart(value) {
        return part(u(WRITE_BOX_WIDTH), function (x) {
          D.sheet.writeBox(frame, {
            x: x, y: centerY - u(WRITE_BOX_HEIGHT) / 2,
            width: u(WRITE_BOX_WIDTH), height: u(WRITE_BOX_HEIGHT)
          }, value);
        });
      }

      function totalPart(caption) {
        var run = {
          family: frame.display, weight: 400, size: u(VITALS_SUFFIX_SIZE),
          color: tone.muted, align: "left"
        };
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
        var run = {
          family: frame.body, weight: 400, size: u(VITALS_SUFFIX_SIZE),
          color: tone.accent, align: "left"
        };
        var captionX = 2 * radius + u(VITALS_DIE_GAP);
        return part(captionX + D.draw.measure(ctx, caption, run), function (x) {
          D.dice.draw(ctx, sides, x + radius, centerY, radius, { color: tone.accent });
          D.draw.text(ctx, caption, x + captionX, baselineFor(run.size), run);
        });
      }

      function part(partWidth, draw) { return { width: partWidth, draw: draw }; }
      function baselineFor(size) { return centerY + size * lift; }

      var cells = [
        [labelPart("HIT POINTS"), boxPart(page.hitPoints), totalPart("/ " + page.hitPointsMax)],
        [labelPart("TEMP HP"), boxPart(page.temporaryHitPoints)],
        [labelPart("HIT DICE"), boxPart(hitDiceLeft(page, identity)),
          totalPart("/ " + identity.level), diePart(page.hitDie)]
      ];

      var widths = cells.map(function (parts) {
        return parts.reduce(function (sum, p) { return sum + p.width; }, 0) + gap * (parts.length - 1);
      });
      var natural = widths.reduce(function (sum, cellWidth) {
        return sum + cellWidth + 2 * u(VITALS_INSET);
      }, 0);
      var slack = (width - u(VITALS_GAP) * (cells.length - 1) - natural) / cells.length;

      var x = left;
      cells.forEach(function (parts, i) {
        var cellWidth = widths[i] + 2 * u(VITALS_INSET) + slack;
        D.sheet.panel(frame, { x: x, y: top, width: cellWidth, height: height });
        var cursor = x + (cellWidth - widths[i]) / 2;
        parts.forEach(function (p) {
          p.draw(cursor);
          cursor += p.width + gap;
        });
        x += cellWidth + u(VITALS_GAP);
      });
    }

    // ---- Death saves and heroic inspiration ------------------------------------
    // One line: the heading, both tallies, then inspiration past the divider.
    // Every label is to the left of the circles it names, which is what keeps
    // the circles big enough to mark and unmark all evening.
    function drawSituation(top) {
      var height = u(SITUATION_HEIGHT);
      var centerY = top + height / 2;
      var gap = u(SITUATION_GAP);
      D.sheet.panel(frame, { x: left, y: top, width: width, height: height });

      var heading = frame.labelRun(tone.accent);
      heading.align = "left";
      var cursor = left + u(SITUATION_INSET);
      cursor += D.draw.text(ctx, "DEATH SAVES", cursor, centerY + heading.size * lift, heading) + gap;
      cursor += drawDeathTally("SUCCESSES", page.deathSuccesses, cursor, centerY, tone.ink) + gap;
      cursor += drawDeathTally("FAILURES", page.deathFailures, cursor, centerY, tone.accent) + gap;

      // The divider follows the tallies rather than sitting at a fixed
      // fraction, so a longer word can't push a circle under the next label.
      D.draw.bar(ctx, cursor, top + u(SITUATION_INSET), u(SITUATION_DIVIDER_THICKNESS),
        height - 2 * u(SITUATION_INSET), tone.rule);
      drawInspiration((cursor + left + width) / 2, centerY);
    }

    // "SUCCESSES ○ ○ ○" — the slots follow the caption rather than sitting in
    // a fixed column, so the two tallies read as units wherever they're put.
    // Returns what the pair took, which is how the row places what comes next.
    function drawDeathTally(caption, marked, x, centerY, markedColor) {
      var run = frame.labelRun(tone.muted);
      run.size *= DEATH_ROW_LABEL_SCALE;
      run.align = "left";
      var radius = u(DEATH_PIP_RADIUS);
      var captionWidth = D.draw.text(ctx, caption, x, centerY + run.size * lift, run);
      var first = x + captionWidth + u(DEATH_PIP_GAP) + radius;
      for (var i = 0; i < DEATH_SAVE_SLOTS; i++) {
        D.draw.pip(ctx, first + i * u(DEATH_PIP_SPACING), centerY, radius,
          { color: i < marked ? markedColor : tone.rule, filled: i < marked });
      }
      return captionWidth + u(DEATH_PIP_GAP) + 2 * radius + (DEATH_SAVE_SLOTS - 1) * u(DEATH_PIP_SPACING);
    }

    function drawInspiration(centerX, centerY) {
      var run = frame.labelRun(tone.accent);
      run.align = "left";
      var radius = u(INSPIRATION_PIP_RADIUS);
      var runWidth = D.draw.measure(ctx, "INSPIRATION", run) + u(INSPIRATION_GAP) + 2 * radius;
      var runLeft = centerX - runWidth / 2;
      D.draw.text(ctx, "INSPIRATION", runLeft, centerY + run.size * lift, run);
      D.draw.pip(ctx, runLeft + runWidth - radius, centerY, radius,
        { color: page.inspiration ? tone.accent : tone.rule, filled: page.inspiration });
    }

    // ---- Abilities and saving throws -----------------------------------------
    function drawAbilities(top) {
      var cellWidth = (width - u(ABILITY_GAP) * (ABILITY_COLUMNS - 1)) / ABILITY_COLUMNS;
      abilities.forEach(function (ability, i) {
        var x = left + i * (cellWidth + u(ABILITY_GAP));
        var centerX = x + cellWidth / 2;

        D.sheet.panel(frame, { x: x, y: top, width: cellWidth, height: u(ABILITY_HEIGHT) });
        D.draw.text(ctx, ability.abbr, centerX, top + u(ABILITY_LABEL_BASELINE),
          frame.labelRun(tone.accent));
        D.draw.text(ctx, D.rules.signed(ability.modifier), centerX, top + u(ABILITY_MOD_BASELINE),
          { family: frame.display, weight: 700, size: u(ABILITY_MOD_SIZE), color: tone.ink, align: "center" });
        D.draw.text(ctx, String(ability.score), centerX, top + u(ABILITY_SCORE_BASELINE),
          { family: frame.body, weight: 400, size: u(ABILITY_SCORE_SIZE), color: tone.muted, align: "center" });

        D.draw.bar(ctx, x + u(ABILITY_DIVIDER_INSET), top + u(ABILITY_DIVIDER_Y),
          cellWidth - 2 * u(ABILITY_DIVIDER_INSET), u(ABILITY_DIVIDER_THICKNESS), tone.rule);
        // The save row is centered in what's left of the panel below the rule.
        drawSaveRow(ability, centerX, top + u((ABILITY_DIVIDER_Y + ABILITY_HEIGHT) / 2));
      });
    }

    // "◆ SAVE +5", centered as a group on `centerY`.
    function drawSaveRow(ability, centerX, centerY) {
      var radius = u(SAVE_DIAMOND_RADIUS);
      var caption = frame.labelRun(tone.muted);
      var amount = { family: frame.display, weight: 700, size: u(ABILITY_SAVE_SIZE), color: tone.ink };
      var gap = u(SAVE_ROW_GAP);
      var captionWidth = D.draw.measure(ctx, "SAVE", caption);
      var amountWidth = D.draw.measure(ctx, D.rules.signed(ability.save), amount);
      var total = 2 * radius + gap + captionWidth + gap + amountWidth;
      var rowLeft = centerX - total / 2;
      var baseline = centerY + u(ABILITY_SAVE_SIZE) * lift;

      proficiencyDiamond(rowLeft + radius, centerY, radius, ability.saveProficient);
      caption.align = "left";
      D.draw.text(ctx, "SAVE", rowLeft + 2 * radius + gap, baseline, caption);
      amount.align = "right";
      D.draw.text(ctx, D.rules.signed(ability.save), rowLeft + total, baseline, amount);
    }

    // ---- Skills ---------------------------------------------------------------
    function drawSkills(top) {
      var rowsTop = top + D.sheet.sectionHeader(frame, "SKILLS", top);
      var rowCount = Math.ceil(skills.length / SKILL_COLUMNS);
      var columnWidth = (width - u(SKILL_COLUMN_GAP) * (SKILL_COLUMNS - 1)) / SKILL_COLUMNS;

      var radius = u(SKILL_DIAMOND_RADIUS);
      var expertiseX = u(SKILL_DIAMOND_X) + 2 * radius + u(SKILL_DIAMOND_GAP);
      var nameX = expertiseX + radius + u(SKILL_NAME_GAP);

      function abbrRun() {
        var run = frame.labelRun(tone.muted, u(SKILL_ABBR_SIZE));
        run.weight = 400;
        run.align = "right";
        return run;
      }
      function modRun() {
        return { family: frame.display, weight: 700, size: u(SKILL_MOD_SIZE), color: tone.ink, align: "right" };
      }
      function nameRun() {
        return {
          family: frame.body, weight: 400, size: u(SKILL_NAME_SIZE),
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
      var clusterHeight = (u(SKILL_MOD_SIZE) + u(SKILL_ABBR_SIZE)) * D.sheet.RATIO.capHeight +
        u(SKILL_ABBR_LEADING);

      // One size for every name — the tightest row sets it — because a list
      // where two entries are visibly smaller than the rest reads as a mistake.
      var nameSize = skills.reduce(function (smallest, skill) {
        var room = columnWidth - nameX - u(SKILL_MOD_RIGHT) - clusterWidth(skill) - u(SKILL_NAME_GAP);
        return Math.min(smallest, D.draw.fitSize(ctx, skill.label, nameRun(), room));
      }, u(SKILL_NAME_SIZE));

      for (var column = 0; column < SKILL_COLUMNS; column++) {
        drawSkillColumn(column);
      }

      // Down a column and then over, which is the order a printed list is read
      // in and the order the panel's own skill list runs.
      function drawSkillColumn(column) {
        var x = left + column * (columnWidth + u(SKILL_COLUMN_GAP));
        D.sheet.rows(frame,
          { x: x, y: rowsTop, width: columnWidth, height: rowCount * u(SKILL_ROW_HEIGHT) },
          { count: rowCount, rowHeight: u(SKILL_ROW_HEIGHT) },
          function (row, index) {
            var skill = skills[column * rowCount + index];
            if (skill) drawSkillRow(skill, row);
          });
      }

      // Everything on the row is centered on the middle of the stripe: the
      // diamonds and the name each on their own, the total and its tag as the
      // pair they are.
      function drawSkillRow(skill, row) {
        var middle = row.y + row.height / 2;
        var right = row.x + row.width - u(SKILL_MOD_RIGHT);
        var modBaseline = middle - clusterHeight / 2 + u(SKILL_MOD_SIZE) * D.sheet.RATIO.capHeight;
        var abbrBaseline = modBaseline + u(SKILL_ABBR_LEADING) +
          u(SKILL_ABBR_SIZE) * D.sheet.RATIO.capHeight;

        // Two diamonds: proficiency, then expertise. Both marked means the
        // bonus counts twice, which is exactly what the two numbers show.
        proficiencyDiamond(row.x + u(SKILL_DIAMOND_X), middle, radius, skill.proficiency >= 1);
        proficiencyDiamond(row.x + expertiseX, middle, radius, skill.proficiency >= 2);

        var name = nameRun();
        name.size = nameSize;
        D.draw.text(ctx, skill.label, row.x + nameX, middle + nameSize * lift, name);
        D.draw.text(ctx, D.rules.signed(skill.modifier), right, modBaseline, modRun());
        D.draw.text(ctx, skill.abbr, right, abbrBaseline, abbrRun());
      }
    }
  }

  // ---- Controls -----------------------------------------------------------------
  // What the panel shows while this is the page being edited. The character's
  // name, level and look aren't here: those belong to every page, so the app
  // keeps them in the block above the tabs.
  var ABILITY_CONTROL = "ability:";
  var SAVE_CONTROL = "save:";

  // A skill's two markers, in the order they're drawn. The index is how many
  // times the proficiency bonus counts once that marker is the last one filled.
  var PROFICIENCY_STEPS = [
    { step: 1, label: "proficient" },
    { step: 2, label: "expertise" }
  ];

  // The numbers typed rather than dragged. `blank` marks the ones the card
  // draws a box for, which is exactly the set a player rubs out mid-session.
  var NUMBER_CONTROLS = {
    hitPoints: { range: D.RANGES.hitPoints, blank: true },
    temporaryHitPoints: { range: D.RANGES.hitPoints, blank: true },
    hitDiceRemaining: { range: D.RANGES.hitDice, blank: true },
    hitPointsMax: { range: D.RANGES.hitPoints },
    armorClass: { range: D.RANGES.armorClass }
  };

  // Controls whose value goes straight onto the page. The hit die is a shape
  // as much as a number, so it doesn't stay the string a <select> hands over.
  var PLAIN_CONTROLS = ["deathSuccesses", "deathFailures", "inspiration"];
  var NUMERIC_CONTROLS = ["hitDie"];

  // The fields a sync writes straight back into their own control. Hit dice
  // are not among them: what that box may show depends on the level too.
  var VALUE_CONTROLS = ["hitPoints", "hitPointsMax", "temporaryHitPoints",
    "armorClass", "deathSuccesses", "deathFailures"];

  // A `blank` field has one state more than the kit's reader gives every typed
  // number: empty, which is not zero. Zero hit points is a character at nought
  // and dying; an empty box is one nobody has written in yet, and that's what
  // the card prints.

  // A character can't have more hit dice than levels, so that field's ceiling
  // moves with the level slider rather than being fixed in the markup.
  function numberControl(name, identity) {
    var field = NUMBER_CONTROLS[name];
    if (name !== "hitDiceRemaining") return field;
    return { range: [D.RANGES.hitDice[0], identity.level], blank: field.blank };
  }

  // ---- Control markup ------------------------------------------------------------
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
      '<label class="' + U.PREFIX + 'check"><input type="checkbox" data-ctl="' +
      SAVE_CONTROL + ability.key + '"> Proficient</label>' +
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

  function html() {
    return U.group("Vitals",
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
    );
  }

  // ---- Syncing controls and readouts ----------------------------------------------
  function syncFields(page, dom, identity) {
    // A blank field is null; writing that straight onto an input would put the
    // word "null" in it.
    VALUE_CONTROLS.forEach(function (name) {
      dom.ctl(name).value = page[name] == null ? "" : page[name];
    });
    var dice = hitDiceLeft(page, identity);
    dom.ctl("hitDiceRemaining").value = dice == null ? "" : dice;
    dom.ctl("inspiration").checked = page.inspiration;
    dom.ctl("hitDie").value = String(page.hitDie);
  }

  function syncReadouts(page, dom) {
    dom.val("deathSuccesses", String(page.deathSuccesses));
    dom.val("deathFailures", String(page.deathFailures));
    dom.el('[data-out="die"]').innerHTML = D.dice.svg(page.hitDie);
  }

  function syncAbilities(page, dom, identity) {
    D.ABILITIES.forEach(function (ability) {
      var score = scoreOf(page, ability.key);
      dom.ctl(ABILITY_CONTROL + ability.key).value = score;
      dom.ctl(SAVE_CONTROL + ability.key).checked = !!page.saves[ability.key];
      dom.val("mod:" + ability.key, D.rules.signed(D.rules.modifier(score)));
      dom.val("save:" + ability.key,
        D.rules.signed(D.rules.savingThrow(score, page.saves[ability.key], identity.level)));
    });
    // Initiative has no field of its own — it follows Dexterity — so this is
    // where the card's third badge gets to say where its number came from.
    dom.el('[data-out="initiative"]').textContent = "Initiative " +
      D.rules.signed(initiativeOf(page)) + ", from Dexterity.";
  }

  // A marker here shows the bonus filling it is worth — the card leaves its own
  // diamonds empty and prints the number once, but this is where the clicking
  // happens. Each carries its own on/off state for assistive technology.
  function syncSkills(page, dom, identity) {
    var bonus = D.rules.signed(D.rules.proficiencyBonus(identity.level));
    D.SKILLS.forEach(function (skill) {
      var proficiency = proficiencyOf(page, skill.key);
      PROFICIENCY_STEPS.forEach(function (marker) {
        var button = dom.el('[data-prof="' + skill.key + '"][data-step="' + marker.step + '"]');
        var applies = proficiency >= marker.step;
        button.firstChild.textContent = bonus;
        button.dataset.on = applies ? "true" : "false";
        button.setAttribute("aria-pressed", applies ? "true" : "false");
        button.setAttribute("aria-label", skill.label + ": " + marker.label);
      });
      dom.val("skill:" + skill.key,
        D.rules.signed(D.rules.skillCheck(scoreOf(page, skill.ability), proficiency, identity.level)));
    });
  }

  function sync(page, dom, ctx) {
    syncFields(page, dom, ctx.identity);
    syncReadouts(page, dom);
    syncAbilities(page, dom, ctx.identity);
    syncSkills(page, dom, ctx.identity);
  }

  function onControl(page, name, target, event, ctx) {
    if (name.indexOf(ABILITY_CONTROL) === 0) {
      var abilityKey = name.slice(ABILITY_CONTROL.length);
      U.readNumber(target, event, { range: D.RANGES.score }, function (value) {
        page.abilities[abilityKey] = value;
        syncAbilities(page, ctx.dom, ctx.identity);
        syncSkills(page, ctx.dom, ctx.identity);
        ctx.render();
      });
      return true;
    }
    if (name.indexOf(SAVE_CONTROL) === 0) {
      page.saves[name.slice(SAVE_CONTROL.length)] = target.checked;
      syncAbilities(page, ctx.dom, ctx.identity);
      ctx.render();
      return true;
    }
    if (NUMBER_CONTROLS[name]) {
      U.readNumber(target, event, numberControl(name, ctx.identity), function (value) {
        page[name] = value;
        ctx.render();
      });
      return true;
    }
    if (PLAIN_CONTROLS.indexOf(name) !== -1 || NUMERIC_CONTROLS.indexOf(name) !== -1) {
      page[name] = NUMERIC_CONTROLS.indexOf(name) === -1 ? U.readControl(target) : +target.value;
      syncReadouts(page, ctx.dom);
      ctx.render();
      return true;
    }
    return false;
  }

  function onClick(page, event, ctx) {
    var button = event.target.closest ? event.target.closest("[data-prof]") : null;
    if (!button) return false;
    var key = button.dataset.prof;
    page.skills[key] = D.rules.toggleProficiency(proficiencyOf(page, key), +button.dataset.step);
    syncSkills(page, ctx.dom, ctx.identity);
    ctx.render();
    return true;
  }

  D.pages.register({
    kind: KIND,
    label: "Character",
    // There is exactly one of these and it is where the picture and the badges
    // live, so it can be neither added nor removed.
    addable: false,
    // The set's one picture is chosen here, on the card that prints it.
    picture: true,
    create: create,
    frameOptions: frameOptions,
    render: render,
    controls: {
      html: html,
      sync: sync,
      onControl: onControl,
      onClick: onClick
    }
  });
})();
