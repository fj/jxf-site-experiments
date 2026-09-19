/*
 * Blocklayer — the parts the interface is built from: an element under the
 * experiment's own class prefix, a pixel-art glyph worn as a mask over the
 * text colour, a coloured sprite shown as a picture, and the word the
 * interface calls a shape by. The toolbar, the size row, the tip panel and the
 * app all build from these, so no panel has to stand up another to borrow them.
 */
(function () {
  "use strict";

  var B = window.BlockLayer = window.BlockLayer || {};

  var ICON_SCALE = 2;                                  // CSS px per sprite px
  var ICON_ATTR = "data-icon";                         // the glyph an icon shows
  var ARROW_ICON = "arrow-";                           // ...which for a compass arrow is this + dir

  var SHAPE_LABELS = { block: "Block", ramp: "Ramp", stairs: "Stairs" };

  function element(tag, name) {
    var el = document.createElement(tag);
    el.className = B.PREFIX + name;
    return el;
  }

  // Coloured pixel art as a picture: a decor object or a still mark.
  function image(sprite) {
    var img = element("img", "image");
    img.alt = "";
    img.draggable = false;
    img.src = B.pixel.dataUrl(sprite);
    img.width = sprite.canvas.width * ICON_SCALE;
    img.height = sprite.canvas.height * ICON_SCALE;
    return img;
  }

  // A UI glyph is a mask over the element's text colour, which the stylesheet
  // sets per theme; the key names the glyph so a repeat is skipped.
  function setIcon(span, key, sprite) {
    if (span.getAttribute(ICON_ATTR) === key) return;
    var url = "url(\"" + B.pixel.crispUrl(sprite) + "\")";
    span.setAttribute(ICON_ATTR, key);
    span.style.setProperty("mask-image", url);
    span.style.setProperty("-webkit-mask-image", url);
    span.style.width = sprite.canvas.width * ICON_SCALE + "px";
    span.style.height = sprite.canvas.height * ICON_SCALE + "px";
  }

  function setGlyph(span, name) {
    setIcon(span, name, B.icons.sprite(name));
  }

  function setArrow(span, dir) {
    setIcon(span, ARROW_ICON + dir, B.icons.arrow(dir));
  }

  function icon(name) {
    var span = element("span", "icon");
    setGlyph(span, name);
    return span;
  }

  function arrowIcon(dir) {
    var span = element("span", "icon");
    setArrow(span, dir);
    return span;
  }

  // What the interface calls a shape, so no panel spells it for itself.
  function shapeLabel(shape) {
    return SHAPE_LABELS[shape] || "";
  }

  B.parts = {
    element: element,
    image: image,
    icon: icon,
    arrowIcon: arrowIcon,
    setGlyph: setGlyph,
    setArrow: setArrow,
    shapeLabel: shapeLabel
  };
})();
