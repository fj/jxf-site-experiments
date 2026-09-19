/*
 * Blocklayer — the panel that names the tile under the pointer while Alt is
 * held: its elevation, its colour, its shape, and its decor object when it
 * carries one. from() answers where the panel stands, and nothing while Alt is
 * up or the pointer is over no tile; sync() shows it beside the pointer, never
 * under it. Every word comes from the lists the toolbar and the level read, so
 * nothing is spelled twice.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var CTL_ATTR = "data-ctl";
  var POINTER_GAP = 14;             // px from the pointer, so the panel never covers it
  var ELEV_WORD = "Elevation";

  var element = B.toolbar.element;

  function labelOf(entries, key) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].key === key) return entries[i].label;
    }
    return "";
  }

  // What the panel stands on: the tile under the pointer and where the pointer
  // is, while Alt is held.
  function from(hit, alt, x, y) {
    var tile = alt && hit ? hit.tile : null;
    return tile ? { tile: tile, x: x, y: y } : null;
  }

  function build() {
    var el = element("div", "tip");
    el.setAttribute(CTL_ATTR, "tip");
    el.setAttribute("role", "tooltip");
    el.hidden = true;

    var elev = element("span", "tip-line");
    var color = element("span", "tip-line");
    var shape = element("span", "tip-line");
    var decor = element("span", "tip-line");
    [elev, color, shape, decor].forEach(function (line) { el.appendChild(line); });

    function show(tip) {
      var tile = tip.tile;
      elev.textContent = ELEV_WORD + " " + tile.elev;
      color.textContent = labelOf(B.PALETTE, tile.color);
      shape.textContent = B.toolbar.shapeLabel(tile.shape);
      decor.textContent = labelOf(B.DECOR, tile.decor);
      decor.hidden = !tile.decor;
      el.style.left = tip.x + POINTER_GAP + "px";
      el.style.top = tip.y + POINTER_GAP + "px";
    }

    function sync(state) {
      el.hidden = !state.tip;
      if (state.tip) show(state.tip);
    }

    return { el: el, sync: sync };
  }

  B.tip = { build: build, from: from };
})();
