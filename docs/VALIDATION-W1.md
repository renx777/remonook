# W1 validation — 2026-10-06

Web v0.1.0 · Contract 1.0.0 · Android reference v0.17.0 / schema 11.

## Completed

- `npm test`: 18 passed, 0 failed.
- `npm run build`: TypeScript check passed; Vite production build passed; versioned offline shell generated.
- jsdom integration: add empty bullets, keyboard Enter, indent, undo, persisted reload, Trash deletion and restoration with unchanged IDs.
- fake-indexeddb: transactional persistence, current-revision protection against stale tabs, staged restore recovery, full round trip, and rollback after synchronous clone failure (no queued record commits).
- ZIP: Android-compatible schema 11 export/import with media; checksum corruption/missing assets/unsafe paths/duplicate entries rejected; schema 10 migration; unknown fields, unknown table sequence and unknown manifest metadata preserved through full re-export. Lossy Android export blocked.
- Domain: stable hierarchy, cycle guards, split/merge, UTF-16 marks, nested question exclusion, card schedule preservation and source-derived scheduler fixtures.
- Rich-text adapter: overlapping marks, Unicode, hard breaks and colors; unsupported formatting detected before editable conversion.
- Domain benchmarks in this environment: 10,000-deep validate/traverse about 18 ms; 10,000-wide move/traverse about 10 ms; 5,000 linked cards initial derivation plus content refresh about 32 ms. Measurements vary and do not represent browser frame rate or phone performance.
- Extracted Android reference compared byte-for-byte to all files in the original archive: 0 changed files.
- Original Android source ZIP SHA-256: `1641de45234f9fe72a75d9e07102eb260a06b9333a121cb3cac2a8e3f822ce78`.

## Not performed in this session

Real browser rendering/interaction, real IndexedDB failure/quota conditions, pointer/touch drag, screen reader acceptance, iOS/Android browser keyboard composition, PWA installation/offline acceptance, Windows launcher execution, and restoring a web-exported ZIP on a real Android installation. These are manual acceptance items, not claims of passing tests. DOM tests use jsdom; storage tests use fake-indexeddb.

## Device acceptance checklist

1. Run the bundled build using the Windows launcher or `node scripts/serve.mjs`; open the printed localhost address.
2. Type English and Kannada/Tamil text, test IME composition, emoji, selection formatting, split/merge and multiline/code input. Verify the caret remains stable.
3. Make empty bullets, close the browser after it reports Saved, and reopen at the same address. Verify persistence and outline IDs via backup export.
4. Drag a branch before/after/inside another, near scroll edges and over a collapsed branch. Try an invalid self/descendant move. Repeat on touch after an approved HTTPS deployment.
5. Navigate with keyboard only, leave editing with Escape, operate menus/dialogs, and verify focus return. Check with a screen reader and enlarged reading size.
6. Import a copy of an Android schema 11 backup; inspect hierarchy, media, cards and retained schedules. Export Android-compatible backup and test restore on a separate Android installation. Retain the original backup.
7. Try a corrupted ZIP and confirm that live notes stay unchanged. Restore a valid backup and recover the pre-restore snapshot. Open two tabs and verify stale writes are rejected.
8. Test a 10,000-node real outline for scrolling, active-editor focus retention and responsive input. The automated benchmark alone does not establish rendering performance.
9. Validate offline reopening after service-worker installation and closing all old tabs during a build update.

Calendar and full study UI are explicitly deferred in the application and parity checklist. No account, paid service or sync backend was added. At W1 packaging time no hosted Site existed. A subsequent user request authorized private deployment at https://remo-notes.arenukaprasad.chatgpt.site; application data remains local to each browser.

## W1 stability update — 2026-10-06

Investigated a reported white screen after interaction. The original compiled production bundle passed the same editing smoke test in jsdom; the reported device-specific failure has not been reproduced, so its root cause remains unconfirmed. Server worker error logs were empty.

The update removes the editor selection callback's dependency on a constructor-local variable, consolidates duplicate row ResizeObservers, schedules measurement updates by animation frame, ignores unchanged viewport dimensions, and falls back when ResizeObserver or dialog.showModal is unavailable. A root recovery boundary also handles rendering errors and uncaught browser errors/rejections, displays error details locally, and offers a full draft/media backup before reload. It does not reset storage or send telemetry.

Additional regression checks exercise the actual built production bundle with ResizeObserver and showModal absent, editing/indent/undo/Trash/navigation/settings, then inject an error to check recovery UI and retained IndexedDB records. A separate test throws during rendering and verifies the recovery backup callback. These use jsdom/fake-indexeddb and do not replace testing on the reporting device. Existing service-worker updates require closing old Remo tabs; do not clear site data.
