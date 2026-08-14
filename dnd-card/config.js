/*
 * Player Card — sizing, typography, and palette configuration.
 *
 * The card's physical size is the fixed point of this experiment: 152 × 101 mm
 * printed at 300 dpi, landscape — the long edge along the bottom. Every length
 * in the renderer is a design px on that 300 dpi card, and rendering at
 * another resolution just scales by
 * (output width / design width) — so the same layout comes out of a 150 dpi
 * proof and a 600 dpi print file.
 *
 * Everything hangs off the window.DndCard namespace; the manifest loads these
 * files in dependency order and app.js wires them together.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  // The printed card. Not adjustable: it's the whole point of the format.
  D.CARD_MM = { width: 152, height: 101 };

  var MM_PER_INCH = 25.4;

  D.REF_DPI = 300;

  D.DPI_CHOICES = [150, 300, 600];

  // Pixel dimensions that print at CARD_MM for a given resolution.
  D.pixelsFor = function (dpi) {
    return {
      width: Math.round(D.CARD_MM.width / MM_PER_INCH * dpi),
      height: Math.round(D.CARD_MM.height / MM_PER_INCH * dpi)
    };
  };

  // Design units are px on the 300 dpi card.
  D.DESIGN = D.pixelsFor(D.REF_DPI);

  // The picture gets the left third at full height; the character's numbers
  // get the rest.
  D.PORTRAIT_FRACTION = 1 / 3;

  // Every face is a Google Fonts webfont loaded at runtime (ExpFonts prefetches
  // each variant before the UI is built), so the canvas renders identically
  // everywhere; the system faces in each stack are fallbacks only. All six
  // ship both a 400 and a 700, which the renderer needs.
  D.FONTS = [
    { key: "cinzel", label: "Cinzel (roman display)", family: '"Cinzel", serif' },
    { key: "grenze-gotisch", label: "Grenze Gotisch (blackletter)", family: '"Grenze Gotisch", serif' },
    { key: "eb-garamond", label: "EB Garamond (serif)", family: '"EB Garamond", Georgia, serif' },
    { key: "alegreya", label: "Alegreya (serif)", family: 'Alegreya, Georgia, serif' },
    { key: "pt-serif", label: "PT Serif (serif)", family: '"PT Serif", Georgia, serif' },
    { key: "fira-sans", label: "Fira Sans (sans)", family: '"Fira Sans", system-ui, sans-serif' }
  ];

  D.FONTS_CSS_URL = "https://fonts.googleapis.com/css2" +
    "?family=Cinzel:wght@400..700" +
    "&family=Grenze+Gotisch:wght@400..700" +
    "&family=EB+Garamond:wght@400..700" +
    "&family=Alegreya:wght@400..700" +
    "&family=PT+Serif:wght@400;700" +
    "&family=Fira+Sans:wght@400;700" +
    "&display=swap";

  D.familyOf = function (key) {
    for (var i = 0; i < D.FONTS.length; i++) if (D.FONTS[i].key === key) return D.FONTS[i].family;
    return D.FONTS[0].family;
  };

  // A theme is three colors; every other tone on the card (panel fills, rules,
  // muted text) is mixed from them, so a custom palette needs three picks
  // rather than a dozen.
  D.THEMES = [
    { key: "parchment", label: "Parchment", background: "#f2e6cc", ink: "#2b2016", accent: "#7c2d1a" },
    { key: "midnight", label: "Midnight", background: "#161a25", ink: "#eae4d6", accent: "#c9a24b" },
    { key: "grove", label: "Grove", background: "#e9efe6", ink: "#1b2a21", accent: "#2f6b48" },
    { key: "arcane", label: "Arcane", background: "#1b1630", ink: "#e8e3f5", accent: "#8f7bd8" },
    { key: "custom", label: "Custom…" }
  ];

  D.themeOf = function (key) {
    for (var i = 0; i < D.THEMES.length; i++) if (D.THEMES[i].key === key) return D.THEMES[i];
    return D.THEMES[0];
  };

  // [min, max] for the sliders (and for clamping typed values). Hit dice are
  // capped at the highest level rather than the character's own, which the
  // control narrows to as the level changes.
  D.RANGES = {
    level: [1, 20],
    score: [1, 30],
    hitPoints: [0, 999],
    hitDice: [0, 20],
    armorClass: [0, 40],
    zoom: [100, 400],
    pan: [-100, 100],
    deathSaves: [0, 3],

    // A feature row holds six tally boxes beside a name and its description:
    // past that the boxes are what the row is and there is nowhere left to say
    // what they count. The third is the spell levels one of those rows counts
    // slots for.
    featureUses: [0, 6],
    featureSlots: [0, 6],
    featureSlotLevel: [1, 9],

    // A spell's own level, which is not the caster's. Zero is a cantrip —
    // a level in the arithmetic, a word on the card.
    spellLevel: [0, 9]
  };

  D.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  D.clampR = function (v, range) { return D.clamp(v, range[0], range[1]); };
})();
