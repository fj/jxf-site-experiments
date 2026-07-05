/*
 * Quote Card — text measurement and layout.
 *
 * Turns styled runs into wrapped, positioned lines and finds the largest font
 * size that fits a box. Text is measured once per (style, word) at a 100px
 * reference size and scaled linearly from there, so the auto-fit binary search
 * and the per-keystroke re-render stay cheap even at large output resolutions.
 */
(function () {
  "use strict";

  var Q = window.QCard = window.QCard || {};

  var MEASURE_SIZE = 100; // reference size for cached text measurements
  var CHIP_PAD = 13;      // horizontal padding inside a code chip, at MEASURE_SIZE

  var ctx = document.createElement("canvas").getContext("2d");
  var cache = {};

  function styleKeyOf(frag) {
    return (frag.code ? "c" : "") + (frag.bold ? "b" : "") + (frag.italic ? "i" : "");
  }

  function fontString(frag, size, family) {
    var fam = frag.code ? Q.CODE_FAMILY : family;
    return (frag.italic ? "italic " : "") + (frag.bold ? "700 " : "400 ") + size + "px " + fam;
  }

  // Width of a fragment at MEASURE_SIZE (scaled linearly at draw time). Code
  // fragments include their chip padding so wrapping accounts for it.
  function refWidth(frag, family) {
    var key = styleKeyOf(frag) + "|" + family + "|" + frag.text;
    var w = cache[key];
    if (w == null) {
      ctx.font = fontString(frag, MEASURE_SIZE, family);
      w = ctx.measureText(frag.text).width;
      cache[key] = w;
    }
    return w + (frag.code ? 2 * CHIP_PAD : 0);
  }

  // Groups runs into "words": unbreakable sequences of styled fragments with
  // reference widths, separated by space tokens.
  function wordsFromRuns(runs, family) {
    var words = [], current = null;
    runs.forEach(function (run) {
      run.text.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          if (current) { words.push(current); current = null; }
          words.push({ space: true, ref: refWidth({ text: " ", bold: run.bold, italic: run.italic, code: false }, family) });
          return;
        }
        var frag = { text: part, bold: run.bold, italic: run.italic, strike: run.strike, code: run.code, ref: refWidth({ text: part, bold: run.bold, italic: run.italic, code: run.code }, family) };
        if (!current) current = { space: false, frags: [], ref: 0 };
        current.frags.push(frag);
        current.ref += frag.ref;
      });
    });
    if (current) words.push(current);
    return words;
  }

  // Greedy word wrap of one hard line at `size`, honoring maxWidth. Word gaps
  // become explicit {gap, w} fragments so drawn width always equals measured.
  function wrap(words, size, maxWidth) {
    var k = size / MEASURE_SIZE;
    var lines = [], frags = [], width = 0, pendingSpace = 0;
    function commit() {
      lines.push({ frags: frags, width: width });
      frags = []; width = 0; pendingSpace = 0;
    }
    words.forEach(function (w) {
      if (w.space) { if (frags.length) pendingSpace += w.ref * k; return; }
      var ww = w.ref * k;
      if (frags.length && width + pendingSpace + ww > maxWidth) commit();
      if (pendingSpace) { frags.push({ gap: true, w: pendingSpace }); width += pendingSpace; }
      pendingSpace = 0;
      w.frags.forEach(function (f) { frags.push(f); });
      width += ww;
    });
    commit();
    return lines;
  }

  // Wraps a whole document at `size` and returns drawable lines plus total
  // extent. doc: {hardLines: [{words, para}], attrWords}. opts: {lineHeight,
  // attrSize(bodySize) → attribution px}. Lines carry their own size and an
  // `attr` flag so body and attribution can be styled independently.
  function layoutDoc(doc, size, maxWidth, opts) {
    var lh = opts.lineHeight;
    var out = [], maxW = 0, y = 0, lastPara = -1;
    doc.hardLines.forEach(function (hl) {
      if (!hl.words.length) return;
      if (lastPara !== -1 && hl.para !== lastPara) y += 0.55 * size * lh; // paragraph gap
      lastPara = hl.para;
      wrap(hl.words, size, maxWidth).forEach(function (line) {
        out.push({ frags: line.frags, width: line.width, size: size, top: y, attr: false });
        y += size * lh;
        if (line.width > maxW) maxW = line.width;
      });
    });
    if (doc.attrWords) {
      var asize = opts.attrSize(size);
      if (out.length) y += 0.9 * asize * lh;
      wrap(doc.attrWords, asize, maxWidth).forEach(function (line) {
        out.push({ frags: line.frags, width: line.width, size: asize, top: y, attr: true });
        y += asize * lh;
        if (line.width > maxW) maxW = line.width;
      });
    }
    return { lines: out, width: maxW, height: y };
  }

  // Largest size whose layout fits the box (auto-size mode). Width overflow
  // only happens when a single word can't wrap — treat as "doesn't fit" so
  // long words shrink the text instead of escaping the card.
  function fit(doc, maxWidth, maxHeight, opts) {
    var lo = 8, hi = Math.max(12, Math.floor(maxHeight));
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      var L = layoutDoc(doc, mid, maxWidth, opts);
      if (L.height <= maxHeight && L.width <= maxWidth + 0.5) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  Q.layout = {
    MEASURE_SIZE: MEASURE_SIZE,
    CHIP_PAD: CHIP_PAD,
    fontString: fontString,
    wordsFromRuns: wordsFromRuns,
    layoutDoc: layoutDoc,
    fit: fit,
    clearCache: function () { cache = {}; }
  };
})();
