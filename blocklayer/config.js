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

  B.ELEV_MIN = -3;
  B.ELEV_MAX = 3;
  B.FLOOR = -4;            // the ground the lowest column stands on
  B.NEW_TILE_ELEV = 0;

  B.TILE_W = 32;           // base-scale pixels: the top diamond's width
  B.TILE_H = 16;           // ...and its height
  B.BLOCK_H = 16;          // one elevation step, as the height of a block's side
  B.STEPS = 4;             // treads on a flight of stairs

  B.ZOOM_MIN = 1;
  B.ZOOM_MAX = 4;
  B.ZOOM_DEFAULT = 2;
  B.PAN_STEP = 1;          // tiles the camera moves per pan press
  B.HOLD_MS = 500;         // the right button held this long removes a tile
  B.STATUS_MS = 3000;      // a message on the status line stays this long
  B.TRANSPARENT_ALPHA = 0.45;

  B.SHAPES = ["block", "ramp", "stairs"];
  B.FACINGS = ["N", "E", "S", "W"];             // world compass; N is -y, E is +x
  B.VIEW_FACINGS = ["ur", "dr", "dl", "ul"];    // screen: up-right, down-right, down-left, up-left
  B.DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  B.DECOR = [
    { key: "chest", label: "Chest" },
    { key: "rock", label: "Rock" },
    { key: "crystal-blue", label: "Blue crystal" },
    { key: "crystal-yellow", label: "Yellow crystal" },
    { key: "crystal-red", label: "Red crystal" }
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

  // The top face's colour at each elevation: cool and dark below ground,
  // warm and bright up high, so height reads without a label.
  B.ELEVATION_COLORS = {
    "-3": "#5e7ce2",
    "-2": "#4fa3e0",
    "-1": "#4cc9b0",
    "0": "#7ed957",
    "1": "#b8e05a",
    "2": "#f2d55c",
    "3": "#f29e4c"
  };

  B.COLORS = {
    outline: "#1f1a2e",
    ghost: "#ffffff",
    select: "#fff7a8",
    hover: "#ffffff",
    hold: "#ff4d3d",
    label: "#1f1a2e",
    labelText: "#ffffff",
    inkLight: "#1f1a2e",   // toolbar icons on a light face
    inkDark: "#e8e8f0"     // ...and on a dark one
  };

  var SCREEN_DIRS = B.DIRECTIONS.length;
  var DIRS_PER_TURN = SCREEN_DIRS / 4;

  // Where world direction i (an index into DIRECTIONS) points on screen after
  // rot quarter turns, as an index into the same eight-way compass.
  B.screenDir = function (rot, i) {
    return (((i + DIRS_PER_TURN * rot) % SCREEN_DIRS) + SCREEN_DIRS) % SCREEN_DIRS;
  };

  B.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
})();
