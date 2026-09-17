/*
 * Blocklayer — drawing the scene. Everything is drawn once, at base scale, on
 * an offscreen canvas: the columns back to front with what stands on them,
 * then the ghost and the compass. That bitmap is blitted to the visible canvas
 * at `scale` (the view's zoom times the device pixel ratio) with smoothing
 * off, so every pixel stays a crisp square.
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
  var TRANSPARENT_ALPHA = 0.45; // how solid a see-through tile is drawn

  var base = null;

  function baseCanvas(frame) {
    if (!base) base = B.pixel.canvas(frame.w, frame.h);
    if (base.width !== frame.w) base.width = frame.w;
    if (base.height !== frame.h) base.height = frame.h;
    return base;
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
    if (B.sameCell(state.selected, tile.x, tile.y)) return "select";
    if (B.sameCell(hoveredTile(state), tile.x, tile.y)) return "hover";
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

  // Where a tile's anchor (the centre of its top diamond) lands on the base
  // canvas.
  function place(state, frame, tile) {
    var P = B.view.project(state.view, tile.x, tile.y, tile.elev);
    return { x: frame.ox + P.sx, y: frame.oy + P.sy };
  }

  function drawTile(ctx, state, tile, at) {
    var view = state.view;
    var viewFacing = B.view.viewFacing(view.rot, tile.facing);
    var slope = wedge(tile, viewFacing);

    ctx.globalAlpha = state.opaque ? 1 : TRANSPARENT_ALPHA;
    B.pixel.draw(ctx, B.tiles.column(tile.elev), at.x, at.y);
    if (slope) B.pixel.draw(ctx, slope, at.x, at.y);
    ctx.globalAlpha = 1;

    if (B.sameCell(state.hold, tile.x, tile.y)) {
      B.pixel.draw(ctx, B.tiles.holdMask(state.hold.progress), at.x, at.y);
    }
    var kind = outlineKind(state, tile);
    if (kind) B.pixel.draw(ctx, B.tiles.outline(tile.shape, viewFacing, kind), at.x, at.y);

    // What stands on the tile stands on its top, a block up on a slope.
    var topY = at.y - (B.level.top(tile) - tile.elev) * B.BLOCK_H;
    var decor = state.layers.decor && tile.decor ? B.decor.sprite(tile.decor) : null;
    if (decor) B.pixel.draw(ctx, decor, at.x, topY);
    if (state.layers.marks && tile.marks.length) {
      drawMarks(ctx, view.rot, tile.marks, at.x, decor ? topY - decor.oy - MARK_ABOVE_DECOR : topY);
    }
  }

  // Labels go over every column, so no tile in front can cover another's.
  function drawLabels(ctx, state, tiles, at) {
    if (!state.layers.elevation) return;
    for (var i = 0; i < tiles.length; i++) {
      B.pixel.draw(ctx, B.tiles.label(elevText(tiles[i].elev)), at[i].x, at[i].y + LABEL_DY);
    }
  }

  function drawGhost(ctx, state, ox, oy) {
    var cell = state.hover && state.hover.cell;
    if (!cell) return;
    var G = B.view.project(state.view, cell.x, cell.y, B.NEW_TILE_ELEV);
    B.pixel.draw(ctx, B.tiles.ghost(B.NEW_TILE_ELEV), ox + G.sx, oy + G.sy);
  }

  function drawCompass(ctx, state) {
    var compass = B.icons.compass(state.view.rot);
    B.pixel.draw(ctx, compass, COMPASS_MARGIN + compass.ox, COMPASS_MARGIN + compass.oy);
  }

  function draw(canvas, state, scale) {
    var frame = B.view.frame(canvas, scale);
    if (!frame.w || !frame.h) return;
    var scene = baseCanvas(frame);
    var ctx = B.pixel.context(scene);
    ctx.clearRect(0, 0, frame.w, frame.h);

    var tiles = B.view.order(state.view, B.level.all(state.level));
    var at = tiles.map(function (tile) { return place(state, frame, tile); });
    for (var i = 0; i < tiles.length; i++) drawTile(ctx, state, tiles[i], at[i]);
    drawLabels(ctx, state, tiles, at);
    drawGhost(ctx, state, frame.ox, frame.oy);
    drawCompass(ctx, state);

    var out = canvas.getContext("2d");
    out.imageSmoothingEnabled = false;
    out.clearRect(0, 0, canvas.width, canvas.height);
    out.drawImage(scene, 0, 0, scene.width * scale, scene.height * scale);
  }

  B.render = { draw: draw };
})();
