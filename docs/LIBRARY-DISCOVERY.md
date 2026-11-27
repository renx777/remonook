# Library discovery — Phase 4

Web staging first. Production and native releases remain separate gates.

## Design before implementation

Search is an explicit **Search local library** action in the existing search menu.
It opens a compact searchable dialog; opening Notes or typing in a bullet does not
start extraction. Only originals already cached on this device are indexed. No
network fetch, model, paid service or automatic download is involved. Missing
originals, unreadable/scanned PDFs and indexing failures have distinct statuses.

An isolated worker extracts EPUB passages and searches source text. PDF.js parses
PDFs in its existing parser worker, with yielding, asynchronous page orchestration
in the browser realm; no page is painted during extraction.
Saved articles use their cached plain text. Extracted units are cached in IndexedDB
under the current storage account/workspace and immutable content hash. Opening
search again reuses those units; changed hashes are extracted independently. The
worker and its database close on account/workspace change or dialog close. Results
are projected only through the current workspace's non-deleted book/bookmark list,
so an old cache cannot expose deleted or foreign sources. Extraction runs one file
at a time, with bounded file/unit/text budgets; errors do not block other files.
Results identify their source and page/passage and open that location in the
existing reader. Article hits navigate to an exact quote, without creating a note
or changing the saved article. Reader progress is marked only by existing explicit
reader actions. Closing search returns focus to its launcher.

Aliases are ordinary Traits: add `#traits`, then `Aliases: ML, Machine learning`
under the resulting Traits bullet. Commas or line breaks separate aliases; repeated
Aliases/Alias rows are retained and combined. No second property store, shared
schema change, startup rewrite or server deployment is needed. Aliases participate
in `[[` suggestions and the existing note-link chooser. Canonical IDs stay stable;
mirrors never duplicate suggestions.

Unlinked mentions live inside the existing backlinks panel, opened explicitly.
Scan only while expanded, in yielding chunks after a short debounce. Match titles
and aliases at Unicode word boundaries; ignore links, URLs, code, Traits, mirrors
and the target itself. Each suggestion shows its source context and a Link action.
Link only the reviewed occurrence, through the normal saved outline mutation in
one undo step. Recheck original text/formatting and target identity at save time;
stale suggestions fail honestly instead of replacing a changed passage. Names containing reserved internal-link delimiters (`[`, `]`, `|`) are left
as ordinary text; they can still be found in the manual link picker. No mass
or automatic linking. Opening the panel never modifies notes.

## Usage

- Search notes → **Search local library** → enter words or a phrase → choose a
  source passage. Books must have been opened on this device first.
- Add `Aliases: alternative name, abbreviation` in a note's Traits. Search that
  alias in a `[[` picker to link to the original note.
- Zoom into a note → expand **Connections** → review **Unlinked mentions** →
  **Link mention**. Ordinary Undo reverses the insertion.

## Limits and validation

The derived index is disposable and device-local, excluded from note sync/backups.
Originals and notes remain untouched if the index cannot be cached. Text extraction
has an 8 Mi-character per-source cap and a 32 Mi-character active-search cap,
with 10,000 units per source and 40 returned hits. Scanned image-only PDFs need the
existing OCR workflow; this search does not silently run OCR or spend AI credits.
Test workspace isolation, cache reuse, deletion, cancellation, malformed files,
source navigation, aliases, word boundaries, stale linking, formatting and undo;
check phone/desktop layouts and the full suite before web staging.

Deleting a local workspace also deletes its derived search database. A refreshed
article hash receives a new entry; old extracted content is never projected without
an active matching source in this workspace. Search queries live in dialog memory
only. PDF worker URLs use Vite's URL asset transform, verified by actual PDF opening
rather than a mocked parser. No backend, protocol or binding changes are required.

## Repeatable checks

```sh
NODE_OPTIONS=--max-old-space-size=4096 npm run build
NODE_OPTIONS=--max-old-space-size=4096 npm test
# Against dev, a built-app server, or hosted web staging (guest fixtures only):
LIBRARY_URL=http://127.0.0.1:5199 CHROMIUM_PATH=/usr/bin/chromium node scripts/e2e-library-discovery.mjs
```

Browser acceptance checks explicit indexing, PDF extraction/opening, EPUB passage
navigation, article quote highlighting, missing originals, cache reuse, isolation
from a second workspace, alias lookup, reviewed linking/undo and page overflow.
Both desktop/light and phone/dark run against isolated guest data. They do not
stand in for real Android/native keyboard or signed-in device testing.

[Desktop screenshot](screenshots/library-discovery-desktop.png) ·
[Phone screenshot](screenshots/library-discovery-phone.png)
