/*
 * Blocklayer — the level the browser keeps: the one read back on a return
 * visit, and the one written after an edit. A browser may refuse storage
 * outright or throw on any call to it, and what it holds may be no level at
 * all; any of those answers nothing and none of them throws. What a visit with
 * no level of its own starts on is the app's choice, not the storage's.
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

  // The level the storage holds, however empty, or nothing when it holds none.
  function read(storage) {
    if (!storage) return null;
    try {
      return B.file.parse(storage.getItem(B.STORAGE_KEY));
    } catch (err) {
      return null;
    }
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
