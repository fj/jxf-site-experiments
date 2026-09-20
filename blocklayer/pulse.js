/*
 * Blocklayer — the beat a highlight flashes on while the level is
 * see-through: magenta for the first half of each cycle, its own colour for
 * the second. The renderer asks whether the flash is on at the time a frame
 * carries, and the app asks how long it has until that answer changes, so the
 * canvas redraws on the turn and not on every frame the browser offers.
 * Arithmetic on a time in ms; nothing here holds a clock.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var MS_PER_S = 1000;
  var HALVES = 2;                      // magenta for one of them, the usual ink for the other
  var CYCLE_MS = MS_PER_S / B.PULSE_HZ;
  var LIT_MS = CYCLE_MS / HALVES;

  // How far into the cycle that time falls.
  function phase(time) {
    return time % CYCLE_MS;
  }

  // Whether the magenta half is on then.
  function lit(time) {
    return phase(time) < LIT_MS;
  }

  // The ms from then until the colour turns over.
  function untilFlip(time) {
    var at = phase(time);
    return at < LIT_MS ? LIT_MS - at : CYCLE_MS - at;
  }

  // Whether anything is flashing now: a see-through level with a tile hovered
  // or selected, which is the only tile the ring goes around.
  function live(state) {
    if (state.opaque) return false;
    return state.selection.length > 0 || !!(state.hover && state.hover.tile);
  }

  B.pulse = {
    lit: lit,
    untilFlip: untilFlip,
    live: live
  };
})();
