/*
 * Quote Card — Markdown parsing.
 *
 * A deliberately small dialect: inline **bold**, *italic*, `code`, ~~strike~~
 * with backslash escapes. (Paragraph and hard-line-break splitting happens in
 * app.js, which owns the document model.) That's all a quote card needs.
 */
(function () {
  "use strict";

  var Q = window.QCard = window.QCard || {};

  // "text with **markup**" → [{text, bold, italic, strike, code}, ...]
  function parseInline(text) {
    var runs = [];
    var bold = false, italic = false, strike = false;
    var buf = "", i = 0;
    function flush() {
      if (buf) { runs.push({ text: buf, bold: bold, italic: italic, strike: strike, code: false }); buf = ""; }
    }
    while (i < text.length) {
      var ch = text.charAt(i);
      if (ch === "\\" && i + 1 < text.length) { buf += text.charAt(i + 1); i += 2; continue; }
      if (ch === "`") {
        var end = text.indexOf("`", i + 1);
        if (end > i) {
          flush();
          runs.push({ text: text.slice(i + 1, end), bold: bold, italic: italic, strike: strike, code: true });
          i = end + 1; continue;
        }
      }
      if (text.lastIndexOf("**", i) === i || text.lastIndexOf("__", i) === i) { flush(); bold = !bold; i += 2; continue; }
      if (text.lastIndexOf("~~", i) === i) { flush(); strike = !strike; i += 2; continue; }
      if (ch === "*" || ch === "_") { flush(); italic = !italic; i += 1; continue; }
      buf += ch; i += 1;
    }
    flush();
    return runs;
  }

  Q.markdown = { parseInline: parseInline };
})();
