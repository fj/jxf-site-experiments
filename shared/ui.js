/*
 * Shared control kit for embedded experiments.
 *
 * Experiments that put a panel of controls next to a live <canvas> all want
 * the same widgets: labelled inputs, grouped <details> sections, sliders with
 * a live readout, color wells, a preview figure with a download button. This
 * module owns that markup and its behavior; shared/_controls.scss owns the
 * matching styles. An experiment supplies only what is actually its own.
 *
 * The builders return HTML strings (experiments assemble one innerHTML), and
 * every control carries data-ctl="<name>", so a single delegated listener maps
 * an edit onto one state field. Readouts carry data-val="<name>".
 *
 * Everything is namespaced `experiment-ext-ui-`: `ui` is the reserved
 * discriminator for kit-owned class and id names, alongside each experiment's
 * own (`qcard`, `dndc`, …).
 */
(function () {
  "use strict";

  var U = window.ExpUI = window.ExpUI || {};
  var P = "experiment-ext-ui-";

  U.PREFIX = P;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Renders an attribute map, skipping null/undefined so callers can pass
  // optional attributes without composing strings conditionally.
  function attrs(map) {
    var out = "";
    Object.keys(map || {}).forEach(function (k) {
      var v = map[k];
      if (v == null || v === false) return;
      out += v === true ? " " + k : " " + k + '="' + esc(v) + '"';
    });
    return out;
  }

  function idFor(name) { return P + name; }

  // A label wrapping its own control: no for/id dance, and clicking the text
  // focuses the input. Controls that must not be label-activated (buttons,
  // listboxes) use field() with a plain <span> caption instead.
  function labelled(name, caption, controlHtml) {
    return '<label class="' + P + 'field" for="' + esc(idFor(name)) + '">' +
      '<span class="' + P + 'field-label">' + caption + "</span>" +
      controlHtml + "</label>";
  }

  U.esc = esc;
  U.idFor = idFor;

  // ---- Controls ------------------------------------------------------------

  U.text = function (name, caption, opts) {
    opts = opts || {};
    return labelled(name, caption, '<input type="text" class="' + P + 'input"' +
      attrs({ id: idFor(name), "data-ctl": name, placeholder: opts.placeholder, maxlength: opts.maxLength, spellcheck: opts.spellcheck === false ? "false" : null }) + ">");
  };

  U.number = function (name, caption, opts) {
    opts = opts || {};
    return labelled(name, caption, '<input type="number" class="' + P + 'input"' +
      attrs({
        id: idFor(name), "data-ctl": name, min: opts.min, max: opts.max,
        step: opts.step, placeholder: opts.placeholder
      }) + ">");
  };

  U.textarea = function (name, caption, opts) {
    opts = opts || {};
    return labelled(name, caption, '<textarea class="' + P + 'textarea"' +
      attrs({ id: idFor(name), "data-ctl": name, rows: opts.rows || 4, spellcheck: opts.spellcheck === false ? "false" : null }) + "></textarea>");
  };

  // items: ["a", …] or [{value, label}, …].
  U.options = function (items) {
    return items.map(function (it) {
      var value = it && it.value != null ? it.value : it;
      var label = it && it.label != null ? it.label : it;
      return '<option value="' + esc(value) + '">' + esc(label) + "</option>";
    }).join("");
  };

  U.select = function (name, caption, items) {
    return labelled(name, caption, '<select class="' + P + 'select"' +
      attrs({ id: idFor(name), "data-ctl": name }) + ">" + U.options(items) + "</select>");
  };

  // A text input with a <datalist> of suggestions: the canonical values are
  // one keystroke away, but anything else is still accepted — which is what
  // homebrew content needs.
  U.combo = function (name, caption, items, opts) {
    opts = opts || {};
    var listId = idFor(name) + "-list";
    var list = '<datalist id="' + esc(listId) + '">' + U.options(items) + "</datalist>";
    return labelled(name, caption, '<input type="text" class="' + P + "input " + P + 'combo"' +
      attrs({ id: idFor(name), "data-ctl": name, list: listId, placeholder: opts.placeholder, autocomplete: "off" }) + ">" + list);
  };

  U.check = function (name, caption) {
    return '<label class="' + P + 'check"><input type="checkbox"' +
      attrs({ id: idFor(name), "data-ctl": name }) + "> " + caption + "</label>";
  };

  U.color = function (name, caption) {
    return '<label class="' + P + 'color"><input type="color"' +
      attrs({ id: idFor(name), "data-ctl": name }) + "> " + caption + "</label>";
  };

  U.range = function (name, caption, min, max, opts) {
    opts = opts || {};
    return '<div class="' + P + 'range-row">' +
      '<label for="' + esc(idFor(name)) + '">' + caption + "</label>" +
      '<input type="range"' + attrs({ id: idFor(name), "data-ctl": name, min: min, max: max, step: opts.step }) + ">" +
      '<span class="' + P + 'range-val" data-val="' + esc(name) + '"></span>' +
      "</div>";
  };

  // A field whose caption isn't a <label> — for controls that own their own
  // labelling (buttons, listboxes, composite widgets).
  U.field = function (caption, innerHtml, opts) {
    opts = opts || {};
    return '<div class="' + P + "field" + (opts.className ? " " + opts.className : "") + '"' +
      attrs(opts.attrs || {}) + ">" +
      (caption ? '<span class="' + P + 'field-label"' + attrs({ id: opts.labelId }) + ">" + caption + "</span>" : "") +
      innerHtml + "</div>";
  };

  U.grid2 = function () {
    return '<div class="' + P + 'grid2">' + [].slice.call(arguments).join("") + "</div>";
  };

  // A run of controls revealed by the checkbox above them. Toggle with
  // dom.show(name, on).
  U.subgroup = function (name, bodyHtml) {
    return '<div class="' + P + 'subgroup" data-sub="' + esc(name) + '" hidden>' + bodyHtml + "</div>";
  };

  // A collapsible section of controls. opts.extra goes in the summary bar
  // (e.g. a per-group mode toggle); opts.open defaults to true.
  U.group = function (title, bodyHtml, opts) {
    opts = opts || {};
    return '<details class="' + P + 'group"' + (opts.open === false ? "" : " open") +
      attrs({ "data-group": opts.key }) + "><summary>" +
      "<span>" + title + "</span>" + (opts.extra || "") + "</summary>" +
      '<div class="' + P + 'group-body">' + bodyHtml + "</div></details>";
  };

  U.dims = function (widthName, heightName, opts) {
    opts = opts || {};
    function box(name, caption) {
      return '<label for="' + esc(idFor(name)) + '"><span class="' + P + 'field-label">' + caption + "</span>" +
        '<input type="number" class="' + P + 'input"' +
        attrs({ id: idFor(name), "data-ctl": name, min: opts.min, max: opts.max }) + "></label>";
    }
    return '<div class="' + P + 'dims">' + box(widthName, opts.widthLabel || "Width") +
      '<span class="' + P + 'dims-x">&times;</span>' + box(heightName, opts.heightLabel || "Height") + "</div>";
  };

  // ---- Font picker ----------------------------------------------------------
  // A button + listbox stand-in for <select>: native option popups ignore
  // per-option fonts, and the point of this control is previewing each face.
  // fonts: [{key, label, family}].

  U.fontPick = function (name, fonts, caption) {
    var labelId = idFor(name) + "-label";
    var items = fonts.map(function (f) {
      return '<li role="option" data-value="' + esc(f.key) + '" style="font-family: ' + esc(f.family) + '">' + esc(f.label) + "</li>";
    }).join("");
    return U.field(caption == null ? "Font" : caption,
      '<button type="button" class="' + P + "select " + P + 'fontpick-btn"' +
      attrs({ "data-ctl": name, "aria-haspopup": "listbox", "aria-expanded": "false", "aria-labelledby": labelId }) + "></button>" +
      '<ul class="' + P + 'fontpick-list" role="listbox" hidden>' + items + "</ul>",
      { className: P + "fontpick", labelId: labelId, attrs: { "data-fontpick": name } });
  };

  // Wires one picker up. `get` returns the selected key, `onPick` is called
  // with a new one. Returns a sync() that re-reads `get`.
  U.initFontPick = function (root, name, fonts, get, onPick) {
    var wrap = root.querySelector('[data-fontpick="' + name + '"]');
    var btn = wrap.querySelector("button");
    var list = wrap.querySelector("ul");
    var items = [].slice.call(list.children);

    function idx() {
      for (var i = 0; i < fonts.length; i++) if (fonts[i].key === get()) return i;
      return 0;
    }

    function sync() {
      var f = fonts[idx()];
      btn.textContent = f.label;
      btn.style.fontFamily = f.family;
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
      if (get() === key) return;
      onPick(key);
      sync();
    }

    btn.addEventListener("click", function () { if (!btn.disabled) setOpen(list.hidden); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { setOpen(false); return; }
      var step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      choose(fonts[Math.max(0, Math.min(fonts.length - 1, idx() + step))].key);
    });
    list.addEventListener("click", function (e) {
      var li = e.target.closest ? e.target.closest("[data-value]") : null;
      if (li) choose(li.dataset.value);
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) setOpen(false);
    });

    sync();
    return sync;
  };

  // ---- Preview figure -------------------------------------------------------
  // The canvas holds the output bitmap at full resolution; CSS scales it to
  // the column. Below it: a caption, an optional progress track and status
  // line, and the download button.

  // Lucide "download", matching the site's icon partial: inline stroke SVG on
  // currentColor.
  var DOWNLOAD_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" x2="12" y1="15" y2="3"/></svg>';

  U.figure = function (opts) {
    opts = opts || {};
    var name = opts.name || "download";
    return '<figure class="' + P + 'figure">' +
      '<div class="' + P + 'preview" data-preview>' +
      '<canvas class="' + P + 'canvas"' + attrs({ role: "img", "aria-label": opts.ariaLabel }) + "></canvas></div>" +
      '<figcaption class="' + P + 'caption" data-out="caption"></figcaption>' +
      (opts.progress === false ? "" : '<div class="' + P + 'progress" data-progress hidden><span></span></div>') +
      (opts.status === false ? "" : '<p class="' + P + 'status" data-out="status" role="status"></p>') +
      '<button type="button" class="' + P + 'download"' + attrs({ "data-ctl": name }) + ">" +
      DOWNLOAD_ICON + "<span>" + esc(opts.button || "Download PNG") + "</span></button>" +
      "</figure>";
  };

  U.loading = function (label) {
    return '<div class="' + P + 'loading" role="status">' +
      '<span class="' + P + 'spinner" aria-hidden="true"></span>' + esc(label || "Loading…") + "</div>";
  };

  // ---- DOM handle -----------------------------------------------------------
  // Accessors scoped to one mount, so an experiment doesn't repeat selector
  // plumbing.

  U.dom = function (root) {
    var buttonLabels = {};

    var d = {
      root: root,

      el: function (sel) { return root.querySelector(sel); },
      ctl: function (name) { return root.querySelector('[data-ctl="' + name + '"]'); },
      canvas: function () { return root.querySelector("." + P + "canvas"); },

      // Readout text for a slider or any [data-val] node.
      val: function (name, text) {
        var node = root.querySelector('[data-val="' + name + '"]');
        if (node) node.textContent = text;
      },

      caption: function (text) {
        var node = root.querySelector('[data-out="caption"]');
        if (node) node.textContent = text;
      },

      status: function (text, kind) {
        var node = root.querySelector('[data-out="status"]');
        if (!node) return;
        node.textContent = text || "";
        node.classList.toggle(P + "status-error", kind === "error");
      },

      // Reveal or hide a subgroup built with U.subgroup.
      show: function (name, on) {
        var node = root.querySelector('[data-sub="' + name + '"]');
        if (node) node.hidden = !on;
      },

      disable: function (names, on) {
        names.forEach(function (name) {
          var node = d.ctl(name);
          if (node) node.disabled = !!on;
        });
      },

      // Swaps a button into its working state, remembering the resting label
      // so ready() can put it back.
      busy: function (name, label) {
        var btn = d.ctl(name);
        if (!btn) return;
        var span = btn.querySelector("span");
        if (span && buttonLabels[name] == null) buttonLabels[name] = span.textContent;
        btn.disabled = true;
        if (span && label) span.textContent = label;
      },

      ready: function (name) {
        var btn = d.ctl(name);
        if (!btn) return;
        var span = btn.querySelector("span");
        btn.disabled = false;
        if (span && buttonLabels[name] != null) span.textContent = buttonLabels[name];
      },

      // fraction: null hides the track, -1 runs it indeterminate, 0..1 fills it.
      progress: function (fraction) {
        var track = root.querySelector("[data-progress]");
        if (!track) return;
        var bar = track.firstElementChild;
        track.hidden = fraction == null;
        track.classList.toggle(P + "progress-indeterminate", fraction === -1);
        if (fraction != null && fraction >= 0) bar.style.width = Math.round(fraction * 100) + "%";
      }
    };
    return d;
  };

  // One delegated listener per mount for both event types: `input` fires as a
  // control is dragged or typed into, `change` when a select or checkbox
  // commits. Handlers get (name, element, event).
  U.bind = function (root, handler) {
    function onEvent(e) {
      var name = e.target && e.target.dataset ? e.target.dataset.ctl : null;
      if (name) handler(name, e.target, e);
    }
    root.addEventListener("input", onEvent);
    root.addEventListener("change", onEvent);
  };

  // Reads a control's value the way its type implies, so callers don't
  // branch on tag names.
  U.readControl = function (element) {
    if (element.type === "checkbox") return element.checked;
    if (element.type === "range" || element.type === "number") return +element.value;
    return element.value;
  };

  // ---- Drag and drop --------------------------------------------------------
  // Accepting a dropped file anywhere over the preview is the obvious gesture
  // for image-backed experiments; onFile gets the first matching File.

  U.dropTarget = function (element, mimePrefix, onFile) {
    function matches(item) {
      return item && item.type && item.type.indexOf(mimePrefix) === 0;
    }
    function highlight(on) { element.classList.toggle(P + "dropping", on); }

    element.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      highlight(true);
    });
    element.addEventListener("dragleave", function () { highlight(false); });
    element.addEventListener("drop", function (e) {
      e.preventDefault();
      highlight(false);
      var files = [].slice.call(e.dataTransfer.files || []);
      for (var i = 0; i < files.length; i++) if (matches(files[i])) { onFile(files[i]); return; }
    });
  };
})();
