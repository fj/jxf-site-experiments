/*
 * Quote Card — small CSS toolkit.
 *
 * Generic parsing helpers with no knowledge of the card: declaration blocks,
 * numeric values, colors (normalized by letting a canvas parse them), and 2D
 * transform lists composed into an affine matrix.
 */
(function () {
  "use strict";

  var Q = window.QCard = window.QCard || {};
  var ctx = document.createElement("canvas").getContext("2d");

  // "prop: value; ..." → {decls: [{prop, value}], errors: [...]}. Comments are
  // stripped; anything that isn't a declaration is a syntax error.
  function parseDecls(text) {
    var errors = [], decls = [];
    var clean = text.replace(/\/\*[\s\S]*?\*\//g, " ");
    clean.split(";").forEach(function (chunk) {
      var t = chunk.trim();
      if (!t) return;
      var m = /^(--[\w-]+|[a-zA-Z-]+)\s*:\s*([\s\S]+)$/.exec(t);
      if (!m) {
        var short = t.length > 40 ? t.slice(0, 40) + "…" : t;
        errors.push("“" + short + "” isn’t a “property: value” declaration");
        return;
      }
      decls.push({ prop: m[1].toLowerCase(), value: m[2].replace(/\s+/g, " ").trim() });
    });
    return { decls: decls, errors: errors };
  }

  // Splits a value on whitespace, but not inside parens (rgba colors, etc.).
  function splitTokens(v) {
    var out = [], cur = "", depth = 0;
    for (var i = 0; i < v.length; i++) {
      var ch = v.charAt(i);
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (/\s/.test(ch) && depth === 0) { if (cur) { out.push(cur); cur = ""; } }
      else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  function px(v) { var m = /^(-?\d+(?:\.\d+)?)px$/i.exec(v.trim()); return m ? parseFloat(m[1]) : null; }
  function pct(v) { var m = /^(-?\d+(?:\.\d+)?)%$/.exec(v.trim()); return m ? parseFloat(m[1]) : null; }
  function num(v) { var m = /^(-?\d+(?:\.\d+)?)$/.exec(v.trim()); return m ? parseFloat(m[1]) : null; }

  // Parses any CSS color by letting the canvas do it (it normalizes to
  // "#rrggbb" or "rgba(...)"). Returns {css, hex, alpha} or null. hex/alpha
  // are null for exotic forms the canvas accepts but we can't decompose.
  // Assigning an invalid color leaves fillStyle unchanged, so parse against
  // two sentinels to detect that.
  function color(value) {
    ctx.fillStyle = "#000001";
    ctx.fillStyle = value;
    var got = ctx.fillStyle;
    ctx.fillStyle = "#fffffe";
    ctx.fillStyle = value;
    if (got !== ctx.fillStyle) return null;
    var m = /^#([0-9a-f]{6})$/.exec(got);
    if (m) return { css: got, hex: got, alpha: 1 };
    m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(got);
    if (m) {
      var h = function (v) { return ("0" + (+v).toString(16)).slice(-2); };
      return { css: got, hex: "#" + h(m[1]) + h(m[2]) + h(m[3]), alpha: parseFloat(m[4]) };
    }
    return { css: got, hex: null, alpha: null };
  }

  function rgba(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    var n = m ? parseInt(m[1], 16) : 0;
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + +a.toFixed(2) + ")";
  }

  function isDark(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return false;
    var n = parseInt(m[1], 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 140;
  }

  // ---- Transforms -----------------------------------------------------------
  // Parses a CSS transform list into one affine matrix [a, b, c, d, e, f].
  // Returns {ok: true, matrix} (matrix null for "none") or {ok: false}.
  // Lengths are px (they scale with the card like every other design unit).
  function mul(A, B) {
    return [
      A[0] * B[0] + A[2] * B[1],
      A[1] * B[0] + A[3] * B[1],
      A[0] * B[2] + A[2] * B[3],
      A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4],
      A[1] * B[4] + A[3] * B[5] + A[5]
    ];
  }
  function angle(v) {
    if (v === "0") return 0;
    var m = /^(-?\d+(?:\.\d+)?)(deg|rad|grad|turn)$/i.exec(v.trim());
    if (!m) return null;
    var n = parseFloat(m[1]);
    switch (m[2].toLowerCase()) {
      case "deg": return n * Math.PI / 180;
      case "rad": return n;
      case "grad": return n * Math.PI / 200;
      case "turn": return n * 2 * Math.PI;
    }
    return null;
  }
  function length(v) {
    if (v === "0") return 0;
    return px(v);
  }
  function fnMatrix(fn, args) {
    var a, b;
    switch (fn) {
      case "matrix":
        if (args.length !== 6) return null;
        var nums = args.map(num);
        return nums.indexOf(null) === -1 ? nums : null;
      case "translate":
        a = length(args[0]); b = args.length > 1 ? length(args[1]) : 0;
        return a == null || b == null ? null : [1, 0, 0, 1, a, b];
      case "translatex":
        a = length(args[0]);
        return a == null ? null : [1, 0, 0, 1, a, 0];
      case "translatey":
        a = length(args[0]);
        return a == null ? null : [1, 0, 0, 1, 0, a];
      case "scale":
        a = num(args[0]); b = args.length > 1 ? num(args[1]) : a;
        return a == null || b == null ? null : [a, 0, 0, b, 0, 0];
      case "rotate":
        a = angle(args[0]);
        return a == null ? null : [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
      case "skewx":
        a = angle(args[0]);
        return a == null ? null : [1, 0, Math.tan(a), 1, 0, 0];
      case "skewy":
        a = angle(args[0]);
        return a == null ? null : [1, Math.tan(a), 0, 1, 0, 0];
    }
    return null;
  }
  function parseTransform(value) {
    var v = value.trim();
    if (/^none$/i.test(v)) return { ok: true, matrix: null };
    if (v.replace(/[a-zA-Z]+\([^()]*\)/g, "").trim()) return { ok: false };
    var re = /([a-zA-Z]+)\(([^()]*)\)/g;
    var m = [1, 0, 0, 1, 0, 0], match, any = false;
    while ((match = re.exec(v))) {
      any = true;
      var args = match[2].split(",").map(function (s) { return s.trim(); });
      var t = fnMatrix(match[1].toLowerCase(), args);
      if (!t) return { ok: false };
      m = mul(m, t);
    }
    return any ? { ok: true, matrix: m } : { ok: false };
  }

  Q.css = {
    parseDecls: parseDecls,
    splitTokens: splitTokens,
    px: px,
    pct: pct,
    num: num,
    color: color,
    rgba: rgba,
    isDark: isDark,
    parseTransform: parseTransform
  };
})();
