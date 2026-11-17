# Stable Notes visibility

Notes is a projection of the shared outline, not a separate collection of records.
Specialized bookmark, book, calendar, mindmap and standalone study branches retain
source identities and their dedicated views. Registering an ordinary note page as
a study deck must not hide that page: its notes and study children remain together
in Notes, while Study Desk also provides its study outline.

## Filtered editing commands

Previously, Notes displayed a filtered projection but Backspace, Tab and arrow
navigation used the full canonical outline. Adding a blank root after a hidden
bookmark and pressing Backspace selected that bookmark's last child. The active
edit exception then temporarily revealed the hidden branch. Tab could also nest a
new note under an invisible sibling. This was a display/command mismatch, not
evidence of a failed sync or missing records.

OutlineView now reports the complete filtered row sequence, before virtualization,
to its own pane. Keyboard navigation, merge, divider deletion and indent use that
sequence. Indent chooses the preceding displayed sibling; Backspace uses the
preceding displayed row and stops at the first displayed row. Pane, search,
completed-item and collapse filters therefore define the same editing boundaries
as the view. Context-menu indent uses the same command path. Calendar's embedded
outline reports its projection too. Existing mirror source resolution remains in
place.

These commands use normal mutation, Undo and persistence paths. Hidden branches
are retained; no data migration, sync protocol change, snapshot replacement or
outbox changes are involved. Android bookmark capture now states its destination:
Library → Bookmarks. Ordinary shared text is saved to Inbox in Notes.

## Validation

- Model tests retain hidden bookmark records and test first-row boundaries.
- App regression seeds an ordinary deck and a NotebookLM bookmark; checks initial
  visibility, blur, Backspace, Tab, arrow navigation, Undo, durable saving and the
  bookmark's dedicated outline.
- Chromium acceptance at 1280 × 850 and 390 × 844 checks Backspace, Undo, Tab,
  retained bookmark text and visibility after reload. These are browser checks;
  they do not claim real Android keyboard or affected-account acceptance.
- Full tests and staging acceptance are recorded in ENVIRONMENTS.md with the
  exact deployed source. Installed Android apps require the signed native update.
