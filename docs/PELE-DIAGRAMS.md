# Pele diagram renderer

Fenced Mermaid blocks now use Pele 1.12.0 as their primary renderer. The syntax
users save, export, and sync is unchanged. Pele is MIT licensed and requires no
account, API key, hosted service, or runtime dependency.

## Rendering and compatibility

`Notation.tsx` delegates diagram mounting to `diagram-renderer.ts`. The Pele lazy
entry point loads the required diagram family, then mounts a block container with
an explicit per-instance SVG ID prefix. Its mount tracks width changes and web
fonts; the app also updates its font settings when workspace typography changes.
Theme colors map to RemoNook's CSS variables and change without a diagram redraw.
Pele can rearrange wide diagrams on narrow screens. Layout and styling differ
from Mermaid's renderer; Pele targets Mermaid 12.1 syntax while the retained
Mermaid package is 12.2.

If Pele cannot parse/render an existing diagram, the adapter imports the previous
Mermaid renderer with strict security and bounded source/edge settings. If both
fail, the original source stays visible and editable with a plain-text error.
Pele limit failures are never retried through Mermaid. A render from an outdated
source or an unmounted note cannot replace the current SVG. Mount/resize/font
observers are destroyed when leaving the note or switching to the fallback.

Math labels use the existing KaTeX dependency only when needed. The adapter
measures trusted MathML in the browser before passing it to Pele; arbitrary HTML
labels, image fetching and diagram click callbacks are not enabled. Source limit:
50,000 characters; SVG limit: 4,000,000 characters; flowchart edge limit: 500.
Pele's own escaped SVG output and strict Mermaid rendering remain the markup
boundaries. KaTeX uses `trust:false` with existing expansion/size bounds.

## Loading and offline behavior

No CDN is used. Successful Pele diagrams never import or execute Mermaid.
The existing offline service worker still precaches bundled application assets,
including the retained Mermaid compatibility code, so this release does **not**
claim a sixfold reduction in total offline download size. It improves diagram
rendering and avoids parsing/executing the legacy renderer on the normal path.
Retaining the fallback preserves legacy diagram availability offline.

## Measurements and validation

Local headless Chromium, five small representative fixtures; each renderer warmed
once, median of three trials. Each trial rendered Pele 100 times and Mermaid five
times, measuring time to produce SVG. This excludes the first library download and
is not a benchmark of full page load or every possible diagram.

| Fixture | Pele (ms) | Mermaid (ms) |
| --- | ---: | ---: |
| Flowchart | 0.192 | 42.04 |
| Sequence | 0.061 | 13.42 |
| Mindmap | 0.026 | 43.44 |
| Class | 0.087 | 35.42 |
| State | 0.093 | 30.72 |

`tests/diagrams.test.mjs` checks nine real diagram families, distinct accessibility
IDs, escaped source, limits, stale imports and fallback completions, cleanup and
fallback failure. Existing editor parsing/formatting tests continue to cover the
unchanged source representation.

Chromium UI checks cover eight mounted examples including math, light/dark themes,
font changes, mobile resizing (390px), unique IDs, changing diagram families while
editing, malicious-looking labels as text, invalid source and recovery, and no
legacy engine request on successful diagrams. TypeScript, builds and the full
regression suite gate the staging release.

## References

- [Pele source and MIT license](https://github.com/obsidianmd/pele)
- [Lazy imports, mounting and MathML](https://pele.run/api)
- [Syntax and layout differences](https://pele.run/compatibility)
- [CSS variables and fonts](https://pele.run/theming)
- [Escaping, limits and application responsibilities](https://pele.run/security)
