/*
 * Quote Card — advanced mode (per-group CSS editing).
 *
 * Each control group can be edited as a CSS declaration block. While a
 * group's advanced mode is on, its CSS is the source of truth: app.js applies
 * the declarations onto that group's resolved style struct at render time, so
 * advanced values aren't limited to what the controls offer (arbitrary font
 * families, unclamped sizes, alpha colors, transforms). The basic controls
 * are disabled and mirror the CSS best-effort (clamped into their ranges).
 *
 * Each group defines:
 *   gen(state)                     → canonical CSS text from the control state
 *   applyToStyle(decls, style, is) → merge declarations into a style struct,
 *                                    reporting {errors, warnings} into `is`.
 *                                    Errors block; warnings are declarations
 *                                    that are valid CSS but can't be rendered
 *                                    into a PNG (e.g. animation) and are
 *                                    ignored.
 *   harvest(style, state)          → mirror a resolved style back onto the
 *                                    control state (clamped, best-effort)
 */
(function () {
  "use strict";

  var Q = window.QCard = window.QCard || {};
  var css = Q.css, R = Q.RANGES;

  function styleColor(value, what, is) {
    var c = css.color(value);
    if (!c) { is.errors.push("can’t parse the " + what + " color “" + value + "”"); return null; }
    return c.css;
  }
  function setAlign(value, style, is) {
    var v = value.toLowerCase();
    if (v !== "left" && v !== "center" && v !== "right") { is.errors.push("text-align must be left, center, or right"); return; }
    style.align = v;
  }
  function setTransform(value, style, is) {
    var t = css.parseTransform(value);
    if (!t.ok) { is.errors.push("can’t parse the transform “" + value + "”"); return; }
    style.transform = t.matrix;
  }
  function warnUnsupported(prop, is) {
    is.warnings.push("“" + prop + "” can’t be rendered into a PNG — ignored");
  }
  function applyShadow(value, style, is) {
    if (value.toLowerCase() === "none") { style.shadow = null; return; }
    var px = [], rest = [];
    css.splitTokens(value).forEach(function (tok) {
      var n = css.px(tok);
      if (n != null) px.push(n); else rest.push(tok);
    });
    if (px.length < 2 || px.length > 3) {
      is.errors.push("text-shadow needs “<x>px <y>px <blur>px <color>” (or none)");
      return;
    }
    var color = style.shadow ? style.shadow.color : "rgba(0,0,0,0.4)";
    if (rest.length) {
      color = styleColor(rest.join(" "), "text-shadow", is);
      if (color == null) return;
    }
    style.shadow = { x: px[0], y: px[1], blur: px[2] || 0, color: color };
  }
  // Harvests a raw color string into a hex control (+ optional opacity
  // control). Colors the pickers can't express (exotic spaces) leave them.
  function harvestColor(raw, state, hexField, opacityField, opacityRange) {
    var c = css.color(raw);
    if (!c || !c.hex) return;
    if (opacityField) {
      state[hexField] = c.hex;
      state[opacityField] = Q.clampR(Math.round(c.alpha * 100), opacityRange);
    } else if (c.alpha === 1) {
      state[hexField] = c.hex;
    }
  }
  function harvestFamily(familyCss, state, field) {
    var key = Q.matchFamily(familyCss);
    if (key) state[field] = key;
  }

  var text = {
    gen: function (state) {
      return [
        "/* Quote text. px values are design units at a 1200px-wide card. */",
        "color: " + state.textColor + ";",
        "font-family: " + Q.familyOf(state.font) + ";",
        state.autoSize
          ? "/* no font-size — auto-fits the card; set one (e.g. font-size: 64px) to take over */"
          : "font-size: " + state.fontSize + "px;",
        "line-height: " + +state.lineHeight.toFixed(2) + ";",
        "text-align: " + state.align + ";",
        "text-shadow: " + (state.shadow
          ? state.shadowX + "px " + state.shadowY + "px " + state.shadowBlur + "px " + css.rgba(state.shadowColor, state.shadowOpacity / 100)
          : "none") + ";"
      ].join("\n");
    },
    applyToStyle: function (decls, style, is) {
      var sawSize = false;
      decls.forEach(function (d) {
        switch (d.prop) {
          case "color":
            var c = styleColor(d.value, "quote text", is);
            if (c != null) style.color = c;
            break;
          case "font-family":
            style.family = d.value;
            break;
          case "font-size":
            var px = css.px(d.value);
            if (px == null || px <= 0) { is.errors.push("font-size must be a positive px value (e.g. 64px)"); break; }
            sawSize = true;
            style.autoSize = false;
            style.fontSize = px;
            break;
          case "line-height":
            var n = css.num(d.value);
            if (n == null || n <= 0) { is.errors.push("line-height must be a positive number (e.g. 1.45)"); break; }
            style.lineHeight = n;
            break;
          case "text-align": setAlign(d.value, style, is); break;
          case "text-shadow": applyShadow(d.value, style, is); break;
          case "transform": setTransform(d.value, style, is); break;
          default: warnUnsupported(d.prop, is);
        }
      });
      if (!sawSize) style.autoSize = true; // no font-size declared = auto-fit
    },
    harvest: function (style, state) {
      harvestColor(style.color, state, "textColor", null);
      harvestFamily(style.family, state, "font");
      state.autoSize = style.autoSize;
      if (!style.autoSize) state.fontSize = Q.clampR(Math.round(style.fontSize), R.fontSize);
      state.lineHeight = Q.clampR(style.lineHeight, R.lineHeight);
      state.align = style.align;
      state.shadow = !!style.shadow;
      if (style.shadow) {
        state.shadowX = Q.clampR(Math.round(style.shadow.x), R.shadowOffset);
        state.shadowY = Q.clampR(Math.round(style.shadow.y), R.shadowOffset);
        state.shadowBlur = Q.clampR(Math.round(style.shadow.blur), R.shadowBlur);
        harvestColor(style.shadow.color, state, "shadowColor", "shadowOpacity", R.shadowOpacity);
      }
    }
  };

  var attribution = {
    gen: function (state) {
      return [
        "/* Attribution line. font-size may be a % of the quote size or absolute px. */",
        "color: " + (state.attrOpacity < 100 ? css.rgba(state.attrColor, state.attrOpacity / 100) : state.attrColor) + ";",
        "font-family: " + Q.familyOf(state.attrFont) + ";",
        "font-size: " + state.attrSizePct + "%;",
        "font-style: " + (state.attrItalic ? "italic" : "normal") + ";",
        "text-align: " + state.attrAlign + ";"
      ].join("\n");
    },
    applyToStyle: function (decls, style, is) {
      decls.forEach(function (d) {
        switch (d.prop) {
          case "color":
            var c = styleColor(d.value, "attribution", is);
            if (c != null) style.color = c;
            break;
          case "font-family":
            style.family = d.value;
            break;
          case "font-size":
            var p = css.pct(d.value), px = css.px(d.value);
            if (p != null && p > 0) { style.sizePct = p; style.sizePx = null; }
            else if (px != null && px > 0) { style.sizePx = px; }
            else is.errors.push("attribution font-size must be a % of the quote size or a px value");
            break;
          case "font-style":
            var v = d.value.toLowerCase();
            if (v === "italic" || v === "oblique") style.italic = true;
            else if (v === "normal") style.italic = false;
            else is.errors.push("font-style must be italic or normal");
            break;
          case "text-align": setAlign(d.value, style, is); break;
          case "transform": setTransform(d.value, style, is); break;
          default: warnUnsupported(d.prop, is);
        }
      });
    },
    harvest: function (style, state) {
      harvestColor(style.color, state, "attrColor", "attrOpacity", R.attrOpacity);
      harvestFamily(style.family, state, "attrFont");
      if (style.sizePx == null) state.attrSizePct = Q.clampR(Math.round(style.sizePct), R.attrSizePct);
      state.attrItalic = style.italic;
      state.attrAlign = style.align;
    }
  };

  var frame = {
    gen: function (state) {
      return [
        "/* Card frame. border-style: none | solid | double | dashed | dotted | wavy. */",
        "background-color: " + state.background + ";",
        "border: " + (state.borderStyle === "none"
          ? "none"
          : state.borderWidth + "px " + state.borderStyle + " " + state.borderColor) + ";",
        "border-radius: " + state.borderRadius + "px;",
        "padding: " + state.padding + "%; /* text padding, % of the shorter side */",
        "--border-inset: " + state.borderInset + "%; /* gap between card edge and border */"
      ].join("\n");
    },
    applyToStyle: function (decls, style, is) {
      function shorthand(value) {
        var toks = css.splitTokens(value);
        if (toks.length === 1 && toks[0].toLowerCase() === "none") { style.borderStyle = "none"; return; }
        toks.forEach(function (tok) {
          var lower = tok.toLowerCase();
          var px = css.px(tok);
          if (px != null) { style.borderWidth = px; return; }
          if (Q.BORDER_STYLES.indexOf(lower) !== -1) { style.borderStyle = lower; return; }
          var c = css.color(tok);
          if (c) { style.borderColor = c.css; return; }
          is.errors.push("can’t make sense of “" + tok + "” in border");
        });
      }
      decls.forEach(function (d) {
        switch (d.prop) {
          case "background":
          case "background-color":
            var c = styleColor(d.value, "background", is);
            if (c != null) style.background = c;
            break;
          case "border": shorthand(d.value); break;
          case "border-width":
            var bw = css.px(d.value);
            if (bw == null || bw < 0) { is.errors.push("border-width must be a px value"); break; }
            style.borderWidth = bw;
            break;
          case "border-style":
            var bs = d.value.toLowerCase();
            if (Q.BORDER_STYLES.indexOf(bs) === -1) { is.errors.push("border-style must be one of: " + Q.BORDER_STYLES.join(", ")); break; }
            style.borderStyle = bs;
            break;
          case "border-color":
            var bc = styleColor(d.value, "border", is);
            if (bc != null) style.borderColor = bc;
            break;
          case "border-radius":
            var br = css.px(d.value);
            if (br == null || br < 0) { is.errors.push("border-radius must be a px value"); break; }
            style.borderRadius = br;
            break;
          case "padding":
            var pp = css.pct(d.value);
            if (pp == null || pp < 0) { is.errors.push("padding is a percentage of the shorter side (e.g. 8%)"); break; }
            style.padding = pp;
            break;
          case "--border-inset":
            var bi = css.pct(d.value);
            if (bi == null || bi < 0) { is.errors.push("--border-inset is a percentage of the shorter side (e.g. 4%)"); break; }
            style.borderInset = bi;
            break;
          case "transform": setTransform(d.value, style, is); break;
          default: warnUnsupported(d.prop, is);
        }
      });
    },
    harvest: function (style, state) {
      harvestColor(style.background, state, "background", null);
      harvestColor(style.borderColor, state, "borderColor", null);
      state.borderStyle = style.borderStyle;
      state.borderWidth = Q.clampR(Math.round(style.borderWidth), R.borderWidth);
      state.borderRadius = Q.clampR(Math.round(style.borderRadius), R.borderRadius);
      state.borderInset = Q.clampR(Math.round(style.borderInset), R.borderInset);
      state.padding = Q.clampR(Math.round(style.padding), R.padding);
    }
  };

  Q.adv = { groups: { text: text, attribution: attribution, frame: frame } };
})();
