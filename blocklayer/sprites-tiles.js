/*
 * Blocklayer — the tile sprites: the flat top, the column of blocks under it,
 * the wedges of ramps and stairs, and the marks the editor lays over a tile.
 * Faces are flat polygons in the tile's own (u, v, z) frame, rasterised one
 * pixel column at a time; a pass over the finished pixels then draws the dark
 * outline wherever a face meets another face or the background.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};
  var P = B.pixel;

  var W = B.TILE_W;
  var H = B.TILE_H;
  var BLOCK = B.BLOCK_H;
  var HALF_W = W / 2;
  var HALF_H = H / 2;
  var EDGE = 0.5;                        // a tile spans u, v in [-EDGE, EDGE]
  // The diamond is rasterised half a pixel wider and a quarter taller than
  // its vertices, so its top row is four pixels and its two widest rows span
  // the full width: the shape a 32 × 16 tile needs to tile the plane.
  var U_SCALE = HALF_W + 0.5;
  var V_SCALE = HALF_H + 0.25;
  var PIXEL_CENTRE = 0.5;
  var LEFT_SHADE = -0.22;
  var RIGHT_SHADE = -0.42;
  var SLOPE_SHADE = -0.08;
  var SEAM_SHADE = -0.18;                // between two stacked blocks
  var WEDGE_H = H + BLOCK;
  var WEDGE_ANCHOR_Y = HALF_H + BLOCK;
  var HOLD_ALPHA = 0.7;
  var HOLD_STEPS = 16;
  var SELECT_WIDTH = 2;
  var HOVER_WIDTH = 1;
  var PLUS_ARM = 2;                      // the ghost's "+" reaches this far from its centre
  var CHIP_PAD = 1;
  var GLYPH_W = 3;
  var GLYPH_H = 5;
  var GLYPH_GAP = 1;

  var FONT = {
    "0": ["###", "#.#", "#.#", "#.#", "###"],
    "1": [".#.", "##.", ".#.", ".#.", "###"],
    "2": ["###", "..#", "###", "#..", "###"],
    "3": ["###", "..#", "###", "..#", "###"],
    "4": ["#.#", "#.#", "###", "..#", "..#"],
    "5": ["###", "#..", "###", "..#", "###"],
    "6": ["###", "#..", "###", "#.#", "###"],
    "7": ["###", "..#", "..#", "..#", "..#"],
    "8": ["###", "#.#", "###", "#.#", "###"],
    "9": ["###", "#.#", "###", "..#", "###"],
    "+": ["...", ".#.", "###", ".#.", "..."],
    "-": ["...", "...", "###", "...", "..."]
  };

  function topColor(elev) {
    var color = B.ELEVATION_COLORS[String(elev)];
    if (!color) throw new Error("no colour for elevation " + elev);
    return color;
  }

  function faceColor(elev, kind) {
    var color = topColor(elev);
    if (kind === "left") return P.shade(color, LEFT_SHADE);
    if (kind === "right") return P.shade(color, RIGHT_SHADE);
    if (kind === "slope") return P.shade(color, SLOPE_SHADE);
    return color;
  }

  // ---- Rasterising ---------------------------------------------------------

  function toScreen(ax, ay, p) {
    return [ax + (p[0] - p[1]) * U_SCALE, ay + (p[0] + p[1]) * V_SCALE - p[2]];
  }

  // Fills a convex polygon: a pixel is in when its centre is inside or on an
  // edge, so faces that share an edge share its pixels and the later one wins.
  function fillPoly(ctx, pts, color) {
    var xMin = Infinity;
    var xMax = -Infinity;
    pts.forEach(function (p) {
      xMin = Math.min(xMin, p[0]);
      xMax = Math.max(xMax, p[0]);
    });
    ctx.fillStyle = color;
    for (var x = Math.floor(xMin); x <= Math.ceil(xMax); x++) {
      var cx = x + PIXEL_CENTRE;
      var yMin = Infinity;
      var yMax = -Infinity;
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i];
        var b = pts[(i + 1) % pts.length];
        if (cx < Math.min(a[0], b[0]) || cx > Math.max(a[0], b[0])) continue;
        if (a[0] === b[0]) {
          yMin = Math.min(yMin, a[1], b[1]);
          yMax = Math.max(yMax, a[1], b[1]);
        } else {
          var y = a[1] + (b[1] - a[1]) * (cx - a[0]) / (b[0] - a[0]);
          yMin = Math.min(yMin, y);
          yMax = Math.max(yMax, y);
        }
      }
      var top = Math.ceil(yMin - PIXEL_CENTRE);
      var bottom = Math.floor(yMax - PIXEL_CENTRE);
      if (bottom >= top) ctx.fillRect(x, top, 1, bottom - top + 1);
    }
  }

  function fillFace(ctx, ax, ay, face, color) {
    fillPoly(ctx, face.map(function (p) { return toScreen(ax, ay, p); }), color);
  }

  function colorKeys(canvas) {
    var ctx = P.context(canvas);
    var w = canvas.width;
    var d = ctx.getImageData(0, 0, w, canvas.height).data;
    return function (x, y) {
      if (x < 0 || y < 0 || x >= w || y >= canvas.height) return "";
      var i = (y * w + x) * 4;
      return d[i + 3] ? d[i] + "," + d[i + 1] + "," + d[i + 2] : "";
    };
  }

  // A filled pixel becomes outline where it borders the background, or where
  // the pixel to its right or below is a different colour.
  function outlinePass(canvas) {
    var key = colorKeys(canvas);
    var ctx = P.context(canvas);
    ctx.fillStyle = B.COLORS.outline;
    for (var y = 0; y < canvas.height; y++) {
      for (var x = 0; x < canvas.width; x++) {
        var c = key(x, y);
        if (!c) continue;
        var right = key(x + 1, y);
        var below = key(x, y + 1);
        var bare = !key(x - 1, y) || !right || !key(x, y - 1) || !below;
        var seam = (right && right !== c) || (below && below !== c);
        if (bare || seam) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // The filled pixels of `shape` that lie within `width` of the background,
  // drawn in `color` on a canvas of the same size.
  function ring(shape, width, color) {
    var key = colorKeys(shape);
    var w = shape.width;
    var h = shape.height;
    var level = [];
    var x;
    var y;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var bare = key(x, y) && (!key(x - 1, y) || !key(x + 1, y) || !key(x, y - 1) || !key(x, y + 1));
        level[y * w + x] = bare ? 1 : 0;
      }
    }
    for (var depth = 2; depth <= width; depth++) {
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          if (level[y * w + x] || !key(x, y)) continue;
          var near = (x > 0 && level[y * w + x - 1] === depth - 1) ||
            (x + 1 < w && level[y * w + x + 1] === depth - 1) ||
            (y > 0 && level[(y - 1) * w + x] === depth - 1) ||
            (y + 1 < h && level[(y + 1) * w + x] === depth - 1);
          if (near) level[y * w + x] = depth;
        }
      }
    }
    var out = P.canvas(w, h);
    var ctx = P.context(out);
    ctx.fillStyle = color;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) if (level[y * w + x]) ctx.fillRect(x, y, 1, 1);
    }
    return out;
  }

  // ---- Faces ---------------------------------------------------------------

  function diamond(z) {
    return [[-EDGE, -EDGE, z], [EDGE, -EDGE, z], [EDGE, EDGE, z], [-EDGE, EDGE, z]];
  }

  function leftFace(zBottom, zTop) {
    return [[-EDGE, EDGE, zBottom], [EDGE, EDGE, zBottom], [EDGE, EDGE, zTop], [-EDGE, EDGE, zTop]];
  }

  function rightFace(zBottom, zTop) {
    return [[EDGE, -EDGE, zBottom], [EDGE, EDGE, zBottom], [EDGE, EDGE, zTop], [EDGE, -EDGE, zTop]];
  }

  // Swapping u and v mirrors a face left to right on screen, and turns a
  // left-facing face into a right-facing one.
  function mirror(faces) {
    var kinds = { left: "right", right: "left" };
    return faces.map(function (f) {
      return {
        kind: kinds[f.kind] || f.kind,
        pts: f.pts.map(function (p) { return [p[1], p[0], p[2]]; })
      };
    });
  }

  // A wedge rising to BLOCK on the up-right side (`ur`), or on the down-right
  // side (`dr`), whose sloped top is seen edge-on. The mirrors give `ul`, `dl`.
  function rampFaces(viewFacing) {
    var faces;
    if (viewFacing === "ur" || viewFacing === "ul") {
      faces = [
        { kind: "right", pts: [[EDGE, EDGE, 0], [EDGE, -EDGE, 0], [EDGE, -EDGE, BLOCK]] },
        { kind: "slope", pts: [[-EDGE, EDGE, 0], [EDGE, EDGE, 0], [EDGE, -EDGE, BLOCK], [-EDGE, -EDGE, BLOCK]] }
      ];
    } else {
      faces = [
        { kind: "right", pts: rightFace(0, BLOCK) },
        { kind: "left", pts: [[-EDGE, EDGE, 0], [EDGE, EDGE, 0], [EDGE, EDGE, BLOCK]] }
      ];
    }
    return viewFacing === "ul" || viewFacing === "dl" ? mirror(faces) : faces;
  }

  function stairsFaces(viewFacing) {
    var rise = BLOCK / B.STEPS;
    var depth = (2 * EDGE) / B.STEPS;
    var faces = [];
    var i;
    if (viewFacing === "ur" || viewFacing === "ul") {
      for (i = 0; i < B.STEPS; i++) {
        var vn = EDGE - i * depth;
        var vf = vn - depth;
        faces.push({ kind: "right", pts: [[EDGE, vn, 0], [EDGE, vf, 0], [EDGE, vf, rise * (i + 1)], [EDGE, vn, rise * (i + 1)]] });
      }
      for (i = 0; i < B.STEPS; i++) {
        var near = EDGE - i * depth;
        var far = near - depth;
        var hi = rise * (i + 1);
        faces.push({ kind: "left", pts: [[-EDGE, near, rise * i], [EDGE, near, rise * i], [EDGE, near, hi], [-EDGE, near, hi]] });
        faces.push({ kind: "top", pts: [[-EDGE, near, hi], [EDGE, near, hi], [EDGE, far, hi], [-EDGE, far, hi]] });
      }
    } else {
      faces.push({ kind: "right", pts: rightFace(0, BLOCK) });
      for (i = 0; i < B.STEPS; i++) {
        var un = -EDGE + i * depth;
        var uf = un + depth;
        var h = rise * (i + 1);
        faces.push({ kind: "left", pts: [[un, EDGE, 0], [uf, EDGE, 0], [uf, EDGE, h], [un, EDGE, h]] });
      }
      for (i = 0; i < B.STEPS; i++) {
        var u0 = -EDGE + i * depth;
        var u1 = u0 + depth;
        var top = rise * (i + 1);
        faces.push({ kind: "top", pts: [[u0, -EDGE, top], [u0, EDGE, top], [u1, EDGE, top], [u1, -EDGE, top]] });
      }
    }
    return viewFacing === "ul" || viewFacing === "dl" ? mirror(faces) : faces;
  }

  function drawFaces(ctx, ax, ay, elev, faces) {
    faces.forEach(function (f) { fillFace(ctx, ax, ay, f.pts, faceColor(elev, f.kind)); });
  }

  function wedge(elev, faces) {
    var c = P.canvas(W, WEDGE_H);
    drawFaces(P.context(c), HALF_W, WEDGE_ANCHOR_Y, elev, faces);
    outlinePass(c);
    return P.sprite(c, HALF_W, WEDGE_ANCHOR_Y);
  }

  // ---- The column ----------------------------------------------------------

  // How far a pixel column sits inside the diamond: 0 at its widest, 7 at
  // its top and bottom points.
  function inset(x) {
    return Math.floor((x < HALF_W ? HALF_W - 1 - x : x - HALF_W) / 2);
  }

  function drawSeams(ctx, elev, blocks) {
    var left = P.shade(faceColor(elev, "left"), SEAM_SHADE);
    var right = P.shade(faceColor(elev, "right"), SEAM_SHADE);
    for (var k = 1; k < blocks; k++) {
      for (var x = 0; x < W; x++) {
        ctx.fillStyle = x < HALF_W ? left : right;
        ctx.fillRect(x, H - 1 - inset(x) + BLOCK * k, 1, 1);
      }
    }
  }

  function column(elev) {
    var blocks = elev - B.FLOOR;
    var c = P.canvas(W, H * (blocks + 1));
    var ctx = P.context(c);
    var bottom = -blocks * BLOCK;
    fillFace(ctx, HALF_W, HALF_H, leftFace(bottom, 0), faceColor(elev, "left"));
    fillFace(ctx, HALF_W, HALF_H, rightFace(bottom, 0), faceColor(elev, "right"));
    fillFace(ctx, HALF_W, HALF_H, diamond(0), topColor(elev));
    outlinePass(c);
    drawSeams(ctx, elev, blocks);
    return P.sprite(c, HALF_W, HALF_H);
  }

  function top(elev) {
    var c = P.canvas(W, H);
    fillFace(P.context(c), HALF_W, HALF_H, diamond(0), topColor(elev));
    outlinePass(c);
    return P.sprite(c, HALF_W, HALF_H);
  }

  // One block's faces alone: the single-block column below its top.
  function band(elev) {
    var whole = column(B.FLOOR + 1).canvas;
    var c = P.canvas(W, BLOCK + HALF_H);
    var ctx = P.context(c);
    ctx.drawImage(whole, 0, -HALF_H);
    for (var y = 0; y < HALF_H; y++) {
      var k = HALF_H - 1 - y;
      ctx.clearRect(HALF_W - 2 - 2 * k, y, 4 + 4 * k, 1);
    }
    return P.sprite(c, HALF_W, 0);
  }

  // ---- Overlays ------------------------------------------------------------

  function diamondRing(width, color) {
    var shape = P.canvas(W, H);
    fillFace(P.context(shape), HALF_W, HALF_H, diamond(0), color);
    return ring(shape, width, color);
  }

  function ghost() {
    var c = diamondRing(1, B.COLORS.outline);
    var ctx = P.context(c);
    var key = colorKeys(c);
    var x;
    var y;
    ctx.fillStyle = B.COLORS.ghost;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) if (key(x, y) && (x + y) % 2 === 0) ctx.fillRect(x, y, 1, 1);
    }
    var arms = [];
    for (var d = -PLUS_ARM; d <= PLUS_ARM; d++) arms.push([HALF_W + d, HALF_H], [HALF_W, HALF_H + d]);
    ctx.fillStyle = B.COLORS.outline;
    arms.forEach(function (p) { ctx.fillRect(p[0] - 1, p[1] - 1, 3, 3); });
    ctx.fillStyle = B.COLORS.ghost;
    arms.forEach(function (p) { ctx.fillRect(p[0], p[1], 1, 1); });
    return P.sprite(c, HALF_W, HALF_H);
  }

  function outline(shape, viewFacing, kind) {
    var width = kind === "select" ? SELECT_WIDTH : HOVER_WIDTH;
    var color = kind === "select" ? B.COLORS.select : B.COLORS.hover;
    var filled = P.canvas(W, WEDGE_H);
    var ctx = P.context(filled);
    var faces = shape === "ramp" ? rampFaces(viewFacing) : shape === "stairs" ? stairsFaces(viewFacing) : null;
    var sloped = faces && (viewFacing === "ur" || viewFacing === "ul");
    if (!faces) {
      fillFace(ctx, HALF_W, WEDGE_ANCHOR_Y, diamond(0), color);
    } else if (sloped) {
      fillFace(ctx, HALF_W, WEDGE_ANCHOR_Y, rampFaces(viewFacing)[1].pts, color);
    } else {
      faces.forEach(function (f) { fillFace(ctx, HALF_W, WEDGE_ANCHOR_Y, f.pts, color); });
    }
    return P.sprite(ring(filled, width, color), HALF_W, WEDGE_ANCHOR_Y);
  }

  function holdStep(step) {
    var c = P.canvas(W, H);
    var ctx = P.context(c);
    var rgb = P.parseHex(B.COLORS.hold);
    ctx.fillStyle = "rgba(" + rgb.join(",") + "," + HOLD_ALPHA + ")";
    var rows = Math.round(H * step / HOLD_STEPS);
    for (var y = H - rows; y < H; y++) {
      var k = y < HALF_H ? y : H - 1 - y;
      ctx.fillRect(HALF_W - 2 - 2 * k, y, 4 + 4 * k, 1);
    }
    return P.sprite(c, HALF_W, HALF_H);
  }

  function label(text) {
    var glyphs = text.split("").map(function (ch) {
      if (!FONT[ch]) throw new Error("no glyph for '" + ch + "'");
      return FONT[ch];
    });
    var width = CHIP_PAD * 2 + glyphs.length * GLYPH_W + (glyphs.length - 1) * GLYPH_GAP;
    var rows = [];
    for (var y = 0; y < GLYPH_H + CHIP_PAD * 2; y++) {
      var row = "";
      for (var x = 0; x < width; x++) {
        var gx = x - CHIP_PAD;
        var gy = y - CHIP_PAD;
        var g = Math.floor(gx / (GLYPH_W + GLYPH_GAP));
        var col = gx - g * (GLYPH_W + GLYPH_GAP);
        var lit = gy >= 0 && gy < GLYPH_H && gx >= 0 && g < glyphs.length && col < GLYPH_W &&
          glyphs[g][gy].charAt(col) === "#";
        row += lit ? "t" : "c";
      }
      rows.push(row);
    }
    return P.fromRows(rows, { c: B.COLORS.label, t: B.COLORS.labelText });
  }

  var memoHold = P.memo(holdStep);

  B.tiles = {
    top: P.memo(top),
    band: P.memo(band),
    column: P.memo(column),
    ramp: P.memo(function (elev, viewFacing) { return wedge(elev, rampFaces(viewFacing)); }),
    stairs: P.memo(function (elev, viewFacing) { return wedge(elev, stairsFaces(viewFacing)); }),
    ghost: P.memo(ghost),
    outline: P.memo(outline),
    holdMask: function (progress) {
      return memoHold(Math.round(B.clamp(progress, 0, 1) * HOLD_STEPS));
    },
    label: P.memo(label)
  };
})();
