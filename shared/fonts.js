/*
 * Shared webfont boot for canvas-rendering experiments.
 *
 * Canvas drawing never triggers an @font-face download on its own — assigning
 * ctx.font doesn't fetch anything — so an experiment that measures text must
 * have its faces resident *before* it lays anything out, or it bakes
 * fallback-face widths into the layout. This loads a Google Fonts stylesheet,
 * waits for every variant the renderer can ask for, and boots the app behind a
 * spinner, with a timeout so a slow or blocked font CDN can't strand it.
 */
(function () {
  "use strict";

  var F = window.ExpFonts = window.ExpFonts || {};

  var DEFAULT_TIMEOUT_MS = 8000;
  var PROBE_SIZE_PX = 16; // any size loads the face; the smallest is fine

  // Injects the stylesheet, then resolves once every (style, weight, family)
  // the canvas might use is loaded. Resolves rather than rejects when the CDN
  // is unreachable: the caller boots on fallback faces instead of failing.
  F.prefetch = function (cssUrl, families, opts) {
    opts = opts || {};
    var weights = opts.weights || [400, 700];
    var styles = opts.styles || [""];

    return new Promise(function (resolve) {
      var pre = document.createElement("link");
      pre.rel = "preconnect";
      pre.href = "https://fonts.gstatic.com";
      pre.crossOrigin = "anonymous";
      document.head.appendChild(pre);

      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = cssUrl;
      css.onload = resolve;
      css.onerror = resolve;
      document.head.appendChild(css);
    }).then(function () {
      if (!document.fonts) return null;
      var loads = [];
      families.forEach(function (family) {
        styles.forEach(function (style) {
          weights.forEach(function (weight) {
            loads.push(document.fonts.load(style + weight + " " + PROBE_SIZE_PX + "px " + family));
          });
        });
      });
      return Promise.all(loads).catch(function () { return null; });
    });
  };

  // Shows a spinner in `root`, prefetches, then calls start(). If the fonts
  // are still in flight after opts.timeoutMs, start() runs anyway on the
  // fallback faces and onLate() fires when they finally land, so the app can
  // drop stale measurements and re-render.
  F.boot = function (root, opts) {
    root.innerHTML = window.ExpUI.loading(opts.label || "Loading fonts…");

    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      opts.start();
    }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);

    return F.prefetch(opts.cssUrl, opts.families, opts).then(function () {
      clearTimeout(timer);
      if (!timedOut) opts.start();
      else if (opts.onLate) opts.onLate();
    });
  };
})();
