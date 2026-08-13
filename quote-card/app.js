/*
 * Quote Card — a client-side PNG quote generator (app entry).
 *
 * Type a quote in Markdown, style it, and download a PNG. Everything happens
 * in the browser: the preview <canvas> always holds the bitmap at the chosen
 * output resolution (CSS merely scales it to fit), so the download is exactly
 * what you see — no server round-trip, no second render.
 *
 * This file owns the control state, the DOM, and the wiring. The widgets come
 * from the shared control kit (ExpUI, ExpFonts, ExpPng); the card-specific
 * work lives in the modules the manifest loads before it:
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
  var U = window.ExpUI;
  var root = document.getElementById("experiment-ext-qcard");
  if (!root || !Q || !U) return;

  var dom = U.dom(root);

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
    dom.caption(
      state.width + " × " + state.height + " px" +
      (Math.abs(scale - 1) < 0.01 ? "" : " · preview scaled to " + Math.round(scale * 100) + "%") +
      " · rendered entirely in your browser");
  }

  var rafId = null;
  function sched() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = null; render(); });
  }

  // ---- Download ------------------------------------------------------------------
  function download() {
    dom.busy("download", "Rendering…");
    dom.status("");
    render(); // make sure the bitmap reflects the latest state
    window.ExpPng.encode(canvas).then(function (blob) {
      window.ExpPng.save(blob, "quote-" + state.width + "x" + state.height + ".png");
    }).catch(function (err) {
      dom.status(String(err && err.message || err), "error");
    }).then(function () {
      dom.ready("download");
    });
  }

  // ---- Advanced mode UI -------------------------------------------------------------
  function advToggle(key) {
    var panel = dom.el('[data-adv-panel="' + key + '"]');
    var btn = dom.el('[data-advtoggle="' + key + '"]');
    var opening = panel.hidden;
    if (opening) {
      var ta = dom.el('[data-adv="' + key + '"]');
      ta.value = Q.adv.groups[key].gen(state);
      advActive[key] = Q.css.parseDecls(ta.value).decls; // canonical, error-free
      advSetIssues(key, { errors: [], warnings: [] });
    } else {
      advActive[key] = null;
    }
    panel.hidden = !opening;
    btn.classList.toggle("is-active", opening);
    btn.setAttribute("aria-pressed", opening ? "true" : "false");
    btn.closest("." + U.PREFIX + "group").classList.toggle("experiment-ext-qcard-adv-on", opening);
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

  function advSetIssues(key, issues) {
    var ta = dom.el('[data-adv="' + key + '"]');
    var box = dom.el('[data-adv-errors="' + key + '"]');
    ta.classList.toggle("experiment-ext-qcard-adv-invalid", issues.errors.length > 0);
    ta.setAttribute("aria-invalid", issues.errors.length ? "true" : "false");
    var items = issues.errors.map(function (e) { return "<li>" + U.esc(e) + "</li>"; })
      .concat(issues.warnings.map(function (w) { return '<li class="is-warning">' + U.esc(w) + "</li>"; }));
    box.hidden = !items.length;
    box.innerHTML = items.join("");
  }

  // ---- Basic controls ----------------------------------------------------------------
  function onControl(name, target, e) {
    // Dimensions commit on change (blur/Enter), so clamping doesn't fight
    // with half-typed values.
    if ((name === "width" || name === "height") && e.type === "input") return;

    state[name] = U.readControl(target);

    if (name === "lineHeight") state.lineHeight = +target.value / 100;
    if (name === "preset") applyPreset(target.value);
    if (name === "width" || name === "height") {
      state[name] = clampDim(+target.value);
      target.value = state[name];
      state.preset = matchPreset(state.width, state.height);
      dom.ctl("preset").value = state.preset;
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
        dom.ctl("width").value = state.width;
        dom.ctl("height").value = state.height;
      }
    }
  }

  function syncEnabled() {
    Object.keys(GROUP_CTLS).forEach(function (key) {
      dom.disable(GROUP_CTLS[key], !!advActive[key]);
    });
    if (!advActive.text) dom.ctl("fontSize").disabled = state.autoSize;
    dom.show("shadow", state.shadow);
    var custom = state.preset === "custom";
    dom.ctl("width").readOnly = !custom;
    dom.ctl("height").readOnly = !custom;
  }

  function syncReadouts() {
    dom.val("fontSize", state.autoSize ? "auto" : state.fontSize + " px");
    dom.val("lineHeight", state.lineHeight.toFixed(2));
    dom.val("shadowBlur", state.shadowBlur + " px");
    dom.val("shadowX", state.shadowX + " px");
    dom.val("shadowY", state.shadowY + " px");
    dom.val("shadowOpacity", state.shadowOpacity + "%");
    dom.val("attrSizePct", state.attrSizePct + "%");
    dom.val("attrOpacity", state.attrOpacity + "%");
    dom.val("borderWidth", state.borderWidth + " px");
    dom.val("borderRadius", state.borderRadius + " px");
    dom.val("borderInset", state.borderInset + "%");
    dom.val("padding", state.padding + "%");
  }

  var fontPickSync = {};

  function syncControls() {
    dom.ctl("body").value = state.body;
    dom.ctl("attribution").value = state.attribution;
    dom.ctl("curly").checked = state.curly;
    fontPickSync.font();
    dom.ctl("align").value = state.align;
    dom.ctl("textColor").value = state.textColor;
    dom.ctl("autoSize").checked = state.autoSize;
    dom.ctl("fontSize").value = state.fontSize;
    dom.ctl("lineHeight").value = Math.round(state.lineHeight * 100);
    dom.ctl("shadow").checked = state.shadow;
    dom.ctl("shadowBlur").value = state.shadowBlur;
    dom.ctl("shadowX").value = state.shadowX;
    dom.ctl("shadowY").value = state.shadowY;
    dom.ctl("shadowColor").value = state.shadowColor;
    dom.ctl("shadowOpacity").value = state.shadowOpacity;
    fontPickSync.attrFont();
    dom.ctl("attrItalic").checked = state.attrItalic;
    dom.ctl("attrAlign").value = state.attrAlign;
    dom.ctl("attrColor").value = state.attrColor;
    dom.ctl("attrOpacity").value = state.attrOpacity;
    dom.ctl("attrSizePct").value = state.attrSizePct;
    dom.ctl("borderStyle").value = state.borderStyle;
    dom.ctl("borderWidth").value = state.borderWidth;
    dom.ctl("borderColor").value = state.borderColor;
    dom.ctl("borderRadius").value = state.borderRadius;
    dom.ctl("borderInset").value = state.borderInset;
    dom.ctl("background").value = state.background;
    dom.ctl("padding").value = state.padding;
    dom.ctl("preset").value = state.preset;
    dom.ctl("width").value = state.width;
    dom.ctl("height").value = state.height;
  }

  function initFontPick(name) {
    fontPickSync[name] = U.initFontPick(root, name, Q.FONTS,
      function () { return state[name]; },
      function (key) {
        state[name] = key;
        buildDoc(); // both font controls are REBUILD controls
        syncEnabled();
        syncReadouts();
        sched();
      });
  }

  // ---- Skeleton ------------------------------------------------------------------
  function buildSkeleton(mount) {
    function rangeR(caption, name, key) {
      return U.range(name, caption, Q.RANGES[key][0], Q.RANGES[key][1]);
    }
    // A group whose look is editable as CSS: a 🧑‍💻 toggle in the summary and
    // a hidden editor at the end of the body.
    function styledGroup(title, key, bodyHtml) {
      var toggle = '<button type="button" class="experiment-ext-qcard-adv-toggle" data-advtoggle="' + key +
        '" aria-pressed="false" title="Advanced: edit this group as CSS">🧑&zwj;💻</button>';
      var editorId = "experiment-ext-qcard-adv-" + key;
      var editor = '<div class="experiment-ext-qcard-adv" data-adv-panel="' + key + '" hidden>' +
        '<label class="' + U.PREFIX + 'field-label" for="' + editorId + '">CSS</label>' +
        '<textarea id="' + editorId + '" class="' + U.PREFIX + 'textarea experiment-ext-qcard-adv-css"' +
        ' data-adv="' + key + '" rows="8" spellcheck="false"></textarea>' +
        '<ul class="experiment-ext-qcard-adv-errors" data-adv-errors="' + key + '" hidden></ul></div>';
      return U.group(title, bodyHtml + editor, { key: key, extra: toggle });
    }
    var aligns = [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }];
    var borders = Q.BORDER_STYLES.map(function (s) {
      return { value: s, label: s.charAt(0).toUpperCase() + s.slice(1) };
    });

    mount.innerHTML = '<div class="' + U.PREFIX + 'layout">' +
      '<div class="' + U.PREFIX + 'panel">' +

      U.textarea("body", "Quote &mdash; Markdown: **bold**, *italic*, `code`, ~~strike~~", { rows: 5, spellcheck: false }) +
      U.text("attribution", "Attribution") +
      U.check("curly", "Surround with curly quotes") +

      styledGroup("Text", "text",
        U.grid2(
          U.fontPick("font", Q.FONTS),
          U.select("align", "Alignment", aligns)) +
        U.grid2(
          U.color("textColor", "Text color"),
          U.check("autoSize", "Auto-fit size")) +
        rangeR("Size", "fontSize", "fontSize") +
        U.range("lineHeight", "Line height", 100, 220) +
        U.check("shadow", "Drop shadow") +
        U.subgroup("shadow",
          rangeR("Blur", "shadowBlur", "shadowBlur") +
          rangeR("Offset X", "shadowX", "shadowOffset") +
          rangeR("Offset Y", "shadowY", "shadowOffset") +
          rangeR("Opacity", "shadowOpacity", "shadowOpacity") +
          U.color("shadowColor", "Shadow color"))
      ) +

      styledGroup("Attribution", "attribution",
        U.grid2(
          U.fontPick("attrFont", Q.FONTS),
          U.select("attrAlign", "Alignment", aligns)) +
        U.grid2(
          U.color("attrColor", "Color"),
          U.check("attrItalic", "Italic")) +
        rangeR("Size", "attrSizePct", "attrSizePct") +
        rangeR("Opacity", "attrOpacity", "attrOpacity")
      ) +

      styledGroup("Frame", "frame",
        U.grid2(
          U.select("borderStyle", "Border style", borders),
          U.color("borderColor", "Border color")) +
        rangeR("Thickness", "borderWidth", "borderWidth") +
        rangeR("Corner radius", "borderRadius", "borderRadius") +
        rangeR("Border inset", "borderInset", "borderInset") +
        rangeR("Text padding", "padding", "padding") +
        U.color("background", "Background color")
      ) +

      // Output is a bitmap size, not styling — no advanced (CSS) mode here.
      U.group("Output",
        U.select("preset", "Resolution", Q.PRESETS.map(function (p) { return { value: p.key, label: p.label }; })) +
        U.dims("width", "height", { min: 64, max: 4096 })
      ) +

      "</div>" +

      U.figure({ ariaLabel: "Live preview of the quote card", button: "Download PNG", progress: false }) +

      "</div>";
  }

  // ===========================================================================
  // Boot
  // ===========================================================================
  function start() {
    buildSkeleton(root);
    canvas = dom.canvas();
    ctx = canvas.getContext("2d");
    initFontPick("font");
    initFontPick("attrFont");
    syncControls();
    U.bind(root, onControl);
    root.addEventListener("input", function (e) {
      var key = e.target.dataset ? e.target.dataset.adv : null;
      if (key) advApply(key, e.target.value);
    });
    dom.ctl("download").addEventListener("click", download);
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

  window.ExpFonts.boot(root, {
    label: "Loading fonts…",
    cssUrl: Q.FONTS_CSS_URL,
    families: Q.FONTS.map(function (f) { return f.family; }),
    weights: [400, 700],
    styles: ["", "italic "],
    start: start,
    // Fonts that arrive after the timeout invalidate every width measured
    // against the fallback faces.
    onLate: function () {
      Q.layout.clearCache();
      buildDoc();
      sched();
    }
  });
})();
