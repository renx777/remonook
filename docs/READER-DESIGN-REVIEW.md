# Reader design review

Historical first pass. The follow-up [Bookshelf and reader design](BOOKSHELF-AND-READER.md)
replaces the reserved annotation bar and footer with one compact toolbar and
continuous, virtualized PDF pages.

## Problems found

- The inset, rounded modal frame wastes reading space, especially on large PDFs.
- The selection palette floats over the document, includes a duplicate quote and
  an always-visible comment field, and can cover the passage being selected.
- Selection-change events run during a drag. Collapsed or invalid selections do
  not clear the old stored passage, so a later click can save the wrong text.
- A highlights sidebar or window resize rebuilds the PDF text layer without
  invalidating the stored selection. Its rectangles can belong to old geometry.
- Download and save notices float over the bottom of the page.
- PDF zoom uses text-size labels and lacks a clear reset to fit width.

## Implemented design

The reader fills the viewport with no inset card, rounded frame or blurred
backdrop. Native dialog semantics still isolate background shortcuts and return
focus to the opening control. The document has its own keyboard-focusable scroll
region. Page navigation and completion stay in the footer.

A compact, permanently reserved highlight bar sits above the document. Color
buttons enable only for a valid selection; selecting text never moves the page
or creates a floating panel. Comments expand only after choosing Add thought.
Downloads move into the header. Save feedback occupies a small reserved status
line and expires automatically. On phones the color targets are 44 pixels and
long header labels collapse; PDF zoom has a percentage and fit-width reset.

Selection is captured after pointer release or a settled keyboard/native-touch
selection change. New drags, page changes and PDF rerenders invalidate stale
passages. Comment entry and keyboard access to color buttons retain the selected
quote. PDF selections with no visible rectangles are rejected. Annotation data,
source anchors, notes, undo and automatic sync keep their existing contracts.

## Library decision

Keep the existing PDF.js canvas, text layer and worker. It already supplies the
rendering and selectable text required here. Adding React-PDF would introduce a
wrapper without addressing palette placement or selection ownership. The existing
Floating UI dependency is useful for popovers elsewhere, but a document selection
menu still competes with text and native touch handles. Reserved controls avoid
that overlap without adding a dependency or initial-download cost.

References:
- https://mozilla.github.io/pdf.js/examples/
- https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-TextLayer.html
- https://developer.mozilla.org/en-US/docs/Web/API/Selection
- https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog

## Verification

`npm run build`, the full automated suite and focused reader interaction tests.
The interaction tests cover drag completion, comment capture, stale-selection
clearing, navigation, zoom reset, focus restoration and invalid PDF geometry.
Browser checks use a synthetic, selectable PDF; no production books or user
records are needed. Desktop (1440 × 1000) and phone (390 × 844) Chromium checks
passed for actual text dragging, saving aligned highlights, zoom reset, sidebar
layout and navigation. These do not substitute for physical iOS/Android tests.

Environment builds now copy the versioned PDF fonts, CMaps and WASM assets before
building the offline shell, matching the ordinary build. The staging gate includes
the new reader interaction and asset-loading checks. No schema migration or new persisted fields are introduced.
