/*
 * Blocklayer — decor: the objects that stand on a tile (a chest, a rock,
 * three crystals and a switch) as string-art sprites anchored at the centre of
 * their footprint, plus a 16x16 rendition of each for a toolbar button.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var HIGHLIGHT_SHADE = 0.5;

  var WOOD = "#c8843e";
  var GOLD = "#f4c542";
  var GOLD_DARK = "#b8861e";
  var STONE = "#b0b4b8";
  var BLUE = "#7fd0ff";
  var YELLOW = "#f6d048";
  var RED = "#f25c7a";
  var RED_DARK = "#b83e5a";
  var STEEL = "#8d9bb0";

  // l: the lit face, m: the left (mid) face, d: the right (dark) face,
  // h: a highlight, #: outline.
  function facets(base, extra) {
    var palette = {
      "#": B.COLORS.outline,
      "l": base,
      "m": B.pixel.shade(base, B.FACE_SHADES.left),
      "d": B.pixel.shade(base, B.FACE_SHADES.right),
      "h": B.pixel.shade(base, HIGHLIGHT_SHADE)
    };
    Object.keys(extra || {}).forEach(function (ch) { palette[ch] = extra[ch]; });
    return palette;
  }

  var ART = {
    "chest": {
      palette: facets(WOOD, { "g": GOLD, "G": GOLD_DARK }),
      ox: 9, oy: 11,
      rows: [
        "......####........",
        "....##hhll##......",
        "..##hhllllll##....",
        "##llllllllllll##..",
        "##llllllllllllll##",
        "#m##llllllllllll##",
        "#mmm##llllllll##d#",
        "##mmmm##llll##ddd#",
        "#m##ggmm####dddd##",
        "#mmmggmmmm#ddd##d#",
        "#mmmGG##mm#d##ddd#",
        "##mmmmmm####ddddd#",
        "..##mmmmmm#ddddd##",
        "....##mmmm#ddd##..",
        "......##mm#d##....",
        "........####......"
      ],
      icon: [
        "................",
        ".....####.......",
        "...##hhll##.....",
        ".##llllllll##...",
        ".##llllllllll##.",
        ".#m##llllllll##.",
        ".#mmm##llll##d#.",
        ".##mmmm####ddd#.",
        ".#m##ggmm#ddd##.",
        ".#mmmggmm#d##d#.",
        ".##mmGG####ddd#.",
        "...##mmmm#ddd##.",
        ".....##mm#d##...",
        ".......####.....",
        "................",
        "................"
      ]
    },
    "rock": {
      palette: facets(STONE),
      ox: 8, oy: 8,
      rows: [
        "....#####.......",
        "..##lllll##.....",
        ".#llhllllll##...",
        ".#lhhlllllllll#.",
        "#mlllllllllllld#",
        "#mmmllllllddddd#",
        "#mmmmmllldddddd#",
        "#mmmmmmmddddddd#",
        ".#mmmmmmdddddd#.",
        ".##mmmmmddddd##.",
        "...#########...."
      ],
      icon: [
        "................",
        "................",
        "................",
        ".....#####......",
        "...##lllll##....",
        "..#lhhllllll#...",
        ".#llhlllllllld#.",
        ".#mmllllllddddd#",
        ".#mmmmllldddddd#",
        ".#mmmmmmddddddd#",
        "..#mmmmmdddddd#.",
        "...##mmmdddd##..",
        ".....#######....",
        "................",
        "................",
        "................"
      ]
    },
    "crystal-blue": {
      palette: facets(BLUE),
      ox: 5, oy: 14,
      rows: [
        "....##....",
        "...#lm#...",
        "...#lm#...",
        "..#llmm#..",
        "..#llmm#..",
        ".#lllmmm#.",
        ".#mhmddd#.",
        ".#mhmddd#.",
        ".#mhmddd#.",
        ".#mmmddd#.",
        ".#mmmddd#.",
        ".#mmmddd#.",
        ".#mmmddd#.",
        ".#mmmddd#.",
        ".##mmdd##.",
        "...####..."
      ],
      icon: [
        "................",
        ".......##.......",
        "......#lm#......",
        "......#lm#......",
        ".....#llmm#.....",
        ".....#llmm#.....",
        "....#lllmmm#....",
        "....#mhmddd#....",
        "....#mhmddd#....",
        "....#mmmddd#....",
        "....#mmmddd#....",
        "....#mmmddd#....",
        "....#mmmddd#....",
        "....##mmdd##....",
        "......####......",
        "................"
      ]
    },
    "crystal-yellow": {
      palette: facets(YELLOW),
      ox: 6, oy: 24,
      rows: [
        "......##....",
        ".....#lm#...",
        ".....#lm#...",
        ".....#lm#...",
        "....#llmm#..",
        "....#llmm#..",
        "....#llmm#..",
        "...#lllmmm#.",
        "...#lllmmm#.",
        "...#lllmmm#.",
        "...#mhmddd#.",
        "...#mhmddd#.",
        "...#mhmddd#.",
        "...#mhmddd#.",
        "...#mmmddd#.",
        "..##mmmddd#.",
        ".#lm#mmddd#.",
        ".#lm#mmddd#.",
        "#llmm#mddd#.",
        "#llmm#mddd#.",
        "#mhmd#mddd#.",
        "#mmmd#mddd#.",
        "#mmmd#mddd#.",
        "#mmmd#mddd#.",
        "##mmd#mdd##.",
        ".########..."
      ],
      icon: [
        "........##......",
        ".......#lm#.....",
        ".......#lm#.....",
        ".......#lm#.....",
        "......#llmm#....",
        "......#llmm#....",
        "......#llmm#....",
        "......#mhdd#....",
        "....###mhdd#....",
        "...#lm#mmdd#....",
        "...#lm#mmdd#....",
        "..#llmm#mdd#....",
        "..#llmm#mdd#....",
        "..#mmdd#mdd#....",
        "..##md##md##....",
        "...########....."
      ]
    },
    "crystal-red": {
      palette: facets(RED),
      ox: 9, oy: 18,
      rows: [
        "........##........",
        ".......#lm#.......",
        ".......#lm#.......",
        "......#llmm#......",
        "......#llmm#......",
        "..##..#llmm#......",
        ".#lm##lllmmm#.....",
        ".#lm##lllmmm#.....",
        ".#lm##lllmmm#.##..",
        "#llmm#mhmddd##lm#.",
        "#llmm#mhmddd##lm#.",
        "#llmm#mhmddd##lm#.",
        "#mhdd#mmmddd#llmm#",
        "#mhdd#mmmddd#llmm#",
        "#mmdd#mmmddd#llmm#",
        "#mmdd#mmmddd#mmdd#",
        "#mmdd##mmdd##mmdd#",
        "#mmdd#.####.#mmdd#",
        "##md##......##md##",
        ".####.......####.."
      ],
      icon: [
        "........##......",
        ".......#lm#.....",
        ".......#lm#.....",
        "......#llmm#....",
        "..##..#llmm#....",
        ".#lm##lllmmm#...",
        ".#lm##lllmmm##..",
        "#llmm#mhmdd#lm#.",
        "#llmm#mhmdd#lm#.",
        "#mhdd#mhmd#llmm#",
        "#mmdd#mmmd#llmm#",
        "#mmdd#mmmd#mmdd#",
        "#mmdd##mmd#mmdd#",
        "#mmdd#.####mmdd#",
        "##md##....##md##",
        ".####......####."
      ]
    },
    "switch": {
      palette: facets(STEEL, { "r": RED, "R": RED_DARK }),
      ox: 9, oy: 14,
      rows: [
        ".####.............",
        "#rrRR#............",
        "#rrRR#............",
        ".####.............",
        ".#lm#.............",
        "..#lm#............",
        "...#lm#...........",
        "....#lm#..........",
        ".....#lm##........",
        "......#lm###......",
        "....##l#lm#l##....",
        "..##hhllllllll##..",
        "..#m##llllll##d#..",
        "..#mmm##ll##ddd#..",
        "..#mmmmm##ddddd#..",
        "....##mmm#dd##....",
        "......##m###......",
        "........##........"
      ],
      icon: [
        "................",
        ".####...........",
        "#rrRR#..........",
        "#rrRR#..........",
        ".####...........",
        ".#lm#...........",
        "..#lm#..........",
        "...#lm#.........",
        "....#lm###......",
        "....##lm#l##....",
        "..##hh#lm#ll##..",
        "..#m##llll##d#..",
        "..#mmm####ddd#..",
        "....##mm#d##....",
        "......####......",
        "................"
      ]
    }
  };

  function artFor(key) {
    var art = ART[key];
    if (!art) throw new Error("unknown decor: " + key);
    return art;
  }

  var sprite = B.pixel.memo(function (key) {
    var art = artFor(key);
    return B.pixel.fromRows(art.rows, art.palette, art.ox, art.oy);
  });

  var icon = B.pixel.memo(function (key) {
    var art = artFor(key);
    return B.pixel.fromRows(art.icon, art.palette);
  });

  B.decor = {
    sprite: sprite,
    icon: icon
  };
})();
