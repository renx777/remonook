# Android incoming sharing and view outlines

Work branch: `codex/android-share-view-outlines`, based on current main and fast-forwarded through the native widget staging baseline to preserve existing changes. Release to staging only.

Android receives plain shared text/links through ACTION_SEND, plus selected text through ACTION_PROCESS_TEXT. A small receiver first durably queues the original payload in private device storage, then opens the existing app. The main app presents an editable capture preview, with the current workspace named explicitly. Saving uses normal undoable note/bookmark mutations and normal persistence. No account is required for device-local capture. No shared URL is opened or fetched automatically.

A stable capture UUID and a receipt in the saved workspace prevent duplicate insertion after a crash between local save and native acknowledgement. Acknowledgement/archive follows successful local persistence. Save failures leave the original queued payload and editable preview available. Account changes invalidate the destination; pending shares do not silently enter another account. Original queued content is retained until saved or explicitly discarded by the user. No sync outbox or shared-state replacement is introduced.

Notes focuses on ordinary notes at its root. Study Desk, Calendar, Mindmaps, Bookmarks and Bookshelf receive an Outline toggle exposing their existing source bullets in place. This is a presentation change, not a migration or duplicated data store. Global search and direct note navigation must continue to reach every kind of content. Existing editor/save/undo paths are reused, and mixed pages preserve their ordinary notes.

Validation must cover cold/warm incoming shares, selected text, URL capture, duplicate retries, failed save, account transitions and guest capture; view-specific filtering, mixed branches, empty states, search/deep links, editing/undo, mobile navigation and light/dark themes. Native APK compilation and public update verification are separate from browser acceptance. Physical Android sharesheet testing requires an installed device.

Confirmed destinations are bound in native private storage before the canonical
mutation, using a separate immutable claim keyed by capture UUID. Inbox reads
filter those claims natively, before returning text to JavaScript. A different
account cannot resume or acknowledge an owned share. Unconfirmed incoming shares
remain device-level drafts until the user explicitly chooses Save in the named
workspace. Native archive acknowledgement verifies the original destination.

## Staging validation

Application commit `b0040a07c1859587841bfbe7db5bf25cc7bf49e2` passed the full
160-file suite, TypeScript, staging build and exact-source CI. Web staging run
170 and Android run 10 published successfully on 16 November 2026. Live browser
smoke checks passed for desktop/mobile outlines. The signed Android 0.1.10 APK
passed package, intent-filter, existing-widget and certificate verification.
Browser capture tests cover guest saving, repeated taps, failed-save retry and
account changes; native IPC is simulated there. Physical Android sharesheet,
cold/warm Activity behavior and selected-text menu acceptance remain to be
confirmed on an installed device. See ENVIRONMENTS.md for current release details.

## Fixes after the first staging release

- **Sharing failed on phones with "link failed: EACCES (Permission denied)".** Android does not
  allow apps to create hard links in their private storage, and the share receiver, the share
  archive/claim steps and the flashcard widget's review files all published files that way. They
  now publish by rename (atomic within one directory). Each target is checked first, under the
  existing lock or with a fresh id, so an existing file is never replaced; a conflicting widget
  review still keeps both versions.
- **View outlines:**
  - An empty view outline (Study Desk, Calendar, Mindmaps) offers Add instead of only "No … yet".
  - A bullet that editing carries out of the view (outdented out of a mindmap, no longer a
    flashcard) stays in place until editing ends, as Notes already did, so the cursor is not lost.
  - When editing ends and the bullet now belongs to another view, a notice says where it moved,
    with **Show**, which opens it on its page in that view.
  - Zooming inside a view's outline shows breadcrumbs: the view's outline, then the path; each
    part is clickable.
- Checks: `scripts/e2e-view-outlines.mjs` (browser), `cargo test` (the widget's immutable-review
  test covers the rename path).
