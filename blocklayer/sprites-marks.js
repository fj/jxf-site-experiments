/*
 * Blocklayer — marks: the small icons laid on a tile's top. Arrows are drawn
 * for screen directions, so a world arrow goes through B.screenDir first; the
 * eight come from two designs, one axis-aligned and one on the 2:1 grid line.
 * Every mark is drawn as a fill and then given a dark outline.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var TRANSPARENT = ".";
  var OUTLINE = "#";
  var OUTLINE_PAD = 1;          // px added on every side for the outline

  var PALETTE = {
    "#": B.COLORS.outline,
    "w": "#ffffff",
    "v": "#c39bff",
    "V": "#8b4de0",
    "b": "#c98f4e",
    "B": "#8a5a2b",
    "g": "#5ee87a",
    "G": "#26a84c"
  };

  // The two base arrows: up (screen direction 7) and up-right (0).
  var ARROW_UP = [
    "...w...",
    "..www..",
    ".wwwww.",
    "wwwwwww",
    "..www..",
    "..www..",
    "..www..",
    "..www.."
  ];

  // Up-right runs along the 2:1 line: the shaft steps two across per one
  // up, and the head's barbs are the other two world directions as seen.
  var ARROW_UP_RIGHT = [
    "....wwwwww",
    ".......www",
    ".....wwwww",
    "...wwww..w",
    ".wwww.....",
    ".ww......."
  ];

  // Indexed by screen direction: up-right, right, down-right, down,
  // down-left, left, up-left, up.
  var P = B.pixel;
  var ARROW_BY_SCREEN_DIR = [
    ARROW_UP_RIGHT,
    P.hflip(P.transpose(ARROW_UP)),
    P.vflip(ARROW_UP_RIGHT),
    P.vflip(ARROW_UP),
    P.hflip(P.vflip(ARROW_UP_RIGHT)),
    P.transpose(ARROW_UP),
    P.hflip(ARROW_UP_RIGHT),
    ARROW_UP
  ];

  var STILL = {
    "teleport": [
      "...vvv...",
      ".vvvvvvv.",
      "vvv...vvv",
      "vv.....vv",
      "VV.....VV",
      "VVV...VVV",
      ".VVVVVVV.",
      "...VVV..."
    ],
    "rope": [
      "..bbbbb..",
      ".bb...bb.",
      "bb.....bB",
      "bb.....bB",
      "bb.....BB",
      ".bb...BB.",
      "..bbbBB..",
      "...BBB...",
      "..bB.Bb..",
      ".bb...bb."
    ],
    "jump": [
      "....g....",
      "...ggg...",
      "..gg.gg..",
      ".gg.G.gg.",
      "gg.GGG.gg",
      "..GG.GG..",
      ".GG...GG.",
      "GG.....GG"
    ]
  };

  function blank(width) {
    var row = "";
    while (row.length < width) row += TRANSPARENT;
    return row;
  }

  // Grows the art by OUTLINE_PAD on every side and marks each empty cell that
  // touches a filled one (4-neighbours, so 2:1 edges stay 2 px runs).
  function outlined(rows) {
    var margin = blank(OUTLINE_PAD);
    var edgeRow = blank(rows[0].length + 2 * OUTLINE_PAD);
    var padded = [edgeRow].concat(rows.map(function (row) {
      return margin + row + margin;
    }), [edgeRow]);
    function filled(x, y) {
      return y >= 0 && y < padded.length && x >= 0 && x < padded[y].length &&
        padded[y].charAt(x) !== TRANSPARENT;
    }
    return padded.map(function (row, y) {
      var out = "";
      for (var x = 0; x < row.length; x++) {
        var ch = row.charAt(x);
        var edge = ch === TRANSPARENT &&
          (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1));
        out += edge ? OUTLINE : ch;
      }
      return out;
    });
  }

  function markFor(key) {
    for (var i = 0; i < B.MARKS.length; i++) {
      if (B.MARKS[i].key === key) return B.MARKS[i];
    }
    throw new Error("unknown mark: " + key);
  }

  var arrow = B.pixel.memo(function (screenDir) {
    var rows = ARROW_BY_SCREEN_DIR[screenDir];
    if (!rows) throw new Error("unknown screen direction: " + screenDir);
    return B.pixel.fromRows(outlined(rows), PALETTE);
  });

  var still = B.pixel.memo(function (key) {
    var rows = STILL[key];
    if (!rows) throw new Error("no art for mark: " + key);
    return B.pixel.fromRows(outlined(rows), PALETTE);
  });

  var sprite = B.pixel.memo(function (key, rot) {
    var mark = markFor(key);
    if (mark.dir) return arrow(B.screenDir(rot || 0, B.DIRECTIONS.indexOf(mark.dir)));
    return still(key);
  });

  B.marks = { sprite: sprite };
})();
