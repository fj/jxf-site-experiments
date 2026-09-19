/*
 * Runs the named Blocklayer modules, in order, against a bare `window` and
 * hands back the `BlockLayer` namespace they build. A test that needs more of
 * a window (a clock, a frame scheduler, a document that makes canvases)
 * passes its own. Each module is compiled in the test's own realm so its
 * objects compare with deepStrictEqual. tile() is a well-formed tile, as
 * level.js would make it, for any test.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const MODULE_DIR = path.join(__dirname, "..");

function load(names, window = {}) {
  for (const name of names) {
    const filename = path.join(MODULE_DIR, name);
    const code = fs.readFileSync(filename, "utf8");
    vm.compileFunction(code, ["window", "document"], { filename })(window, window.document);
  }
  return window.BlockLayer;
}

function tile(overrides = {}) {
  return {
    x: 1, y: 2, elev: 0, color: "green", shape: "block", facing: "N", decor: null, marks: [],
    ...overrides
  };
}

module.exports = { load, tile };
