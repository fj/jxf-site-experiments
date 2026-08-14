/*
 * Shared archive helper: a set of files as one gzipped tar.
 *
 * An experiment that renders a set of pages has to hand the reader a set of
 * files, and the only thing a browser offers for that is one download per file
 * — a run of save dialogs, or a scatter of loose files in a downloads folder.
 * No engine ships an archive writer, but every current one ships gzip
 * (CompressionStream), and tar is a format a page can write for itself: a
 * 512-byte header of octal ASCII per file, the file's bytes padded to the next
 * block, two zero blocks to finish. So the archive is a ustar tar built here,
 * byte by byte, and compressed by the browser.
 *
 * Nothing here fails quietly. A malformed archive downloads like any other,
 * carries a plausible size, and only refuses to open later, with nothing left
 * on the page to explain it — so a name too long for a ustar header, an entry
 * with nothing to write, a duplicate name that would shadow an earlier file,
 * and an engine that cannot gzip all stop the archive with a sentence naming
 * what happened rather than producing bytes nobody can extract.
 */
(function () {
  "use strict";

  var Archive = window.ExpArchive = window.ExpArchive || {};

  var BLOCK_BYTES = 512;      // every tar structure is a whole block
  var RECORD_BLOCKS = 20;     // and an archive is whole records of blocks
  var TRAILER_BLOCKS = 2;     // the zero blocks that mark the end
  var OCTAL = 8;
  var SPACE = 0x20;
  var MS_PER_SECOND = 1000;
  var GZIP_FORMAT = "gzip";
  var ARCHIVE_TYPE = "application/gzip";

  // The ustar header fields this writes, by where they sit in the block.
  var NAME = { at: 0, bytes: 100 };
  var MODE = { at: 100, bytes: 8 };
  var UID = { at: 108, bytes: 8 };
  var GID = { at: 116, bytes: 8 };
  var SIZE = { at: 124, bytes: 12 };
  var MTIME = { at: 136, bytes: 12 };
  var CHECKSUM = { at: 148, bytes: 8 };
  var TYPEFLAG = { at: 156, bytes: 1 };
  var MAGIC = { at: 257, bytes: 6 };
  var VERSION = { at: 263, bytes: 2 };

  var CHECKSUM_DIGITS = 6;    // six octal digits, then a NUL and a space
  var FILE_MODE = parseInt("644", OCTAL);
  var REGULAR_FILE = "0";
  var MAGIC_TEXT = "ustar";   // the field's last byte stays NUL
  var VERSION_TEXT = "00";

  var encoder = null;

  // A name is measured and written in bytes, not characters: the header's name
  // field is 100 bytes wide whatever alphabet fills it.
  function utf8(text) {
    if (!encoder) encoder = new TextEncoder();
    return encoder.encode(text);
  }

  // ---- ustar headers ---------------------------------------------------------

  function writeAscii(block, at, text) {
    for (var i = 0; i < text.length; i++) block[at + i] = text.charCodeAt(i);
  }

  function octal(value, digits) {
    var text = Math.floor(value).toString(OCTAL);
    if (text.length > digits) {
      throw new Error("a tar header can’t hold " + value + " in " + digits + " octal digits");
    }
    while (text.length < digits) text = "0" + text;
    return text;
  }

  // Numeric fields are octal ASCII, zero-padded, keeping their last byte for
  // the NUL that terminates them.
  function writeOctal(block, field, value) {
    writeAscii(block, field.at, octal(value, field.bytes - 1));
  }

  // The checksum is the sum of every byte of the finished header, its own field
  // read as spaces — so it is filled with spaces, summed, and then overwritten.
  function writeChecksum(block) {
    var i;
    for (i = 0; i < CHECKSUM.bytes; i++) block[CHECKSUM.at + i] = SPACE;
    var sum = 0;
    for (i = 0; i < block.length; i++) sum += block[i];
    writeAscii(block, CHECKSUM.at, octal(sum, CHECKSUM_DIGITS));
    block[CHECKSUM.at + CHECKSUM_DIGITS] = 0;
  }

  function header(nameBytes, size, mtime) {
    var block = new Uint8Array(BLOCK_BYTES);
    block.set(nameBytes, NAME.at);
    writeOctal(block, MODE, FILE_MODE);
    writeOctal(block, UID, 0);
    writeOctal(block, GID, 0);
    writeOctal(block, SIZE, size);
    writeOctal(block, MTIME, mtime);
    writeAscii(block, TYPEFLAG.at, REGULAR_FILE);
    writeAscii(block, MAGIC.at, MAGIC_TEXT);
    writeAscii(block, VERSION.at, VERSION_TEXT);
    writeChecksum(block);
    return block;
  }

  function roundUp(length, unit) {
    return Math.ceil(length / unit) * unit;
  }

  // Everything past the last byte written stays zero, which is exactly what the
  // padding, the trailing blocks and the unused header fields all have to be.
  function tar(names, contents) {
    var mtime = Math.floor(Date.now() / MS_PER_SECOND);
    var length = TRAILER_BLOCKS * BLOCK_BYTES;
    contents.forEach(function (bytes) {
      length += BLOCK_BYTES + roundUp(bytes.length, BLOCK_BYTES);
    });

    var out = new Uint8Array(roundUp(length, RECORD_BLOCKS * BLOCK_BYTES));
    var at = 0;
    contents.forEach(function (bytes, i) {
      out.set(header(names[i], bytes.length, mtime), at);
      at += BLOCK_BYTES;
      out.set(bytes, at);
      at += roundUp(bytes.length, BLOCK_BYTES);
    });
    return out;
  }

  // ---- Entries ---------------------------------------------------------------

  function checkedName(name, seen) {
    if (typeof name !== "string" || !name) {
      throw new Error("every file in an archive needs a name");
    }
    var bytes = utf8(name);
    if (bytes.length > NAME.bytes) {
      throw new Error("“" + name + "” is too long a name for a tar header: " +
        bytes.length + " bytes, where the limit is " + NAME.bytes);
    }
    if (seen.indexOf(name) >= 0) {
      throw new Error("two files in this archive are both named “" + name + "”");
    }
    seen.push(name);
    return bytes;
  }

  function checkedNames(entries) {
    var seen = [];
    return entries.map(function (entry) {
      if (!entry || !entry.blob || typeof entry.blob.arrayBuffer !== "function") {
        var known = entry && typeof entry.name === "string" ? "“" + entry.name + "”" : "an entry";
        throw new Error(known + " has no file to put in the archive");
      }
      return checkedName(entry.name, seen);
    });
  }

  // ---- Compression -----------------------------------------------------------

  function gzip(bytes) {
    var compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream(GZIP_FORMAT));
    return new Response(compressed).arrayBuffer().then(function (buffer) {
      return new Blob([buffer], { type: ARCHIVE_TYPE });
    });
  }

  // ---- Public API -------------------------------------------------------------

  // What, if anything, will stop `targz` from building the archive — a sentence
  // to show the reader, or null to go ahead, the way ExpPng.saveBlocker() reads
  // before a save. What it covers is the compression: writing the tar is
  // arithmetic this file does itself, but the gzip is the engine's, and an
  // engine without CompressionStream cannot do it at all. Handing the finished
  // blob to the reader is a download like any other, so a caller that saves it
  // has ExpPng.saveBlocker() to ask as well.
  Archive.blocker = function () {
    if (typeof CompressionStream !== "function") {
      return "this browser can’t build a compressed archive";
    }
    return null;
  };

  // entries: [{name, blob}] -> a Promise for one .tar.gz Blob.
  //
  // Every failure arrives as a rejection, the ones found before a single blob
  // is read included, so a caller has one place to catch and one sentence to
  // show for all of them.
  Archive.targz = function (entries) {
    return Promise.resolve().then(function () {
      var blocked = Archive.blocker();
      if (blocked) throw new Error(blocked);
      if (!entries || !entries.length) throw new Error("there is nothing to put in the archive");

      var names = checkedNames(entries);
      var reads = entries.map(function (entry) { return entry.blob.arrayBuffer(); });
      return Promise.all(reads).then(function (buffers) {
        return gzip(tar(names, buffers.map(function (buffer) { return new Uint8Array(buffer); })));
      });
    });
  };
})();
