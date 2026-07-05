/*
 * Quote Card — a client-side PNG quote generator (app entry).
 *
 * Type a quote in Markdown, style it, and download a PNG. Everything happens
 * in the browser: the preview <canvas> always holds the bitmap at the chosen
 * output resolution (CSS merely scales it to fit), so the download is exactly
 * what you see — no server round-trip, no second render.
 *
 * This file owns the control state, the DOM, and the wiring; the heavy
 * lifting lives in the modules the manifest loads before it:
 *   config.js   — fonts, presets, control ranges       (QCard.FONTS, …)
 *   csskit.js   — CSS parsing helpers                  (QCard.css)
 *   markdown.js — the inline Markdown dialect          (QCard.markdown)
 *   layout.js   — text measurement, wrapping, auto-fit (QCard.layout)
 *   render.js   — draws a card from resolved styles    (QCard.render)
 *   advanced.js — per-group CSS editing                (QCard.adv)
 *
 * Styling flows one way: the basic controls (state) produce per-group style
 * structs; a group whose advanced mode is on then overlays its CSS
 * declarations onto that struct (arbitrary values allowed) while its controls
 * are disabled and mirror the CSS best-effort. Closing advanced mode drops
 * the overlay, so only what the controls cover applies again.
 */
(function () {
  "use strict";

  var Q = window.QCard;
  var root = document.getElementById("experiment-ext-qcard");
  if (!root || !Q) return;

  // ---- State (what the basic controls edit) -----------------------------------
  var state = {
    body: "We are what we *repeatedly* do. **Excellence**, then, is not an act, but a habit.",
    attribution: "Will Durant",
    curly: true,

    font: "fira-code",
    align: "center",
    textColor: "#f5f0e6",
    autoSize: true,
    fontSize: 64,     // design px (at a 1200px-wide card; scales with output)
    lineHeight: 1.45,

    shadow: false,
    shadowBlur: 18,   // design px
    shadowX: 5,       // design px
    shadowY: 8,       // design px
    shadowColor: "#000000",
    shadowOpacity: 40, // %

    attrFont: "fira-code",
    attrItalic: true,
    attrAlign: "right",
    attrColor: "#f5f0e6",
    attrOpacity: 78,  // %
    attrSizePct: 55,  // % of the body size, so auto-fit scales both together

    borderStyle: "solid",
    borderWidth: 6,   // design px
    borderColor: "#d4a24e",
    borderRadius: 28, // design px
    borderInset: 4,   // % of the shorter output side
    background: "#252a37",
    padding: 8,       // % of the shorter output side, inside the border

    preset: "bsky",
    width: 1200,
    height: 675
  };

  // Active advanced-mode overlays: group key → declaration list (only while
  // that group's panel is open and its CSS is valid).
  var advActive = { text: null, attribution: null, frame: null };

  // Which basic controls belong to which advanced-mode group (disabled while
  // the group's CSS is authoritative).
  var GROUP_CTLS = {
    text: ["font", "align", "textColor", "autoSize", "fontSize", "lineHeight", "shadow", "shadowBlur", "shadowX", "shadowY", "shadowOpacity", "shadowColor"],
    attribution: ["attrFont", "attrAlign", "attrColor", "attrItalic", "attrSizePct", "attrOpacity"],
    frame: ["borderStyle", "borderColor", "borderWidth", "borderRadius", "borderInset", "padding", "background"]
  };

  // Control changes that require re-measuring the text.
  var REBUILD = { body: 1, attribution: 1, curly: 1, font: 1, attrFont: 1, attrItalic: 1 };

  var canvas, ctx; // assigned at boot, once the skeleton exists

  function el(sel) { return root.querySelector(sel); }
  function ctl(name) { return root.querySelector('[data-ctl="' + name + '"]'); }

  // ---- Style resolution ---------------------------------------------------------
  // Control state → per-group style structs, then any active advanced-mode
  // CSS overlays its declarations (validated when typed, so silently here).
  function baseStyleFor(key) {
    if (key === "text") {
      return {
        color: state.textColor,
        family: Q.familyOf(state.font),
        autoSize: state.autoSize,
        fontSize: state.fontSize,
        lineHeight: state.lineHeight,
        align: state.align,
        shadow: state.shadow
          ? { x: state.shadowX, y: state.shadowY, blur: state.shadowBlur, color: Q.css.rgba(state.shadowColor, state.shadowOpacity / 100) }
          : null,
        transform: null
      };
    }
    if (key === "attribution") {
      return {
        color: Q.css.rgba(state.attrColor, state.attrOpacity / 100),
        family: Q.familyOf(state.attrFont),
        italic: state.attrItalic,
        sizePct: state.attrSizePct,
        sizePx: null,
        align: state.attrAlign,
        transform: null
      };
    }
    return {
      background: state.background,
      borderStyle: state.borderStyle,
      borderWidth: state.borderWidth,
      borderColor: state.borderColor,
      borderRadius: state.borderRadius,
      borderInset: state.borderInset,
      padding: state.padding,
      transform: null
    };
  }

  function resolveStyle(key) {
    var style = baseStyleFor(key);
    if (advActive[key]) Q.adv.groups[key].applyToStyle(advActive[key], style, { errors: [], warnings: [] });
    return style;
  }

  function resolveStyles() {
    return { text: resolveStyle("text"), attr: resolveStyle("attribution"), frame: resolveStyle("frame") };
  }

  // ---- Document model ------------------------------------------------------------
  // The measured word structure. Rebuilt when the text or the resolved fonts
  // change; wrapping at a given size is then pure arithmetic (layout.js).
  var doc = null;

  function buildDoc() {
    var bodyFamily = resolveStyle("text").family;
    var attrStyle = resolveStyle("attribution");
    var src = state.body.replace(/\r\n/g, "\n").trim();
    if (state.curly && src) src = "“" + src + "”";
    var paragraphs = src ? src.split(/\n{2,}/) : [];
    var hardLines = [];
    paragraphs.forEach(function (para, pi) {
      para.split("\n").forEach(function (line) {
        hardLines.push({ words: Q.layout.wordsFromRuns(Q.markdown.parseInline(line), bodyFamily), para: pi });
      });
    });
    var attr = state.attribution.trim();
    var attrWords = attr
      ? Q.layout.wordsFromRuns([{ text: "— " + attr, bold: false, italic: attrStyle.italic, strike: false, code: false }], attrStyle.family)
      : null;
    doc = { hardLines: hardLines, attrWords: attrWords };
  }

  // ---- Render ----------------------------------------------------------------------
  function render() {
    if (canvas.width !== state.width) canvas.width = state.width;
    if (canvas.height !== state.height) canvas.height = state.height;
    Q.render.drawCard(ctx, state.width, state.height, doc, resolveStyles());
    syncCaption();
  }

  // The canvas holds the bitmap at full output resolution and CSS scales it
  // to fit the preview column — say so when that's happening, so "what you
  // see" is understood as a zoomed view, not the pixel-for-pixel output.
  function syncCaption() {
    var shown = canvas.getBoundingClientRect().width;
    var scale = shown ? shown / state.width : 1;
    el('[data-out="caption"]').textContent =
      state.width + " × " + state.height + " px" +
      (Math.abs(scale - 1) < 0.01 ? "" : " · preview scaled to " + Math.round(scale * 100) + "%") +
      " · rendered entirely in your browser";
  }

  var rafId = null;
  function sched() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = null; render(); });
  }

  // ---- Download ------------------------------------------------------------------
  function download() {
    var btn = ctl("download");
    var label = btn.querySelector("span");
    btn.disabled = true;
    label.textContent = "Rendering…";
    render(); // make sure the bitmap reflects the latest state
    canvas.toBlob(function (blob) {
      btn.disabled = false;
      label.textContent = "Download PNG";
      if (!blob) return;
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "quote-" + state.width + "x" + state.height + ".png";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }, "image/png");
  }

  // ---- Advanced mode UI -------------------------------------------------------------
  function advToggle(key) {
    var panel = el('[data-adv-panel="' + key + '"]');
    var btn = el('[data-advtoggle="' + key + '"]');
    var opening = panel.hidden;
    if (opening) {
      var ta = el('[data-adv="' + key + '"]');
      ta.value = Q.adv.groups[key].gen(state);
      advActive[key] = Q.css.parseDecls(ta.value).decls; // canonical, error-free
      advSetIssues(key, { errors: [], warnings: [] });
    } else {
      advActive[key] = null;
    }
    panel.hidden = !opening;
    btn.classList.toggle("is-active", opening);
    btn.setAttribute("aria-pressed", opening ? "true" : "false");
    btn.closest(".experiment-ext-qcard-group").classList.toggle("experiment-ext-qcard-adv-on", opening);
    buildDoc();
    syncEnabled();
    sched();
  }

  function advApply(key, cssText) {
    var parsed = Q.css.parseDecls(cssText);
    var issues = { errors: parsed.errors.slice(), warnings: [] };
    var probe = baseStyleFor(key);
    Q.adv.groups[key].applyToStyle(parsed.decls, probe, issues);
    advSetIssues(key, issues);
    if (issues.errors.length) return; // keep the last valid CSS applied
    advActive[key] = parsed.decls;
    Q.adv.groups[key].harvest(probe, state); // mirror onto the controls
    buildDoc();
    syncControls();
    syncEnabled();
    syncReadouts();
    sched();
  }

  function escHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function advSetIssues(key, issues) {
    var ta = el('[data-adv="' + key + '"]');
    var box = el('[data-adv-errors="' + key + '"]');
    ta.classList.toggle("experiment-ext-qcard-adv-invalid", issues.errors.length > 0);
    ta.setAttribute("aria-invalid", issues.errors.length ? "true" : "false");
    var items = issues.errors.map(function (e) { return "<li>" + escHtml(e) + "</li>"; })
      .concat(issues.warnings.map(function (w) { return '<li class="is-warning">' + escHtml(w) + "</li>"; }));
    box.hidden = !items.length;
    box.innerHTML = items.join("");
  }

  // ---- Basic controls ----------------------------------------------------------------
  function onControl(e) {
    var t = e.target;
    if (t.dataset && t.dataset.adv) { advApply(t.dataset.adv, t.value); return; }
    var name = t.dataset && t.dataset.ctl;
    if (!name) return;
    // Dimensions commit on change (blur/Enter), so clamping doesn't fight
    // with half-typed values.
    if ((name === "width" || name === "height") && e.type === "input") return;

    if (t.type === "checkbox") state[name] = t.checked;
    else if (t.type === "range" || t.type === "number") state[name] = +t.value;
    else state[name] = t.value;

    if (name === "lineHeight") state.lineHeight = +t.value / 100;
    if (name === "preset") applyPreset(t.value);
    if (name === "width" || name === "height") {
      state[name] = clampDim(+t.value);
      t.value = state[name];
      state.preset = matchPreset(state.width, state.height);
      ctl("preset").value = state.preset;
    }
    if (REBUILD[name]) buildDoc();
    syncEnabled();
    syncReadouts();
    sched();
  }

  function clampDim(v) {
    if (!isFinite(v)) return 64;
    return Math.max(64, Math.min(4096, Math.round(v)));
  }

  function matchPreset(w, h) {
    for (var i = 0; i < Q.PRESETS.length; i++) if (Q.PRESETS[i].w === w && Q.PRESETS[i].h === h) return Q.PRESETS[i].key;
    return "custom";
  }

  function applyPreset(key) {
    state.preset = key;
    for (var i = 0; i < Q.PRESETS.length; i++) {
      if (Q.PRESETS[i].key === key && Q.PRESETS[i].w) {
        state.width = Q.PRESETS[i].w;
        state.height = Q.PRESETS[i].h;
        ctl("width").value = state.width;
        ctl("height").value = state.height;
      }
    }
  }

  function syncEnabled() {
    Object.keys(GROUP_CTLS).forEach(function (key) {
      var advOn = !!advActive[key];
      GROUP_CTLS[key].forEach(function (name) { ctl(name).disabled = advOn; });
    });
    if (!advActive.text) ctl("fontSize").disabled = state.autoSize;
    el(".experiment-ext-qcard-shadow-controls").hidden = !state.shadow;
    var custom = state.preset === "custom";
    ctl("width").readOnly = !custom;
    ctl("height").readOnly = !custom;
  }

  function syncReadouts() {
    // The closed font selects preview their current choice in its own face
    // (the options themselves are styled in buildSkeleton).
    ctl("font").style.fontFamily = Q.familyOf(state.font);
    ctl("attrFont").style.fontFamily = Q.familyOf(state.attrFont);
    el('[data-val="fontSize"]').textContent = state.autoSize ? "auto" : state.fontSize + " px";
    el('[data-val="lineHeight"]').textContent = state.lineHeight.toFixed(2);
    el('[data-val="shadowBlur"]').textContent = state.shadowBlur + " px";
    el('[data-val="shadowX"]').textContent = state.shadowX + " px";
    el('[data-val="shadowY"]').textContent = state.shadowY + " px";
    el('[data-val="shadowOpacity"]').textContent = state.shadowOpacity + "%";
    el('[data-val="attrSizePct"]').textContent = state.attrSizePct + "%";
    el('[data-val="attrOpacity"]').textContent = state.attrOpacity + "%";
    el('[data-val="borderWidth"]').textContent = state.borderWidth + " px";
    el('[data-val="borderRadius"]').textContent = state.borderRadius + " px";
    el('[data-val="borderInset"]').textContent = state.borderInset + "%";
    el('[data-val="padding"]').textContent = state.padding + "%";
  }

  function syncControls() {
    ctl("body").value = state.body;
    ctl("attribution").value = state.attribution;
    ctl("curly").checked = state.curly;
    fontPickSync.font();
    ctl("align").value = state.align;
    ctl("textColor").value = state.textColor;
    ctl("autoSize").checked = state.autoSize;
    ctl("fontSize").value = state.fontSize;
    ctl("lineHeight").value = Math.round(state.lineHeight * 100);
    ctl("shadow").checked = state.shadow;
    ctl("shadowBlur").value = state.shadowBlur;
    ctl("shadowX").value = state.shadowX;
    ctl("shadowY").value = state.shadowY;
    ctl("shadowColor").value = state.shadowColor;
    ctl("shadowOpacity").value = state.shadowOpacity;
    fontPickSync.attrFont();
    ctl("attrItalic").checked = state.attrItalic;
    ctl("attrAlign").value = state.attrAlign;
    ctl("attrColor").value = state.attrColor;
    ctl("attrOpacity").value = state.attrOpacity;
    ctl("attrSizePct").value = state.attrSizePct;
    ctl("borderStyle").value = state.borderStyle;
    ctl("borderWidth").value = state.borderWidth;
    ctl("borderColor").value = state.borderColor;
    ctl("borderRadius").value = state.borderRadius;
    ctl("borderInset").value = state.borderInset;
    ctl("background").value = state.background;
    ctl("padding").value = state.padding;
    ctl("preset").value = state.preset;
    ctl("width").value = state.width;
    ctl("height").value = state.height;
  }

  // ---- Font pickers ----------------------------------------------------------------
  // Behavior for the custom listboxes fontPickHtml() builds: click or
  // Enter/Space toggles the list, clicking an entry picks it, ArrowUp/Down
  // steps the choice (like a native select), Escape and clicking elsewhere
  // close. Selection flows through the same state + rebuild path as the
  // native controls.
  var fontPickSync = {};

  function initFontPick(name) {
    var wrap = root.querySelector('[data-fontpick="' + name + '"]');
    var btn = wrap.querySelector("button");
    var list = wrap.querySelector("ul");
    var items = [].slice.call(list.children);

    function idx() {
      for (var i = 0; i < Q.FONTS.length; i++) if (Q.FONTS[i].key === state[name]) return i;
      return 0;
    }

    function sync() {
      var f = Q.FONTS[idx()];
      btn.textContent = f.label;
      items.forEach(function (li) {
        li.setAttribute("aria-selected", li.dataset.value === f.key ? "true" : "false");
      });
    }

    function setOpen(open) {
      list.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function choose(key) {
      setOpen(false);
      if (state[name] === key) return;
      state[name] = key;
      sync();
      buildDoc(); // both font controls are REBUILD controls
      syncEnabled();
      syncReadouts();
      sched();
    }

    btn.addEventListener("click", function () { setOpen(list.hidden); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { setOpen(false); return; }
      var step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      choose(Q.FONTS[Q.clamp(idx() + step, 0, Q.FONTS.length - 1)].key);
    });
    list.addEventListener("click", function (e) {
      var li = e.target.closest ? e.target.closest("[data-value]") : null;
      if (li) choose(li.dataset.value);
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) setOpen(false);
    });

    fontPickSync[name] = sync;
    sync();
  }

  // ---- Skeleton ------------------------------------------------------------------
  function buildSkeleton(mount) {
    function range(label, name, min, max) {
      return '<div class="experiment-ext-qcard-range-row">' +
        '<label for="experiment-ext-qcard-' + name + '">' + label + '</label>' +
        '<input type="range" id="experiment-ext-qcard-' + name + '" data-ctl="' + name + '" min="' + min + '" max="' + max + '">' +
        '<span class="experiment-ext-qcard-range-val" data-val="' + name + '"></span>' +
        '</div>';
    }
    function rangeR(label, name, key) {
      return range(label, name, Q.RANGES[key][0], Q.RANGES[key][1]);
    }
    // A control group: <details> with, for stylable groups, a 🧑‍💻 advanced-
    // mode toggle in the summary and a hidden CSS editor at the end.
    function group(title, key, bodyHtml) {
      var advBits = key
        ? '<button type="button" class="experiment-ext-qcard-adv-toggle" data-advtoggle="' + key + '" aria-pressed="false" title="Advanced: edit this group as CSS">🧑&zwj;💻</button>'
        : "";
      var advPanel = key
        ? '<div class="experiment-ext-qcard-adv" data-adv-panel="' + key + '" hidden>' +
          '<label class="experiment-ext-qcard-field-label" for="experiment-ext-qcard-adv-' + key + '">CSS</label>' +
          '<textarea id="experiment-ext-qcard-adv-' + key + '" class="experiment-ext-qcard-adv-css" data-adv="' + key + '" rows="8" spellcheck="false"></textarea>' +
          '<ul class="experiment-ext-qcard-adv-errors" data-adv-errors="' + key + '" hidden></ul>' +
          "</div>"
        : "";
      return '<details class="experiment-ext-qcard-group" open><summary>' +
        "<span>" + title + "</span>" + advBits + "</summary>" +
        '<div class="experiment-ext-qcard-group-body">' + bodyHtml + advPanel + "</div></details>";
    }
    // The font pickers are custom listboxes rather than <select>s: native
    // option popups ignore per-option fonts, and each entry here renders in
    // its own face (the webfonts are prefetched before boot, so they're
    // ready). A <div> wrapper, not a <label> — label activation would
    // re-click the button when an entry is chosen.
    function fontPickHtml(name) {
      var items = Q.FONTS.map(function (f) {
        return '<li role="option" data-value="' + f.key + '" style="font-family: ' + escHtml(f.family) + '">' + f.label + "</li>";
      }).join("");
      return '<div class="experiment-ext-qcard-field experiment-ext-qcard-fontpick" data-fontpick="' + name + '">' +
        '<span class="experiment-ext-qcard-field-label" id="experiment-ext-qcard-' + name + '-label">Font</span>' +
        '<button type="button" class="experiment-ext-qcard-select experiment-ext-qcard-fontpick-btn" data-ctl="' + name + '"' +
        ' aria-haspopup="listbox" aria-expanded="false" aria-labelledby="experiment-ext-qcard-' + name + '-label"></button>' +
        '<ul class="experiment-ext-qcard-fontpick-list" role="listbox" hidden>' + items + "</ul>" +
        "</div>";
    }
    var alignOptions = '<option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>';
    var presetOptions = Q.PRESETS.map(function (p) {
      return '<option value="' + p.key + '">' + p.label + "</option>";
    }).join("");
    var borderOptions = Q.BORDER_STYLES.map(function (s) {
      return '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + "</option>";
    }).join("");

    mount.innerHTML = '<div class="experiment-ext-qcard-layout">' +
      '<div class="experiment-ext-qcard-panel">' +

      '<div class="experiment-ext-qcard-field">' +
      '<label class="experiment-ext-qcard-field-label" for="experiment-ext-qcard-body">Quote &mdash; Markdown: **bold**, *italic*, `code`, ~~strike~~</label>' +
      '<textarea id="experiment-ext-qcard-body" class="experiment-ext-qcard-textarea" rows="5" data-ctl="body" spellcheck="false"></textarea>' +
      "</div>" +

      '<div class="experiment-ext-qcard-field">' +
      '<label class="experiment-ext-qcard-field-label" for="experiment-ext-qcard-attr">Attribution</label>' +
      '<input id="experiment-ext-qcard-attr" class="experiment-ext-qcard-input" type="text" data-ctl="attribution">' +
      "</div>" +

      '<label class="experiment-ext-qcard-check"><input type="checkbox" data-ctl="curly"> Surround with curly quotes</label>' +

      group("Text", "text",
        '<div class="experiment-ext-qcard-grid2">' +
        fontPickHtml("font") +
        '<label class="experiment-ext-qcard-field"><span class="experiment-ext-qcard-field-label">Alignment</span><select class="experiment-ext-qcard-select" data-ctl="align">' + alignOptions + "</select></label>" +
        "</div>" +
        '<div class="experiment-ext-qcard-grid2">' +
        '<label class="experiment-ext-qcard-color"><input type="color" data-ctl="textColor"> Text color</label>' +
        '<label class="experiment-ext-qcard-check"><input type="checkbox" data-ctl="autoSize"> Auto-fit size</label>' +
        "</div>" +
        rangeR("Size", "fontSize", "fontSize") +
        range("Line height", "lineHeight", 100, 220) +
        '<label class="experiment-ext-qcard-check"><input type="checkbox" data-ctl="shadow"> Drop shadow</label>' +
        '<div class="experiment-ext-qcard-shadow-controls" hidden>' +
        rangeR("Blur", "shadowBlur", "shadowBlur") +
        rangeR("Offset X", "shadowX", "shadowOffset") +
        rangeR("Offset Y", "shadowY", "shadowOffset") +
        rangeR("Opacity", "shadowOpacity", "shadowOpacity") +
        '<label class="experiment-ext-qcard-color"><input type="color" data-ctl="shadowColor"> Shadow color</label>' +
        "</div>"
      ) +

      group("Attribution", "attribution",
        '<div class="experiment-ext-qcard-grid2">' +
        fontPickHtml("attrFont") +
        '<label class="experiment-ext-qcard-field"><span class="experiment-ext-qcard-field-label">Alignment</span><select class="experiment-ext-qcard-select" data-ctl="attrAlign">' + alignOptions + "</select></label>" +
        "</div>" +
        '<div class="experiment-ext-qcard-grid2">' +
        '<label class="experiment-ext-qcard-color"><input type="color" data-ctl="attrColor"> Color</label>' +
        '<label class="experiment-ext-qcard-check"><input type="checkbox" data-ctl="attrItalic"> Italic</label>' +
        "</div>" +
        rangeR("Size", "attrSizePct", "attrSizePct") +
        rangeR("Opacity", "attrOpacity", "attrOpacity")
      ) +

      group("Frame", "frame",
        '<div class="experiment-ext-qcard-grid2">' +
        '<label class="experiment-ext-qcard-field"><span class="experiment-ext-qcard-field-label">Border style</span><select class="experiment-ext-qcard-select" data-ctl="borderStyle">' + borderOptions + "</select></label>" +
        '<label class="experiment-ext-qcard-color"><input type="color" data-ctl="borderColor"> Border color</label>' +
        "</div>" +
        rangeR("Thickness", "borderWidth", "borderWidth") +
        rangeR("Corner radius", "borderRadius", "borderRadius") +
        rangeR("Border inset", "borderInset", "borderInset") +
        rangeR("Text padding", "padding", "padding") +
        '<label class="experiment-ext-qcard-color"><input type="color" data-ctl="background"> Background color</label>'
      ) +

      // Output is a bitmap size, not styling — no advanced (CSS) mode here.
      group("Output", null,
        '<label class="experiment-ext-qcard-field"><span class="experiment-ext-qcard-field-label">Resolution</span><select class="experiment-ext-qcard-select" data-ctl="preset">' + presetOptions + "</select></label>" +
        '<div class="experiment-ext-qcard-dims">' +
        '<label><span class="experiment-ext-qcard-field-label">Width</span><input class="experiment-ext-qcard-input" type="number" min="64" max="4096" data-ctl="width"></label>' +
        '<span class="experiment-ext-qcard-dims-x">×</span>' +
        '<label><span class="experiment-ext-qcard-field-label">Height</span><input class="experiment-ext-qcard-input" type="number" min="64" max="4096" data-ctl="height"></label>' +
        "</div>"
      ) +

      "</div>" +

      '<figure class="experiment-ext-qcard-figure">' +
      '<div class="experiment-ext-qcard-preview"><canvas class="experiment-ext-qcard-canvas" role="img" aria-label="Live preview of the quote card"></canvas></div>' +
      '<figcaption class="experiment-ext-qcard-caption" data-out="caption"></figcaption>' +
      // The icon mirrors the site's icon partial (Lucide "download"): inline
      // stroke SVG on currentColor, like the homepage social icons.
      '<button type="button" class="experiment-ext-qcard-download" data-ctl="download">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>' +
      "<span>Download PNG</span></button>" +
      "</figure>" +

      "</div>";
  }

  // ===========================================================================
  // Boot
  // ===========================================================================
  // Every preset face is a Google Fonts webfont loaded at runtime, and canvas
  // drawing never triggers @font-face downloads on its own (ctx.font doesn't
  // fetch), so boot prefetches every variant behind a spinner — measuring
  // against fallback faces would bake wrong widths into the layout.
  function prefetchFonts() {
    return new Promise(function (resolve) {
      var pre = document.createElement("link");
      pre.rel = "preconnect";
      pre.href = "https://fonts.gstatic.com";
      pre.crossOrigin = "anonymous";
      document.head.appendChild(pre);
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = Q.FONTS_CSS_URL;
      css.onload = resolve;
      css.onerror = resolve; // offline: boot anyway, on the fallback faces
      document.head.appendChild(css);
    }).then(function () {
      if (!document.fonts) return null;
      var loads = [];
      Q.FONTS.forEach(function (f) {
        ["", "italic "].forEach(function (style) {
          ["400", "700"].forEach(function (weight) {
            loads.push(document.fonts.load(style + weight + " 16px " + f.family));
          });
        });
      });
      return Promise.all(loads).catch(function () { return null; });
    });
  }

  function start() {
    buildSkeleton(root);
    canvas = root.querySelector(".experiment-ext-qcard-canvas");
    ctx = canvas.getContext("2d");
    initFontPick("font");
    initFontPick("attrFont");
    syncControls();
    root.addEventListener("input", onControl);
    root.addEventListener("change", onControl);
    ctl("download").addEventListener("click", download);
    root.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-advtoggle]") : null;
      if (!btn) return;
      e.preventDefault(); // keep the <details> from toggling
      advToggle(btn.dataset.advtoggle);
    });
    buildDoc();
    syncEnabled();
    syncReadouts();
    render();
    // The caption's "preview scaled to N%" note tracks the preview's CSS
    // width, which changes with the window, not just with control edits.
    window.addEventListener("resize", syncCaption);
  }

  root.innerHTML = '<div class="experiment-ext-qcard-loading" role="status">' +
    '<span class="experiment-ext-qcard-spinner" aria-hidden="true"></span>Loading fonts…</div>';
  // Don't let a slow or blocked font CDN strand the spinner: boot on fallback
  // faces after 8s and re-measure if the fonts arrive later.
  var timedOut = false;
  var timer = setTimeout(function () { timedOut = true; start(); }, 8000);
  prefetchFonts().then(function () {
    clearTimeout(timer);
    if (!timedOut) { start(); return; }
    Q.layout.clearCache();
    buildDoc();
    sched();
  });
})();
