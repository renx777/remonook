# Remo shared contract 1.0.0 — proposed baseline, W1

Historical contract/handoff: the web scheduler moved to FSRS-6 on 1 November 2026. See [FSRS.md](FSRS.md) for the current memory state, migration and Android compatibility behavior.

Android baseline: v0.17.0; Room schema 11. Web: v0.1.0. This specification is versioned separately from either app. It must be handed to the Android thread explicitly. The web implementation of this contract does not imply that the Android thread accepted it or made changes.

## Authority and separation

Web flashcards/media now have a documented additive [web behavior revision 1.1.0](CONTRACT-1.1.0-WEB.md). The baseline below remains the Android/W1 reference; see that revision for current web differences.

The supplied Android source was audited before web coding. Only the web project is modified. Behavior changes require a contract revision, documented compatibility impact and shared test vectors. Minor additive revisions retain older fields; incompatible behavior/data changes require a new major contract or archive version. Release-note descriptions are not behavior authority.

## Canonical records

The checked-in `src/android-schema.json` defines exact Android table/column order. `src/android-fields.json` defines field affinity and requiredness from the supplied Room schema. The following tables are all retained:

| Table          | Identity             | Required preservation                                                                                                         |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| bullets        | id                   | parentId, position, text, kind, collapsed, formatting, autoHighlight, listType, codeLanguage, taskState, dueDate, journalDate |
| decks          | rootId               | createdAt, pinned; rootId references a bullet                                                                                 |
| cards          | id                   | id equals question bullet ID; all scheduling/content/state fields                                                             |
| media          | id                   | bulletId, fileName, mimeType, sourceUrl, credit, licenseUrl and bytes                                                         |
| emojis         | token                | fileName, label and animation bytes                                                                                           |
| review_logs    | Android integer id   | cardId, grade, reviewedAtEpochMillis, responseTimeMillis, scheduledNextAtEpochMillis, mode                                    |
| study_sessions | id, normally current | scope, mode, tag, queueJson, cursor, reviewed, revealed, updatedAt                                                            |
| study_limits   | deckId               | newCards, reviewCards; -1 unlimited, 0 disabled                                                                               |
| trash          | id                   | title, deletedAt, nodeCount and complete serialized branch payload                                                            |
| goals          | id                   | Every field; currently legacy UI data                                                                                         |
| concepts       | id                   | Every field; currently legacy UI data                                                                                         |

New user-created bullet IDs are UUIDs. Imported IDs are never regenerated. Seed/demo fixture IDs are deterministic. Sibling ordering is integer position then lexicographic ID, matching Kotlin string ordering. Deleting a branch deactivates its cards rather than erasing scheduling and review history. Source content changes reactivate qualifying cards while retaining their previous schedule.

## Text and outline behavior

Canonical content is plain text plus span marks, not HTML or a Tiptap document. Formatting is `start:end:style` separated by semicolons. Offsets count UTF-16 code units in both Kotlin and JavaScript. Known marks: BOLD, ITALIC, UNDERLINE, CODE, HIGHLIGHT, COLOR_RRGGBB and HIGHLIGHT_RRGGBB. The editor adapter can coalesce equivalent adjacent spans; meaning and offsets are preserved. Unknown or invalid mark encodings remain stored and pause editing of that node. They are not filtered out of an import/export.

Tree validation rejects duplicate IDs, missing parents and cycles. Traversal is iterative. Indent appends beneath the previous sibling and expands it. Outdent places a node immediately after its parent at the grandparent level. A branch cannot move into itself or any descendant. Empty bullets persist unless explicitly merged/deleted by the user.

Enter at the end of a parent with children inserts the first child. Otherwise Enter splits at the selected text range, preserving spans on each side and keeping existing children on the original node. The new node is NOTE, with inherited list style and applicable task/date metadata. Shift+Enter and code-mode Enter insert literal newlines. Backspace at the start merges with the previous visible node, reparents children and transfers media references. Web Tab/Shift+Tab are explicit platform additions.

A deck root is a title. Odd relative depths with children identify questions; direct children provide answers. Nested questions are excluded from the enclosing question's answer. Explicit QUESTION/ANSWER node kinds also derive cards. A question must have nonblank text; an answer can qualify through text or media. Android skips blank direct answer nodes without media even if those nodes contain text descendants; W1 preserves this rule.

## Study behavior to implement in W3/W4

NORMAL follows expanded outline order, including collapsed branches, logs PRACTICE/NORMAL and does not modify a schedule. SPACED uses Android's four-button SM-2 adaptation. Difficulty/stability/retrievability remain retained legacy fields; this is not FSRS.

- Again: quality 2; repetitions 0; interval 0; next review now + 600,000 ms.
- Hard/Good/Easy quality values: 3/4/5. Successful repetitions increment.
- Base interval: first 1 day, second 6 days, later ceil(previous interval, at least 1, × previous ease).
- Hard: first 1 day; otherwise max(previous interval + 1, ceil(base × .8)). Easy: first 3 days; otherwise ceil(base × 1.3). Good uses base.
- Ease update: clamp(previous ease + .1 − (5−q) × (.08 + (5−q) × .02), 1.3, 3.5).
- Interval capped to 0..36,500 days; each scheduled day is exactly 86,400,000 ms.

Due queues order by due time, creation time and ID. Availability requires ACTIVE, not suspended, and burial expired. Normal practice ignores daily spaced budgets. Daily spaced budgets count distinct cards; same-day retries do not consume extra capacity. Nearest enclosing deck owns the card; default key is `__default__`. Today's new/review classification uses the first spaced log. Local midnight boundaries use an explicit timezone input; hide-until-tomorrow expires at the next local midnight, which can be a non-24-hour boundary. Stored scheduling instants are never converted on import.

Tags are case-normalized Unicode hashtags found in text. A node's aggregated tag set includes descendant tags, not ancestor tags. Saved sessions retain queue order and cursor. Restoration drops no-longer-valid queue entries and only retains answer reveal if the same first remaining card survives.

## Archive contracts and migration

Android archive: ZIP containing `remo.json` and flat `media/<fileName>` / `emoji/<fileName>` entries, with no directory entries. Manifest fields: format `remo-backup`, version 1, schema 11, createdAt, tables, preferences and assets. Tables use explicit columns and row arrays; SQLite booleans serialize as 0/1. Preferences groups are appearance, editor_tools and study_preferences. Asset records carry path, bytes and SHA-256.

Schema 10 imports append suspended=0 and buriedUntilEpochMillis=0 to cards, mode=SPACED to review_logs, and an empty study_limits table. Migration occurs on staged data before validation. Only schemas 10 and 11 are understood; newer schema/format versions are rejected without changing live data.

Web archive: format `remo-web-backup`, version 1, schema 11, the same table/asset representation plus web metadata. Unknown tables, columns, preference values, manifest fields and declared assets are retained. Unknown manifest fields are also indexed under web.archiveExtensions and emitted at their original top-level keys. Unknown fields within existing records remain attached to those records. Unknown table rows retain their sequence. Future unknown enum values that affect validated behavior are rejected without replacing data. No future format is guessed.

Android compatibility export requires exact known table/column layouts, compatible preference groups and no extended manifest fields. It excludes web-only device/revision metadata and unreferenced assets, which are operational/archive differences; it never emits extra columns that Android would reject. Full backup preserves retained extensions. Adding a new shared field requires updating Android's strict archive reader before declaring bidirectional support.

Restores are replacement operations, not merges. Stage and validate metadata/assets; reject unsafe paths, duplicate ZIP entries, unsupported encryption/compression, broken checksums and size overruns. Limits mirror Android: 64 MiB metadata, 64 MiB per attachment, 1 GiB attachments total. W1 additionally rejects ZIP64/multi-volume archives explicitly. Before replacement, snapshot current data and assets; commit records, settings and attachments in one IndexedDB transaction. Recovery reuses the same preview/confirmation flow. Stable identities and review history survive migrations.

## Future sync boundary

Current local persistence includes independent device identity, revision checks and an operation journal (append-only for ordinary edits; reset after restore or permanent purge) with globally unique operation IDs, changed records and deletion markers. Review logs retain their original integer IDs; future sync must add a separate globally unique review-event identity without overwriting those IDs. Full user backups do not currently export the operational journal. Restore/import must establish a new sync baseline when sync is implemented.

No network sync exists. A later transport can read/write through the repository boundary. Before enabling it on either platform, agree on workspace identity, causal ordering, text/move conflict handling, duplicate review-event handling and deterministic scheduling replay. A move conflict must never create a cycle; conflicting text must not be silently replaced. A future CRDT or explicit conflict resolver may require additional metadata and an Android migration. The current foundation supports adding that layer; it does not claim conflict resolution is already implemented.
