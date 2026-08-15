/*
 * Player Card — reading a value that came from outside.
 *
 * A value out of a file is a value somebody could have typed anything into,
 * and the renderer would rather be handed a number than find out mid-draw. So
 * everything a saved file holds arrives through one of these: each takes what
 * the file held and what to fall back to, and returns a value of the right
 * type. `fallback` is what a blank page already has, so a key that is missing,
 * misspelled or nonsense leaves the card as it would have been rather than
 * half-built.
 *
 * This knows nothing about files, documents or which keys a document has —
 * it is the vocabulary the page kinds and D.saved both write their readers in.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  var COLOR = /^#[0-9a-fA-F]{6}$/;

  D.read = {
    text: function (value, fallback) {
      if (typeof value === "string") return value;
      if (value == null || typeof value === "object") return fallback == null ? "" : fallback;
      return String(value);
    },

    whole: function (value, range, fallback) {
      var number = Math.round(Number(value));
      return isFinite(number) ? D.clampR(number, range) : fallback;
    },

    // A count that may legitimately be blank, as an inventory quantity is.
    countOrBlank: function (value, range) {
      if (value == null || value === "") return null;
      var number = Math.round(Number(value));
      return isFinite(number) ? D.clampR(number, range) : null;
    },

    flag: function (value) {
      return value === true || value === "true" || value === 1;
    },

    choice: function (value, keys, fallback) {
      return keys.indexOf(String(value)) === -1 ? fallback : String(value);
    },

    color: function (value, fallback) {
      return COLOR.test(String(value)) ? String(value).toLowerCase() : fallback;
    },

    // The rows of a page: whatever is there, as mappings, and no more than the
    // card has room for. A file claiming forty rows gets the first ten drawn
    // rather than an error, because the extra rows are the only part of it
    // that can't be honoured.
    rows: function (value, limit) {
      if (!Array.isArray(value)) return [];
      return value.filter(function (row) {
        return row && typeof row === "object" && !Array.isArray(row);
      }).slice(0, limit);
    }
  };
})();
