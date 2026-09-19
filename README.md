# jxf-site-experiments

Self-contained interactive explorations ("experiments") that are embedded into
[jxf-site](https://github.com/fj/jxf-site). This repo owns each experiment's
implementation; the site owns routing, page chrome, and the thin glue that
mounts an experiment into a page.

## How embedding works

jxf-site includes this repo as a git submodule at `site/assets/experiments/`.
For each experiment the site renders an empty mount element plus `<link>`/
`<script>` tags pointing at the files here:

- `manifest.yaml` — declares what the experiment is made of: its mount element,
  stylesheets, web fonts and third-party dependencies (fetched at build time,
  pinned + verified via SRI), and local scripts in load order. The host reads
  this and hardcodes nothing about the experiment.
- `style.scss` — compiled to CSS by Hugo's SCSS step. The dark variants key off
  `body.colorscheme-dark`, the class the site theme's toggle sets, so the
  experiment inherits the site's look.
- `app.js` — builds its own DOM inside the mount element and renders the
  experiment. It reads its data from a global.
- `data.js` — sets `window.JXF_EXP_DATA["<name>"]`. Shipped as **JS, not JSON**,
  so the host page loads it with a plain `<script src>` and never runs it
  through a JSON/templating pipeline.

Style and script paths in a manifest are relative to the experiment's own
directory and are cleaned before lookup, so `../shared/ui.js` reaches a sibling
directory — which is how experiments pick up the shared control kit below.

Third-party libraries (e.g. d3 v7) and web fonts are **not committed here** —
they're declared as dependencies in `manifest.yaml`. The host pulls them down at
build time (verifying the pinned SRI) and serves them self-hosted, so this repo
stays free of vendored blobs and the dependency list lives with the experiment,
not the host.

An experiment's pure modules — the ones with no DOM or canvas in them — can
carry `node:test` files in a `tests/` directory beside them. The host runs every
such directory with `task test:experiments`; on its own, `node --test
'<experiment>/tests/*.test.js'` does the same (a bare directory is not a test
pattern to node). Everything that draws is checked by eye.

Because the app runs in the host page's document, it inherits the site's fonts,
colours, and dark mode while bringing its own scoped component styles. Anything
an experiment contributes to the document's class/id namespace — component
classes, the mount element, form-control ids — is prefixed with
`experiment-ext-` plus a short per-experiment discriminator (e.g.
`.experiment-ext-llmx-*`, `.experiment-ext-qcard-*`), so it can't collide with
the host or with other experiments. `ui` is reserved as the discriminator for
the shared kit.

## `shared/` — the control kit

Experiments that put a panel of controls beside a live `<canvas>` all need the
same widgets, so they live here rather than being reimplemented per experiment:

- `_theme.scss` — design tokens and the `exp-mobile` / `exp-dark` mixins.
  Variables and mixins only, so importing it twice emits nothing twice.
- `_controls.scss` — styles for every kit widget, namespaced
  `experiment-ext-ui-`. An experiment's stylesheet starts with
  `@import "../shared/controls";` and then only writes rules for what's
  genuinely its own.
- `ui.js` (`window.ExpUI`) — builders returning HTML strings for labelled
  inputs, `<datalist>`-backed combos, prose boxes that wrap what is typed and
  grow to hold it, grouped `<details>` sections, sliders
  with live readouts, color wells, font pickers, and the preview figure with
  its caption, progress track, download button and any secondary actions
  offered beside it. Every control carries `data-ctl="<name>"`, so one
  delegated listener maps an edit onto one state field; `ExpUI.dom(root)`
  returns the accessors for readouts, status, busy buttons and progress —
  the secondary actions included, since they are addressed by name like
  everything else. `ExpUI.readNumber` reads a typed number the way a typed
  number has to be read: a half-typed value only takes effect while it is
  already in range, and a commit rounds, clamps and writes the result back, so
  the box shows what was taken from it.
- `fonts.js` (`window.ExpFonts`) — loads a Google Fonts stylesheet and waits
  for every variant before booting the app behind a spinner, with a timeout so
  a blocked font CDN can't strand it. Canvas text has to be measured against
  the real faces; `ctx.font` doesn't trigger a download on its own.
- `png.js` (`window.ExpPng`) — encodes a canvas, rewrites the PNG's `pHYs`
  chunk so the file declares its print resolution, and saves it.
- `archive.js` (`window.ExpArchive`) — packs several files into one `.tar.gz`,
  for an experiment that produces a set rather than a single download. The tar
  is ustar, written here byte by byte; the compression is the browser's
  `CompressionStream`. Nothing goes into an archive that couldn't come back
  out: a name too long for a ustar header, an entry with no file behind it, a
  name that would shadow an earlier one, and an engine that can't gzip each
  stop the archive with a sentence saying so.
- `yaml.js` (`window.ExpYaml`) — the block subset of YAML, written and read,
  for an experiment that wants to hand the reader everything they typed and
  take it back afterwards. JSON would do that in two builtin calls, but nobody
  edits JSON by hand. Mappings, sequences, the three kinds of scalar, comments;
  anchors, tags, block scalars, flow collections, tabs and duplicate keys are
  refused by line number rather than half-supported. Everything it writes it
  reads back as what it was written from, and what it writes is what PyYAML
  reads too.

## Experiments

### `llm-explorer/`

An interactive scatter plot comparing popular language models on cost vs. output
speed, with workload-aware cost (input/output token mix, request size, cache).

Regenerate its dataset:

```sh
python3 tools/build-llm-explorer-dataset.py           # fetch models.dev live
python3 tools/build-llm-explorer-dataset.py path.json # or build from a local copy
```

Pricing/metadata come from [models.dev](https://models.dev); median output
tokens/sec are indicative figures compiled from public
[Artificial Analysis](https://artificialanalysis.ai) benchmarks.

### `quote-card/`

A client-side PNG quote generator. A small Markdown dialect (paragraphs, bold,
italic, inline code, strikethrough) is laid out on a `<canvas>` with word wrap
and an auto-fitting font size; the attribution line is styled independently of
the quote, and border (solid/double/dashed/dotted/wavy), shadow, colors, and
output resolution (Bluesky-feed-sized by default) are all tunable live. Each
styling group has an advanced mode (🧑‍💻) where its CSS becomes the source of
truth: values beyond the controls are honored (arbitrary font families,
unclamped sizes, alpha colors, transforms), the disabled controls mirror the
CSS best-effort, errors show red, and valid-but-unrenderable properties (e.g.
animation) show as warnings. The preview canvas holds the actual output
bitmap, so the Download button just serializes it — nothing leaves the
browser. Every preset face is a Google Fonts webfont the app prefetches at
runtime. The implementation is modular: `config.js`, `csskit.js`,
`markdown.js`, `layout.js`, `render.js`, `advanced.js`, and `app.js` each
attach one module to the `QCard` namespace, loaded in manifest order, on top of
the shared control kit.

### `dnd-card/`

A client-side player card generator for D&D 5.5E. A character — name, species,
class, subclass, background, level; hit points, temporary hit points and hit
dice; death saves and heroic inspiration; the six abilities with their saving
throws; all eighteen skills at none / proficient / expertise — is laid out on a
`<canvas>` beside a portrait that fills the card's left third, and downloaded
as a PNG that prints at 152 × 101 mm (1795 × 1193 px at 300 dpi, also
offered at 150 and 600). The card is landscape, so the controls sit under the
preview rather than beside it.

A character has a *set* of these rather than one. Beside the character card
there are inventory cards of ten items each (equipped and attuned as a tick and
a triangle, a count, and the item's name and what it is), features cards of up
to eight rows the reader adds, removes and drags into order (each with as many
empty tally boxes down its left as the ability has uses, or a spell level and
its slots), and spells cards of ten rows, each marked with one of the eight
schools of magic and the level it is cast at — `schools.js` holds those the way
`dice.js` holds the dice, once in a unit circle, drawn onto the canvas or handed
to the panel as an `<svg>`. A features row and a spells row are both a run of
type, "name — description", set by the same `sheet.js` routine: it wraps them
down the row at the size they were asked for rather than shrinking them, and
cuts with an ellipsis only what a row that deep still cannot hold.
The spells card prints its rows by level and then by name whatever order they
were typed in, because at the table a spell is looked for by the slot there is
one of left.

Every card repeats the character card's header and puts its own name where that
card keeps its three badges, so a card face-up on the table says whose it is.
The panel follows: what belongs to the whole set sits in a block of its own
above a tab strip, and under the strip are the controls of whichever card is
being edited — including the picture, which is built into the region of any card
whose kind asks the frame for one. The strip is the set's order as well as its
index: a tab can be dragged onto another, or moved with Ctrl and an arrow key,
and the `+` at its end opens a menu of the kinds that can be added. Adding a
kind is a module that registers with `pages.js`, a line in the manifest, and a
block of styles for its own controls — nothing in `app.js` names a kind.

The set comes back out as one PNG, as a `.tar.gz` of one PNG per card, or as a
single PNG of all of them tiled — and as YAML, which is the one that also goes
back *in*. `saved.js` owns that file: which block of it each setting sits in,
and what a value has to be before it is allowed near a renderer. Nothing read
from it is trusted, and every card goes to its own kind's `load()` to be made
sense of, so a file written by an older version, hand-edited and got wrong, or
not one of ours at all either loads as something drawable or is refused in a
sentence. A picture chosen from a file isn't in it — the card holds the decoded
image rather than the bytes — but one named by a URL is.

Everything derivable is derived: modifiers from
scores, the proficiency bonus from the level, initiative from Dexterity, saves
and skill totals from both. What isn't derived is what changes during play:
hit points, temporary hit points and hit dice are write-in boxes rather than
printed numbers — their controls accept a blank, which prints an empty box —
and they band together with the death saves and inspiration above the ability
blocks, each label to the left of its box so the box keeps the width. The hit
die is chosen, not inferred from the class, and `dice.js` holds each solid's
outline once in a unit circle, rendering it either onto the canvas beside the
hit dice or as an `<svg>` beside the picker. The top right corner carries three
badges, each a shape drawn by `draw.js`: the proficiency bonus in a diamond,
armor class (typed, since it comes off what you're wearing) in a shield, and
initiative in a right-pointing triangle. Every other diamond on the card is
empty, because it is there to be filled in — one on a saving throw, two on a
skill so expertise has a box of its own — while circles stay for the tallies
kept during play. Each skill row centers on its stripe — the two diamonds and the
name on the middle, the total and the ability it comes off stacked as a pair
that straddles it — and type is set in three independently chosen faces: one for the name, one for
headings and numbers, one for everything read as words. The 2024 Player's
Handbook lists are `<datalist>` suggestions rather than closed menus, so
homebrew types straight in. The
downloaded PNG carries a `pHYs` chunk declaring its resolution, so print
dialogs size it correctly rather than assuming screen dpi. The picture is read
locally; a picture given by URL is fetched with CORS requested, so a host that
forbids cross-origin reads fails with an explanation instead of silently
tainting the canvas. Modules on the `DndCard` namespace: `config.js`,
`data.js`, `rules.js`, `dice.js`, `schools.js`, `draw.js`, `portrait.js`,
`sheet.js` (the frame every card draws inside, and the furniture more than one
of them needs), `pages.js` (the kinds, and a set of them), then one module per
kind — `card.js`, `inventory.js`, `features.js`, `spells.js` — with
`downloads.js` and `app.js` last.

### `blocklayer/`

An isometric pixel-art level editor. A level is a set of tiles on an integer
grid; each tile is a column of as many blocks as its elevation (0 to 7, where a
tile at 0 has no block and its top face lies on the floor), shaped as a block, a
ramp or a flight of stairs rising to the next level on one side, painted from a
palette of ten (the rainbow's seven and three greys), carrying at most one decor
object (a chest, a rock, three crystal pillars) and any number of marks (eight
compass arrows, a teleport, a rope, a jump). The view turns in
quarter turns, zooms at whole-number factors, pans in the four compass
directions, hides or shows the elevation labels, the marks and the decor, and
draws the tiles solid or see-through. A light grey grid rules the floor under
the scene. Editing happens on the canvas: hover shows where a tile would go,
click or drag adds tiles, click selects one, `Ctrl` or `Cmd` with a click puts
a tile in the selection or takes it out, `Shift` with a drag sweeps a box of
them in, the wheel raises or lowers the selection, the right button held removes
a tile, and the right button away from the selection drops it. Every edit —
shape, facing, colour, decor, marks, height, removal — applies to the whole
selection, which a raise moves as one body or not at all. The keyboard does the
same work: `W` and `S` move the selection, or the height a new tile gets when
nothing is selected, `Shift+W` and `Shift+S` move the whole level, `C` steps the
colour new tiles are painted, and the marks sit in a compass rose under the
right hand. The toolbar is icons only.

The scene is drawn at the sprites' own scale on an offscreen canvas and blitted
up by a whole number, so pixels stay square. Every sprite is built in code from
the palette in `config.js` — nothing is a bitmap file. Modules on the
`BlockLayer` namespace, in load order: `config.js`, `pixel.js` (anchored
sprites, string-art, shading, memoizing), `level.js`, `file.js`, `view.js`,
`selection.js` and `demo.js` (the pure models: tiles and their edits and
validation; the `*.blocklayer.json` file a level is saved to and opened from;
rotation, projection, picking, the frame and the way in from a pointer; which
cells are chosen, which every module asks `selection.js`; the level a first
visit starts with — all unit-tested under `tests/`), `sprites-tiles.js`,
`sprites-decor.js`,
`sprites-marks.js`, `sprites-icons.js`, `render.js`, `toolbar.js`, `input.js`,
and `app.js` last, with the kit's `shared/png.js` for the file download.
The level autosaves to `localStorage`, and a `.blocklayer.json` dropped on the
canvas opens.
