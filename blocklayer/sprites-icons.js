/*
 * Blocklayer — the interface's own pixel art: the 16×16 glyphs on the toolbar
 * buttons and in the hint row, the eight compass arrows the direction buttons
 * show, both drawn as alpha masks for the stylesheet to colour by theme, and
 * the compass rose that shows where world north points. Everything is string
 * art turned into a sprite once and cached.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var INK = "#";
  var TONE = "o";
  var TONE_ALPHA = 0.5;            // the second tone's share of the ink's alpha

  var COMPASS_SIZE = 24;           // px, square
  var ARM_STEPS = 3;               // 2:1 steps on each short arm of the rose
  var NORTH_STEPS = 4;             // ...and on the arm that carries the N
  var HEAD_LENGTH = 3;             // px in each bar of the arrowhead
  var LETTER_GAP = 1;              // rows between the arrowhead and the N
  var LETTER_HALF = 2;             // the N is five wide: two either side of centre
  var HALO_COLOR = "#ffffff";
  var HALO_REACH = 1;              // px of halo around each ink pixel

  // The four 2:1 screen diagonals, as x and y signs keyed by screen direction.
  var DIAGONALS = { 0: [1, -1], 2: [1, 1], 4: [-1, 1], 6: [-1, -1] };

  var LETTER_N = [
    "#...#",
    "##..#",
    "#.#.#",
    "#..##",
    "#...#"
  ];

  var ROWS = {
    "rotate-cw": [
      "................",
      "..........#.....",
      "..........##....",
      ".....#########..",
      "...##.....##....",
      "..#.......#.....",
      "..#.............",
      ".#..............",
      ".#..............",
      ".#............#.",
      ".#............#.",
      "..#..........#..",
      "..#..........#..",
      "...##......##...",
      ".....######.....",
      "................"
    ],
    "zoom-in": [
      "................",
      "...#####........",
      "..#ooooo#.......",
      ".#ooo#ooo#......",
      ".#ooo#ooo#......",
      ".#o#####o#......",
      ".#ooo#ooo#......",
      ".#ooo#ooo#......",
      "..#ooooo#.......",
      "...#####.##.....",
      "..........##....",
      "...........##...",
      "............##..",
      ".............##.",
      "................",
      "................"
    ],
    "zoom-out": [
      "................",
      "...#####........",
      "..#ooooo#.......",
      ".#ooooooo#......",
      ".#ooooooo#......",
      ".#o#####o#......",
      ".#ooooooo#......",
      ".#ooooooo#......",
      "..#ooooo#.......",
      "...#####.##.....",
      "..........##....",
      "...........##...",
      "............##..",
      ".............##.",
      "................",
      "................"
    ],
    "layer-elev": [
      "................",
      "................",
      "................",
      ".#############..",
      ".#ooooooooooo#..",
      ".#ooooooo#ooo#..",
      ".#ooo#oo##ooo#..",
      ".#oo###oo#ooo#..",
      ".#ooo#ooo#ooo#..",
      ".#oooooo###oo#..",
      ".#ooooooooooo#..",
      ".#############..",
      "................",
      "................",
      "................",
      "................"
    ],
    "layer-marks": [
      "................",
      "................",
      "...##########...",
      "..#oooooooooo#..",
      ".#ooooooo#oooo#.",
      ".#ooooooo##ooo#.",
      ".#ooooooo###oo#.",
      ".#o##########o#.",
      ".#o##########o#.",
      ".#ooooooo###oo#.",
      ".#ooooooo##ooo#.",
      ".#ooooooo#oooo#.",
      "..#oooooooooo#..",
      "...##########...",
      "................",
      "................"
    ],
    "layer-decor": [
      "................",
      ".......#........",
      "......#o#.......",
      "......#o#.......",
      ".....#.oo#......",
      ".....#.oo#......",
      "....#..ooo#.....",
      "....#..ooo#.....",
      "....#..ooo#.....",
      "....#..ooo#.....",
      ".....#.oo#......",
      ".....#.oo#......",
      "......#o#.......",
      "......#o#.......",
      ".......#........",
      "................"
    ],
    "opaque": [
      "................",
      ".......##.......",
      ".....##..##.....",
      "...##......##...",
      "..#..........#..",
      "..###......###..",
      "..#oo##..#####..",
      "..#oooo#######..",
      "..#oooo#######..",
      "..#oooo#######..",
      "..#oooo#######..",
      "...##oo######...",
      ".....######.....",
      ".......##.......",
      "................",
      "................"
    ],
    "transparent": [
      "................",
      ".......##.......",
      ".....##oo##.....",
      "...##..oo..##...",
      "..#....oo....#..",
      "..###..oo..###..",
      "..#..##oo##..#..",
      "..#....##....#..",
      "..#..oo##oo..#..",
      "..#oo..##..oo#..",
      "..#....##....#..",
      "...##..##..##...",
      ".....######.....",
      ".......##.......",
      "................",
      "................"
    ],
    "shape-block": [
      "................",
      "................",
      ".......##.......",
      ".....##..##.....",
      "...##......##...",
      "..#..........#..",
      "..###......###..",
      "..#oo##..#####..",
      "..#oooo#######..",
      "..#oooo#######..",
      "...##oo######...",
      ".....######.....",
      ".......##.......",
      "................",
      "................",
      "................"
    ],
    "shape-ramp": [
      "................",
      "................",
      ".......##.......",
      "......#..##.....",
      ".....#.....##...",
      ".....#.......#..",
      "....#.......##..",
      "...#.......###..",
      "...#.......###..",
      "..#.......####..",
      "...##....####...",
      ".....##..##.....",
      ".......##.......",
      "................",
      "................",
      "................"
    ],
    "shape-stairs": [
      "................",
      "........#.......",
      "......##.##.....",
      "......###..##...",
      "......#oo##..#..",
      "......#oooo###..",
      "....##.##ooo##..",
      "..##.....##o##..",
      "..###......###..",
      "..#oo##..#####..",
      "..#oooo#######..",
      "...##ooo#####...",
      ".....##o###.....",
      ".......##.......",
      "................",
      "................"
    ],
    "file-save": [
      "................",
      "................",
      ".......##.......",
      ".......##.......",
      ".......##.......",
      ".......##.......",
      "....########....",
      ".....######.....",
      "..#...####...#..",
      "..#....##....#..",
      "..#..........#..",
      "..#..........#..",
      "..#oooooooooo#..",
      "..############..",
      "................",
      "................"
    ],
    "file-open": [
      "................",
      "................",
      ".......##.......",
      "......####......",
      ".....######.....",
      "....########....",
      ".......##.......",
      ".......##.......",
      "..#....##....#..",
      "..#....##....#..",
      "..#....##....#..",
      "..#....##....#..",
      "..#oooo##oooo#..",
      "..############..",
      "................",
      "................"
    ],
    "clear": [
      "................",
      "......####......",
      "......#..#......",
      "..############..",
      "...##########...",
      "...#oooooooo#...",
      "...#oo#oo#oo#...",
      "...#oo#oo#oo#...",
      "...#oo#oo#oo#...",
      "...#oo#oo#oo#...",
      "...#oo#oo#oo#...",
      "...#oo#oo#oo#...",
      "...#oooooooo#...",
      "...##########...",
      "................",
      "................"
    ],
    "hint-add": [
      "................",
      "..#######.......",
      ".#ooo#...#...#..",
      ".#ooo#...#...#..",
      ".#ooo#...#.#####",
      ".#ooo#...#...#..",
      ".#########...#..",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      "..#######.......",
      "................",
      "................"
    ],
    "hint-wheel": [
      "................",
      "..#######....#..",
      ".#..ooo..#..###.",
      ".#..ooo..#.#####",
      ".#..ooo..#......",
      ".#..ooo..#.#####",
      ".#########..###.",
      ".#.......#...#..",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      "..#######.......",
      "................",
      "................"
    ],
    "hint-remove": [
      "................",
      "..#######.......",
      ".#...#ooo#.#...#",
      ".#...#ooo#..#.#.",
      ".#...#ooo#...#..",
      ".#...#ooo#..#.#.",
      ".#########.#...#",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      ".#.......#......",
      "..#######.......",
      "................",
      "................"
    ]
  };

  ROWS["rotate-ccw"] = B.pixel.hflip(ROWS["rotate-cw"]);

  // The compass arrows the toolbar's direction buttons show: one along an
  // axis and one on the 45° diagonal, the other six flipped from these.
  var ARROW_N = [
    "................",
    ".......##.......",
    "......####......",
    ".....######.....",
    "....##.##.##....",
    "...##..##..##...",
    "..##...##...##..",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    "................",
    "................"
  ];

  var ARROW_NE = [
    "................",
    "................",
    "......########..",
    "......########..",
    "..........####..",
    ".........##.##..",
    "........##..##..",
    ".......##...##..",
    "......##....##..",
    ".....##.....##..",
    "....##..........",
    "...##...........",
    "..##............",
    "................",
    "................",
    "................"
  ];

  var ARROW_ROWS = {
    N: ARROW_N,
    NE: ARROW_NE,
    E: B.pixel.hflip(B.pixel.transpose(ARROW_N)),
    SE: B.pixel.vflip(ARROW_NE),
    S: B.pixel.vflip(ARROW_N),
    SW: B.pixel.hflip(B.pixel.vflip(ARROW_NE)),
    W: B.pixel.transpose(ARROW_N),
    NW: B.pixel.hflip(ARROW_NE)
  };

  // A glyph is a mask: only its alpha counts, so the ink is opaque black and
  // the tone is the same at half the alpha.
  var MASK_INK = "#000000";
  var MASK = {};
  MASK[INK] = B.pixel.translucent(MASK_INK, 1);
  MASK[TONE] = B.pixel.translucent(MASK_INK, TONE_ALPHA);

  var sprite = B.pixel.memo(function (name) {
    var rows = ROWS[name];
    if (!rows) throw new Error("unknown icon: " + name);
    return B.pixel.fromRows(rows, MASK);
  });

  var arrow = B.pixel.memo(function (dir) {
    var rows = ARROW_ROWS[dir];
    if (!rows) throw new Error("unknown direction: " + dir);
    return B.pixel.fromRows(rows, MASK);
  });

  // The rose's ink pixels relative to its centre: four 2:1 arms, the north one
  // longer and tipped with an arrowhead, and an upright N beyond the tip.
  function rosePixels(rot) {
    var north = DIAGONALS[B.screenDir(rot, 0)];
    var pixels = [[0, 0]];
    Object.keys(DIAGONALS).forEach(function (dir) {
      var signs = DIAGONALS[dir];
      var steps = signs === north ? NORTH_STEPS : ARM_STEPS;
      for (var k = 1; k <= steps; k++) {
        pixels.push([signs[0] * (2 * k - 1), signs[1] * k]);
        pixels.push([signs[0] * 2 * k, signs[1] * k]);
      }
    });
    var tipX = north[0] * 2 * NORTH_STEPS;
    var tipY = north[1] * NORTH_STEPS;
    for (var i = 0; i < HEAD_LENGTH; i++) {
      pixels.push([tipX - north[0] * i, tipY]);
      pixels.push([tipX, tipY - north[1] * i]);
    }
    var letterTop = north[1] < 0
      ? tipY - LETTER_GAP - LETTER_N.length
      : tipY + LETTER_GAP + 1;
    LETTER_N.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        if (row.charAt(x) === INK) pixels.push([tipX - LETTER_HALF + x, letterTop + y]);
      }
    });
    return pixels;
  }

  var compass = B.pixel.memo(function (rot) {
    var c = B.pixel.canvas(COMPASS_SIZE, COMPASS_SIZE);
    var ctx = B.pixel.context(c);
    var centre = Math.floor(COMPASS_SIZE / 2);
    var pixels = rosePixels(rot);
    var haloSize = 2 * HALO_REACH + 1;
    ctx.fillStyle = HALO_COLOR;
    pixels.forEach(function (p) {
      ctx.fillRect(centre + p[0] - HALO_REACH, centre + p[1] - HALO_REACH, haloSize, haloSize);
    });
    ctx.fillStyle = B.COLORS.outline;
    pixels.forEach(function (p) {
      ctx.fillRect(centre + p[0], centre + p[1], 1, 1);
    });
    return B.pixel.sprite(c, centre, centre);
  });

  B.icons = {
    sprite: sprite,
    arrow: arrow,
    compass: compass
  };
})();
