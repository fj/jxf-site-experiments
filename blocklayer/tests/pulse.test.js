"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load, tile } = require("./load");

const B = load(["config.js", "pulse.js"]);
const P = B.pulse;

const MS_PER_S = 1000;
const HALVES = 2;                        // the magenta half of a cycle, and the other
const CYCLE_MS = MS_PER_S / B.PULSE_HZ;
const LIT_MS = CYCLE_MS / HALVES;
const CYCLES = [0, 1, 2, 9];             // cycles from the start of the clock
const A_MOMENT = 1;                      // ms: inside a half, from either end of it

// A state the renderer would draw: see-through, with a tile hovered.
const flashing = (over = {}) => ({
  opaque: false,
  hover: { tile: tile() },
  selection: [],
  ...over
});

describe("pulse: lit", () => {
  it("is on for the first half of the cycle and off for the second", () => {
    assert.equal(P.lit(0), true);
    assert.equal(P.lit(LIT_MS - A_MOMENT), true);
    assert.equal(P.lit(LIT_MS), false, "the turn belongs to the half it starts");
    assert.equal(P.lit(CYCLE_MS - A_MOMENT), false);
  });

  it("keeps that beat cycle after cycle", () => {
    for (const cycle of CYCLES) {
      const from = cycle * CYCLE_MS;
      assert.equal(P.lit(from), true, `cycle ${cycle}`);
      assert.equal(P.lit(from + LIT_MS), false, `cycle ${cycle} turned`);
    }
  });

  it("flashes as many times a second as the config asks for", () => {
    let flashes = 0;
    for (let ms = 1; ms <= MS_PER_S; ms++) {
      if (P.lit(ms) && !P.lit(ms - 1)) flashes++;
    }
    assert.equal(flashes, B.PULSE_HZ);
  });
});

describe("pulse: untilFlip", () => {
  it("counts out the rest of the half the time falls in", () => {
    assert.equal(P.untilFlip(0), LIT_MS);
    assert.equal(P.untilFlip(A_MOMENT), LIT_MS - A_MOMENT);
    assert.equal(P.untilFlip(LIT_MS), CYCLE_MS - LIT_MS);
    assert.equal(P.untilFlip(CYCLE_MS - A_MOMENT), A_MOMENT);
  });

  it("names a wait that lands on the turn, and never one of no time at all", () => {
    for (let ms = 0; ms < CYCLE_MS * CYCLES.length; ms++) {
      const wait = P.untilFlip(ms);
      assert.ok(wait > 0 && wait <= LIT_MS, `${ms} waits ${wait}`);
      assert.notEqual(P.lit(ms + wait), P.lit(ms), `${ms} still reads the same`);
      assert.equal(P.lit(ms + wait - A_MOMENT), P.lit(ms), `${ms} turned early`);
    }
  });
});

describe("pulse: live", () => {
  it("flashes for a hovered tile on a see-through level", () => {
    assert.equal(P.live(flashing()), true);
  });

  it("flashes for a selected tile as well", () => {
    assert.equal(P.live(flashing({ hover: null, selection: [{ x: 1, y: 2 }] })), true);
  });

  it("stays still while the level is solid", () => {
    assert.equal(P.live(flashing({ opaque: true })), false);
    assert.equal(P.live(flashing({ opaque: true, selection: [{ x: 1, y: 2 }] })), false);
  });

  it("stays still while nothing is ringed", () => {
    assert.equal(P.live(flashing({ hover: null })), false);
    assert.equal(P.live(flashing({ hover: { cell: { x: 1, y: 2 } } })), false,
      "an empty cell takes the ghost, not a ring");
  });
});
