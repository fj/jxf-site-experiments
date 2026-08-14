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
  inputs, `<datalist>`-backed combos, grouped `<details>` sections, sliders
  with live readouts, color wells, font pickers, and the preview figure with
  its caption, progress track, download button and any secondary actions
  offered beside it. Every control carries `data-ctl="<name>"`, so one
  delegated listener maps an edit onto one state field; `ExpUI.dom(root)`
  returns the accessors for readouts, status, busy buttons and progress —
  the secondary actions included, since they are addressed by name like
  everything else.
- `fonts.js` (`window.ExpFonts`) — loads a Google Fonts stylesheet and waits
  for every variant before booting the app behind a spinner, with a timeout so
  a blocked font CDN can't strand it. Canvas text has to be measured against
  the real faces; `ctx.font` doesn't trigger a download on its own.
- `png.js` (`window.ExpPng`) — encodes a canvas, rewrites the PNG's `pHYs`
  chunk so the file declares its print resolution, and saves it.

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
preview rather than beside it. Everything derivable is derived: modifiers from
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
`data.js`, `rules.js`, `dice.js`, `draw.js`, `portrait.js`, `card.js`,
`app.js`.
