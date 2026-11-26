# Inbox processing (Phase 1)

Open **Inbox** in navigation (on a phone, open the navigation button at the top
left), or run **Open Inbox** in the command palette. **Process Inbox** also appears
when viewing the canonical Inbox outline.

1. **Capture:** New capture opens an ordinary editable bullet under Inbox. There
   is no separate draft form: normal device saving, undo and sync protect typing.
   Dashboard quick capture, desktop quick capture and untargeted Android note
   shares use this same branch. Explicitly choosing Bookmarks still saves there.
2. **File:** choose a note or My notes. The original branch moves after the
   destination's existing children; its ID, children, attachments, provenance and
   study type stay intact. The destination expands. Existing references still work.
3. **Link:** choose an existing note. A child reference is appended under the
   capture, without copying either note. Repeating the same link adds nothing.
4. **Make task:** marks the original bullet TODO, retaining its current content
   and study type. It does not reopen completed tasks.
5. **Schedule:** creates one in-app Calendar reminder linked to the capture. Date
   and optional time are editable; repeating the action reschedules that reminder.
   The capture's deadline is unchanged. Reminder delivery follows Calendar's
   existing behavior: while RemoNook is open, not guaranteed background delivery.

Link, task and reminder actions keep the capture in Inbox until the user files it.
Nothing is automatically archived, classified or removed. Trash uses the existing
recoverable branch deletion. Undo/Redo are available in the Inbox toolbar; each
processing action is one normal history step. Open note shows the full capture,
children, sources and attachments. Captures display their share-received timestamp
when available, otherwise their original creation date.

## Architecture and safeguards

- Inbox is the existing `quick-capture-inbox` bullet; no parallel catalogue,
  processed-status field, new backend endpoint or schema migration is introduced.
- Actions resolve against the latest document through `commit` and `withNodes`,
  then use normal durable saving and the sync-v3 outbox. Pending data remains pending.
- Missing/moved sources and invalid destinations fail without changing content.
  Filing into Inbox, its descendants, Traits or mirrors is disallowed. Mirrored
  captures offer Open source; processing their source is done in the normal outline.
- Reminder identity is stable per source. Existing reminder notes/title and repeat
  settings are retained during rescheduling. The linked source opens from the
  Calendar reminder editor. Deleting a capture does not silently remove its reminder;
  users can remove the reminder separately in Calendar.
- Local, signed-out workspaces have the same processing actions. The view remounts
  on workspace/account changes; it has no independent content store. Destination
  search is workspace-local, bounded to 80 displayed results; capture lists page by 30.
- Phase 0 fixes are carried forward while PR #108 remains unmerged. Phase 2's task
  workspace, scheduled-date model, recurrence and native reminders are not part of
  this release. Production and native releases remain separate from web staging.

## Verification

`tests/inbox.test.mjs` checks capture routing, source/attachment preservation,
append order, idempotence, invalid/stale targets, durable saving, account isolation,
pending outbox preservation and concurrent offline filing/text-edit convergence.
`tests/inbox-app.test.mjs` exercises the actual app and one-step undo for all four
actions, Trash recovery and normal capture editing.

Run the browser acceptance test against Vite on port 5198:

```sh
npm run dev -- --port 5198
CHROMIUM_PATH=/usr/bin/chromium node scripts/e2e-inbox.mjs
```

Set `INBOX_URL=https://staging.remonook.com` for deployed acceptance. It always
creates fresh guest contexts and refuses production. `INBOX_SCREENSHOTS=/tmp/inbox`
saves desktop-light and phone-dark screenshots. `INBOX_TEST_IGNORE_TLS=1` is only
for a local test environment whose browser does not trust its HTTPS proxy; do not
change the application's TLS behavior.

Browser coverage: empty Inbox, capture and child creation, offline processing,
link/task/reminder creation, filing, undo/redo, Trash recovery, Escape/focus return,
viewport overflow and durable reload. Physical Android sharing/IME checks remain
owner device tests before native rollout.
