/*
 * Shared PNG helpers: encode a canvas, stamp a physical print density, save.
 *
 * A canvas encodes to a PNG that says nothing about how big it is in the
 * physical world, so software that opens one has to guess — and most guesses
 * are 72 or 96 dpi, which prints a 300 dpi card at three or four times its
 * intended size. PNG has a chunk for exactly this (pHYs: pixels per unit, in
 * metres), so writing one turns "this bitmap has the right number of pixels"
 * into "this file prints at the right physical size".
 *
 * Nothing here fails quietly. A card that didn't save, or saved without its
 * density, looks exactly like one that worked until it comes out of a printer
 * at the wrong size, so every step that can't do its job says so instead.
 */
(function () {
  "use strict";

  var Png = window.ExpPng = window.ExpPng || {};

  var SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  var HEADER_BYTES = 8;           // the signature
  var CHUNK_OVERHEAD_BYTES = 12;  // length (4) + type (4) + CRC (4)
  var METRES_PER_INCH = 0.0254;
  var UNIT_METRE = 1;             // pHYs unit specifier
  var OBJECT_URL_TTL_MS = 5000;

  // ---- CRC-32 (the polynomial PNG specifies) ---------------------------------
  var crcTable = null;

  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    var out = new Uint8Array(CHUNK_OVERHEAD_BYTES + data.length);
    var view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  function typeAt(bytes, offset) {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  function isPng(bytes) {
    if (bytes.length < HEADER_BYTES) return false;
    for (var i = 0; i < SIGNATURE.length; i++) if (bytes[i] !== SIGNATURE[i]) return false;
    return true;
  }

  function physChunk(dpi) {
    var perMetre = Math.round(dpi / METRES_PER_INCH);
    var data = new Uint8Array(9);
    var view = new DataView(data.buffer);
    view.setUint32(0, perMetre);
    view.setUint32(4, perMetre);
    data[8] = UNIT_METRE;
    return makeChunk("pHYs", data);
  }

  // Returns the PNG bytes with a pHYs chunk declaring `dpi`, replacing any
  // chunk already there. pHYs must precede IDAT, so it goes right after IHDR.
  //
  // Both bail-outs throw rather than handing back the input untouched. The
  // density is the whole point of writing this chunk, and a file that quietly
  // lacks it prints at whatever the printer guesses — several times too big,
  // with nothing on screen to say so.
  function stampDensity(bytes, dpi) {
    if (!isPng(bytes)) throw new Error("the browser returned something that isn’t a PNG");

    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var insertAt = -1, replaceFrom = -1, replaceTo = -1;
    var offset = HEADER_BYTES;

    while (offset + CHUNK_OVERHEAD_BYTES <= bytes.length) {
      var length = view.getUint32(offset);
      var type = typeAt(bytes, offset + 4);
      var next = offset + CHUNK_OVERHEAD_BYTES + length;
      if (type === "IHDR") insertAt = next;
      if (type === "pHYs") { replaceFrom = offset; replaceTo = next; break; }
      if (type === "IDAT" || type === "IEND") break;
      offset = next;
    }
    if (insertAt < 0) throw new Error("this PNG has no header chunk to write a print size after");

    var phys = physChunk(dpi);
    var head = replaceFrom >= 0 ? replaceFrom : insertAt;
    var tail = replaceFrom >= 0 ? replaceTo : insertAt;
    var out = new Uint8Array(head + phys.length + (bytes.length - tail));
    out.set(bytes.subarray(0, head), 0);
    out.set(phys, head);
    out.set(bytes.subarray(tail), head + phys.length);
    return out;
  }

  // ---- Public API -------------------------------------------------------------

  Png.encode = function (canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("the browser couldn’t encode the canvas as a PNG"));
      }, "image/png");
    });
  };

  Png.withDensity = function (blob, dpi) {
    return blob.arrayBuffer().then(function (buffer) {
      return new Blob([stampDensity(new Uint8Array(buffer), dpi)], { type: "image/png" });
    });
  };

  // What, if anything, will stop `save` from working — a sentence to show the
  // reader, or null to go ahead. Two things stop it: an engine that doesn't
  // know the `download` attribute, and a sandboxed frame that wasn't granted
  // `allow-downloads`.
  //
  // The sandbox is only readable when the embedding page is same-origin. When
  // it isn't, this returns null and a blocked download stays invisible: a page
  // gets no event either way, so "the browser took it" is the most anything
  // here can honestly claim.
  Png.saveBlocker = function () {
    if (!("download" in document.createElement("a"))) {
      return "this browser can’t save a file from a page";
    }
    var frame;
    try {
      frame = window.frameElement;
    } catch (err) {
      return null; // embedded cross-origin: nothing to read
    }
    if (!frame || !frame.sandbox || !frame.sandbox.length) return null;
    if (frame.sandbox.contains("allow-downloads")) return null;
    return "this page is embedded in a sandbox that blocks downloads";
  };

  // Throws when the download can't work, so a caller that reports success
  // after this returns is telling the truth as far as it can be known.
  Png.save = function (blob, filename) {
    var blocked = Png.saveBlocker();
    if (blocked) throw new Error(blocked);

    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.hidden = true;
    // Firefox acts on the click only for an anchor that's in the document.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, OBJECT_URL_TTL_MS);
  };
})();
