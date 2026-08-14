/*
 * Player Card — the set of pages as files.
 *
 * A character has a set of cards, so there are three things worth asking for:
 * the card in front of you, every card as its own file, or every card tiled
 * onto one. Each is the same few steps — draw a page, encode it, stamp the
 * print density on it, hand it to the browser — in a different arrangement,
 * and none of that is the panel's business. So the arrangements live here and
 * the panel only says which one was asked for and where to show its progress.
 *
 * Nothing here draws on the preview. That canvas holds the page the reader is
 * looking at, and downloading the rest of the set would leave it holding
 * whichever one came last, so every run draws on a canvas of its own and lets
 * go of it when the file has gone.
 *
 * A download is `{blocker, run}`. `blocker()` is a sentence to show the reader
 * instead of running, or null; a set of cards is a long enough job that
 * finding out afterwards is a whole set's work wasted. `run(request)` resolves
 * to what it did, `{cards, width, height, dpi}` — what went out, which is not
 * the same as what the panel holds by the time it lands — and every failure,
 * including one thrown before there is a promise, arrives as a rejection, so a
 * caller has one place to catch and one sentence to show.
 *
 * A request is what a download needs to know:
 *   {pages, active, identity, look, dpi, report}
 * where `report(label, fraction)` says which step it is on and how far along;
 * a null label keeps the one already showing.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  // Files are named for the character, then for the page's place in the set
  // and what it is, so a folder of them sorts into reading order and says
  // what each one is: "thistle-quickfoot-2-inventory-1795x1193.png".
  var UNNAMED = "player";               // a nameless character still needs a filename
  var ARCHIVE_SUFFIX = "-cards.tar.gz";
  var SHEET_MARK = "-all-";
  var PNG_SUFFIX = ".png";

  // Where one card's steps sit on the progress bar. Encoding is a single
  // opaque call, so these are the boundaries between steps rather than a
  // continuous measure.
  var STEP_RENDER = 0.15;
  var STEP_ENCODE = 0.55;
  var STEP_STAMP = 0.85;
  var STEP_DONE = 1;

  // A whole set is a render and an encode per card before anything can be
  // compressed, so the cards take the bar this far and the archive takes the
  // rest…
  var CARDS_SHARE = 0.8;
  // …and each card moves it twice: once drawn, once encoded.
  var CARD_STEPS = 2;

  // ---- Names -----------------------------------------------------------------

  function slugify(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function stemFor(identity) {
    return slugify(identity.name) || UNNAMED;
  }

  function pixelSuffix(size) {
    return size.width + "x" + size.height + PNG_SUFFIX;
  }

  function pageFile(stem, pages, index, size) {
    return stem + "-" + (index + 1) + "-" + slugify(pages[index].kind) + "-" + pixelSuffix(size);
  }

  // ---- Drawing and encoding ---------------------------------------------------

  // A canvas per run rather than one kept between them: a contact sheet of a
  // dozen cards is a large bitmap to hold on to after its file has gone.
  function blankCanvas() {
    return document.createElement("canvas");
  }

  function drawPage(canvas, request, index, size) {
    canvas.width = size.width;
    canvas.height = size.height;
    D.sheet.render(canvas.getContext("2d"), size, request.pages[index],
      request.identity, request.look, D.pages.labelFor(request.pages, index));
  }

  // Every PNG leaves here carrying its print density; `beforeStamp` is for a
  // caller with a step to announce between the two calls.
  function encodePng(canvas, dpi, beforeStamp) {
    return window.ExpPng.encode(canvas).then(function (blob) {
      if (beforeStamp) beforeStamp();
      return window.ExpPng.withDensity(blob, dpi);
    });
  }

  function cardsProgress(step, total) {
    return CARDS_SHARE * step / (total * CARD_STEPS);
  }

  // What a download did, for the sentence a caller shows afterwards. The
  // density is part of it because the control that chose it stays editable
  // while the file is being written, and the file carries what it was given.
  function did(request, cards, size) {
    return { cards: cards, width: size.width, height: size.height, dpi: request.dpi };
  }

  // ---- The three downloads ------------------------------------------------------

  function downloadPage(request) {
    var size = D.pixelsFor(request.dpi);
    var canvas = blankCanvas();

    request.report("Rendering…", STEP_RENDER);
    drawPage(canvas, request, request.active, size);

    request.report("Encoding PNG…", STEP_ENCODE);
    return encodePng(canvas, request.dpi, function () {
      request.report("Tagging " + request.dpi + " dpi…", STEP_STAMP);
    }).then(function (blob) {
      request.report(null, STEP_DONE);
      window.ExpPng.save(blob, pageFile(stemFor(request.identity), request.pages, request.active, size));
      return did(request, 1, size);
    });
  }

  // One PNG per page, then all of them in one archive. The cards are done one
  // after another rather than at once because they share a canvas: each
  // encode has to finish reading it before the next page is drawn on it.
  function downloadSet(request) {
    var size = D.pixelsFor(request.dpi);
    var stem = stemFor(request.identity);
    var canvas = blankCanvas();
    var total = request.pages.length;
    var entries = [];
    var pending = Promise.resolve();

    request.pages.forEach(function (page, index) {
      pending = pending.then(function () {
        var counted = " card " + (index + 1) + " of " + total + "…";
        var step = index * CARD_STEPS;

        request.report("Rendering" + counted, cardsProgress(step, total));
        drawPage(canvas, request, index, size);

        request.report("Encoding" + counted, cardsProgress(step + 1, total));
        return encodePng(canvas, request.dpi).then(function (blob) {
          entries.push({ name: pageFile(stem, request.pages, index, size), blob: blob });
        });
      });
    });

    return pending.then(function () {
      request.report("Compressing…", CARDS_SHARE);
      return window.ExpArchive.targz(entries);
    }).then(function (blob) {
      request.report(null, STEP_DONE);
      window.ExpPng.save(blob, stem + ARCHIVE_SUFFIX);
      return did(request, total, size);
    });
  }

  // The whole set on one bitmap, which only the contact sheet knows the size
  // of — it sizes the canvas and says what it made.
  function downloadSheet(request) {
    var stem = stemFor(request.identity);
    var canvas = blankCanvas();

    request.report("Rendering every card…", STEP_RENDER);
    var size = D.sheet.contactSheet(canvas.getContext("2d"), request.pages,
      request.identity, request.look, request.dpi);

    request.report("Encoding PNG…", STEP_ENCODE);
    return encodePng(canvas, request.dpi, function () {
      request.report("Tagging " + request.dpi + " dpi…", STEP_STAMP);
    }).then(function (blob) {
      request.report(null, STEP_DONE);
      window.ExpPng.save(blob, stem + SHEET_MARK + pixelSuffix(size));
      return did(request, request.pages.length, size);
    });
  }

  // ---- Public API ----------------------------------------------------------------

  // Saving is where every download ends, so it is asked about every time. An
  // archive also needs the engine's compressor, and a set of cards is rendered
  // and encoded in full before there is anything to compress.
  function savingBlocker() {
    return window.ExpPng.saveBlocker();
  }

  function archivingBlocker() {
    return window.ExpPng.saveBlocker() || window.ExpArchive.blocker();
  }

  function job(blocker, work) {
    return {
      blocker: blocker,
      run: function (request) {
        return Promise.resolve().then(function () {
          var blocked = blocker();
          if (blocked) throw new Error(blocked);
          return work(request);
        });
      }
    };
  }

  D.downloads = {
    page: job(savingBlocker, downloadPage),
    set: job(archivingBlocker, downloadSet),
    sheet: job(savingBlocker, downloadSheet)
  };
})();
