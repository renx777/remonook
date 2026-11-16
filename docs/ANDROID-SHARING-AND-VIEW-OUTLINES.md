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
