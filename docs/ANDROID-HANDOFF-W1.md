# Remo Web W1 handoff to Android thread

Web v0.1.0 · Proposed contract 1.0.0 · Android reference v0.17.0 / Room schema 11.

The Android reference was inspected and left unchanged. This is a separate web implementation; no thread-to-thread synchronization has occurred. Please read this handoff and the contract explicitly.

Delivered: local-first outline editor, stable hierarchy and IDs, basic range formatting, keyboard split/merge, drag nesting, undo/redo, linked card derivation, Trash, IndexedDB saves, Android schema 10/11 backup import and schema 11 compatibility export. Full study UI remains W3/W4; all imported review/schedule/session/limit data is retained now.

Behavior matched from source:

- Card ID = question bullet ID; deck identity = rootId. Edits preserve schedule; losing a qualifying Q&A structure makes a card inactive.
- Deck alternating-depth questions exclude nested questions from parent answers. Blank direct answers without media do not qualify.
- Enter-at-parent-end inserts first child; other Enter splits into a NOTE sibling. Merge follows prior visible row and transfers children/media references.
- Scheduling is the existing SM-2 adaptation, not FSRS. Difficulty/stability/retrievability are preserved unused fields.
- Normal practice must log without scheduling; daily budgets count distinct spaced cards; burial ends at local midnight.

No Android migration is needed to try W1 compatibility exports: they target the existing exact schema 11 archive. Web full archives use `remo-web-backup` and are intentionally not accepted by unchanged Android. Extended fields block Android-compatible export. Future schema changes require coordinated reader updates because Android currently enforces exact table and column layouts.

Web-only differences: pointer/keyboard editing, responsive navigation, browser font families, visual depth capped at eight levels (data depth uncapped), revision protection and operation journal. Widgets remain Android-specific. ZIP64 imports are explicitly unsupported in W1.

Share files: CONTRACT-1.0.0.md, PARITY.md, fixtures/scheduler-v1.json and src/android-schema.json. Scheduler fixture outputs should be checked independently against Kotlin before a future scheduling release; current JavaScript tests assert source-derived rules.

Validation: TypeScript/build and automated domain/storage/DOM tests. See VALIDATION-W1.md for exact scope and remaining browser/device checks. Request for Android thread: export a real schema 11 backup, import it in web, export Android-compatible backup, and validate restore on a test Android installation before transferring irreplaceable data. Keep a separate original backup.

Next planned milestone: W2 (Calendar, full content tools, media and animated emojis, toolbar configuration, bulk actions and structure-preserving paste). Do not assume W2 changes have been implemented or adopted by Android.

W1 stability update (2026-10-06): web-only editor initialization, measured-outline resize safeguards and browser API fallbacks; recoverable error screen with draft backup and local diagnostics. No contract, Android fields, scheduling rules or schema changes. The reported white-screen failure remains unconfirmed on the originating device; production-bundle DOM regressions pass. Android reference remains unchanged.
