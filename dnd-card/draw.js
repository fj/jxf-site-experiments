/*
 * Player Card — canvas drawing primitives.
 *
 * Card-agnostic helpers the layout in card.js composes: text with optional
 * letter-spacing and shrink-to-fit, rounded panels, rules, the marker and
 * badge shapes, and the color mixing that derives every secondary tone from
 * the theme's three colors.
 *
 * Every shape on the card means something by being that shape. A circle is a
 * tally — a death save you've made. A diamond is a proficiency bonus you add,
 * which is why the diamonds are left empty and one big one says what they're
 * worth. A shield is what it takes to hit you and a triangle is who goes
 * first, which is the whole of what those two need to say.
 *
 * Letter-spacing is given in ems rather than px, so a label's tracking scales
 * with its size and shrink-to-fit stays a linear calculation.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  var MIN_FIT_SIZE_PX = 8;
  var MARKER_STROKE_RATIO = 0.22;
  // Drops a shape's label from its center to its optical middle.
  var LABEL_LIFT = 0.34;

  // A heater shield, as fractions of the half-height: square shoulders, flanks
  // that run straight down, then a sweep into the point.
  var SHIELD_WIDTH = 0.84;
  var SHIELD_FLANK = 0.12;
  var SHIELD_SWEEP = 0.72;

  // A triangle pointing the way you go when you win initiative. Its base sits
  // back far enough to leave the number somewhere to be.
  var WEDGE_BACK = 0.78;

  function fontString(run) {
    return (run.weight || 400) + " " + run.size + "px " + run.family;
  }

  function trackingPx(run) {
    return (run.tracking || 0) * run.size;
  }

  // Tracked text is drawn one glyph at a time, so its width has to be summed
  // the same way — a whole-string measure would include kerning the drawing
  // doesn't apply.
  function measure(ctx, str, run) {
    ctx.font = fontString(run);
    if (!run.tracking) return ctx.measureText(str).width;
    var total = 0;
    for (var i = 0; i < str.length; i++) total += ctx.measureText(str.charAt(i)).width;
    return total + Math.max(0, str.length - 1) * trackingPx(run);
  }

  function originFor(align, x, width) {
    if (align === "center") return x - width / 2;
    if (align === "right") return x - width;
    return x;
  }

  function text(ctx, str, x, y, run) {
    if (str == null || str === "") return 0;
    str = String(str);
    var width = measure(ctx, str, run);
    ctx.save();
    ctx.font = fontString(run);
    ctx.fillStyle = run.color;
    ctx.textBaseline = run.baseline || "alphabetic";
    var left = originFor(run.align, x, width);
    if (run.tracking) {
      var gap = trackingPx(run);
      for (var i = 0; i < str.length; i++) {
        var glyph = str.charAt(i);
        ctx.fillText(glyph, left, y);
        left += ctx.measureText(glyph).width + gap;
      }
    } else {
      ctx.fillText(str, left, y);
    }
    ctx.restore();
    return width;
  }

  // The largest size no wider than maxWidth. Width is linear in size (tracking
  // included, since it's an em fraction), so one measurement settles it.
  function fitSize(ctx, str, run, maxWidth) {
    if (str == null || str === "") return run.size;
    var width = measure(ctx, str, run);
    if (width <= maxWidth || width === 0) return run.size;
    return Math.max(run.minSize || MIN_FIT_SIZE_PX, Math.floor(run.size * maxWidth / width));
  }

  function pathRoundedRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(ctx, rect, opts) {
    ctx.save();
    pathRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, opts.radius || 0);
    if (opts.fill) { ctx.fillStyle = opts.fill; ctx.fill(); }
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = opts.lineWidth || 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // A plain filled rectangle — rules, dividers, and the strip down the edge of
  // the portrait are all this, at different aspect ratios.
  function bar(ctx, x, y, width, height, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  function clipTo(ctx, rect, radius, drawInside) {
    ctx.save();
    pathRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, radius || 0);
    ctx.clip();
    drawInside();
    ctx.restore();
  }

  function marker(ctx, opts, trace) {
    ctx.save();
    ctx.lineWidth = opts.lineWidth || Math.max(1, opts.radius * MARKER_STROKE_RATIO);
    ctx.strokeStyle = opts.color;
    ctx.fillStyle = opts.color;
    trace();
    if (opts.filled) ctx.fill(); else ctx.stroke();
    ctx.restore();
  }

  // A tally box: hollow until it's marked. Death saves and inspiration.
  function pip(ctx, cx, cy, radius, opts) {
    marker(ctx, { radius: radius, color: opts.color, filled: opts.filled, lineWidth: opts.lineWidth },
      function () {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      });
  }

  function traceDiamond(ctx, cx, cy, radius) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius, cy);
    ctx.lineTo(cx, cy + radius);
    ctx.lineTo(cx - radius, cy);
    ctx.closePath();
  }

  function traceShield(ctx, cx, cy, radius) {
    var half = radius * SHIELD_WIDTH;
    var flank = cy + radius * SHIELD_FLANK;
    var sweep = cy + radius * SHIELD_SWEEP;
    ctx.beginPath();
    ctx.moveTo(cx - half, cy - radius);
    ctx.lineTo(cx + half, cy - radius);
    ctx.lineTo(cx + half, flank);
    ctx.quadraticCurveTo(cx + half, sweep, cx, cy + radius);
    ctx.quadraticCurveTo(cx - half, sweep, cx - half, flank);
    ctx.closePath();
  }

  function traceWedge(ctx, cx, cy, radius) {
    var back = cx - radius * WEDGE_BACK;
    ctx.beginPath();
    ctx.moveTo(back, cy - radius);
    ctx.lineTo(cx + radius, cy);
    ctx.lineTo(back, cy + radius);
    ctx.closePath();
  }

  // Each shape says where a number inside it belongs and how much of the size
  // it was asked for it can actually hold — a triangle is mostly point, so its
  // number sits back toward the base and is set smaller to clear the sides.
  var SHAPES = {
    diamond: { trace: traceDiamond, offset: [0, 0], fit: 1 },
    shield: { trace: traceShield, offset: [0, -0.06], fit: 1 },
    wedge: { trace: traceWedge, offset: [-0.2, 0], fit: 0.76 }
  };

  // One of the shapes above, filled or hollow, with an optional number in it.
  // `radius` is the half-height for all of them, so shapes drawn at the same
  // radius sit on the same optical grid. The markers scattered over the card
  // are drawn empty; the badges that say what they're worth carry the number.
  function badge(ctx, kind, cx, cy, radius, opts) {
    var shape = SHAPES[kind];
    marker(ctx, { radius: radius, color: opts.color, filled: opts.filled, lineWidth: opts.lineWidth },
      function () { shape.trace(ctx, cx, cy, radius); });

    if (opts.label == null) return;
    var size = opts.labelSize * shape.fit;
    text(ctx, opts.label, cx + radius * shape.offset[0],
      cy + radius * shape.offset[1] + size * LABEL_LIFT, {
        family: opts.family,
        weight: 700,
        size: size,
        color: opts.labelColor,
        align: "center"
      });
  }

  // ---- Color ----------------------------------------------------------------

  function channels(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    var n = m ? parseInt(m[1], 16) : 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function toHex(rgb) {
    return "#" + rgb.map(function (v) {
      return ("0" + Math.round(D.clamp(v, 0, 255)).toString(16)).slice(-2);
    }).join("");
  }

  // t = 0 is `from`, t = 1 is `to`.
  function mix(from, to, t) {
    var a = channels(from), b = channels(to);
    return toHex([0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }));
  }

  D.draw = {
    measure: measure,
    text: text,
    fitSize: fitSize,
    pathRoundedRect: pathRoundedRect,
    panel: panel,
    bar: bar,
    clipTo: clipTo,
    pip: pip,
    badge: badge,
    mix: mix
  };
})();
