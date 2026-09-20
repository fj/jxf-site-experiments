/*
 * Blocklayer — the constants every module shares: the grid and its
 * projection, the ranges an edit is clamped to, and the lists the toolbar
 * and the level model both enumerate.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  B.MOUNT_ID = "experiment-ext-blk";
  B.PREFIX = "experiment-ext-blk-";
  B.STORAGE_KEY = "experiment-ext-blk-level";

  B.SIZE_MIN = 1;          // the board, in tiles across and down
  B.SIZE_MAX = 64;
  B.SIZE_DEFAULT = { w: 12, h: 12 };

  B.ELEV_MIN = 0;
  B.ELEV_MAX = 7;
  B.FLOOR = B.ELEV_MIN;    // a tile at ELEV_MIN has no blocks: its top is the ground
  B.NEW_TILE_ELEV = 1;

  B.TILE_W = 32;           // base-scale pixels: the top diamond's width
  B.TILE_H = 16;           // ...and its height
  B.BLOCK_H = 16;          // one elevation step, as the height of a block's side

  B.ZOOM_MIN = 1;
  B.ZOOM_MAX = 4;
  B.ZOOM_DEFAULT = 2;
  B.HOLD_MS = 500;         // the right button held this long removes a tile
  B.STATUS_MS = 3000;      // a message on the status line stays this long

  B.SHAPES = ["block", "ramp", "stairs"];
  B.FACINGS = ["N", "E", "S", "W"];             // world compass; N is -y, E is +x
  // Where a tile's high edge is on screen, as two letters: u or d for up (the
  // slope in view) or down (seen edge-on), then r or l for right or left.
  B.VIEW_FACINGS = ["ur", "dr", "dl", "ul"];
  B.DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  B.DECOR = [
    { key: "chest", label: "Chest" },
    { key: "rock", label: "Rock" },
    { key: "crystal-blue", label: "Blue crystal" },
    { key: "crystal-yellow", label: "Yellow crystal" },
    { key: "crystal-red", label: "Red crystal" },
    { key: "switch", label: "Switch" }
  ];

  B.MARKS = [
    { key: "arrow-n", label: "North", dir: "N" },
    { key: "arrow-ne", label: "North-east", dir: "NE" },
    { key: "arrow-e", label: "East", dir: "E" },
    { key: "arrow-se", label: "South-east", dir: "SE" },
    { key: "arrow-s", label: "South", dir: "S" },
    { key: "arrow-sw", label: "South-west", dir: "SW" },
    { key: "arrow-w", label: "West", dir: "W" },
    { key: "arrow-nw", label: "North-west", dir: "NW" },
    { key: "teleport", label: "Teleport" },
    { key: "rope", label: "Rope" },
    { key: "jump", label: "Jump" }
  ];

  // The colours a tile's top face is painted in: the spectrum, then three
  // greys. Height reads from the labels and from the shading of the sides.
  B.PALETTE = [
    { key: "red", label: "Red", hex: "#e0453c" },
    { key: "orange", label: "Orange", hex: "#ef8a42" },
    { key: "yellow", label: "Yellow", hex: "#f2d55c" },
    { key: "green", label: "Green", hex: "#7ed957" },
    { key: "blue", label: "Blue", hex: "#4fa3e0" },
    { key: "indigo", label: "Indigo", hex: "#5e7ce2" },
    { key: "violet", label: "Violet", hex: "#a86fe0" },
    { key: "grey-light", label: "Light grey", hex: "#d0d3d8" },
    { key: "grey", label: "Grey", hex: "#8a8f99" },
    { key: "grey-dark", label: "Dark grey", hex: "#4a4e57" }
  ];

  B.DEFAULT_COLOR = "green";     // what a tile takes when nothing names a colour

  B.COLORS = {
    outline: "#1f1a2e",
    ghost: "#ffffff",
    select: "#fff7a8",
    hover: "#ffffff",
    hold: "#ff4d3d",
    label: "#1f1a2e",
    labelText: "#ffffff",
    grid: "#838a96"          // the floor lattice, drawn part way to the canvas
  };

  // How far each side face of a block or a decor object is shaded from its
  // top colour: the light falls from the upper left.
  B.FACE_SHADES = { left: -0.22, right: -0.42 };

  var SCREEN_DIRS = B.DIRECTIONS.length;
  var DIRS_PER_FACING = SCREEN_DIRS / B.FACINGS.length;   // and per quarter turn

  // Where world direction i (an index into DIRECTIONS) points on screen after
  // rot quarter turns, as an index into the same eight-way compass.
  B.screenDir = function (rot, i) {
    return (((i + DIRS_PER_FACING * rot) % SCREEN_DIRS) + SCREEN_DIRS) % SCREEN_DIRS;
  };

  // The same for a world facing (N, E, S or W).
  B.facingDir = function (rot, facing) {
    return B.screenDir(rot, DIRS_PER_FACING * B.FACINGS.indexOf(facing));
  };

  B.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  // Whether `a` (a tile, a cell, or nothing) sits at the cell (x, y).
  B.sameCell = function (a, x, y) { return !!a && a.x === x && a.y === y; };
})();
