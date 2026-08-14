/*
 * Player Card — the eight schools of magic as marks.
 *
 * A spell row has room for a name and a line about what the spell does, and
 * little else: spelling out "Transmutation" beside each one would eat the row
 * and still read slower than a shape does. So each school gets a mark — a
 * small geometric device you can sort a page of spells by at a glance, in the
 * same spare language as the badges on the card and the dice beside the hit
 * die.
 *
 * The geometry is written once, in a unit circle centred on the origin, and
 * rendered either onto a canvas or as an <svg> — two drawings of one table
 * rather than two tables. A mark is a list of parts, and a part is either a
 * run of points or a circle. The few parts that are solid — a pupil, an eye
 * socket — and the one that is dashed say so themselves, so neither renderer
 * has to know which school it is drawing.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  var TOP = -Math.PI / 2;      // the angle of a vertex at twelve o'clock
  var CENTER = [0, 0];
  var FULL_TURN = Math.PI * 2;
  var STROKE_RATIO = 0.11;     // of the radius, when a caller gives no width
  var DASH = [0.3, 0.24];      // ink, gap, as fractions of the radius
  var CURVE_STEPS = 12;        // segments a quadratic curve is flattened into
  var SPIRAL_STEPS_PER_TURN = 24;
  var SVG_SIZE = 22;
  var SVG_STROKE_RATIO = 0.09; // of the box, so the mark scales as a unit

  // A regular polygon on the unit circle, first vertex at `turn`.
  function regular(sides, turn) {
    var points = [];
    for (var i = 0; i < sides; i++) {
      var angle = turn + i * 2 * Math.PI / sides;
      points.push([Math.cos(angle), Math.sin(angle)]);
    }
    return points;
  }

  function scaled(points, factor) {
    return points.map(function (p) { return [p[0] * factor, p[1] * factor]; });
  }

  // Segments from the middle out to the listed vertices.
  function spokes(points, indices) {
    return indices.map(function (i) { return [CENTER, points[i]]; });
  }

  // A quadratic curve flattened into points, from just past `from` through to
  // `to`, so a caller can concatenate it onto the run it continues.
  function quadratic(from, control, to) {
    var points = [];
    for (var i = 1; i <= CURVE_STEPS; i++) {
      var t = i / CURVE_STEPS;
      var s = 1 - t;
      points.push([
        s * s * from[0] + 2 * s * t * control[0] + t * t * to[0],
        s * s * from[1] + 2 * s * t * control[1] + t * t * to[1]
      ]);
    }
    return points;
  }

  // An Archimedean spiral out from the origin — radius grows with the angle,
  // so every turn is the same distance from the one inside it.
  function spiral(turns) {
    var steps = Math.round(turns * SPIRAL_STEPS_PER_TURN);
    var points = [];
    for (var i = 0; i <= steps; i++) {
      var reach = i / steps;
      var angle = TOP + reach * turns * FULL_TURN;
      points.push([reach * Math.cos(angle), reach * Math.sin(angle)]);
    }
    return points;
  }

  // The parts a mark is made of. Everything is stroked unless it is a `disc`.
  function stroke(points) { return { points: points }; }

  function outline(points) { return { points: points, closed: true }; }

  function circle(center, radius) { return { circle: [center[0], center[1], radius] }; }

  function disc(center, radius) {
    var part = circle(center, radius);
    part.filled = true;
    return part;
  }

  function dashed(part) {
    part.dashed = true;
    return part;
  }

  var MARKS = {};

  // The ward: a heater shield, square in the shoulders, with flanks that run
  // straight down and then sweep into the point — the armor class badge's
  // silhouette, which is the card's word for "what it takes to get through".
  MARKS.abjuration = (function () {
    var halfWidth = 0.72, top = -0.94, flank = 0.06, sweep = 0.72, point = 1;
    var right = [halfWidth, flank];
    var tip = [0, point];
    var left = [-halfWidth, flank];
    return [outline([[-halfWidth, top], [halfWidth, top], right]
      .concat(quadratic(right, [halfWidth, sweep], tip))
      .concat(quadratic(tip, [-halfWidth, sweep], left)))];
  })();

  // The summoning circle: a hexagram drawn inside a ring. The star stands well
  // clear of the ring, or the two of them close up into a rosette at 20 px.
  MARKS.conjuration = (function () {
    var star = 0.66;
    return [
      circle(CENTER, 1),
      outline(scaled(regular(3, TOP), star)),
      outline(scaled(regular(3, -TOP), star))
    ];
  })();

  // The eye: a vesica of two lids meeting at the corners, with the pupil solid
  // so the mark has something to look at you with at any size.
  MARKS.divination = (function () {
    var corner = 1, lidReach = 1.1, pupil = 0.26;
    var left = [-corner, 0], right = [corner, 0];
    return [
      outline([left]
        .concat(quadratic(left, [0, -lidReach], right))
        .concat(quadratic(right, [0, lidReach], left))),
      disc(CENTER, pupil)
    ];
  })();

  // The charm: a spiral wound out from the middle, the one mark here with no
  // corners in it.
  MARKS.enchantment = (function () {
    var turns = 2.5;
    return [stroke(spiral(turns))];
  })();

  // The burst: eight rays out of a single point, the cardinals reaching the
  // full radius and the diagonals falling short, which is what keeps it a
  // flash of energy rather than a snowflake.
  MARKS.evocation = (function () {
    var diagonal = 0.62;
    var points = regular(8, TOP);
    return spokes(points, [0, 2, 4, 6])
      .concat(spokes(scaled(points, diagonal), [1, 3, 5, 7]))
      .map(stroke);
  })();

  // The double: one circle and a copy of it a step away, the copy dashed
  // because only one of the two is really there. The step is most of a radius,
  // so the pair still reads as two circles where they overlap.
  MARKS.illusion = (function () {
    var radius = 0.58, step = 0.38;
    return [
      circle([-step, -step], radius),
      dashed(circle([step, step], radius))
    ];
  })();

  // The skull: a cranium, two sockets sunk solid, and the triangle of the
  // nose. Three marks are all it takes; a jaw would only close up at 20 px.
  MARKS.necromancy = (function () {
    var socket = 0.24, socketSpread = 0.42, socketLine = -0.24;
    var noseHalfWidth = 0.21, noseTop = 0.16, noseTip = 0.62;
    return [
      circle(CENTER, 1),
      disc([-socketSpread, socketLine], socket),
      disc([socketSpread, socketLine], socket),
      outline([[-noseHalfWidth, noseTop], [noseHalfWidth, noseTop], [0, noseTip]])
    ];
  })();

  // The squared circle: a triangle in a circle in a square, the alchemists'
  // figure for turning one thing into another. The circle is short of the
  // square's sides rather than touching them, so the two stay separate shapes.
  MARKS.transmutation = (function () {
    var half = 0.86, inner = 0.66;
    return [
      outline([[-half, -half], [half, -half], [half, half], [-half, half]]),
      circle(CENTER, inner),
      outline(scaled(regular(3, TOP), inner))
    ];
  })();

  // The eight, in the order a spell picker offers them. Also the whole set of
  // marks above, so a picker can't ask for one that isn't drawn.
  var LIST = [
    { key: "abjuration", label: "Abjuration" },
    { key: "conjuration", label: "Conjuration" },
    { key: "divination", label: "Divination" },
    { key: "enchantment", label: "Enchantment" },
    { key: "evocation", label: "Evocation" },
    { key: "illusion", label: "Illusion" },
    { key: "necromancy", label: "Necromancy" },
    { key: "transmutation", label: "Transmutation" }
  ];

  // A key that isn't one of the eight draws the first mark rather than
  // throwing, since it arrives from whatever a saved spell row happens to say.
  function markFor(key) {
    return Object.prototype.hasOwnProperty.call(MARKS, key) ? MARKS[key] : MARKS[LIST[0].key];
  }

  function fixed(n) {
    return n.toFixed(2);
  }

  function trace(ctx, part, cx, cy, radius) {
    ctx.beginPath();
    if (part.circle) {
      ctx.arc(cx + part.circle[0] * radius, cy + part.circle[1] * radius,
        part.circle[2] * radius, 0, FULL_TURN);
      return;
    }
    part.points.forEach(function (p, i) {
      var x = cx + p[0] * radius, y = cy + p[1] * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    if (part.closed) ctx.closePath();
  }

  // One part as markup, in a square viewBox centred on `center`.
  function element(part, center, radius) {
    function at(p) {
      return fixed(center + p[0] * radius) + "," + fixed(center + p[1] * radius);
    }

    var attrs = part.filled ? ' fill="currentColor" stroke="none"' : "";
    if (part.dashed) {
      attrs += ' stroke-dasharray="' + fixed(DASH[0] * radius) + " " + fixed(DASH[1] * radius) + '"';
    }
    if (part.circle) {
      return '<circle cx="' + fixed(center + part.circle[0] * radius) +
        '" cy="' + fixed(center + part.circle[1] * radius) +
        '" r="' + fixed(part.circle[2] * radius) + '"' + attrs + "/>";
    }
    return '<path d="M' + part.points.map(at).join("L") + (part.closed ? "Z" : "") +
      '"' + attrs + "/>";
  }

  D.schools = {
    LIST: LIST,

    // Strokes the mark centred on (cx, cy); `radius` is its half-extent.
    draw: function (ctx, key, cx, cy, radius, opts) {
      ctx.save();
      ctx.strokeStyle = opts.color;
      ctx.fillStyle = opts.color;
      ctx.lineWidth = opts.lineWidth || Math.max(1, radius * STROKE_RATIO);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      markFor(key).forEach(function (part) {
        ctx.setLineDash(part.dashed ? [DASH[0] * radius, DASH[1] * radius] : []);
        trace(ctx, part, cx, cy, radius);
        if (part.filled) ctx.fill(); else ctx.stroke();
      });
      ctx.restore();
    },

    // The same marks as markup for the control panel. They stroke in
    // currentColor, so they follow the panel's text into dark mode by
    // themselves. Half the stroke sits outside the geometry, so the mark is
    // inset by that much and never touches the edge of the box.
    svg: function (key, opts) {
      opts = opts || {};
      var size = opts.size || SVG_SIZE;
      var half = size / 2;
      var strokeWidth = size * SVG_STROKE_RATIO;
      var radius = half - strokeWidth / 2;
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size +
        '" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor"' +
        ' stroke-width="' + fixed(strokeWidth) +
        '" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
        markFor(key).map(function (part) { return element(part, half, radius); }).join("") +
        "</svg>";
    }
  };
})();
