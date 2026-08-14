/*
 * Shared YAML for embedded experiments — the block subset, both ways.
 *
 * An experiment whose controls hold more than a handful of values wants a way
 * to hand the reader everything they typed and take it back afterwards. JSON
 * would do that in two builtin calls, but nobody edits JSON by hand: no
 * comments to say what a key is for, and a misplaced comma for a punishment.
 * So this writes and reads the part of YAML a person actually types — nested
 * mappings, sequences, one scalar per line — and refuses the rest rather than
 * half-supporting it.
 *
 * Read and written both: block mappings and sequences to any depth, plain,
 * single-quoted and double-quoted strings, decimal numbers, true and false,
 * null (and `~`), the empty collections `[]` and `{}`, `#` comments, and a
 * leading `---`.
 *
 * Refused, by line number and with a reason: tabs, anchors and aliases, tags,
 * block scalars (`|`, `>`), flow collections holding anything, duplicate keys,
 * and anything indented where nothing should be. A file this can't read is a
 * file it says it can't read, at the line that stopped it — quietly dropping a
 * key would lose exactly the setting the reader was trying to keep.
 *
 * Writing quotes whatever wouldn't come back as itself: anything that would
 * read as a number, a boolean or a null, anything holding a character YAML
 * reserves, and anything with an edge a reader would trim. Everything written
 * here parses back to what it was written from, which is the property that
 * makes a saved file worth saving.
 */
(function () {
  "use strict";

  var Y = window.ExpYaml = window.ExpYaml || {};

  var INDENT = "  ";
  var MARKER = /^(---|\.\.\.)$/;

  // ---- Writing ---------------------------------------------------------------

  // A value that becomes lines of its own rather than text after a colon. An
  // empty collection is not one: there is nothing to indent under it, and `[]`
  // says what it is on the same line.
  function isBlock(value) {
    if (!value || typeof value !== "object") return false;
    return (Array.isArray(value) ? value.length : Object.keys(value).length) > 0;
  }

  function pad(depth) {
    var out = "";
    for (var i = 0; i < depth; i++) out += INDENT;
    return out;
  }

  function blockLines(value, depth) {
    return Array.isArray(value) ? listLines(value, depth) : mapLines(value, depth);
  }

  function mapLines(map, depth) {
    var out = [];
    Object.keys(map).forEach(function (key) {
      var value = map[key];
      var head = pad(depth) + scalarText(key, true) + ":";
      if (!isBlock(value)) {
        out.push(head + " " + scalarText(value, false));
        return;
      }
      out.push(head);
      out = out.concat(blockLines(value, depth + 1));
    });
    return out;
  }

  // A block inside a list item starts on the item's own line: "- kind: spells"
  // rather than a bare dash with the mapping under it. The dash takes the room
  // of one indent step, which is exactly why the item's contents are written a
  // step deeper and then have their first line's indent replaced.
  function listLines(list, depth) {
    var out = [];
    list.forEach(function (item) {
      if (!isBlock(item)) {
        out.push(pad(depth) + "- " + scalarText(item, false));
        return;
      }
      var inner = blockLines(item, depth + 1);
      inner[0] = pad(depth) + "- " + inner[0].slice(pad(depth + 1).length);
      out = out.concat(inner);
    });
    return out;
  }

  // What may be written without quotes: something that starts as a word and
  // holds nothing YAML reads as punctuation. `:` and `#` are left out at any
  // position rather than only where they bite, because a rule that is the same
  // everywhere is one that can be checked by reading it. Nothing that opens
  // like a number is written plain either — YAML reads numbers in more
  // notations than are worth enumerating (hex, octal, underscored,
  // sexagesimal, `.inf`), and every one of them starts with a digit, a sign or
  // a dot.
  var PLAIN = /^[A-Za-z_][A-Za-z0-9 _.,'()\/+&%!?;=-]*$/;
  var RESERVED = /^(true|false|null|~|yes|no|on|off)$/i;
  var CONTROL = /[\u0000-\u001f\u007f]/;

  function plainly(str) {
    return PLAIN.test(str) && !/\s$/.test(str) && !RESERVED.test(str) && !CONTROL.test(str);
  }

  var ESCAPES = { "\n": "\\n", "\r": "\\r", "\t": "\\t", '"': '\\"', "\\": "\\\\" };

  function quoted(str) {
    var out = '"';
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i);
      if (ESCAPES[c]) out += ESCAPES[c];
      else if (CONTROL.test(c)) out += "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4);
      else out += c;
    }
    return out + '"';
  }

  function scalarText(value, isKey) {
    if (value === null || value === undefined) {
      if (isKey) throw new Error("a mapping key cannot be null");
      return "null";
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      if (!isFinite(value)) throw new Error("YAML has no way to write " + value);
      // JS writes the very large and the very small in exponent form, which
      // YAML only reads back as a number when a decimal point comes with it.
      var written = String(value);
      return written.indexOf("e") === -1 || written.indexOf(".") !== -1
        ? written
        : written.replace("e", ".0e");
    }
    if (typeof value === "object") return Array.isArray(value) ? "[]" : "{}";
    var str = String(value);
    return plainly(str) ? str : quoted(str);
  }

  // A document, newline-terminated. A lone scalar is a legal document and is
  // written as one, so this never has to be called on a mapping only.
  Y.stringify = function (value) {
    if (!isBlock(value)) return scalarText(value, false) + "\n";
    return blockLines(value, 0).join("\n") + "\n";
  };

  // ---- Reading ---------------------------------------------------------------

  function fail(line, message) {
    return new Error("line " + line.number + ": " + message);
  }

  // Everything after an unquoted `#` that follows whitespace or starts the
  // line. Quotes are tracked because a colour is `"#f2e6cc"` and dropping the
  // rest of that line would turn a setting into a null.
  function uncommented(text) {
    var quote = null;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (quote) {
        if (c === "\\" && quote === '"') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === "#" && (i === 0 || /\s/.test(text.charAt(i - 1)))) return text.slice(0, i);
    }
    return text;
  }

  // The lines that carry something, each with the column it starts at. Blank
  // lines, comments and document markers are dropped here so that nothing
  // downstream has to keep stepping over them.
  function scan(text) {
    var out = [];
    text.split(/\r\n|\r|\n/).forEach(function (raw, index) {
      var number = index + 1;
      if (/^ *\t/.test(raw)) {
        throw new Error("line " + number + ": YAML indents with spaces, not tabs");
      }
      var indent = /^ */.exec(raw)[0].length;
      var body = uncommented(raw.slice(indent)).replace(/\s+$/, "");
      if (!body || MARKER.test(body)) return;
      out.push({ number: number, indent: indent, text: body });
    });
    return out;
  }

  function isItem(text) { return text === "-" || text.slice(0, 2) === "- "; }

  // Where a mapping's key ends: the first `:` outside quotes that a space or
  // the end of the line follows. Anything else — a time, a URL, a sentence
  // with a colon in it — is part of a value, not the end of a key.
  function keyEnd(text) {
    var quote = null;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (quote) {
        if (c === "\\" && quote === '"') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (i === 0 && (c === '"' || c === "'")) { quote = c; continue; }
      if (c === ":" && (i + 1 === text.length || text.charAt(i + 1) === " ")) return i;
    }
    return -1;
  }

  var SIMPLE = { n: "\n", r: "\r", t: "\t", "0": "\u0000", '"': '"', "'": "'", "\\": "\\", "/": "/" };

  function unescape(body, line) {
    return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, function (all, code) {
      var lead = code.charAt(0);
      if ((lead === "u" || lead === "x") && code.length > 1) {
        return String.fromCharCode(parseInt(code.slice(1), 16));
      }
      if (Object.prototype.hasOwnProperty.call(SIMPLE, lead)) return SIMPLE[lead];
      throw fail(line, "unknown escape \\" + lead);
    });
  }

  // The body of a quoted scalar, or null when `text` isn't one. A quote that
  // opens and never closes is an error rather than a string running to the end
  // of the line: the line after it would be read as part of the value.
  function quotedBody(text, line) {
    var quote = text.charAt(0);
    if (quote !== '"' && quote !== "'") return null;
    for (var i = 1; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === "\\" && quote === '"') { i++; continue; }
      if (c !== quote) continue;
      if (quote === "'" && text.charAt(i + 1) === "'") { i++; continue; }
      if (i + 1 !== text.length) throw fail(line, "text after a closing quote");
      var body = text.slice(1, i);
      return quote === '"' ? unescape(body, line) : body.replace(/''/g, "'");
    }
    throw fail(line, "a quote that is never closed");
  }

  var REFUSED = {
    "|": "block scalars", ">": "block scalars",
    "&": "anchors", "*": "aliases", "!": "tags"
  };

  // Decimal only, and a float needs its point: these are the forms every YAML
  // reader agrees are numbers. `0x1f` and `1_000` are numbers to some of them
  // and text to others, so they are left as the text they look like.
  var INTEGER = /^[-+]?[0-9]+$/;
  var DECIMAL = /^[-+]?([0-9]+\.[0-9]*|\.[0-9]+)([eE][-+][0-9]+)?$/;

  function scalarValue(text, line) {
    if (text === "") return null;
    var body = quotedBody(text, line);
    if (body !== null) return body;
    if (text === "[]") return [];
    if (text === "{}") return {};
    if (text.charAt(0) === "[" || text.charAt(0) === "{") {
      throw fail(line, "flow collections with anything in them aren't supported");
    }
    if (REFUSED[text.charAt(0)]) throw fail(line, REFUSED[text.charAt(0)] + " aren't supported");
    if (/^(null|~)$/i.test(text)) return null;
    if (/^true$/i.test(text)) return true;
    if (/^false$/i.test(text)) return false;
    if (INTEGER.test(text) || DECIMAL.test(text)) return Number(text);
    return text;
  }

  function parseKey(text, line) {
    var end = keyEnd(text);
    if (end < 0) throw fail(line, 'expected "key: value"');
    var raw = text.slice(0, end).replace(/\s+$/, "");
    if (!raw) throw fail(line, "a mapping key with no name");
    var body = quotedBody(raw, line);
    return { key: body === null ? raw : body, rest: text.slice(end + 1).replace(/^\s+/, "") };
  }

  function block(cursor, indent) {
    return isItem(cursor.lines[cursor.at].text) ? sequence(cursor, indent) : mapping(cursor, indent);
  }

  // What sits under a key with nothing after its colon: a block indented
  // further, a sequence at the key's own column (which YAML allows and people
  // write), or nothing at all, which is a null.
  function nested(cursor, indent) {
    var next = cursor.lines[cursor.at];
    if (!next) return null;
    if (next.indent > indent) return block(cursor, next.indent);
    if (next.indent === indent && isItem(next.text)) return sequence(cursor, indent);
    return null;
  }

  function mapping(cursor, indent) {
    var map = {};
    while (cursor.at < cursor.lines.length) {
      var line = cursor.lines[cursor.at];
      if (line.indent < indent) break;
      if (line.indent > indent) throw fail(line, "indented further than the key above it");
      if (isItem(line.text)) throw fail(line, "a list item where a key was expected");
      var entry = parseKey(line.text, line);
      if (Object.prototype.hasOwnProperty.call(map, entry.key)) {
        throw fail(line, 'the key "' + entry.key + '" is set twice');
      }
      cursor.at++;
      map[entry.key] = entry.rest === "" ? nested(cursor, indent) : scalarValue(entry.rest, line);
    }
    return map;
  }

  function sequence(cursor, indent) {
    var list = [];
    while (cursor.at < cursor.lines.length) {
      var line = cursor.lines[cursor.at];
      if (line.indent < indent) break;
      if (line.indent > indent) throw fail(line, "indented further than the item above it");
      if (!isItem(line.text)) break;   // a key at this column ends the sequence

      var dash = /^-\s*/.exec(line.text)[0];
      var rest = line.text.slice(dash.length);
      if (rest === "") {
        cursor.at++;
        list.push(nestedItem(cursor, indent));
        continue;
      }
      if (!isItem(rest) && keyEnd(rest) < 0) {
        cursor.at++;
        list.push(scalarValue(rest, line));
        continue;
      }
      // "- key: value" and "- - value" both open a block at the column the dash
      // leaves, with whatever follows lined up under it. Rewriting the line as
      // one at that column is what lets the ordinary readers take it from here.
      var inner = line.indent + dash.length;
      cursor.lines[cursor.at] = { number: line.number, indent: inner, text: rest };
      list.push(block(cursor, inner));
    }
    return list;
  }

  function nestedItem(cursor, indent) {
    var next = cursor.lines[cursor.at];
    return next && next.indent > indent ? block(cursor, next.indent) : null;
  }

  // An empty document is null, the same as an explicit one, so a caller has one
  // shape of nothing to handle rather than two.
  Y.parse = function (text) {
    var lines = scan(String(text == null ? "" : text));
    if (!lines.length) return null;
    var cursor = { lines: lines, at: 0 };
    if (lines.length === 1 && !isItem(lines[0].text) && keyEnd(lines[0].text) < 0) {
      return scalarValue(lines[0].text, lines[0]);
    }
    var value = block(cursor, lines[0].indent);
    if (cursor.at < lines.length) throw fail(lines[cursor.at], "left over after the document ended");
    return value;
  };
})();
