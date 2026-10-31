# Optional walkthroughs

Driver.js 1.10.2 powers the Show me how catalog in the workspace toolbar,
sidebar and outline options. The reader has its own help button. While a book is open, only its reading guide is available; other guides start from the workspace. No walkthrough
runs automatically, and all guides can be replayed from the catalog.

The three guides cover reading and annotations, question/answer study workflows,
and visual notes. Reading adapts to the bookshelf, a PDF or an EPUB. An empty
outline gets an add-a-note explanation instead of fabricated notes. Guides only
navigate views and open menus. They never activate uploads, insert content,
change question types, create decks or submit study reviews.

## Lifecycle and accessibility

The driver engine and vendor stylesheet import on demand and are excluded from the initial offline shell. Used guide assets are cached by the existing asset cache. All assets are bundled
locally. Stable data-tour attributes identify app actions without tying the tour
to translated button text or category positions. View changes wait for visible
targets; absent targets return an actionable message in the help catalog.

Next, Back and Finish are controlled by RemoNook so asynchronous view changes,
keyboard navigation and teardown use the same path. Arrow keys navigate, Tab
cycles through guide controls, and Escape or the visible Skip button dismisses.
Backdrop clicks do not advance or accidentally dismiss the guide. After cleanup,
focus returns to a visible help entry. Reader dismissal leaves the book open.
Account changes and app unmount cancel pending loads and destroy active guides.
Closing the catalog while the engine loads cannot start a delayed walkthrough.

Animations respect prefers-reduced-motion, including changes during a guide.
Popover colors inherit the current workspace palette. Mobile targets are tested
inside the Radix action sheet, and reader targets are tested inside its native
dialog. Driver.js manages its own spotlight and popover positioning; these are
not replacements for app menus or the existing Floating UI selection tools.

## Local guide progress

Completion and skip status use a versioned, account-scoped localStorage key.
Only known guide IDs and statuses are accepted when reading. Completed status
survives a skipped replay. Corrupt or unavailable storage does not prevent guides
from running; a failed write is reported when the catalog is reopened. This
browser-only UI preference is separate from note CRDTs, sync acknowledgements,
attachments and backups. It is not described as synced.

## Checks

Model tests cover account isolation, malformed storage, PDF/EPUB/guest/empty-state
plans, and unavailable guide IDs. Interaction tests exercise the real Driver.js
engine, keyboard navigation, completion/replay, focus return, Escape dismissal,
and cancellation during loading. Browser checks exercise app menus on desktop
and phones, cross-view Back navigation, native reader dialogs and unchanged
workspace records. Device emulation does not replace assistive-technology and
physical-device testing.

Sources: https://driverjs.com/docs/configuration and
https://driverjs.com/docs/interactive-tours. Full MIT notice is retained in
LICENSES/driver.js-1.10.2-MIT.txt.

Validation on 31 October 2026: TypeScript, production build and all 104 regression
files passed. Chromium checks passed for desktop and mobile app walkthroughs,
PDF readers at 1440px and 390px, and an EPUB reader at 320px. Reader and workspace
record snapshots remained unchanged. The generated guide JavaScript and CSS were
verified absent from the initial service-worker shell list.
