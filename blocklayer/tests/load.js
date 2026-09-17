/*
 * Runs the named Blocklayer modules, in order, against a bare `window` and
 * hands back the `BlockLayer` namespace they build. A test that needs more of
 * a window (a clock, a frame scheduler) passes its own. Each module is
 * compiled in the test's own realm so its objects compare with deepStrictEqual.
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
    vm.compileFunction(code, ["window"], { filename })(window);
  }
  return window.BlockLayer;
}

module.exports = { load };
