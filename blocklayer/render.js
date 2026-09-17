/*
 * Blocklayer — drawing the scene. Everything is drawn once, at base scale, on
 * an offscreen canvas: the columns back to front with what stands on them,
 * then the ghost and the compass. That bitmap is blitted to the visible canvas
 * at the view's zoom with smoothing off, so every pixel stays a crisp square.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var MARKS_PER_ROW = 3;
  var MARK_PITCH = 11;          // base px between marks in a row
  var MARK_ROW_PITCH = 12;      // base px between rows, which stack upward
  var MARK_ABOVE_DECOR = 6;     // base px between a decor's top and the first row
  var LABEL_DY = 4;             // the label's centre below the top face's centre
  var COMPASS_MARGIN = 6;       // base px from the top-left corner

  var base = null;

  function baseCanvas(frame) {
    if (!base) base = B.pixel.canvas(frame.w, frame.h);
    if (base.width !== frame.w) base.width = frame.w;
    if (base.height !== frame.h) base.height = frame.h;
    return base;
  }

  function sameCell(a, x, y) {
    return !!a && a.x === x && a.y === y;
  }

  function hoveredTile(state) {
    return state.hover && state.hover.tile ? state.hover.tile : null;
  }

  function elevText(elev) {
    return elev > 0 ? "+" + elev : String(elev);
  }

  function wedge(tile, viewFacing) {
    if (tile.shape === "ramp") return B.tiles.ramp(tile.elev, viewFacing);
    if (tile.shape === "stairs") return B.tiles.stairs(tile.elev, viewFacing);
    return null;
  }

  function outlineKind(state, tile) {
    if (sameCell(state.selected, tile.x, tile.y)) return "select";
    if (sameCell(hoveredTile(state), tile.x, tile.y)) return "hover";
    return null;
  }

  function drawMarks(ctx, rot, marks, cx, startY) {
    for (var i = 0; i < marks.length; i++) {
      var row = Math.floor(i / MARKS_PER_ROW);
      var col = i % MARKS_PER_ROW;
      var inRow = Math.min(MARKS_PER_ROW, marks.length - row * MARKS_PER_ROW);
      var x = cx + (col - (inRow - 1) / 2) * MARK_PITCH;
      var y = startY - row * MARK_ROW_PITCH;
      B.pixel.draw(ctx, B.marks.sprite(marks[i], rot), x, y);
    }
  }

  function drawTile(ctx, state, tile, ox, oy) {
    var view = state.view;
    var viewFacing = B.view.viewFacing(view.rot, tile.facing);
    var P = B.view.project(view, tile.x, tile.y, tile.elev);
    var px = ox + P.sx;
    var py = oy + P.sy;
    var top = wedge(tile, viewFacing);

    ctx.globalAlpha = state.opaque ? 1 : B.TRANSPARENT_ALPHA;
    B.pixel.draw(ctx, B.tiles.column(tile.elev), px, py);
    if (top) B.pixel.draw(ctx, top, px, py);
    ctx.globalAlpha = 1;

    if (sameCell(state.hold, tile.x, tile.y)) {
      B.pixel.draw(ctx, B.tiles.holdMask(state.hold.progress), px, py);
    }
    var kind = outlineKind(state, tile);
    if (kind) B.pixel.draw(ctx, B.tiles.outline(tile.shape, viewFacing, kind), px, py);

    var Q = B.view.project(view, tile.x, tile.y, B.level.top(tile));
    var qx = ox + Q.sx;
    var qy = oy + Q.sy;
    var decor = state.layers.decor && tile.decor ? B.decor.sprite(tile.decor) : null;
    if (decor) B.pixel.draw(ctx, decor, qx, qy);
    if (state.layers.marks && tile.marks.length) {
      drawMarks(ctx, view.rot, tile.marks, qx, decor ? qy - decor.oy - MARK_ABOVE_DECOR : qy);
    }
  }

  // Labels go over every column, so no tile in front can cover another's.
  function drawLabels(ctx, state, tiles, ox, oy) {
    if (!state.layers.elevation) return;
    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i];
      var P = B.view.project(state.view, tile.x, tile.y, tile.elev);
      B.pixel.draw(ctx, B.tiles.label(elevText(tile.elev)), ox + P.sx, oy + P.sy + LABEL_DY);
    }
  }

  function drawGhost(ctx, state, ox, oy) {
    var cell = state.hover && state.hover.cell;
    if (!cell) return;
    var G = B.view.project(state.view, cell.x, cell.y, B.NEW_TILE_ELEV);
    B.pixel.draw(ctx, B.tiles.ghost(), ox + G.sx, oy + G.sy);
  }

  function drawCompass(ctx, state) {
    var compass = B.icons.compass(state.view.rot);
    B.pixel.draw(ctx, compass, COMPASS_MARGIN + compass.ox, COMPASS_MARGIN + compass.oy);
  }

  function draw(canvas, state) {
    var frame = B.view.frame(canvas, state.scale);
    if (!frame.w || !frame.h) return;
    var scene = baseCanvas(frame);
    var ctx = B.pixel.context(scene);
    ctx.clearRect(0, 0, frame.w, frame.h);

    var tiles = B.view.order(state.view, B.level.all(state.level));
    for (var i = 0; i < tiles.length; i++) drawTile(ctx, state, tiles[i], frame.ox, frame.oy);
    drawLabels(ctx, state, tiles, frame.ox, frame.oy);
    drawGhost(ctx, state, frame.ox, frame.oy);
    drawCompass(ctx, state);

    var out = canvas.getContext("2d");
    out.imageSmoothingEnabled = false;
    out.clearRect(0, 0, canvas.width, canvas.height);
    out.drawImage(scene, 0, 0, scene.width * state.scale, scene.height * state.scale);
  }

  B.render = { draw: draw };
})();
