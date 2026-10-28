# Dashboard

Dashboard is a daily home view alongside Notes, Calendar, and Study Desk. It does
not replace the existing notes view. New workspaces see five useful defaults,
with no invented activity or completed habits:

- Clock: digital, analog, and split styles, time zones, 12/24-hour time, seconds.
- Focus timer: adjustable focus, short break, and long break durations.
- Today: real note tasks and existing calendar reminders.
- Habits: seven days of check-ins, streaks, editable names, and new habits.
- Quick capture: a device-local draft that becomes a normal root note on submit.

The widget library also offers Study snapshot: due flashcards and MCQs kept
separate, and an overview of real review activity. Multiple instances are allowed,
including clocks for different time zones. At most 16 widgets are visible.

## Interaction and layout

React Grid Layout 2.3 provides collision-aware dragging and resizing. Widgets are
interactive by default; **Edit layout** enables dedicated drag grips and corner
resize handles. Widget menus provide equivalent move earlier/later and size
controls without requiring dragging. Removing a widget offers Undo and retains
its data. Tidy layout repacks the current screen layout without removing data.
Phone, tablet, and desktop layouts are stored independently. The phone default
is a single column. Themes, reduced motion, keyboard navigation, and existing
save/error indicators apply to Dashboard too.

Timers persist a deadline rather than writing once per second. A paused timer
stores its remaining duration. Returning after the deadline records completion
once, using the timer cycle ID; breaks do not count as focus sessions. The next
phase starts only when the user chooses it. Completion uses an in-app message,
without requesting notification permission or playing audio unexpectedly.

## Data and sync

`web.dashboard` is a versioned object containing widgets, per-widget settings and
layouts, habits, date-keyed check-ins, and completed focus sessions. Stable IDs
and keyed objects use the existing v2 CRDT leaf-field sync and durable outbox.
Widget removal and habit archival use tombstones, so concurrent unrelated edits
do not resurrect removed items. Workspace mutations use the current document,
not a stale timer or drag-start snapshot. Dashboard never copies account data
between environments or introduces a separate backend.

Full backups preserve Dashboard data and validate imported values. Android ZIP
export explains that this web-only feature requires a full backup. Quick-capture
drafts are account-scoped and device-local; submitted notes use normal note sync.

Tests cover layout bounds, independent responsive layouts, widget settings and
removal, habit history, timer deadlines and idempotent completion, full backup,
concurrent CRDT edits, and end-to-end app interactions.

Initial release target: **staging only**. Production is published separately.
