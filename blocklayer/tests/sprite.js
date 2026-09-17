/*
 * Helpers for the sprite tests. canvasDocument() is a document whose
 * canvases remember every pixel filled on them and with what, so a module
 * that draws can run in node; rows() reads a sprite's art back as string
 * art; headHeavy() tells an arrow's head from its tail.
 */
"use strict";

const INK = "#";
const BLANK = ".";
const CHANNELS = 4;             // r, g, b, a per pixel, as a canvas stores them
const OPAQUE = 255;
const HEX_RADIX = 16;
const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGBA = /^rgba?\(([^)]+)\)$/;

// A fill style as its four channels. A pixel never filled reads as all zero,
// which is how a canvas reports the background.
function channels(style) {
  const hex = HEX.exec(style);
  if (hex) return [...hex.slice(1).map((h) => parseInt(h, HEX_RADIX)), OPAQUE];
  const rgba = RGBA.exec(style);
  if (!rgba) throw new Error(`no fake for the fill style '${style}'`);
  const parts = rgba[1].split(",").map(Number);
  return [parts[0], parts[1], parts[2], Math.round((parts[3] ?? 1) * OPAQUE)];
}

function fakeCanvas() {
  const canvas = { width: 0, height: 0, filled: new Map() };
  canvas.getContext = () => {
    const ctx = { fillStyle: "", imageSmoothingEnabled: true };
    ctx.fillRect = (x, y, w, h) => {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) canvas.filled.set(`${i},${j}`, ctx.fillStyle);
      }
    };
    ctx.getImageData = (x, y, w, h) => {
      const data = new Uint8ClampedArray(w * h * CHANNELS);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const colour = canvas.filled.get(`${x + i},${y + j}`);
          if (colour !== undefined) data.set(channels(colour), (j * w + i) * CHANNELS);
        }
      }
      return { data };
    };
    return ctx;
  };
  return canvas;
}

function canvasDocument() {
  return {
    createElement(tag) {
      if (tag !== "canvas") throw new Error(`no fake for <${tag}>`);
      return fakeCanvas();
    }
  };
}

// The art as string art, every filled pixel as ink except those in `skip`.
function rows(sprite, skip) {
  const out = [];
  for (let y = 0; y < sprite.canvas.height; y++) {
    let row = "";
    for (let x = 0; x < sprite.canvas.width; x++) {
      const colour = sprite.canvas.filled.get(`${x},${y}`);
      row += colour !== undefined && colour !== skip ? INK : BLANK;
    }
    out.push(row);
  }
  return out;
}

// Whether more of the art's ink lies in the half of it toward (dx, dy) than
// in the half away: an arrow's head outweighs its tail, whatever the design.
function headHeavy(art, dx, dy) {
  const along = [];
  art.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === INK) along.push(dx * x + dy * y);
    });
  });
  const mid = (Math.min(...along) + Math.max(...along)) / 2;
  const head = along.filter((p) => p > mid).length;
  return head > along.length - head;
}

module.exports = { INK, BLANK, canvasDocument, rows, headHeavy };
