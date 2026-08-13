/*
 * Player Card — the portrait that fills the card's left third.
 *
 * Loading and framing an image, kept away from the rest of the card. Two
 * sources: a local file (read through an object URL, so nothing is uploaded
 * anywhere) and a URL. A URL is fetched with CORS credentials requested, which
 * means a host that doesn't allow cross-origin reads fails loudly *here*
 * rather than silently tainting the canvas and breaking the download later —
 * the message says to download the picture and upload it instead.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  var PLACEHOLDER_RING_RATIO = 0.28;   // of the portrait's shorter side
  var PLACEHOLDER_TEXT_RATIO = 0.30;
  var PLACEHOLDER_RING_WIDTH = 0.012;
  // Drops the monogram's baseline from the ring's centre to its optical middle.
  var PLACEHOLDER_BASELINE_RATIO = 0.36;

  function loadInto(image, source, onFailure) {
    return new Promise(function (resolve, reject) {
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error(onFailure)); };
      image.src = source;
    });
  }

  function fromFile(file) {
    var url = URL.createObjectURL(file);
    return loadInto(new Image(), url, "that file isn’t an image the browser can read")
      .then(function (image) { URL.revokeObjectURL(url); return image; },
        function (err) { URL.revokeObjectURL(url); throw err; });
  }

  function fromUrl(url) {
    var image = new Image();
    image.crossOrigin = "anonymous";
    return loadInto(image, url,
      "couldn’t load that URL — the host may not allow other sites to read its images. " +
      "Save the picture and upload the file instead.");
  }

  // Fills `rect` with the image the way `background-size: cover` would, then
  // applies zoom and pan. Pan is expressed as a percentage of the overflow in
  // each direction, so the slider can't push the picture off the card: at
  // ±100% the corresponding edge of the image lines up with the edge of the
  // frame, and with no overflow to slide it has no effect at all.
  function draw(ctx, rect, image, framing) {
    var cover = Math.max(rect.width / image.width, rect.height / image.height);
    var scale = cover * (framing.zoom / 100);
    var width = image.width * scale;
    var height = image.height * scale;
    var overflowX = Math.max(0, width - rect.width);
    var overflowY = Math.max(0, height - rect.height);

    D.draw.clipTo(ctx, rect, 0, function () {
      ctx.drawImage(image,
        rect.x + (rect.width - width) / 2 + (framing.panX / 100) * (overflowX / 2),
        rect.y + (rect.height - height) / 2 + (framing.panY / 100) * (overflowY / 2),
        width, height);
    });
  }

  // Stands in for a picture that hasn't been chosen yet: the character's
  // initial in a ring, in the card's own colors, so an un-illustrated card
  // still prints as something deliberate.
  function drawPlaceholder(ctx, rect, look) {
    var shorter = Math.min(rect.width, rect.height);
    var centerX = rect.x + rect.width / 2;
    var centerY = rect.y + rect.height / 2;

    ctx.save();
    ctx.strokeStyle = look.ring;
    ctx.lineWidth = shorter * PLACEHOLDER_RING_WIDTH;
    ctx.beginPath();
    ctx.arc(centerX, centerY, shorter * PLACEHOLDER_RING_RATIO, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    var size = shorter * PLACEHOLDER_TEXT_RATIO;
    D.draw.text(ctx, look.monogram, centerX, centerY + size * PLACEHOLDER_BASELINE_RATIO, {
      family: look.family,
      weight: 700,
      size: size,
      color: look.ink,
      align: "center"
    });
  }

  D.portrait = {
    fromFile: fromFile,
    fromUrl: fromUrl,
    draw: draw,
    drawPlaceholder: drawPlaceholder
  };
})();
