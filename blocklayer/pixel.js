/*
 * Blocklayer — pixel-art plumbing. A sprite is a canvas plus the anchor it is
 * drawn by; this module makes them, from rows of characters or by hand, and
 * keeps every pixel on the integer grid.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var HEX_RADIX = 16;
  var CHANNEL_MAX = 255;
  var TRANSPARENT = ".";

  function canvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function context(c) {
    var ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  function sprite(c, ox, oy) {
    return { canvas: c, ox: ox, oy: oy };
  }

  function fromRows(rows, palette, ox, oy) {
    var h = rows.length;
    var w = rows[0].length;
    var c = canvas(w, h);
    var ctx = context(c);
    rows.forEach(function (row, y) {
      if (row.length !== w) throw new Error("pixel rows differ in width");
      for (var x = 0; x < w; x++) {
        var ch = row.charAt(x);
        if (ch === TRANSPARENT || ch === " ") continue;
        var color = palette[ch];
        if (!color) throw new Error("no colour for '" + ch + "'");
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    if (ox === undefined) ox = Math.floor(w / 2);
    if (oy === undefined) oy = Math.floor(h / 2);
    return sprite(c, ox, oy);
  }

  function draw(ctx, s, x, y) {
    ctx.drawImage(s.canvas, Math.round(x - s.ox), Math.round(y - s.oy));
  }

  function parseHex(hex) {
    var n = parseInt(hex.slice(1), HEX_RADIX);
    return [(n >> 16) & CHANNEL_MAX, (n >> 8) & CHANNEL_MAX, n & CHANNEL_MAX];
  }

  function toHex(rgb) {
    return "#" + rgb.map(function (v) {
      var s = Math.round(B.clamp(v, 0, CHANNEL_MAX)).toString(HEX_RADIX);
      return s.length < 2 ? "0" + s : s;
    }).join("");
  }

  // amount in [-1, 1]: negative mixes toward black, positive toward white.
  function shade(hex, amount) {
    var target = amount < 0 ? 0 : CHANNEL_MAX;
    var t = Math.abs(amount);
    return toHex(parseHex(hex).map(function (v) { return v + (target - v) * t; }));
  }

  // Encoded once per sprite; a sprite's pixels never change after it is made.
  function dataUrl(s) {
    return s.url || (s.url = s.canvas.toDataURL());
  }

  // The sprite as a CSS image that scales without smoothing. A mask-image is
  // smoothed whatever the element's image-rendering says; the PNG inside an
  // SVG that asks for pixelated rendering is not, at any device pixel ratio.
  function crispUrl(s) {
    if (!s.crispUrl) {
      var size = "width=\"" + s.canvas.width + "\" height=\"" + s.canvas.height + "\"";
      var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" " + size + ">" +
        "<image " + size + " style=\"image-rendering:pixelated\" href=\"" + dataUrl(s) + "\"/>" +
        "</svg>";
      s.crispUrl = "data:image/svg+xml," + encodeURIComponent(svg);
    }
    return s.crispUrl;
  }

  // Keyed by the arguments' string forms, which every sprite function's
  // primitive arguments have; on the per-tile hot path, so no serialising.
  function memo(fn) {
    var cache = {};
    return function () {
      var key = Array.prototype.join.call(arguments, ",");
      if (!(key in cache)) cache[key] = fn.apply(null, arguments);
      return cache[key];
    };
  }

  B.pixel = {
    canvas: canvas,
    context: context,
    sprite: sprite,
    fromRows: fromRows,
    draw: draw,
    parseHex: parseHex,
    toHex: toHex,
    shade: shade,
    dataUrl: dataUrl,
    crispUrl: crispUrl,
    memo: memo
  };
})();
