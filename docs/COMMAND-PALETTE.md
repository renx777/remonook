# Commands and keyboard shortcuts

RemoNook uses cmdk 1.1.1 for searchable commands and Tinykeys 4.0.1 for shared
workspace shortcuts. Both are MIT licensed and bundled locally. There is no
remote command service, telemetry or extra account requirement.

Open **Commands & notes** from the sidebar or toolbar, or press Ctrl+K (⌘K on
Mac). Search actions and all note titles/text, including nested bullets. The
palette ranks fuzzy matches, renders at most 40 matching notes after searching
the complete outline, and preserves distinct IDs for identical titles. Notes
show their parent as context. Arrow keys select, Enter opens, Escape dismisses;
the shortcut also toggles the palette. Mobile has visible entry points and
48px action rows. Styling follows the workspace theme and reduced-motion setting.

Actions open Notes, Dashboard, Bookshelf, Study Desk, Calendar, Settings,
walkthroughs and keyboard help, toggle the sidebar, or explicitly create a new
note. Navigation and note creation flush pending edits and stop with an error if
saving fails. Searching and dismissing the palette do not change workspace data.
Command execution is guarded against double selection while saving.

The reader has a separate context: Ctrl/⌘K or **More reader options → Commands &
notes** opens PDF search/contents, book notes, highlights, display reset and help.
Only relevant actions appear for an EPUB. The palette is portaled inside the
native reader dialog, so it remains visible in the browser's top layer. It never
navigates away from an unfinished reading/annotation session. Escape dismisses
the palette while keeping the book open. Focus returns to the invoking control,
including the summary of a reader menu that has closed.

Tinykeys replaces duplicate global handlers for the palette, save, sidebar and
new-pane shortcuts. It yields to handled events, composition, repeated keys,
other modals/menus and Driver.js tours. Editors retain their local formatting,
undo and structural commands. Saving still works during immersive study; other
workspace shortcuts stay inactive there. No CRDT, outbox or sync policy changes
are involved.

Validation: real cmdk/Tinykeys interaction tests cover fuzzy search, late and
duplicate note matches, disabled actions, honest action failures, keyboard
navigation and shortcut scope. App regression tests cover note navigation and
live typing/pane behavior. Chromium checks cover desktop, 320/390px mobile,
pending-edit persistence, modal handoffs, focus return and native PDF/EPUB
readers. Physical-device and assistive-technology testing remain additional
validation beyond browser emulation.

Sources: https://github.com/pacocoursey/cmdk and
https://github.com/jamiebuilds/tinykeys. Full MIT notices are retained under
LICENSES and served as /cmdk-LICENSE.txt and /tinykeys-LICENSE.txt.

On 31 October 2026, all 106 regression files passed. After the final focus and
shortcut-scope refinements, the affected palette/shortcut/reader tests and
TypeScript checks passed again. Production builds passed, and browser checks
verified repeated commands in PDF readers at 1440px/390px and EPUB at 320px.

## Performance refinement

Large outlines now search in a local module worker. Note matching uses linear
text/token checks and bounded preview fuzzy matching, retaining the best 40
results without sorting the full outline. The worker indexes text once per
outline version and discards stale query responses. When workers are unavailable,
a cancellable fallback yields between 250-note batches. Search never calls an
external service, and pending results cannot open an item from an older query.

The palette keeps a stable height while filtering. Its backdrop has no blur,
opening is immediate, and pointer hover uses CSS rather than updating cmdk's
keyboard selection. Keyboard navigation still scrolls the active item into view.
The shortcut reference has grouped/searchable commands, a fixed header and one
scroll region; its native dialog also has no backdrop blur or entrance animation.
