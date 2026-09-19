/*
 * The page, faked for any test of a module that builds one. An element carries
 * what the interface touches and no more: attributes, classes, style
 * properties, children, focus and listeners, and fire() delivers an event to
 * them. The document makes them, remembers which one holds the focus, and
 * makes a drawing canvas for the sprites. descend() walks a tree and
 * control() finds the one element a data-ctl names.
 */
"use strict";

const { canvasDocument } = require("./sprite");

const PRIMARY_BUTTON = 0;
const CTL_ATTR = "data-ctl";

function fakeElement(tag) {
  const attrs = new Map();
  const classes = new Set();
  const listeners = new Map();
  const style = {
    setProperty(name, value) { style[name] = value; },
    getPropertyValue(name) { return style[name] === undefined ? "" : style[name]; }
  };
  const el = {
    tag,
    className: "",
    title: "",
    disabled: false,
    hidden: false,
    textContent: "",
    style,
    children: [],
    clicks: 0,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    addEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).concat(fn)); },
    appendChild(child) { el.children.push(child); return child; },
    click() { el.clicks++; el.fire("click"); },
    fire(type, props = {}) {
      const e = {
        button: PRIMARY_BUTTON, key: "", repeat: false, prevented: false,
        preventDefault() { this.prevented = true; },
        ...props
      };
      for (const fn of listeners.get(type) || []) fn(e);
      return e;
    }
  };
  return el;
}

// A canvas is an element that also draws, so the sprites can be built on one
// and the app can still listen on the one it shows.
function fakeDocument() {
  const canvases = canvasDocument();
  const doc = {
    activeElement: null,
    createElement(tag) {
      const el = tag === "canvas"
        ? Object.assign(fakeElement(tag), canvases.createElement(tag))
        : fakeElement(tag);
      el.focus = () => {
        doc.activeElement = el;
        el.fire("focus");
      };
      return el;
    }
  };
  return doc;
}

function descend(el, found = []) {
  found.push(el);
  el.children.forEach((child) => descend(child, found));
  return found;
}

function control(root, name) {
  return descend(root).find((el) => el.getAttribute(CTL_ATTR) === name) || null;
}

module.exports = { fakeElement, fakeDocument, descend, control };
