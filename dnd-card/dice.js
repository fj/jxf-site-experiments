/*
 * Player Card — the shape of a die.
 *
 * A hit die is quicker to recognise as a silhouette than as the letters "d8",
 * so the card draws one beside the notation and the panel shows one beside the
 * picker. The geometry is written once, in a unit circle centred on the origin,
 * and rendered either onto a canvas or as an <svg> — two drawings of one table
 * rather than two tables.
 *
 * Each solid is drawn the way you'd see it sitting on a table: an outline for
 * the silhouette, plus the creases where the faces you can see meet. The
 * creases are what stop a d8 reading as a proficiency diamond.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  var TOP = -Math.PI / 2;      // the angle of a vertex at twelve o'clock
  var CENTER = [0, 0];
  var STROKE_RATIO = 0.11;     // of the radius, when a caller gives no width
  var SVG_SIZE = 22;
  var SVG_INSET = 1;           // room for the stroke inside the viewBox
  var SVG_STROKE_RATIO = 0.09; // of the box, so the icon scales as a unit

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

  // Creases from the middle out to the listed vertices — a near vertex facing
  // you, with an edge running to each silhouette corner it touches.
  function spokes(points, indices) {
    return indices.map(function (i) { return [CENTER, points[i]]; });
  }

  function ring(points) {
    return points.map(function (p, i) { return [p, points[(i + 1) % points.length]]; });
  }

  var SHAPES = {};

  // Tetrahedron, resting on a face: a triangle with the top vertex projected
  // onto its middle.
  SHAPES[4] = (function () {
    var face = regular(3, TOP);
    return { outline: face, creases: spokes(face, [0, 1, 2]) };
  })();

  // Cube, on a corner: the hexagon a cube casts, with its three visible faces
  // meeting in the middle.
  SHAPES[6] = (function () {
    var hex = regular(6, TOP);
    return { outline: hex, creases: spokes(hex, [1, 3, 5]) };
  })();

  // Octahedron, on a vertex: a rhombus with the near vertex in the middle,
  // reaching every corner of the silhouette.
  SHAPES[8] = (function () {
    var rhombus = [[0, -1], [0.72, 0], [0, 1], [-0.72, 0]];
    return { outline: rhombus, creases: spokes(rhombus, [0, 1, 2, 3]) };
  })();

  // Pentagonal trapezohedron: a kite pointed at both ends, creased where its
  // two rings of faces meet at the waist.
  SHAPES[10] = (function () {
    var left = [-0.88, -0.05], right = [0.88, -0.05], middle = [0, 0.22];
    return {
      outline: [[0, -1], right, [0.52, 0.72], [0, 1], [-0.52, 0.72], left],
      creases: [[left, middle], [right, middle], [middle, [0, 1]]]
    };
  })();

  // Dodecahedron, face up: the pentagon you read the number off, ringed by the
  // five faces leaning away behind it. The inner pentagon points the other way,
  // which is what those faces do to it.
  SHAPES[12] = (function () {
    var outer = regular(5, TOP);
    var inner = scaled(regular(5, TOP + Math.PI / 5), 0.5);
    return { outline: outer, creases: ring(inner) };
  })();

  // The dice a class rolls for hit points, smallest first. Also the whole set
  // of shapes above, so the picker can't ask for one that isn't drawn.
  var SIDES = [4, 6, 8, 10, 12];

  function shapeFor(sides) {
    return SHAPES[sides] || SHAPES[SIDES[0]];
  }

  function pathData(sides, cx, cy, radius) {
    var shape = shapeFor(sides);
    function at(p) {
      return (cx + p[0] * radius).toFixed(2) + "," + (cy + p[1] * radius).toFixed(2);
    }
    return "M" + shape.outline.map(at).join("L") + "Z" +
      shape.creases.map(function (seg) { return "M" + at(seg[0]) + "L" + at(seg[1]); }).join("");
  }

  D.dice = {
    SIDES: SIDES,

    // Strokes the die centred on (cx, cy); `radius` reaches its widest vertex.
    draw: function (ctx, sides, cx, cy, radius, opts) {
      var shape = shapeFor(sides);
      function move(p, method) { ctx[method](cx + p[0] * radius, cy + p[1] * radius); }

      ctx.save();
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = opts.lineWidth || Math.max(1, radius * STROKE_RATIO);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      shape.outline.forEach(function (p, i) { move(p, i === 0 ? "moveTo" : "lineTo"); });
      ctx.closePath();
      shape.creases.forEach(function (seg) {
        move(seg[0], "moveTo");
        move(seg[1], "lineTo");
      });
      ctx.stroke();
      ctx.restore();
    },

    // The same shape as markup for the control panel. It strokes in
    // currentColor, so it follows the panel's text into dark mode by itself.
    svg: function (sides, opts) {
      opts = opts || {};
      var size = opts.size || SVG_SIZE;
      var half = size / 2;
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size +
        '" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor"' +
        ' stroke-width="' + (size * SVG_STROKE_RATIO).toFixed(2) +
        '" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
        '<path d="' + pathData(sides, half, half, half - SVG_INSET) + '"/></svg>';
    }
  };
})();
