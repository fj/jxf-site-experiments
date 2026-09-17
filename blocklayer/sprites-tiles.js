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
  var ROW_STEP = 2;                      // px a diamond row grows on each side: the 2:1 slope
  var PIXEL_CENTRE = 0.5;
  var SLOPE_SHADE = -0.08;
  var SEAM_SHADE = -0.18;                // between two stacked blocks
  var WEDGE_H = H + BLOCK;
  var WEDGE_ANCHOR_Y = HALF_H + BLOCK;
  var HOLD_ALPHA = 0.7;
  var HOLD_STEPS = 16;
  var KINDS = {                          // the highlight ringing a tile, by kind
    select: { width: 2, color: B.COLORS.select },
    hover: { width: 1, color: B.COLORS.hover }
  };
  var PLUS_ARM = 2;                      // the ghost's "+" reaches this far from its centre
  var CHIP_PAD = 1;                      // px of chip around a label's glyphs
  var GLYPH_H = 5;
  var GLYPH_GAP = 1;
  var GLYPH_INK = "#";                   // a lit pixel in FONT; anything else is chip
  var CHIP = "c";
  var TEXT = "t";

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
    if (kind === "left") return P.shade(color, B.FACE_SHADES.left);
    if (kind === "right") return P.shade(color, B.FACE_SHADES.right);
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

  // Each pixel of a canvas as one packed RGBA int, so 0 is the background and
  // a key doubles as "filled". Off the canvas reads as background.
  function pixelKeys(canvas) {
    var w = canvas.width;
    var h = canvas.height;
    var packed = new Uint32Array(P.context(canvas).getImageData(0, 0, w, h).data.buffer);
    return function (x, y) {
      return x < 0 || y < 0 || x >= w || y >= h ? 0 : packed[y * w + x];
    };
  }

  // Whether a pixel touches the background on any of its four sides.
  function bare(key, x, y) {
    return !key(x - 1, y) || !key(x + 1, y) || !key(x, y - 1) || !key(x, y + 1);
  }

  // A filled pixel becomes outline where it borders the background, or where
  // the pixel to its right or below is a different colour.
  function outlinePass(canvas) {
    var key = pixelKeys(canvas);
    var ctx = P.context(canvas);
    ctx.fillStyle = B.COLORS.outline;
    for (var y = 0; y < canvas.height; y++) {
      for (var x = 0; x < canvas.width; x++) {
        var c = key(x, y);
        if (!c) continue;
        var right = key(x + 1, y);
        var below = key(x, y + 1);
        var seam = (right && right !== c) || (below && below !== c);
        if (seam || bare(key, x, y)) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // The filled pixels of `shape` that lie within `width` of the background,
  // drawn in `color` on a canvas of the same size.
  function ring(shape, width, color) {
    var key = pixelKeys(shape);
    var w = shape.width;
    var h = shape.height;
    var level = [];
    var x;
    var y;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        level[y * w + x] = key(x, y) && bare(key, x, y) ? 1 : 0;
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

  // Swapping u and v mirrors a polygon left to right on screen...
  function mirrorPts(pts) {
    return pts.map(function (p) { return [p[1], p[0], p[2]]; });
  }

  // ...and turns a left-facing face into a right-facing one.
  function mirror(faces) {
    var kinds = { left: "right", right: "left" };
    return faces.map(function (f) {
      return { kind: kinds[f.kind] || f.kind, pts: mirrorPts(f.pts) };
    });
  }

  function polygons(faces) {
    return faces.map(function (f) { return f.pts; });
  }

  // A wedge: its faces, and the polygons a highlight around it fills (its
  // envelope), mirrored when the facing puts the high edge on the left.
  function wedgeShape(viewFacing, faces, envelope) {
    if (!onLeft(viewFacing)) return { faces: faces, envelope: envelope };
    return { faces: mirror(faces), envelope: envelope.map(mirrorPts) };
  }

  // A view facing names the screen side the high edge is on: `u` or `d` for
  // up or down (up shows the slope; down shows it edge-on), then `r` or `l`.
  function slopeSeen(viewFacing) {
    return viewFacing.charAt(0) === "u";
  }

  function onLeft(viewFacing) {
    return viewFacing.charAt(1) === "l";
  }

  // The slope of a ramp whose high edge is up-right: from the foot at +v to
  // the top at -v.
  var SLOPE = [[-EDGE, EDGE, 0], [EDGE, EDGE, 0], [EDGE, -EDGE, BLOCK], [-EDGE, -EDGE, BLOCK]];

  // A wedge rising to BLOCK on the up-right side (`ur`), or on the down-right
  // side (`dr`), whose sloped top is seen edge-on. The mirrors give `ul`, `dl`.
  // The slope alone envelops the first; the edge-on wedge is its two faces.
  function rampShape(viewFacing) {
    if (slopeSeen(viewFacing)) {
      return wedgeShape(viewFacing, [
        { kind: "right", pts: [[EDGE, EDGE, 0], [EDGE, -EDGE, 0], [EDGE, -EDGE, BLOCK]] },
        { kind: "slope", pts: SLOPE }
      ], [SLOPE]);
    }
    var faces = [
      { kind: "right", pts: rightFace(0, BLOCK) },
      { kind: "left", pts: [[-EDGE, EDGE, 0], [EDGE, EDGE, 0], [EDGE, EDGE, BLOCK]] }
    ];
    return wedgeShape(viewFacing, faces, polygons(faces));
  }

  // Tread i of a flight up the slope, from the foot: its near and far edge
  // along the run and the heights it rises between.
  function tread(i) {
    var rise = BLOCK / B.STEPS;
    var depth = (2 * EDGE) / B.STEPS;
    var near = EDGE - i * depth;
    return { near: near, far: near - depth, lo: rise * i, hi: rise * (i + 1) };
  }

  // Seen edge-on the flight runs along u from -EDGE, so each tread's edges
  // negate. The ramp's slope envelops the flight; edge-on, its faces do.
  function stairsShape(viewFacing) {
    var faces = [];
    var i;
    var t;
    if (slopeSeen(viewFacing)) {
      for (i = 0; i < B.STEPS; i++) {
        t = tread(i);
        faces.push({ kind: "right", pts: [
          [EDGE, t.near, 0], [EDGE, t.far, 0], [EDGE, t.far, t.hi], [EDGE, t.near, t.hi]
        ] });
      }
      for (i = 0; i < B.STEPS; i++) {
        t = tread(i);
        faces.push({ kind: "left", pts: [
          [-EDGE, t.near, t.lo], [EDGE, t.near, t.lo], [EDGE, t.near, t.hi], [-EDGE, t.near, t.hi]
        ] });
        faces.push({ kind: "top", pts: [
          [-EDGE, t.near, t.hi], [EDGE, t.near, t.hi], [EDGE, t.far, t.hi], [-EDGE, t.far, t.hi]
        ] });
      }
    } else {
      faces.push({ kind: "right", pts: rightFace(0, BLOCK) });
      for (i = 0; i < B.STEPS; i++) {
        t = tread(i);
        faces.push({ kind: "left", pts: [
          [-t.near, EDGE, 0], [-t.far, EDGE, 0], [-t.far, EDGE, t.hi], [-t.near, EDGE, t.hi]
        ] });
      }
      for (i = 0; i < B.STEPS; i++) {
        t = tread(i);
        faces.push({ kind: "top", pts: [
          [-t.near, -EDGE, t.hi], [-t.near, EDGE, t.hi], [-t.far, EDGE, t.hi], [-t.far, -EDGE, t.hi]
        ] });
      }
    }
    return wedgeShape(viewFacing, faces, slopeSeen(viewFacing) ? [SLOPE] : polygons(faces));
  }

  function drawFaces(ctx, ax, ay, elev, faces) {
    faces.forEach(function (f) { fillFace(ctx, ax, ay, f.pts, faceColor(elev, f.kind)); });
  }

  function wedge(elev, shape) {
    var c = P.canvas(W, WEDGE_H);
    drawFaces(P.context(c), HALF_W, WEDGE_ANCHOR_Y, elev, shape.faces);
    outlinePass(c);
    return P.sprite(c, HALF_W, WEDGE_ANCHOR_Y);
  }

  // ---- The column ----------------------------------------------------------

  // Pixel row y of the top diamond: where it starts and how wide it is.
  function diamondRow(y) {
    var k = y < HALF_H ? y : H - 1 - y;
    return { x: HALF_W - ROW_STEP * (k + 1), w: 2 * ROW_STEP * (k + 1) };
  }

  // Between two stacked blocks, a darker line along the diamond's lower edge:
  // the ROW_STEP pixels at each end of a row that the row below leaves bare.
  function drawSeams(ctx, elev, blocks) {
    var left = P.shade(faceColor(elev, "left"), SEAM_SHADE);
    var right = P.shade(faceColor(elev, "right"), SEAM_SHADE);
    for (var k = 1; k < blocks; k++) {
      for (var y = HALF_H; y < H; y++) {
        var row = diamondRow(y);
        ctx.fillStyle = left;
        ctx.fillRect(row.x, y + BLOCK * k, ROW_STEP, 1);
        ctx.fillStyle = right;
        ctx.fillRect(row.x + row.w - ROW_STEP, y + BLOCK * k, ROW_STEP, 1);
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

  // ---- Overlays ------------------------------------------------------------

  function diamondRing(width, color) {
    var shape = P.canvas(W, H);
    fillFace(P.context(shape), HALF_W, HALF_H, diamond(0), color);
    return ring(shape, width, color);
  }

  function ghost() {
    var c = diamondRing(1, B.COLORS.outline);
    var ctx = P.context(c);
    var key = pixelKeys(c);
    var x;
    var y;
    ctx.fillStyle = B.COLORS.ghost;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) if (key(x, y) && (x + y) % 2 === 0) ctx.fillRect(x, y, 1, 1);
    }
    var arms = [];
    for (var d = -PLUS_ARM; d <= PLUS_ARM; d++) {
      arms.push([HALF_W + d, HALF_H], [HALF_W, HALF_H + d]);
    }
    ctx.fillStyle = B.COLORS.outline;
    arms.forEach(function (p) { ctx.fillRect(p[0] - 1, p[1] - 1, 3, 3); });
    ctx.fillStyle = B.COLORS.ghost;
    arms.forEach(function (p) { ctx.fillRect(p[0], p[1], 1, 1); });
    return P.sprite(c, HALF_W, HALF_H);
  }

  function envelope(shape, viewFacing) {
    if (shape === "ramp") return rampShape(viewFacing).envelope;
    if (shape === "stairs") return stairsShape(viewFacing).envelope;
    return [diamond(0)];
  }

  // The highlight around a tile: its envelope filled, then only the ring
  // within the kind's width of the background kept.
  function outline(shape, viewFacing, kind) {
    var style = KINDS[kind];
    var filled = P.canvas(W, WEDGE_H);
    var ctx = P.context(filled);
    envelope(shape, viewFacing).forEach(function (pts) {
      fillFace(ctx, HALF_W, WEDGE_ANCHOR_Y, pts, style.color);
    });
    return P.sprite(ring(filled, style.width, style.color), HALF_W, WEDGE_ANCHOR_Y);
  }

  function holdStep(step) {
    var c = P.canvas(W, H);
    var ctx = P.context(c);
    var rgb = P.parseHex(B.COLORS.hold);
    ctx.fillStyle = "rgba(" + rgb.join(",") + "," + HOLD_ALPHA + ")";
    var rows = Math.round(H * step / HOLD_STEPS);
    for (var y = H - rows; y < H; y++) {
      var row = diamondRow(y);
      ctx.fillRect(row.x, y, row.w, 1);
    }
    return P.sprite(c, HALF_W, HALF_H);
  }

  function repeat(ch, n) {
    var s = "";
    while (s.length < n) s += ch;
    return s;
  }

  function chipChar(ch) {
    return ch === GLYPH_INK ? TEXT : CHIP;
  }

  // The glyphs side by side with a gap between, on a chip that pads them.
  function label(text) {
    var glyphs = text.split("").map(function (ch) {
      if (!FONT[ch]) throw new Error("no glyph for '" + ch + "'");
      return FONT[ch];
    });
    var pad = repeat(CHIP, CHIP_PAD);
    var gap = repeat(CHIP, GLYPH_GAP);
    var rows = [];
    for (var y = 0; y < GLYPH_H; y++) {
      var art = glyphs.map(function (g) { return g[y]; }).join(gap);
      rows.push(pad + art.replace(/./g, chipChar) + pad);
    }
    var blank = repeat(CHIP, rows[0].length);
    for (var i = 0; i < CHIP_PAD; i++) {
      rows.unshift(blank);
      rows.push(blank);
    }
    var palette = {};
    palette[CHIP] = B.COLORS.label;
    palette[TEXT] = B.COLORS.labelText;
    return P.fromRows(rows, palette);
  }

  var memoHold = P.memo(holdStep);

  B.tiles = {
    column: P.memo(column),
    ramp: P.memo(function (elev, viewFacing) { return wedge(elev, rampShape(viewFacing)); }),
    stairs: P.memo(function (elev, viewFacing) { return wedge(elev, stairsShape(viewFacing)); }),
    ghost: P.memo(ghost),
    outline: P.memo(outline),
    holdMask: function (progress) {
      return memoHold(Math.round(B.clamp(progress, 0, 1) * HOLD_STEPS));
    },
    label: P.memo(label)
  };
})();
