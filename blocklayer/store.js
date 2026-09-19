/*
 * Blocklayer — the level the browser keeps: the one a visit starts from, and
 * the one written back after an edit. A browser may refuse storage outright or
 * throw on any call to it, and what it holds may be no level at all; any of
 * those answers the demo level and none of them throws.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  // The window's storage, or nothing: reading the property alone throws on a
  // browser that refuses it.
  function from(win) {
    try {
      return win.localStorage || null;
    } catch (err) {
      return null;
    }
  }

  // The level the storage holds, or nothing when it holds none.
  function stored(storage) {
    try {
      return B.file.parse(storage.getItem(B.STORAGE_KEY));
    } catch (err) {
      return null;
    }
  }

  // The level to start from: the stored one, however empty, else the demo.
  function read(storage) {
    return (storage && stored(storage)) || B.demo.level();
  }

  // The level is stored as the text a file holds.
  function write(storage, level) {
    if (!storage) return;
    try {
      storage.setItem(B.STORAGE_KEY, B.file.serialize(level));
    } catch (err) {
      // Storage refused the level; it lives on in memory until the next edit.
    }
  }

  B.store = {
    from: from,
    read: read,
    write: write
  };
})();
