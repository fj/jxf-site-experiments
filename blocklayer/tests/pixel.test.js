"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const B = load(["config.js", "pixel.js"]);
const P = B.pixel;

const GREEN = "#7ed957";        // 126, 217, 87: the top face at elevation 1

describe("pixel: parseHex and toHex", () => {
  it("parses a hex colour into its three channels, whatever the case", () => {
    assert.deepEqual(P.parseHex("#000000"), [0, 0, 0]);
    assert.deepEqual(P.parseHex("#ffffff"), [255, 255, 255]);
    assert.deepEqual(P.parseHex("#1f1a2e"), [31, 26, 46]);
    assert.deepEqual(P.parseHex("#0A0b0C"), [10, 11, 12]);
  });

  it("writes three channels as six lowercase digits, zero-padded", () => {
    assert.equal(P.toHex([0, 0, 0]), "#000000");
    assert.equal(P.toHex([0, 5, 15]), "#00050f");
    assert.equal(P.toHex([31, 26, 46]), "#1f1a2e");
    assert.equal(P.toHex([255, 255, 255]), "#ffffff");
  });

  it("rounds each channel and clamps it into 0..255", () => {
    assert.equal(P.toHex([127.5, 300, -5]), "#80ff00");
    assert.equal(P.toHex([254.4, 254.5, 255.4]), "#feffff");
  });

  it("round-trips every colour in the palette", () => {
    const palette = Object.values(B.ELEVATION_COLORS).concat(Object.values(B.COLORS));
    for (const hex of palette) assert.equal(P.toHex(P.parseHex(hex)), hex, hex);
  });
});

describe("pixel: shade", () => {
  it("leaves a colour alone at 0", () => {
    assert.equal(P.shade(GREEN, 0), GREEN);
    assert.equal(P.shade("#7ED957", 0), GREEN);
  });

  it("mixes half way toward black at -0.5 and toward white at +0.5", () => {
    assert.equal(P.shade(GREEN, -0.5), "#3f6d2c");
    assert.equal(P.shade(GREEN, 0.5), "#bfecab");
  });

  it("reaches black at -1 and white at +1", () => {
    assert.equal(P.shade(GREEN, -1), "#000000");
    assert.equal(P.shade(GREEN, 1), "#ffffff");
    assert.equal(P.shade("#000000", 1), "#ffffff");
    assert.equal(P.shade("#ffffff", -1), "#000000");
  });

  it("goes no further than black or white past the ends", () => {
    assert.equal(P.shade(GREEN, -2), "#000000");
    assert.equal(P.shade(GREEN, 2), "#ffffff");
  });

  it("darkens more the further from 0, so the two side faces stay in order", () => {
    const { left, right } = B.FACE_SHADES;
    assert.ok(right < left && left < 0);
    const [mid, dark] = [P.shade(GREEN, left), P.shade(GREEN, right)].map(P.parseHex);
    const top = P.parseHex(GREEN);
    for (let i = 0; i < 3; i++) assert.ok(top[i] > mid[i] && mid[i] > dark[i], `channel ${i}`);
  });
});

describe("pixel: hflip, vflip and transpose", () => {
  const rows = ["#...", "##..", "..#."];
  const copy = rows.slice();

  it("hflip mirrors each row left to right and leaves the input alone", () => {
    assert.deepEqual(P.hflip(rows), ["...#", "..##", ".#.."]);
    assert.deepEqual(rows, copy);
    assert.deepEqual(P.hflip(P.hflip(rows)), rows);
  });

  it("vflip mirrors the rows top to bottom and leaves the input alone", () => {
    assert.deepEqual(P.vflip(rows), ["..#.", "##..", "#..."]);
    assert.deepEqual(rows, copy);
    assert.deepEqual(P.vflip(P.vflip(rows)), rows);
  });

  it("transpose turns rows into columns, so a wide art comes back tall", () => {
    assert.deepEqual(P.transpose(rows), ["##.", ".#.", "..#", "..."]);
    assert.deepEqual(rows, copy);
    assert.deepEqual(P.transpose(P.transpose(rows)), rows);
  });

  it("an up arrow transposed points left, and mirrored after that points right", () => {
    const up = [".#.", "###", ".#.", ".#."];
    assert.deepEqual(P.transpose(up), [".#..", "####", ".#.."]);
    assert.deepEqual(P.hflip(P.transpose(up)), ["..#.", "####", "..#."]);
  });
});

describe("pixel: translucent", () => {
  it("writes a colour's channels with the alpha the caller asks for", () => {
    assert.equal(P.translucent(GREEN, 0.5), "rgba(126,217,87,0.5)");
    assert.equal(P.translucent("#000000", 1), "rgba(0,0,0,1)");
  });

  it("takes the channels from the hex, whatever its case", () => {
    assert.equal(P.translucent("#7ED957", 0.25), P.translucent(GREEN, 0.25));
  });
});

describe("pixel: dataUrl and crispUrl", () => {
  const PNG = "data:image/png;base64,AAAA";
  const SVG_PREFIX = "data:image/svg+xml,";

  // A sprite whose canvas counts how often it is asked to encode itself.
  function stub() {
    let encodes = 0;
    const canvas = { width: 16, height: 12, toDataURL: () => { encodes++; return PNG; } };
    return { sprite: { canvas, ox: 8, oy: 6 }, encodes: () => encodes };
  }

  it("encodes a sprite once and answers the same URL after", () => {
    const s = stub();
    assert.equal(P.dataUrl(s.sprite), PNG);
    assert.equal(P.dataUrl(s.sprite), PNG);
    assert.equal(s.encodes(), 1);
  });

  it("wraps the PNG in an SVG of the sprite's size that asks for pixelated rendering", () => {
    const s = stub();
    const url = P.crispUrl(s.sprite);
    assert.ok(url.startsWith(SVG_PREFIX), url.slice(0, 30));
    const svg = decodeURIComponent(url.slice(SVG_PREFIX.length));
    const open = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12">';
    const image = '<image width="16" height="12" style="image-rendering:pixelated" href="' +
      PNG + '"/>';
    assert.ok(svg.startsWith(open), svg);
    assert.ok(svg.includes(image), svg);
    assert.equal(P.crispUrl(s.sprite), url);
    assert.equal(s.encodes(), 1);
  });
});

// memo keys by the arguments' string forms, so 1 and "1" (or null and
// undefined) would share an entry; every caller passes primitives that do not
// collide, and the tests pin only what callers rely on.
describe("pixel: memo", () => {
  function counted() {
    let calls = 0;
    const fn = P.memo((...args) => { calls++; return { args }; });
    return { fn, calls: () => calls };
  }

  it("calls the function once per argument list and hands back the same object", () => {
    const m = counted();
    const first = m.fn(1, "a");
    assert.equal(m.fn(1, "a"), first);
    assert.deepEqual(first.args, [1, "a"]);
    assert.equal(m.calls(), 1);
  });

  it("keeps a distinct result for each distinct argument list", () => {
    const m = counted();
    const results = [m.fn(1), m.fn(2), m.fn(1, 2), m.fn(12), m.fn("a"), m.fn()];
    assert.equal(new Set(results).size, results.length);
    assert.equal(m.calls(), results.length);
    assert.equal(m.fn(1), results[0]);
  });

  it("keeps a cache per memoized function", () => {
    const a = counted();
    const b = counted();
    assert.notEqual(a.fn(0), b.fn(0));
    assert.equal(a.calls(), 1);
    assert.equal(b.calls(), 1);
  });

  it("caches a falsy result too", () => {
    let calls = 0;
    const falsy = { zero: 0, empty: "", nil: null, no: false };
    const fn = P.memo((name) => { calls++; return falsy[name]; });
    for (const name of Object.keys(falsy)) {
      assert.equal(fn(name), falsy[name]);
      assert.equal(fn(name), falsy[name]);
    }
    assert.equal(calls, Object.keys(falsy).length);
  });
});
