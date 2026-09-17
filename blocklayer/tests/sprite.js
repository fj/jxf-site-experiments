/*
 * Helpers for the sprite tests. canvasDocument() is a document whose canvases
 * remember every pixel filled on them, with what and how many times, so a
 * module that draws can run in node; rows() reads a sprite's art back as
 * string art; headHeavy() tells an arrow's head from its tail.
 */
"use strict";

const INK = "#";
const BLANK = ".";

function fakeCanvas() {
  const canvas = { width: 0, height: 0, filled: new Map(), paints: new Map() };
  canvas.getContext = () => {
    const ctx = { fillStyle: "", imageSmoothingEnabled: true };
    ctx.fillRect = (x, y, w, h) => {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          const at = `${i},${j}`;
          canvas.filled.set(at, ctx.fillStyle);
          canvas.paints.set(at, (canvas.paints.get(at) || 0) + 1);
        }
      }
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
