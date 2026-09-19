/*
 * Blocklayer — the level a first visit starts with: a plateau with a raised
 * square reached by a ramp and by stairs, a stepped tower, terraces down
 * to flat ground, every decor object and a few marks, on a board with empty
 * tiles around them, so the first screenshot shows every feature, both ends
 * of the elevation range and the edges of the board. The slopes were
 * placed to be in sight at the first view's rotation; demo.test.js checks that
 * against view.js, which is why this loads after it.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  // Colour no longer follows the height, so every part of the level takes one
  // of its own and the first screenshot shows the whole palette.
  var PLATEAU_SIZE = 6;                           // the plateau is this many tiles square
  var PLATEAU_ELEV = 2;
  var PLATEAU_COLOR = "green";
  var FRONT_ROW_COLOR = "grey-light";             // the plateau's edge over the rows below
  var PATH_COLOR = "grey";                        // underfoot from there up to the stairs
  var RAMP_COLOR = "orange";
  var STAIRS_COLOR = "violet";
  // The raised square on the plateau, one step up.
  var MESA = { x: 3, y: 1, size: 2, color: "yellow" };
  var TOWER_DROP = 2;                             // blocks the tower falls to its shoulder
  // A stepped tower at the plateau's back corner: the top of the range, then
  // a shoulder on the way down to the plateau.
  var TOWER = { x: 0, y: 0, steps: [
    { elev: B.ELEV_MAX, color: "red" },
    { elev: B.ELEV_MAX - TOWER_DROP, color: "grey-dark" }
  ] };
  // The rows in front of the plateau, each a step lower: a sunken row, then
  // ground so low that it carries no block at all.
  var TERRACES = [
    { elev: PLATEAU_ELEV - 1, color: "blue" },
    { elev: B.ELEV_MIN, color: "indigo" }
  ];
  // The board takes a margin of empty tiles past the layout, so the first
  // screenshot shows its edges.
  var BOARD_MARGIN = 3;          // empty tiles past the level, so the edges show
  var BOARD = {
    w: PLATEAU_SIZE + BOARD_MARGIN,
    h: PLATEAU_SIZE + TERRACES.length + BOARD_MARGIN
  };
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
    var lvl = L.create(BOARD.w, BOARD.h);
    var x, y, row, step;
    for (y = 0; y < PLATEAU_SIZE; y++) {
      for (x = 0; x < PLATEAU_SIZE; x++) L.add(lvl, x, y, PLATEAU_ELEV, PLATEAU_COLOR);
    }
    for (x = 0; x < PLATEAU_SIZE; x++) L.setColor(lvl, x, PLATEAU_SIZE - 1, FRONT_ROW_COLOR);
    for (row = 0; row < TERRACES.length; row++) {
      for (x = 0; x < PLATEAU_SIZE; x++) {
        L.add(lvl, x, PLATEAU_SIZE + row, TERRACES[row].elev, TERRACES[row].color);
      }
    }
    for (step = 0; step < TOWER.steps.length; step++) {
      L.raise(lvl, TOWER.x, TOWER.y + step, TOWER.steps[step].elev - PLATEAU_ELEV);
      L.setColor(lvl, TOWER.x, TOWER.y + step, TOWER.steps[step].color);
    }
    for (y = 0; y < MESA.size; y++) {
      for (x = 0; x < MESA.size; x++) {
        L.raise(lvl, MESA.x + x, MESA.y + y, 1);
        L.setColor(lvl, MESA.x + x, MESA.y + y, MESA.color);
      }
    }
    // Up onto the mesa: a ramp from the east and stairs from the south. Both
    // rise away from the first view's camera, so both slopes are in sight.
    var rampX = MESA.x + MESA.size;
    var stairsX = MESA.x + MESA.size - 1;
    var stairsY = MESA.y + MESA.size;
    L.setShape(lvl, rampX, MESA.y, "ramp");
    L.setFacing(lvl, rampX, MESA.y, "W");
    L.setColor(lvl, rampX, MESA.y, RAMP_COLOR);
    L.setShape(lvl, stairsX, stairsY, "stairs");
    L.setFacing(lvl, stairsX, stairsY, "N");
    L.setColor(lvl, stairsX, stairsY, STAIRS_COLOR);
    // A path across the plateau, from its front row up to the foot of the stairs.
    for (y = stairsY + 1; y < PLATEAU_SIZE; y++) L.setColor(lvl, stairsX, y, PATH_COLOR);
    DECOR_AT.forEach(function (d) { L.setDecor(lvl, d.x, d.y, d.decor); });
    MARKS_AT.forEach(function (m) { L.toggleMark(lvl, m.x, m.y, m.mark); });
    return lvl;
  }

  B.demo = { level: level };
})();
