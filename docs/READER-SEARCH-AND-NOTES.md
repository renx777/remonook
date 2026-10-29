# PDF search, contents and editable book notes

The reader retains its single 48px toolbar. Search/Contents opens a navigation
panel; Book notes opens the existing book note branch in an editable side pane.
On wide screens both can be open alongside the PDF. On narrower screens opening
one panel dismisses the other so controls remain reachable.

## Search and contents

- Ctrl/Command F focuses PDF search, including when the navigation pane is
  already open. Results include page numbers and contextual snippets. Enter and
  the previous/next controls move through matches; selecting a result jumps to
  its page and outlines the matched text without changing stored annotations. The page counter follows the most visible
  page, and large jumps retain placeholder height until the destination renders.
- Search begins after a 250ms typing pause. Text is extracted sequentially via
  the existing PDF.js worker, with incremental results and cancellation when the
  query changes or the reader closes. No library-wide index is built at startup.
- The search cache holds at most 32 pages and 256,000 normalized text characters.
  Results are capped at 500, with a prompt to narrow the query. Ligatures and case
  are normalized; match positions map back to original UTF-16 text-layer offsets.
  Text-run spacing and line endings support phrase matching across PDF spans.
- Contents uses the PDF's embedded outline and resolves named/reference page
  destinations. Nested entries are collapsible. Malformed destinations and
  external actions are not executed. Books without an embedded outline explain
  the fallback to search or page entry. Scanned pages require selectable text.

## Editable notes

The pane displays the book's ordinary note subtree, including existing highlights,
thoughts and screenshot images with their source-page buttons. A source button
returns to the PDF page inside the same reader. New note creates or reuses the
existing stable book heading, preserving renamed headings and Trash history.
Opening the pane alone does not create notes.

Notes reuse Tiptap, the existing note serialization/marks and the parent's normal
content-update path. Typing and bold/italic/underline changes save automatically;
remote document updates reconcile against the authoritative current node, as in
the outline editor. Undo/redo uses the application's existing history rather
than an independent editor history. Existing formatting the editor cannot safely
handle remains read-only and can be opened in the full Notes view.

Only the active note mounts an editor. Long branches show an initial batch of 60
notes, with an explicit Show more action. The PDF remains virtualized while notes
are open. Phone-size controls keep the compact toolbar; the notes pane becomes
an optional overlay that can be closed to return to reading.

This release adds no dependencies, backend changes or synchronized fields. Book
notes remain standard notes and media, so existing saving, automatic CRDT sync,
backups, study relationships and source anchors retain their contracts. PDF
search/contents is PDF-only; the notes pane also works with the existing EPUB
reader, using its passage references.

## Validation

Automated tests cover normalized search offsets, repeated-query caching,
cancellation, result caps, named/reference chapter destinations, malformed and
empty outlines, new-note root reuse, live note-pane updates and the existing
reader regressions. Browser QA uses a synthetic 20-page PDF with an embedded
outline and checks real match rectangles and rich-text editing. The real-browser flow passes at 1600 × 1000 and 390 × 844, including
normalized match overlays, chapter jumps, rich-text edits, incoming updates,
undo, responsive panel switching and the 48px toolbar. All 98 automated test
files pass. No private books or accounts are used. Physical iOS/Android checks remain a manual acceptance step.
