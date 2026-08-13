/*
 * Quote Card — shared configuration.
 *
 * The fonts the basic controls offer, the output-size presets, the border
 * styles, and the numeric ranges the sliders (and control clamping) use.
 * Everything hangs off the window.QCard namespace; the manifest loads these
 * files in dependency order and app.js wires them together.
 */
(function () {
  "use strict";

  var Q = window.QCard = window.QCard || {};

  // Sliders are expressed in px at a 1200px-wide reference card and scaled by
  // (output width / 1200), so a card re-rendered at @2x looks identical.
  Q.REF_W = 1200;

  // Every preset face is a Google Fonts webfont, loaded at runtime (ExpFonts
  // injects FONTS_CSS_URL and prefetches every variant before the UI is
  // built), so the canvas renders identically everywhere; system faces in each
  // stack are fallbacks only. Gelasio, Arimo, and Tinos stand in for Georgia,
  // Helvetica, and Times (their metric-compatible Google equivalents);
  // EB Garamond takes Palatino's old-style-serif slot.
  Q.FONTS = [
    { key: "fira-code", label: "Fira Code (mono)", family: '"Fira Code", monospace' },
    { key: "fira-sans", label: "Fira Sans (sans)", family: '"Fira Sans", sans-serif' },
    { key: "arimo", label: "Arimo (sans)", family: 'Arimo, "Helvetica Neue", Helvetica, Arial, sans-serif' },
    { key: "gelasio", label: "Gelasio (serif)", family: 'Gelasio, Georgia, serif' },
    { key: "eb-garamond", label: "EB Garamond (serif)", family: '"EB Garamond", "Palatino Linotype", Palatino, serif' },
    { key: "pt-serif", label: "PT Serif (serif)", family: '"PT Serif", serif' },
    { key: "tinos", label: "Tinos (serif)", family: 'Tinos, "Times New Roman", Times, serif' }
  ];

  // Inline `code` always renders in the mono face, whatever the body font is.
  Q.CODE_FAMILY = '"Fira Code", monospace';

  // One Google Fonts stylesheet covering every preset face above: regular,
  // bold, and (except mono Fira Code, which has none) italics of both, since
  // the canvas draws all four. Fira Code, Arimo, Gelasio, and EB Garamond are
  // variable fonts, so their 400–700 range is a single file per style.
  Q.FONTS_CSS_URL = "https://fonts.googleapis.com/css2" +
    "?family=Fira+Code:wght@400..700" +
    "&family=Fira+Sans:ital,wght@0,400;0,700;1,400;1,700" +
    "&family=Arimo:ital,wght@0,400..700;1,400..700" +
    "&family=Gelasio:ital,wght@0,400..700;1,400..700" +
    "&family=EB+Garamond:ital,wght@0,400..700;1,400..700" +
    "&family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700" +
    "&family=Tinos:ital,wght@0,400;0,700;1,400;1,700" +
    "&display=swap";

  Q.familyOf = function (key) {
    for (var i = 0; i < Q.FONTS.length; i++) if (Q.FONTS[i].key === key) return Q.FONTS[i].family;
    return Q.FONTS[0].family;
  };

  function firstFamily(css) {
    return String(css).split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
  }

  // The dropdown key for a CSS font-family value, or null if it isn't one of
  // the preset fonts (compared on the stack's first family). Other families
  // still render verbatim in advanced mode; they just don't move the dropdown.
  Q.matchFamily = function (familyCss) {
    var first = firstFamily(familyCss);
    for (var i = 0; i < Q.FONTS.length; i++) if (firstFamily(Q.FONTS[i].family) === first) return Q.FONTS[i].key;
    return null;
  };

  Q.PRESETS = [
    { key: "bsky", label: "Bluesky feed — 1200 × 675", w: 1200, h: 675 },
    { key: "bsky2x", label: "Bluesky feed @2x — 2400 × 1350", w: 2400, h: 1350 },
    { key: "og", label: "Link card / OG — 1200 × 630", w: 1200, h: 630 },
    { key: "square", label: "Square — 1080 × 1080", w: 1080, h: 1080 },
    { key: "custom", label: "Custom…" }
  ];

  Q.BORDER_STYLES = ["none", "solid", "double", "dashed", "dotted", "wavy"];

  // [min, max] per basic control. The sliders use these, and advanced-mode
  // values are clamped into them when mirrored back onto the controls (the
  // renderer itself uses advanced values unclamped).
  Q.RANGES = {
    fontSize: [12, 200],
    lineHeight: [1, 2.2],
    shadowBlur: [0, 60],
    shadowOffset: [-40, 40],
    shadowOpacity: [5, 100],
    attrSizePct: [25, 120],
    attrOpacity: [10, 100],
    borderWidth: [0, 40],
    borderRadius: [0, 120],
    borderInset: [0, 15],
    padding: [2, 20]
  };

  Q.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  Q.clampR = function (v, range) { return Q.clamp(v, range[0], range[1]); };
})();
