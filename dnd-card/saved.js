/*
 * Player Card — the whole set as a file, and back again.
 *
 * Everything a reader types lives in the page they typed it on, which is fine
 * until they close the tab. This is the one place that knows how to write all
 * of it down and read it back: what the document holds, what each key is
 * called in it, and what a value has to be before it is allowed near the
 * renderer.
 *
 * The file is YAML rather than JSON because it is meant to be *edited*. A
 * character sheet is a list of small decisions, and the fastest way to change
 * twenty of them is in a text editor with comments to say what is what. The
 * document is grouped the way the panel is — the character, the look, the
 * picture, the output, then the cards — so a key can be found by looking for
 * where it would be.
 *
 * Nothing read here is trusted. A file may have been hand-edited, written by
 * an older version, or not written by this experiment at all. So every value
 * goes through one of D.read's coercions on the way in, and every card goes to
 * its own kind to be made sense of — a kind knows what its own rows are, and
 * nothing else should have to.
 *
 * What is *not* saved: a picture chosen from a file. The card holds the decoded
 * image, not the bytes, and re-encoding it would turn a text file anyone can
 * read into a page of base64. A picture named by URL is saved, because a URL is
 * what it is.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  // Bumped when the shape changes in a way an older reader would misread.
  // Nothing is refused for being from a different version — every value is
  // checked on the way in anyway — but a file says which shape it was written
  // in, so a future reader has something to branch on.
  var VERSION = 1;

  var read = D.read;

  // ---- What the document holds ---------------------------------------------------
  // One row per setting the whole set shares: which block of the file it sits
  // in, what it is called there, the state field it is, and how to read it back.
  // Export and import are both this table walked in order, so a setting cannot
  // be written under one name and looked for under another.
  function fonts() { return D.FONTS.map(function (font) { return font.key; }); }

  function themes() { return D.THEMES.map(function (theme) { return theme.key; }); }

  function resolutions() { return D.DPI_CHOICES.map(function (dpi) { return String(dpi); }); }

  var SETTINGS = [
    { block: "character", key: "name", field: "name" },
    { block: "character", key: "species", field: "species" },
    { block: "character", key: "class", field: "className" },
    { block: "character", key: "subclass", field: "subclass" },
    { block: "character", key: "background", field: "background" },
    {
      block: "character", key: "level", field: "level",
      read: function (value, fallback) { return read.whole(value, D.RANGES.level, fallback); }
    },

    {
      block: "look", key: "theme", field: "theme",
      read: function (value, fallback) { return read.choice(value, themes(), fallback); }
    },
    { block: "look", key: "paper", field: "paper", read: read.color },
    { block: "look", key: "ink", field: "ink", read: read.color },
    { block: "look", key: "accent", field: "accent", read: read.color },
    {
      block: "look", key: "nameFont", field: "nameFont",
      read: function (value, fallback) { return read.choice(value, fonts(), fallback); }
    },
    {
      block: "look", key: "displayFont", field: "displayFont",
      read: function (value, fallback) { return read.choice(value, fonts(), fallback); }
    },
    {
      block: "look", key: "bodyFont", field: "bodyFont",
      read: function (value, fallback) { return read.choice(value, fonts(), fallback); }
    },

    { block: "picture", key: "url", field: "portraitUrl" },
    {
      block: "picture", key: "zoom", field: "zoom",
      read: function (value, fallback) { return read.whole(value, D.RANGES.zoom, fallback); }
    },
    {
      block: "picture", key: "panAcross", field: "panX",
      read: function (value, fallback) { return read.whole(value, D.RANGES.pan, fallback); }
    },
    {
      block: "picture", key: "panDown", field: "panY",
      read: function (value, fallback) { return read.whole(value, D.RANGES.pan, fallback); }
    },

    {
      block: "output", key: "dpi", field: "dpi",
      read: function (value, fallback) {
        return Number(read.choice(value, resolutions(), String(fallback)));
      }
    }
  ];

  var CARDS_KEY = "cards";

  // The lines above the document, which are the only place to say what a reader
  // is allowed to do to it.
  var PREAMBLE = [
    "# A player card set, as saved by the Player Card experiment.",
    "#",
    "# Edit anything here and load it back: a value this can't make sense of",
    "# falls back to what a blank card has rather than breaking the load. A",
    "# picture chosen from a file isn't saved — only one named by a URL is.",
    ""
  ].join("\n");

  // ---- Writing ---------------------------------------------------------------------
  function documentFor(state) {
    var out = { version: VERSION };
    SETTINGS.forEach(function (setting) {
      if (!out[setting.block]) out[setting.block] = {};
      out[setting.block][setting.key] = state[setting.field];
    });
    out[CARDS_KEY] = state.pages.map(function (page) { return D.pages.save(page); });
    return out;
  }

  function encode(state) {
    return PREAMBLE + window.ExpYaml.stringify(documentFor(state));
  }

  // ---- Reading -----------------------------------------------------------------------
  // What a load produced: the settings to write over the state's own, the cards
  // to replace the set with, and what had to be left behind. The caller says
  // all of that out loud — a card quietly dropped is a card the reader will go
  // looking for later.
  function decode(text, defaults) {
    var parsed = window.ExpYaml.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("that file isn't a saved card set");
    }

    var settings = {};
    SETTINGS.forEach(function (setting) {
      var block = parsed[setting.block];
      var held = block && typeof block === "object" ? block[setting.key] : undefined;
      var fallback = defaults[setting.field];
      settings[setting.field] = held === undefined
        ? fallback
        : (setting.read || read.text)(held, fallback);
    });

    var pages = [];
    var ignored = [];
    var saved = Array.isArray(parsed[CARDS_KEY]) ? parsed[CARDS_KEY] : [];
    saved.forEach(function (raw) {
      var page = raw && typeof raw === "object" ? D.pages.load(raw) : null;
      if (page) pages.push(page);
      else ignored.push(raw && raw.kind ? String(raw.kind) : "a card with no kind");
    });

    if (!pages.length && saved.length) throw new Error("none of that file's cards could be read");
    return { settings: settings, pages: pages.length ? pages : D.pages.initial(), ignored: ignored };
  }

  D.saved = {
    VERSION: VERSION,
    encode: encode,
    decode: decode
  };
})();
