"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");
const { canvasDocument } = require("./sprite");

const MODULE_DIR = path.join(__dirname, "..");
const MANIFEST = "manifest.yaml";
const SCRIPT_EXT = ".js";
const COMMENT = "#";
const ITEM = /^\s*-\s+(\S.*)$/;
const FIELD = /^(\w+):\s*(.*)$/;
const SPRITES = /^sprites-/;
// The constants and the entry point attach nothing of their own.
const NAMELESS = ["config.js", "app.js"];

// The manifest is a flat map of scalars and lists of scalars: enough YAML for
// this file, and no dependency.
function parseYaml(text) {
  const out = {};
  let field = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(COMMENT)) continue;
    const item = ITEM.exec(line);
    if (item) {
      if (!Array.isArray(out[field])) throw new Error(`${MANIFEST}: an item under no list`);
      out[field].push(item[1]);
      continue;
    }
    const named = FIELD.exec(line);
    if (!named) throw new Error(`${MANIFEST}: cannot read "${line}"`);
    field = named[1];
    out[field] = named[2] || [];
  }
  return out;
}

const B = load(["config.js"]);
const manifest = parseYaml(fs.readFileSync(path.join(MODULE_DIR, MANIFEST), "utf8"));
const listed = (manifest.styles || []).concat(manifest.scripts || []);

describe("manifest", () => {
  it("builds itself into the element config.js names", () => {
    assert.equal(manifest.mount, B.MOUNT_ID);
  });

  it("lists only files that are there", () => {
    assert.ok(listed.length > 0);
    for (const file of listed) {
      assert.ok(fs.existsSync(path.join(MODULE_DIR, file)), file);
    }
  });

  it("lists every module of the experiment, so none is left out of the page", () => {
    const modules = fs.readdirSync(MODULE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(SCRIPT_EXT))
      .map((entry) => entry.name);
    const scripts = new Set(manifest.scripts);
    for (const name of modules) assert.ok(scripts.has(name), `${name} is in no manifest`);
  });

  it("lists the scripts in an order that loads, each module attaching its own", () => {
    const window = {
      document: Object.assign(canvasDocument(), { getElementById: () => null })
    };
    const namespace = load(manifest.scripts, window);
    const own = manifest.scripts.filter((script) =>
      !script.startsWith(".") && NAMELESS.indexOf(script) < 0);
    for (const script of own) {
      const name = path.basename(script, SCRIPT_EXT).replace(SPRITES, "");
      assert.ok(namespace[name], `${script} attached no ${name}`);
    }
  });
});
