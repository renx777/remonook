# Cross-device sync: reliability release

This release improves the snapshot protocol without changing production D1/R2
schemas or requiring all older tabs to upgrade simultaneously.

## Merge rules

- Different bullets merge by ID. Within an existing bullet, independent fields
  merge; text and formatting remain one atomic unit, as do parent and position.
- Delete versus edit, divergent edits to the same text/formatting, and unsafe
  tree structures remain internally pending until a safe merge is possible.
  Users are not asked to choose a workspace copy.
- Derived note timestamps reconcile separately. Workdays entries/holidays/leave
  allowances merge by date/year; policies by effective date. Calendar reminders
  and study folders merge by ID. Attachments remain path/hash checked.
- Collapsed outline state and Workdays day/month view belong to the browser.
  Cloud applies preserve those local values, including with older clients.
- Legacy acknowledged JSON keys can recover the exact prior baseline. Malformed
  or inconsistent keys never authorize an automatic overwrite. An absent asset
  baseline is accepted only when the current attachment manifests agree.

## Delivery and recovery

Local saves remain durable in the account-specific IndexedDB workspace. Pending
changes are found by comparing this workspace and attachments to its acknowledged
checkpoint after reload. This is not yet a per-operation outbox.

Local edits trigger sync after 2.5 seconds. Visible browsers check every 10 seconds
and on focus, visibility return, reconnect and editor blur. Unchanged checks use
conditional requests. Incoming replacements wait until editing is safe. Requests
that arrive during an in-flight sync are queued for another pass. Workspace
revision races are refetched and re-merged with up to three bounded retries.

Overlapping edits preserve both copies and remain retryable; they do not latch
the client permanently into a paused state. There are no force-overwrite, manual
sync or conflict-recovery controls in Settings. A local recovery snapshot is saved
automatically before a merge and when edits cannot yet merge; repeated unchanged
checks do not rewrite it. Pending changes are never presented as Synced. Ordinary
workspace backup export/import remains separate from sync. Notes and attachment changes arriving during
an upload/download are checked before applying a downloaded/merged copy.

## Validation

`npm test` includes actual React-hook tests using the sync Worker routes and an
in-memory SQLite database: legacy Android baseline, third-client revision race,
real text conflict, retry after resolving it, identical first sync, conditional
polls, and typing during a poll. Merge tests cover independent bullet fields,
text/formatting safety, moves, calendar dates, UI state and old checkpoints.

## Next migration

The transport still transfers workspace snapshots. Per-operation durable outboxes,
server acknowledgements/deduplication, incremental delivery with live invalidation,
and rich-text CRDT storage are not part of this compatibility release. Introduce
those behind a protocol version with old-client write protection, data migration,
replay tests, and a staged rollout. Backend reconciliation and durable version history must
resolve concurrent updates without user intervention. See AGENTS.md for the
owner's persistent product requirement. The current local recovery snapshot is
not yet a backend version journal. Changing polling alone is not that migration.
