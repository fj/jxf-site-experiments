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
    return sprite(c, ox === undefined ? Math.floor(w / 2) : ox, oy === undefined ? Math.floor(h / 2) : oy);
  }

  function draw(ctx, s, x, y) {
    ctx.drawImage(s.canvas, Math.round(x - s.ox), Math.round(y - s.oy));
  }

  function scaled(s, factor) {
    var c = canvas(s.canvas.width * factor, s.canvas.height * factor);
    var ctx = context(c);
    ctx.drawImage(s.canvas, 0, 0, c.width, c.height);
    return sprite(c, s.ox * factor, s.oy * factor);
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

  function dataUrl(s) {
    return s.canvas.toDataURL();
  }

  function memo(fn) {
    var cache = {};
    return function () {
      var args = Array.prototype.slice.call(arguments);
      var key = JSON.stringify(args);
      if (!(key in cache)) cache[key] = fn.apply(null, args);
      return cache[key];
    };
  }

  B.pixel = {
    canvas: canvas,
    context: context,
    sprite: sprite,
    fromRows: fromRows,
    draw: draw,
    scaled: scaled,
    parseHex: parseHex,
    toHex: toHex,
    shade: shade,
    dataUrl: dataUrl,
    memo: memo
  };
})();
