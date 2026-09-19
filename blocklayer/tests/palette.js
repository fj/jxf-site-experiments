/*
 * The tile colours, stubbed. B.PALETTE, B.DEFAULT_COLOR, B.level.setColor and
 * B.tiles.swatch come with the change that gives every tile its own colour;
 * until that lands, these put them on a loaded namespace to the contract the
 * colour picker is written against. Delete this file when the change arrives.
 */
"use strict";

// Ten entries in order: the spectrum, then the greys.
const PALETTE = [
  { key: "red", label: "Red", hex: "#e05038" },
  { key: "orange", label: "Orange", hex: "#ef8a42" },
  { key: "yellow", label: "Yellow", hex: "#f2d55c" },
  { key: "green", label: "Green", hex: "#7ed957" },
  { key: "blue", label: "Blue", hex: "#4fa3e0" },
  { key: "indigo", label: "Indigo", hex: "#5a5ad9" },
  { key: "violet", label: "Violet", hex: "#a05ad9" },
  { key: "grey-light", label: "Light grey", hex: "#c6ccd6" },
  { key: "grey", label: "Grey", hex: "#838a96" },
  { key: "grey-dark", label: "Dark grey", hex: "#4a5260" }
];

const DEFAULT_COLOR = "green";
const KEYS = PALETTE.map((entry) => entry.key);
const held = (key) => KEYS.indexOf(key) >= 0;

// The tile's top diamond, outlined, as the button that picks it shows it.
const SWATCH_ROWS = [
  "...oo...",
  ".oCCCCo.",
  ".oCCCCo.",
  "...oo..."
];

// The constants config.js will hold. This refuses to shadow the real ones, so
// the day they land the suites stop here instead of testing the stub.
function colors(B) {
  if (B.PALETTE) throw new Error("config.js holds a palette: delete tests/palette.js");
  B.PALETTE = PALETTE;
  B.DEFAULT_COLOR = DEFAULT_COLOR;
  return B;
}

// A new tile takes a palette key; setColor paints one and ignores any other key.
function tileColors(B) {
  const add = B.level.add;
  B.level.add = (level, x, y, elev, color) => {
    const tile = add(level, x, y, elev);
    if (tile.color === undefined) tile.color = held(color) ? color : DEFAULT_COLOR;
    return tile;
  };
  B.level.setColor = (level, x, y, key) => {
    const tile = B.level.get(level, x, y);
    if (tile && held(key)) tile.color = key;
    return tile;
  };
  return B;
}

function swatches(B) {
  const swatch = B.pixel.memo((key) => {
    const entry = PALETTE.find((e) => e.key === key);
    return B.pixel.fromRows(SWATCH_ROWS, { o: B.COLORS.outline, C: entry.hex });
  });
  B.tiles = { ...B.tiles, swatch };
  return B;
}

module.exports = { PALETTE, DEFAULT_COLOR, colors, tileColors, swatches };
