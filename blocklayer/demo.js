/*
 * Blocklayer — the level a first visit starts with: a plateau with a raised
 * square reached by a ramp and by stairs, a tower at one corner, terraces down
 * to flat ground, every decor object and a few marks, so the first screenshot
 * shows every feature and both ends of the elevation range. The slopes were
 * placed to be in sight at the first view's rotation; demo.test.js checks that
 * against view.js, which is why this loads after it.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var PLATEAU_SIZE = 6;                           // the plateau is this many tiles square
  var PLATEAU_ELEV = 2;
  var MESA = { x: 3, y: 1, size: 2 };             // the raised square on it, one step up
  var TOWER = { x: 0, y: 0, elev: B.ELEV_MAX };   // a pillar at the plateau's back corner
  // The rows in front of the plateau, each a step lower: a sunken row, then
  // ground so low that it carries no block at all.
  var TERRACE_ELEVS = [PLATEAU_ELEV - 1, B.ELEV_MIN];
  var DECOR_AT = [
    { x: 4, y: 1, decor: "chest" },
    { x: 0, y: 4, decor: "rock" },
    { x: 1, y: 0, decor: "crystal-blue" },
    { x: 5, y: 5, decor: "crystal-yellow" },
    { x: 2, y: 6, decor: "crystal-red" }
  ];
  var MARKS_AT = [
    { x: 1, y: 1, mark: "arrow-e" },
    { x: 4, y: 4, mark: "arrow-n" },
    { x: 0, y: 2, mark: "teleport" },
    { x: 3, y: 5, mark: "rope" },
    { x: 1, y: 5, mark: "jump" }
  ];

  function level() {
    var L = B.level;
    var lvl = L.create();
    var x, y, row;
    for (y = 0; y < PLATEAU_SIZE; y++) {
      for (x = 0; x < PLATEAU_SIZE; x++) L.add(lvl, x, y, PLATEAU_ELEV);
    }
    for (row = 0; row < TERRACE_ELEVS.length; row++) {
      for (x = 0; x < PLATEAU_SIZE; x++) {
        L.add(lvl, x, PLATEAU_SIZE + row, TERRACE_ELEVS[row]);
      }
    }
    L.raise(lvl, TOWER.x, TOWER.y, TOWER.elev - PLATEAU_ELEV);
    for (y = 0; y < MESA.size; y++) {
      for (x = 0; x < MESA.size; x++) L.raise(lvl, MESA.x + x, MESA.y + y, 1);
    }
    // Up onto the mesa: a ramp from the east and stairs from the south. Both
    // rise away from the first view's camera, so both slopes are in sight.
    var rampX = MESA.x + MESA.size;
    var stairsX = MESA.x + MESA.size - 1;
    var stairsY = MESA.y + MESA.size;
    L.setShape(lvl, rampX, MESA.y, "ramp");
    L.setFacing(lvl, rampX, MESA.y, "W");
    L.setShape(lvl, stairsX, stairsY, "stairs");
    L.setFacing(lvl, stairsX, stairsY, "N");
    DECOR_AT.forEach(function (d) { L.setDecor(lvl, d.x, d.y, d.decor); });
    MARKS_AT.forEach(function (m) { L.toggleMark(lvl, m.x, m.y, m.mark); });
    return lvl;
  }

  B.demo = { level: level };
})();
