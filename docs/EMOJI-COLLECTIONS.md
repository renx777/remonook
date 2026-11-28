# Emoji artwork choices

The full emoji picker and inline colon picker offer Google Noto, Microsoft Fluent,
Twemoji and OpenMoji. The picker remembers its collection on this device. It is
a choice for new insertions, not a command to replace artwork already in notes.
Existing Unicode text, Noto/Fluent tokens and custom animations remain unchanged.

Twemoji and OpenMoji are static SVG collections. They never start an animation
player or fetch animation previews. Only visible picker artwork and explicitly
selected downloads contact pinned GitHub URLs, without note text/search queries.
Selected SVGs are checked against their pinned Git blob, validated and saved as
ordinary emoji attachments before insertion. Saved notes render their local files,
including while offline. Downloads still need connectivity if not yet saved.

Attribution and license links are embedded as SVG metadata in each saved file;
the drawings remain unchanged. The single primary asset carries those notices
through existing sync, backup, history and Markdown/OPML packages, including on
older sync servers. Full license texts are in LICENSES. Twemoji graphics use
CC BY 4.0; OpenMoji artwork uses CC BY-SA 4.0 and remains under that license.
The app's code is separate from the licensed artwork.

No shared schema, Unicode rewrite, backend migration or forced preference sync.
Older app versions need updating to render the new static tokens; their generic
emoji records and SVG attachments remain compatible with normal synchronization.
Web staging first; native and production releases are separate.

## Updating the catalogues

Run scripts/sync-static-emojis.mjs explicitly with network access. Sources are
pinned to commits in that script. It matches published Unicode metadata to actual
SVG paths, excluding custom non-Unicode additions. Builds do not contact GitHub.
The generated catalogue includes skin tones, flags and supported sequences.

Catalogue labels, categories and tags derive from the pinned OpenMoji dataset
and are distributed under CC BY-SA 4.0. See LICENSES/emoji-artwork.md.
Catalogue metadata is bundled; artwork files load only when shown or selected.
Inline search indexes only the active collection and caches that index.
