# Tasks

Tasks is a planning view of your existing note bullets, not another task database.
Open **Tasks** in the sidebar, **More → Tasks** on a phone, or **Open Tasks** in
the command palette. A task's source path stays visible; **Open note** returns to
its original context, children, attachments and formatting.

## Try it

1. Choose **New task**. Write in the ordinary editor in Inbox, then return to Tasks.
   You can also mark an existing bullet as a task, or choose Make task in Inbox.
2. Find it in **Inbox** or **Anytime**, then choose **Plan**.
3. Set **Scheduled for** to the day you intend to work on it. Set **Deadline**
   separately only if it must be finished by a particular day. Optionally set a
   priority and an estimate in minutes, or put it in Someday or Waiting.
   For a time block, also set Start time and Time block minutes; these reserve
   calendar time separately from the effort estimate.
4. Save. **Today** shows scheduled work carried forward and deadlines that are due.
   Tick the checkbox to complete the original task. Reopen it in **Completed**.
   Undo/redo use the same normal outline history, including the whole planning edit.
5. Filter by a top-level note branch (project), search text/source paths, or sort
   by date or priority. There is no separate Project entity to keep in sync.

## Views and dates

| View | Includes unfinished tasks unless noted |
| --- | --- |
| Inbox | Tasks anywhere under the canonical capture Inbox |
| Today | Active tasks scheduled today or earlier, and **all** tasks with a deadline today or earlier |
| Upcoming | Tasks not already in Today, with a future active schedule or a future deadline |
| Anytime | Active tasks without a scheduled date and without a deadline already due |
| Someday | Tasks explicitly set to Someday |
| Waiting | Tasks explicitly set to Waiting |
| Completed | Finished tasks, with the option to reopen |

Views overlap intentionally: an unscheduled task with a future deadline is both
Anytime and Upcoming; an overdue Waiting task remains in Waiting and Today. A
Someday/Waiting task's schedule does not pull it into Today, but a real deadline
always does. Completed tasks do not appear in unfinished views.

Scheduled dates are local calendar dates, without a time zone or notification.
They never replace an existing deadline or create an agenda reminder. Calendar's
day pane shows references to those same tasks, and the mini-month marks their
dates. Today includes carryover work; other days show exact schedule/deadline
matches. Completing a Calendar task completes the original bullet. Time blocks and opt-in open-app browser delivery are available in the calendar-planning
increment; see [CALENDAR-PLANNING.md](CALENDAR-PLANNING.md). Closed-app push remains
future work.

## Google Tasks

Choose the explicit **Google Tasks** source inside Tasks. It reuses the existing
Google connection, consent and list controls; its tasks stay in Google rather
than becoming note copies. Opening the normal RemoNook tab does not enable Google Tasks.
Google actions need a connection and network access. Choosing a list is
account/device-local. No API key or new paid service is required.

## Persistence and compatibility

Planning is optional canonical bullet metadata: `scheduledDate`, `taskPlanning`,
`taskPriority` (0–3) and `taskDurationMinutes` (0–1440). Missing fields mean
unscheduled, Active, no priority and no estimate. Existing documents are not
rewritten at startup. `dueDate` remains the existing deadline.

Forms save only changed planning fields against the latest document. Concurrent
text edits, completion and unchanged planning fields survive. Removing a task
while its plan is open disables saving and retains the form for inspection.
Canonical mirror sources are deduplicated; Traits rows are excluded. All changes
use normal saves, CRDT operations, undo and the durable outbox. A local save is
not a cloud acknowledgement. Failed persistence keeps normal actionable status.

Full ZIP backups retain these optional fields, including mixed legacy rows.
Legacy Android-format export explicitly refuses to omit planning; use a full
backup. Older current native builds preserve unknown fields but do not display
these controls; native rollout remains separate. The prepared MCP `update_note` update accepts
`scheduled_date`, `task_state`, `task_planning`, `task_priority` and
`task_duration_minutes` with version checking; old fieldless note hashes remain
unchanged. Cloud MCP planning controls and stronger server validation require the
separate sync-server deployment. The existing v3 server already preserves these
optional fields through its generic bullet-field transport. The web interface
can run before that deployment; the deployed two-device test verifies acceptance
and propagation.

## Verification and release scope

The automated tests cover legacy defaults, views and deadlines, mirror identity,
validation/recovery, full backup round trips, durable pending writes, account
isolation, concurrent offline schedule/text/completion edits and MCP stale
versions. App tests cover plan/undo/redo, completion and Calendar references.
`scripts/e2e-tasks.mjs` runs isolated guest desktop-light and phone-dark browser
checks for offline planning, filters, completion, undo/redo and reload. It never
uses a signed-in person's data. The staging workflow runs it after deployment.

This increment is **web staging only**. Before native rollout, check real Android
keyboard/date controls, phone navigation, full backup import and signed-in
cross-device task propagation. Emulation is not a physical-device test.
