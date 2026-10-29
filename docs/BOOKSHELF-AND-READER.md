# Bookshelf and document-first reader

## Design review

The Edge reference succeeds through a single toolbar, a neutral page surround,
continuous scrolling and annotation tools that appear on demand. The preceding
RemoNook design reserved a title row, annotation row, footer and permanent status
row. Making that shell full-screen did not solve the loss of document space.

The new design gives the reader one 48-pixel toolbar. Navigation, page number,
zoom, page sizing, highlighter and highlights live together. Download, book notes
and completion are secondary menu actions. There is no permanent footer, help
strip, duplicate selected quote or automatic selection popup. Save feedback uses
an accessible live region and the existing title slot, without moving the PDF.
On a 390 × 844 viewport the reading area is 796 pixels tall. Optional annotation
and highlights panels are opened explicitly.

## Reading behavior and implementation

- PDFs scroll continuously. The toolbar tracks the visible page; arrows and page
  entry navigate directly. Actual size (96 CSS pixels/inch), fit width and fit page
  are distinct modes. A zoom/size change retains the current page.
- `@tanstack/react-virtual` 3.14.24 provides measured page virtualization. Nearby
  pages render with one page of overscan, including mixed-size pages. This avoids
  retaining a canvas and text layer for every page. PDF.js retains its rendering
  limits, local fonts/CMaps/WASM, text selection and worker cleanup.
- Native text selection stays native. The highlighter is enabled for a completed,
  valid selection. Color choices and comments open only on request. Comments live
  beside the document. Normalized source rectangles survive a sizing change;
  navigation and new selections clear the old passage.
- EPUBs retain the existing safe, worker-based text renderer, stable passage
  boundaries and source anchors. The same compact toolbar controls passage and
  text sizing. This does not introduce fixed-layout EPUB rendering or DRM support.

TanStack Virtual is a headless library: it supplies measurement and scrolling,
without imposing another toolbar, annotation model or storage system. Wrapping
PDF.js in React-PDF would not supply the interaction design needed here; a full
commercial PDF viewer would add competing controls and licensing. The virtualizer
and PDF engines stay in lazy reader modules rather than the initial offline shell.
MIT notices for the new dependency and its core are retained under `LICENSES/`.

## Bookshelf

Bookshelf is a main navigation destination on desktop and mobile. The Daily
Reading widget opens this same library. Existing uploads appear automatically;
there is no second book collection or migration.

The gallery uses book proportions, restrained cover colors, serif cover titles,
small format labels and reading progress. Search, recently-added/title sorting,
PDF/EPUB filters, in-progress and finished filters support larger collections.
Clicking a cover opens the original in the reader and resumes the last viewed
page on that device. Browsing checkpoints are account/book-scoped local preferences;
they do not mark pages read or alter synchronized daily completion. Upload, download and deletion
use the same account-bound storage hook as Settings, with existing limits,
validation, upload durability and deletion confirmation.

Covers use an existing account-local thumbnail when available. Otherwise a cached
original can supply a first-page PDF preview or a bounded EPUB cover image. Only
visible/nearby covers are prepared; at most two extraction tasks run concurrently.
Browsing the shelf does not fetch every original. Generated thumbnails stay in
the account's private IndexedDB book cache, outside the shared service-worker
shell and note assets. A typographic cover is the fallback when no local preview
is available. A failed preview never prevents reading.

## Research references

- Microsoft Edge PDF reader: https://learn.microsoft.com/en-us/deployedge/microsoft-edge-pdf
- TanStack Virtual: https://tanstack.com/virtual/latest/docs/introduction
- Installed, pinned TanStack type declarations and source were consulted for
  dynamic measurement, scrolling, estimates and overscan behavior.
- PDF.js examples: https://mozilla.github.io/pdf.js/examples/
- Microsoft Fluent layout: https://fluent2.microsoft.design/layout

The supplied Edge screenshot was the direct visual reference. The result follows
its density and document emphasis while retaining RemoNook's theme, notes,
account isolation, progress, undo and sync behavior.

## Validation

Automated tests cover bookshelf format/progress filtering, title search, direct
reading, signed-out access, metadata-only gallery requests, existing upload/cache
operations, selection capture, comments and source geometry. The production
navigation smoke test opens Study Desk explicitly, rather than assuming it is
always the last navigation item.

Chromium browser checks use a synthetic 100-page PDF and a two-passage EPUB at
1440 × 1000 and 390 × 844. They verify text dragging, aligned highlights, a jump
to page 50, bounded canvas count, continuous-scroll page tracking, zoom retaining
the current page, gallery search/filtering and direct EPUB access. No production
books or accounts are used. Physical Android/iOS touch selection remains a manual
acceptance check.

There are no backend/schema changes or new synchronized fields. Reader and
Bookshelf continue to use the already-deployed staging book backend. Production
still needs the separate book-storage/reader backend release before frontend
promotion.
