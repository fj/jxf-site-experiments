/*
 * Player Card — the kinds of page, and the set a character has of them.
 *
 * A character card is one page of a set now, and the other pages are things
 * the same character needs on the table: what they carry, what they can do,
 * what they can cast. Each of those is a *kind*, and a kind is one module that
 * registers what it is here: how to make a blank page of it, how to draw one,
 * what controls edit it, and how to read a saved one back. Nothing else has to
 * be told a kind exists — the
 * panel builds its tabs, its "add a card" buttons and its controls out of this
 * registry, so a new kind is a new file, a line in the manifest, and whatever
 * styles its own controls need in style.scss, which is the one place a kind
 * still has to reach outside itself.
 *
 * A page itself is plain data: its `kind` and whatever that kind's `create()`
 * put on it. Nothing here holds the set — that is the app's `state.pages`, an
 * ordinary array it adds to and splices from — because a page set is what the
 * reader is editing, and this module only says what may be in one.
 */
(function () {
  "use strict";

  var D = window.DndCard = window.DndCard || {};

  var KINDS = [];
  var BY_KIND = {};

  // Whether a kind was ever registered — asked with hasOwnProperty, because a
  // page's kind can come out of a saved file and "constructor" is a name every
  // object already answers to.
  function known(kind) {
    return Object.prototype.hasOwnProperty.call(BY_KIND, kind);
  }

  // A definition is {kind, label, create, render} plus, optionally, `addable`
  // (default true), `picture` for the kind that carries the set's picture,
  // `frameOptions`, `controls`, and `load` for making a page of itself out of
  // a saved one. See D.sheet for what a renderer is given and app.js for when
  // each control hook is called.
  function register(definition) {
    if (known(definition.kind)) throw new Error("page kind registered twice: " + definition.kind);
    if (definition.addable == null) definition.addable = true;
    KINDS.push(definition);
    BY_KIND[definition.kind] = definition;
    return definition;
  }

  function definition(kind) {
    if (!known(kind)) throw new Error("no such page kind: " + kind);
    return BY_KIND[kind];
  }

  // The registry stamps the kind onto the page, so a page can always say what
  // it is however its own create() was written.
  function create(kind) {
    var page = definition(kind).create();
    page.kind = kind;
    return page;
  }

  // A fresh set: one page of every kind a reader can't add, in registration
  // order. Those are exactly the ones that have to be there.
  function initial() {
    return KINDS.filter(function (d) { return !d.addable; })
      .map(function (d) { return create(d.kind); });
  }

  function addable() {
    return KINDS.filter(function (d) { return d.addable; });
  }

  // A page may be removed when its kind could be added again; anything else
  // would be a one-way door.
  function removable(kind) {
    return definition(kind).addable;
  }

  // A page's caption in the set it belongs to. A kind that appears once is
  // just itself; one that repeats is numbered from 1 in page order, because
  // "Inventory" and "Inventory" name the same thing twice.
  function labelFor(pages, index) {
    var kind = pages[index].kind;
    var count = 0;
    var ordinal = 0;
    pages.forEach(function (page, i) {
      if (page.kind !== kind) return;
      count++;
      if (i === index) ordinal = count;
    });
    var label = definition(kind).label;
    return count > 1 ? label + " " + ordinal : label;
  }

  // A page as plain data for a file, its kind first so a reader can tell what
  // they are looking at from the first line of it. A page is already only what
  // somebody typed, so a kind that says nothing is written whole.
  function save(page) {
    var narrowed = definition(page.kind).save;
    var body = narrowed ? narrowed(page) : page;
    var out = { kind: page.kind };
    Object.keys(body).forEach(function (key) {
      if (key !== "kind") out[key] = body[key];
    });
    return out;
  }

  // …and back. The kind is asked to make a page of itself out of what a file
  // held, because only it knows what its own rows are and none of it can be
  // trusted. A kind nobody registered is null: the caller has to say what it
  // dropped, and nothing here knows how to.
  function load(raw) {
    if (!raw || !known(raw.kind)) return null;
    var found = BY_KIND[raw.kind];
    var page = found.load ? found.load(raw) : found.create();
    page.kind = raw.kind;
    return page;
  }

  D.pages = {
    KINDS: KINDS,
    register: register,
    definition: definition,
    create: create,
    initial: initial,
    addable: addable,
    removable: removable,
    labelFor: labelFor,
    save: save,
    load: load
  };
})();
