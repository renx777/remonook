# PDF captures and reader research

## Capture implementation

Use the camera button to enter area-capture mode, then drag across one PDF page.
Escape or the camera button cancels. For keyboard access or an entire page, use
More → Save current page to notes. The image is added beneath the existing book
heading as an ordinary image note. The note's source button returns to the PDF
page. Existing edited notes and captures are retained.

The implementation copies the PDF.js backing canvas directly. It captures the
original page pixels without reader controls, browser UI or a display-sharing
permission prompt. PNG is preferred for text and diagrams; oversized captures
use WebP and, if necessary, downsampling to respect the existing 2 MiB attachment
limit. Captures use the normal 20 MiB note-attachment budget and automatic sync,
durable local outbox, backups and undo behavior. They are not stored with private
book originals or added to the shared service-worker cache.

The page source uses an explicit `remonook:pdf/<hash>/<zero-based-page>` value in
the existing media `sourceUrl` metadata. A strict parser turns it into an in-app
citation button; it does not navigate arbitrary URLs. This avoids inventing a
text highlight for an image or adding new synchronized fields. Existing media
exports/backups retain the source metadata. Original PDFs remain unchanged.

No additional capture library is needed. PDF.js already renders the pixels;
Canvas `drawImage` and `toBlob` provide the region copy and encoding. A DOM
screenshot library would duplicate rendering and risk including the reader UI.
The capture module is loaded on demand.

## Research findings

Microsoft Edge's documented reader includes document search, page navigation,
fit modes, inking, highlights/comments, keyboard interaction and read-aloud with
word highlighting. Its most useful design principle here is document-first
navigation in one toolbar, with secondary actions exposed on demand.

Zotero connects annotations to editable notes with source-page links and
citations. It supports a Notes pane beside the PDF, adding annotations directly
to a note, and generating a note from a document's annotations. It also separates
stored annotation metadata from exporting an annotated PDF. This is a strong
reference for RemoNook's reading-to-notes-to-study workflow.

PDF.js exposes document outlines and per-page text/annotations. Its existing
workers and page renderer can support navigation and search without replacing
the viewer. Search indexing should stay lazy and bounded rather than parsing
and keeping the text for every book on startup.

## Recommended next steps

| Priority | Feature | User value | Implementation / effort |
| --- | --- | --- | --- |
| 1 | Search results + chapter outline | Find a term or section in a long book and jump directly to it. | Medium. PDF.js `getOutline`, page destinations and lazy `getTextContent`; a single optional navigation panel. No new viewer library. |
| 2 | Capture → image-occlusion card | Hide labels in a captured diagram and study it immediately. | Medium. Reuse RemoNook's existing image/occlusion and Study Desk paths; add a selection action on image notes rather than another card system. |
| 3 | Editable notes beside the PDF | Organize quotes, screenshots and original thoughts without closing the book. | Medium. Reuse the outline editor in an optional pane; keep source links and existing save/undo/sync behavior. Zotero is the reference workflow. |
| 4 | Book digest export | Export chosen quotes, images, thoughts and source pages as a study document. | Low–medium. Existing note tree and ZIP support can produce Markdown + image files. Keep full workspace backup separate. |
| 5 | Bookmarks + cross-device reading locations | Resume an exact reading location and collect useful pages on any device. | Medium. Extend the existing automatic CRDT sync with validated, stable book-hash anchors. Current browsing checkpoints are device-local; synchronized completion is a different record. |
| 6 | Read-aloud with follow-along text | Listen while reading and improve accessibility. | Medium. Prototype browser speech synthesis first; available voices, offline operation and word-boundary events vary by browser. Scanned PDFs need OCR first. |
| 7 | OCR for a scan or selected area | Turn an image-only passage into searchable text and editable notes. | Medium–large. Evaluate lazy, worker-based Tesseract.js and language packs; measure accuracy, download size and mobile memory before adopting it. Math/table structure needs separate evaluation. |
| 8 | Ask the book, with page citations | Explain a passage, compare ideas and produce grounded study questions. | Large / optional. Requires a provider, explicit API setup, indexed source chunks, bounded cost and citations that open the supporting pages. Keep generated answers distinct from source quotations. |

First ship navigation/search, then the diagram-to-study bridge and editable notes
pane. These address frequent reading tasks and build on features already present.
Keep the optional tools in panels/menus so improvements do not consume another
row of document space.

## Sources consulted

- Microsoft Edge PDF reader: https://learn.microsoft.com/en-us/deployedge/microsoft-edge-pdf
- Zotero PDF Reader and Note Editor: https://www.zotero.org/support/pdf_reader
- PDF.js document API: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html
- PDF.js page API: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html
- Canvas encoding behavior and format fallback: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob

## Validation

Model tests cover book-heading reuse, preserving Trash, source parsing, source
navigation metadata and image retention through backups. Capture tests cover
fractional geometry, backing-pixel conversion, invalid rectangles and attachment
size fallback. Browser checks use a synthetic PDF, never a user's private book. Desktop checks
verify a 440 × 300 region capture and an 816 × 1056 full-page capture, page links,
cancellation and quota failure. Phone-size checks retain the 48-pixel toolbar
without horizontal overflow. Physical touch devices were not available.
