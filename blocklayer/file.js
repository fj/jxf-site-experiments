/*
 * Blocklayer — the level as a file. A `*.blocklayer.json` file holds exactly
 * what B.level.toJSON writes, pretty-printed. serialize() makes that text,
 * parse() reads it back and answers null for anything that is not a level,
 * and isLevelFile() says whether a file name is worth opening at all.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var EXTENSION = ".blocklayer.json";
  var JSON_EXTENSION = ".json";
  var BASE_NAME = "level";
  var INDENT = 2;                  // spaces per level of nesting
  var NEWLINE = "\n";
  var LEVEL_SUFFIXES = [EXTENSION, JSON_EXTENSION];

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

  function endsWith(name, suffix) {
    return name.slice(-suffix.length) === suffix;
  }

  function isLevelFile(name) {
    if (typeof name !== "string") return false;
    var lower = name.toLowerCase();
    return LEVEL_SUFFIXES.some(function (suffix) { return endsWith(lower, suffix); });
  }

  B.file = {
    EXTENSION: EXTENSION,
    FILE_NAME: BASE_NAME + EXTENSION,
    serialize: serialize,
    parse: parse,
    isLevelFile: isLevelFile
  };
})();
