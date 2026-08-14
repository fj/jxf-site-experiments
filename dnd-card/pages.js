/*
 * Player Card — the kinds of page, and the set a character has of them.
 *
 * A character card is one page of a set now, and the other pages are things
 * the same character needs on the table: what they carry, what they can do,
 * what they can cast. Each of those is a *kind*, and a kind is one module that
 * registers what it is here: how to make a blank page of it, how to draw one,
 * and what controls edit it. Nothing else has to be told a kind exists — the
 * panel builds its tabs, its "add a card" buttons and its controls out of this
 * registry, so a new kind is a new file and a line in the manifest.
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

  // A definition is {kind, label, create, render} plus, optionally, `addable`
  // (default true), `frameOptions` and `controls`. See D.sheet for what a
  // renderer is given and app.js for when each control hook is called.
  function register(definition) {
    if (BY_KIND[definition.kind]) throw new Error("page kind registered twice: " + definition.kind);
    if (definition.addable == null) definition.addable = true;
    KINDS.push(definition);
    BY_KIND[definition.kind] = definition;
    return definition;
  }

  function definition(kind) {
    var found = BY_KIND[kind];
    if (!found) throw new Error("no such page kind: " + kind);
    return found;
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

  D.pages = {
    KINDS: KINDS,
    register: register,
    definition: definition,
    create: create,
    initial: initial,
    addable: addable,
    removable: removable,
    labelFor: labelFor
  };
})();
