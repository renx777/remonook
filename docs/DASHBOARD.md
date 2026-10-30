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

**Quotes** is available through **Add widget → Quotes**. The restrained reading
card uses serif text, a fine warm rule, and a small attribution. It draws randomly
from 18 bundled excerpts from public-domain works and bullets tagged `#quote`.
Library entries link to the source work; personal entries link to the original
note. The library works offline and makes no network requests to choose a quote.

Use **Another quote** to choose a different entry. The selection stays put during
clock ticks and unrelated dashboard updates; reopening Dashboard chooses anew.
**Customize → Quote source** selects the library, tagged notes, or both. The
preference uses normal workspace saving, sync, and backups. Existing layouts are
preserved: the new widget is opt-in through the library.

Tag a bullet anywhere in the outline, including a question or nested note:

```text
Stay curious. Keep learning. #quote
— Optional attribution
```

The attribution is an optional new line in the same bullet (Shift+Enter in the
editor). The tag stays in the source note but is hidden on the card. Matching is
case-insensitive and excludes partial tags, code, and internal link labels.
Mirrors do not duplicate their original. Removing the tag or deleting the note
removes it from the collection; the widget selects another available entry.
Long text remains readable with scrolling in constrained sizes. Phone cards fit
their content, with a bounded reading area for unusually long notes.

## Interaction and layout

Dashboard uses a quiet editorial layout: small typography, fine dividers, neutral surfaces, and compact controls. React Grid Layout 2.3 provides collision-aware dragging and resizing on desktop and tablet. Widgets are interactive by default; **Edit layout** enables dedicated drag grips and corner resize handles there. On phones, widgets form a content-sized stack; use the grip to reorder with touch or keyboard. The dnd-kit sortable stack supports edge auto-scroll, cancellation, focus restoration, and spoken position announcements. Habits and Study offer Compact or Expanded content presets. Radix Dropdown Menu anchors widget menus outside the transformed grid, keeps them in the viewport, and supplies keyboard navigation, typeahead and dismissal. Menus provide equivalent move earlier/later and size
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

## Usability review

See [DASHBOARD-REVIEW.md](DASHBOARD-REVIEW.md) for findings, library research, and verification. Phone Habits exposes all active habits, supports past check-ins through a seven-day picker in Expanded view, and offers archive/restore from the habit editor. Today counts all reminders before applying a three-item preview and can expand the full list. Clock and running timers update locally on second boundaries; the rest of Dashboard updates on minute boundaries. Hidden tabs suspend ticking and reconcile on return.

## Google Tasks

Choose **Add widget → Google Tasks**, then authorize access separately from your
RemoNook sign-in. The connected account label, list selector, task checkboxes,
completed section, and task-entry form are kept compact. Settings → Connections
manages account replacement and disconnect. Setup, credentials, security and
staging acceptance are documented in [GOOGLE-TASKS.md](GOOGLE-TASKS.md).
