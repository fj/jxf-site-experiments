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
- `style.scss` — compiled to CSS by Hugo's SCSS step (self-contained; no shared
  imports). The dark variants key off `body.colorscheme-dark`, the class the
  site theme's toggle sets, so the experiment inherits the site's look.
- `app.js` — builds its own DOM inside the mount element and renders the
  experiment (d3). It reads its data from a global.
- `data.js` — sets `window.JXF_EXP_DATA["<name>"]`. Shipped as **JS, not JSON**,
  so the host page loads it with a plain `<script src>` and never runs it
  through a JSON/templating pipeline.
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
the host or with other experiments.

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
browser. Fira Code, the default face, is declared in `manifest.yaml` as a
pinned font dependency the host fetches and self-hosts. The implementation is
modular: `config.js`, `csskit.js`, `markdown.js`, `layout.js`, `render.js`,
`advanced.js`, and `app.js` each attach one module to the `QCard` namespace,
loaded in manifest order.
