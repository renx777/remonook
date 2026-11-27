# RemoNook design philosophy

**A quiet nook that moves at the speed of thought.** Calm by default, fast when you reach for it. Notes stay the centre; planning, study and reading are ways of looking at the same notes, not separate databases with their own chrome.

The mockups and the reasoning are on the design canvas "RemoNook planning UX review" (row 0, Design philosophy and Visual language).

## Six principles

| # | Principle | Rule | Learned from |
|---|-----------|------|--------------|
| 1 | **Content first, chrome on demand.** Show the words; controls appear on the row you hover or focus. No taglines or instructions in the interface. | A screen's first item sits above the fold on a phone. | Things 3, Bear, iA Writer |
| 2 | **One keystroke away.** Every frequent action has a key, shown beside it. Mouse and touch lose nothing. | Triage a capture without leaving the keyboard. | Linear, Superhuman, Raycast |
| 3 | **Speak human time.** "Today", "Tomorrow 18:00", "2 days late". Type dates the way you say them and see them parsed as you type. | No ISO dates in the interface. | Fantastical, Things 3, Todoist |
| 4 | **One day, one timeline.** Tasks, time blocks and reminders share a single day; loose tasks wait in a tray. | Calendar never shows two lists for one day. | Amie, Notion Calendar, Structured, Sunsama |
| 5 | **Say what a view is.** Collections and searches describe themselves in a sentence whose parts you can click. | Every filtered view states its scope. | Obsidian Bases, Notion, Readwise Reader |
| 6 | **Forgiving and alive.** Act first, undo after. Things move to where they went. | No confirmation dialog for a reversible action. | Superhuman, Things 3, Arc |

## Visual language (`src/design-tokens.css`)

- **Light theme:** warm paper `#FFFEFC`, nook `#F6F4F0` (sidebar), ink `#2B2926`, quiet ink `#6B6862` (5.4:1), hairlines `#EBE8E2`.
- **One accent:** Nook blue `#2B6A8A` for focus, selection and scheduled time (`--block-soft/-line/-ink` for time blocks).
- **Meaning-only colour:** amber `--deadline*` for overdue and deadlines, violet `--reminder*` for reminders, green `--done` only for completion. Each also differs in lightness, so they stay distinct without colour vision. Dark themes get their own values for these tokens.
- **Type:** page titles use Newsreader (bundled, works offline) through `--title-font`; everything else is Inter. Rows are 14–15 px, meta 12 px.
- **Shape:** 4 px grid; radii 8 (controls), 12 (panels), 20 (sheets); hairlines, with shadows only on floating things; 44 px touch targets.
- **Motion:** hover/focus 120 ms; popovers 180 ms; completing a task checks, fades and slides away in about 450 ms; the toast stays 6 s. `prefers-reduced-motion` uses fades only.

## Shared pieces

- `UndoToast` (`src/UndoToast.tsx`): one toast with Undo (button or <kbd>Z</kbd> outside text fields). Used by Inbox and Tasks.
- `natural-date.mjs`: `parseQuickTask` reads day, time, ranges, durations, deadlines (`due fri`), repeats (`every week`), priority (`!high`) and keeps `#tags` in the title; `relativeDay` and `deadlineLabel` print human dates.
- `.rn-chip` (`is-time`, `is-deadline`, `is-high`, `is-reminder`) and `.rn-parse` show parsed parts.

## Where it is applied (web)

- **Inbox:** the title and a key legend instead of the eyebrow and tagline. One row per capture, with File / Link / Make task / Schedule / Open on the focused row. <kbd>J</kbd>/<kbd>K</kbd> move; <kbd>F</kbd> <kbd>L</kbd> <kbd>T</kbd> <kbd>S</kbd> <kbd>O</kbd> act. Results go to the Undo toast. On a phone, tapping a capture shows its four actions.
- **Tasks:** the view name is the page title, with a count and planned time. Quick add parses as you type ("Call mom tomorrow 6pm #home"); in Today an undated task lands on today. Rows are compact with chips for time blocks, deadlines and High priority, and relative dates. Row actions appear on hover. Completion animates and shows Undo.
- **Plan:** opens with one "Type when" line ("today 9am for 90m high", "due fri", "every week"), quick picks (Today, Tomorrow, This weekend, Next week, Someday), the core fields, and "More" for status and effort.
- **Calendar:** Timeline is the default day layout. Untimed tasks wait in an "Anytime" tray with **Time it**, which books the next free slot. Task blocks are blue; reminders are violet with a bell (also in the agenda).
- **Collections:** a scope sentence ("12 results from the whole workspace where Author is not empty") whose parts open Configure or Filter.
- **Connections:** the summary says how many backlinks there are and offers unlinked mentions.

## Consistency pass (canvas row 5)

**Six text styles**, defined as `--fs-*` tokens in `src/design-tokens.css`:

| Style | Font and size |
|---|---|
| Display | Newsreader 600; 28 phone / 32 desktop; one per page |
| Title | Inter 600 15 |
| Body | 16 phone / 15 desktop |
| Meta | 13 |
| Label | 11 caps |
| Number | 22 tabular |

**Controls:** 36 px; tabs and segments 30 px.

**Page header** (`.rn-head`): title + count, then at most three icons (search, filter, add), then slim tabs (`.rn-tabs`).
- Filters and sort open a `Sheet` (`src/Sheet.tsx`): a bottom sheet on phones and a popover on desktop. An active filter shows as a removable chip.
- Secondary actions go in ⋯. On phones, the Outline toggle and Undo/Redo are in the ⋯ menu. No taglines and no help text.

**Applied:**
- **Tasks:** "Today ▾" view menu with Google Tasks; filter sheet; search icon.
- **Calendar:** short date and week strip on phones; compact Home/Office/Leave.
- **Study Desk:** stats strip; folder boxes showing the spines of their decks; one-line deck footer. Notebook covers are unchanged.
- **Dashboard:** date label, greeting, Edit and +.
- **Bookshelf:** format and sort in a sheet.
- **Bookmarks:** sort and tags in a sheet.
- **Canvas and Mindmaps:** plain titles.
- **Empty states:** one style everywhere.
