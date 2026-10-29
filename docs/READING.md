# Reading, highlights and dashboard spaces

Staging release: Dashboard → Add widget → Daily reading, or Settings → Storage →
Read. PDF.js 6.4.299 provides canvases, selectable text and a separate parsing
worker. PDF font/CMap/WASM support files are served locally, never from a CDN.
EPUB parsing runs in a separate worker using pinned fast-xml-parser and JSZip.

## Reading experience

The focused reader fills the viewport without an inset modal card. Native dialog
semantics retain keyboard isolation and focus restoration. A quiet title bar, one
active page/passage, previous/next and a jump field, display-size controls, and
Mark as read provide the reading workspace. Desktop
has an optional highlights sidebar; on phones it becomes a sheet. Selection uses
native text selection, with a compact color bar reserved above the document.
Comments expand only on request; typing stays local until the highlight is
committed. Controls never float over the PDF. Selection is captured after dragging
ends and cleared on navigation, deselection and PDF rerendering. Escape dismisses the
selection, then the highlights panel, then the reader. Focus returns on close.

PDF rendering is limited to the current page, capped at four million canvas
pixels and at most 2x device pixel ratio. Render tasks cancel on navigation;
page resources clean up and document workers terminate on close. The text layer
is independent of annotation overlays, so adding a highlight does not rasterize
the page again. Image-only PDFs can be read but require OCR for selection; OCR
is not provided. Password-locked PDFs need an unlocked copy.

EPUB v1 is a text reading mode. It follows OPF spine order, preserves readable
paragraph order and entities, and excludes scripts, styles, executable elements
and external resources. Illustration alt text is retained; publisher image,
font, table and fixed-layout fidelity is not reproduced. The original file stays
available for download. Encrypted EPUB resources are rejected. A chapter is
bounded at 2 MiB expanded markup, text across the book at 8 MiB, and units at
10,000. ZIP entries have bounded expansion. Processing and text segmentation
stay in the worker; only the active passage is sent to the UI.

EPUB unit algorithm v1 is stable: up to 350 whitespace-delimited words, capped
at 3,000 characters with paragraph/word breaks where possible. Do not change its
boundaries in place in a future release; introduce a version and migrate source
anchors if segmentation changes. Units do not depend on screen size, font size,
or calendar date.

## Notes, identity and persistence

- `web.readingHighlights`: keyed annotations with immutable book hash, current
  original ID, format, unit, offsets, original quote, normalized PDF rectangles,
  color, note/root IDs and deletion flag.
- `web.readingNoteRoots`: book-hash-to-root-note ID. Roots are generated
  deterministically and are not looked up by title. Existing renamed/retyped
  headings and children are preserved. Capturing after a branch was trashed
  allocates a fresh identity rather than overwriting Trash.
- Highlight identity is SHA-256 of file hash, format, unit, start and end offsets.
  Simultaneous devices converge on one quote/root; separate highlights and
  comments remain preserved. Re-selecting an existing passage can recolor it or
  append a comment without replacing edited note text.
- Quotes/comments use ordinary NOTE bullets and the existing mutation, durable
  save, outbox, sync and undo paths. One capture is one undo step. Source references
  are separate metadata so editing note prose does not destroy the original.
- `web.readingProgress`: per-book base and unit-keyed completion dates. The next
  unread unit is derived from merged completion records, so lower cached position
  values cannot undo reading completed on another device. Browsing never marks a
  unit complete. Missing days do not advance or accumulate an overdue queue.
- Removing a highlight keeps its note. Deleting an original keeps all captured
  notes; source opening then explains how to reimport. Identical-file reimports
  resolve by content hash. Full web backups preserve metadata, sources and
  progress, while originals remain separately downloaded files. Android export
  fails explicitly rather than dropping source metadata.

Reading data is validated locally, during imports and on the sync backend.
Existing note/workspace limits apply to captured notes and metadata. Book-file
limits and the combined 100 MiB quota remain unchanged.

## Dashboard tabs

Existing widgets remain in an implicit Today tab without dirtying the workspace.
Tabs can be added, renamed, reordered, removed and restored with Undo. Stable IDs
and removal flags use normal sync; each widget records its tab membership and
keeps its existing responsive layouts. Maximum eight active tabs, sixteen widgets
per tab. Phone order is independent per tab. Active tab selection is device/account
local, so one device cannot switch another device's dashboard view. Reading
progress belongs to the book, not to its widget or tab.

## Loading and compatibility

The reader executes only after opening a book. Its small interface is included
in the offline shell; PDF parsing and page modules, the PDF worker and the EPUB
worker stay out of the initial precache. Engines and versioned PDF support assets
cache on use in a separate 128-entry runtime cache, retained across shell updates. Original book binaries are never
included in this shell cache. Users must open the reader once online before
expecting offline reading. Reader-load failures have a local fallback and do not
replace the notes workspace with a recovery screen.

The staging gate requires `bookReader:1` from /health before frontend release.
Deploy the matching backend validators first; no database migration is needed.
Existing book storage flags, quotas, private buckets and cleanup remain intact.
Production remains a separate release. Public tutorial: /guides/reading.

## Validation

Model tests exercise grouping, repeated selection, original-note edits, comments,
Trash, completion ordering, missed days, concurrent CRDT merges, backups and
invalid geometry. EPUB tests cover order, bounded deterministic units, external
content exclusion, encryption and malformed packages. Chromium checks cover real
PDF selection, EPUB passages, source navigation, color changes, mobile/desktop
layouts, tab isolation and removal undo. Run the existing typing/sidebar and
study regressions alongside these tests.
