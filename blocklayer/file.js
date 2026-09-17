/*
 * Blocklayer — the level as a file. A `*.blocklayer.json` file holds exactly
 * what B.level.toJSON writes, pretty-printed. serialize() makes that text and
 * parse() reads it back, answering null for anything that is not a level.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var EXTENSION = ".blocklayer.json";
  var BASE_NAME = "level";
  var INDENT = 2;                  // spaces per level of nesting
  var NEWLINE = "\n";

  function serialize(level) {
    return JSON.stringify(B.level.toJSON(level), null, INDENT) + NEWLINE;
  }

  function parse(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return null;
    }
    return B.level.fromJSON(data);
  }

  B.file = {
    EXTENSION: EXTENSION,
    FILE_NAME: BASE_NAME + EXTENSION,
    serialize: serialize,
    parse: parse
  };
})();
