/*
 * Blocklayer — the interface's own pixel art: the 16×16 glyphs on the toolbar
 * buttons and in the hint row, drawn in whatever ink the theme asks for, and
 * the compass rose that shows where world north points. Everything is string
 * art turned into a sprite once and cached.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var INK = "#";
  var TONE = "o";
  var TONE_MIX = 0.5;              // how far the second tone sits from the ink
  var MID_LUMINANCE = 128;         // an ink averaging under this counts as dark

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

  ROWS["rotate-ccw"] = ROWS["rotate-cw"].map(mirror);

  function mirror(row) {
    return row.split("").reverse().join("");
  }

  function isDark(hex) {
    var rgb = B.pixel.parseHex(hex);
    return (rgb[0] + rgb[1] + rgb[2]) / rgb.length < MID_LUMINANCE;
  }

  function palette(ink) {
    var p = {};
    p[INK] = ink;
    p[TONE] = B.pixel.shade(ink, isDark(ink) ? TONE_MIX : -TONE_MIX);
    return p;
  }

  var sprite = B.pixel.memo(function (name, ink) {
    var rows = ROWS[name];
    if (!rows) throw new Error("unknown icon: " + name);
    return B.pixel.fromRows(rows, palette(ink));
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
    compass: compass
  };
})();
