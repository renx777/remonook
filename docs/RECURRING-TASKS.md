# Recurring task notes (Phase 2B follow-up)

## Design before implementation

Completing a repeating task keeps that completed note and creates one next TODO
note. Daily/weekly/monthly/yearly dates use calendar arithmetic with a preserved
anchor (31 January → 28 February → 31 March). There is one outstanding next date;
missed dates are not silently skipped. Deadlines are not repeated automatically.
Next notes link back to their original context rather than copying attachments,
study cards or child notes. The normal save, undo, backups and durable outbox apply.

Each explicitly configured pattern has an immutable UUID and template (title,
formatting, cadence and anchor). Changing its schedule/cadence or explicitly
refreshing the template starts a new version; old versions and receipts stay in
history. Two completions of the same task/pattern/date derive the same next IDs.
Concurrent edits that intentionally configure different pattern versions retain
both versions rather than silently discarding an offline intention.

Stable IDs alone are insufficient: independent Y.Text creation can duplicate the
initial title. Generated rows therefore carry an immutable, canonical creation
record. On first insertion only, the CRDT writer integrates that record with a
stable, reserved high-range actor identity, so replicas share the same initial
characters. The version-one factory and CRDT writer are frozen independently of
the evolving note factory: plain initial text plus the lossless legacy-format
register reproduce identical initial structs across versions. User edits continue under their ordinary session actors and merge
normally. Different rows have different creation identities; ordinary bullets
never use this path. Known/deleted identities are not reseeded, preserving the
existing Trash/undo restoration path. This is an incremental initialization
update, never a replacement of a workspace or an existing text document.

The template is frozen when Repeat is configured. Later edits to one occurrence
remain on that note. A user can explicitly use the current title/settings as the
future template. Placement changes are regular field updates over the immutable
creation record, so independent moves do not duplicate text. A completion receipt
is stored at `web.taskRepeatReceipts[sourceId][patternId]`, routed to the source
bullet’s bucket instead of accumulating an unbounded global history bucket. It
identifies its next note and date; retries never overwrite an existing successor
or recreate an intentionally removed one. Local undo before sync can undo the
whole local creation; reopening an older occurrence after other devices have
already advanced retains their next task and work.

New clients create successors offline. The serialized v3 server also reconciles
completions from older cloud clients, within the same commit and journal. Older
native clients can read the ordinary next TODO notes but need an update for Repeat
controls. Daily task recurrence uses new optional fields, avoiding a new calendar
reminder enum that old native validators reject. Daily Calendar reminder enums,
closed-app delivery and a visual drag timeline remain separate work.

## Release constraints

Full backups preserve templates, seeds and receipts. Legacy Android-format export
must refuse to omit them. MCP uses version-checked source edits and the same repeat
configuration helper (`task_repeat` and `refresh_repeat`). Private seed/template
metadata is excluded from AI text exports. Unchanged rows reuse bounded template
and row-validation caches so typing does not repeatedly parse creation records.
Server validation, recovery and health expose this capability
before the web controls are deployed. No production release or main merge is
included. Verify same/different actor delivery orders, lost responses/retries,
post-creation edits, mirrors, month/leap anchors, deleted successors, local undo,
backup recovery and account isolation before staging.

## Testing and deployment

`tests/recurring-tasks.test.mjs` covers anchored dates, completion, immutable
creation identity, two offline creators, subsequent edits, undo/redo, intentional
deletions, backups, account isolation, copies and mirrors. The app test exercises
Plan → Daily → Complete → Undo → Redo. The SQLite-backed v3 server test verifies
both delivery orders of an old-client completion and a newer offline creator,
idempotent replay and a later successor edit. The guest browser test exercises
desktop light and phone dark, offline completion and persistence after reload.

Deploy the sync server before the web controls; health must report
`taskRecurrence: 1` as well as `taskPlanning: 1` and `calendarPlanning: 1`.
The frontend staging workflow enforces that capability gate. Staging deployment
requires coordination under AGENTS.md. Smart Collections is a separate PR and is
not included in this follow-up. Physical-phone checks and native releases remain
unverified until performed explicitly.
