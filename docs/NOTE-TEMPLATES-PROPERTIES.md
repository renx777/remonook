# Reusable note templates and typed properties

Open a bullet’s menu → **Properties**, **Use template**, or **Save as note template**.
The command palette also offers **New note from template**. A zoomed note shows
Properties and Use template beside its title.

Templates start with Meeting, Project, Book notes, Daily review and Learning note.
Save a text branch to create your own; edit an ordinary branch and choose an
existing template in Save as to publish a new version. Each insertion creates
independent IDs, appends after existing children and expands the destination.
Formatting, internal note links and typed defaults carry over; completed tasks
become unchecked and calendar dates/review history do not carry over. Insertions
use normal persistence and are one undo step. Variables include `{{date}}`,
`{{time}}` and arbitrary fields such as `{{title}}` or `{{author}}`.

This first version rejects branches with files, MCQs or image-occlusion cards,
with an explanation. It does not silently omit those contents. Template payloads
have immutable version IDs; archiving retains their full contents.

Properties support text, number, date, checkbox, single select, multi-select and
note links. Definitions belong to the workspace; values belong to the original
note (mirrors use its identity). Only modified fields are saved. Previous values
are available under Manage, including both sides of concurrent edits. Restoring
a previous value adds an edit rather than deleting history. Type changes and
option deletion are intentionally unavailable: they would invalidate existing
values. Archive/restore definitions instead. Unset, false and zero stay distinct.

Storage is under the existing `web` metadata: `noteTemplates` and
`noteProperties` (version 1), through normal save, backups and v3 synchronization.
Property cells and definition names use append-only revision maps with stable
edit IDs. Concurrent revisions converge deterministically without removing either
value. No new snapshot replacement, manual merge UI or outbox mechanism is used.
Limits: 64 active properties, 128 choices per select, 128 active saved templates,
300 bullets per template, 8,000 characters per text property.
