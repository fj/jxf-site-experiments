/*
 * Player Card — the arithmetic the 2024 rules define.
 *
 * Only the numbers a card must show, derived from what the player types: the
 * ability modifiers, the proficiency bonus the character's level earns, and
 * the saving-throw and skill totals those two produce. Kept apart from both
 * the controls and the renderer so the rules can be read (and corrected) on
 * their own.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  var ABILITY_BASELINE = 10;   // the score at which a modifier is +0
  var POINTS_PER_STEP = 2;     // every 2 points of score is 1 point of modifier
  var BASE_PROFICIENCY = 2;    // proficiency bonus at level 1
  var LEVELS_PER_STEP = 4;     // …and +1 for every 4 levels after that

  function modifier(score) {
    return Math.floor((score - ABILITY_BASELINE) / POINTS_PER_STEP);
  }

  function proficiencyBonus(level) {
    return BASE_PROFICIENCY + Math.floor((level - 1) / LEVELS_PER_STEP);
  }

  // Signed, the way a character sheet writes it: a bonus you add or subtract.
  function signed(n) {
    return (n < 0 ? "−" : "+") + Math.abs(n);
  }

  // "1st", "2nd", "3rd", "4th" — and the teens, which the last digit alone
  // gets wrong. A spell level is written this way wherever it is written out.
  var ORDINAL_SUFFIXES = ["th", "st", "nd", "rd"];
  var LAST_DIGIT = 10;
  var LAST_TWO_DIGITS = 100;
  var TEENS = [11, 13];

  function ordinal(n) {
    var last = n % LAST_DIGIT;
    var pair = n % LAST_TWO_DIGITS;
    var irregular = pair >= TEENS[0] && pair <= TEENS[1];
    return n + (irregular || last >= ORDINAL_SUFFIXES.length
      ? ORDINAL_SUFFIXES[0]
      : ORDINAL_SUFFIXES[last]);
  }

  D.rules = {
    modifier: modifier,
    proficiencyBonus: proficiencyBonus,
    signed: signed,
    ordinal: ordinal,

    savingThrow: function (score, proficient, level) {
      return modifier(score) + (proficient ? proficiencyBonus(level) : 0);
    },

    // Rolling for initiative is a Dexterity check, so it's that modifier and
    // nothing else. Armor class isn't here: what it takes to hit you comes off
    // what you're wearing, which is not arithmetic the card can do.
    initiative: function (dexterity) { return modifier(dexterity); },

    // proficiency: how many times the bonus counts — 0 none, 1 proficient,
    // 2 expertise. It is also the number of marked boxes, which is why the
    // card can draw it as two diamonds and the panel as two toggles.
    skillCheck: function (score, proficiency, level) {
      return modifier(score) + proficiency * proficiencyBonus(level);
    },

    // Marking box `step` (1 proficiency, 2 expertise) sets the count to it;
    // clearing one clears everything above, since expertise without
    // proficiency isn't a state the rules have.
    toggleProficiency: function (proficiency, step) {
      return proficiency >= step ? step - 1 : step;
    }
  };
})();
