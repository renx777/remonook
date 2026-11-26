# Calendar planning (Phase 2B)

## Design

Time blocks belong to original task bullets. Set a Scheduled date, Start time and
Time block minutes in Tasks → Plan. The block is separate from the effort estimate
and deadline. Calendar orders tasks by start time. Overlaps are allowed, never
silently moved. Times are local wall-clock times on the displayed date; a block
can cross midnight, but is listed on its starting day. No hours-long grid or drag
interaction is required to plan on a phone.

Calendar reminders support weekly, monthly and yearly repetition. A series
stays one reminder; occurrences are computed from the original date, preserving
month-end and leap-day anchors. Completion now writes a date-keyed boolean map
alongside the legacy completed list. Different dates merge independently; two
devices completing the same occurrence produce one completed occurrence and one
next occurrence, with no generated note/text duplication. Undo/reopen uses the
same map and ordinary save/history. The old list is retained for compatibility;
new map entries take precedence. All data uses the existing CRDT and outbox.
Task bullets themselves do not automatically repeat: use a linked recurring
Calendar reminder for a repeating action. A generated successor-task system is
outside this increment and must not be claimed as complete.

## Browser delivery

In Calendar, choose Enable browser reminders in the top bar. Permission is asked
only on that click. This device/account-local option checks timed reminders and
active timed task blocks every 15 seconds while RemoNook is open and visible,
and checks again on focus. A missed time earlier today is delivered on return;
previous days are left visible in Calendar without flooding notifications.

Receipt keys include source ID and occurrence date. Device-local receipts reset
each day; Web Locks serialize tabs where supported, and notification tags replace
identical occurrences. Storage/permission/delivery failures stay honest. Local
receipts never acknowledge sync. Notifications are best effort: there is no push
server, closed-app guarantee, exact-second alarm or cross-device notification
suppression. Each opted-in device can notify independently. Browsers/native
webviews without Notification support keep ordinary Calendar reminders.

Wall-clock comparisons catch spring-forward skipped times on the next visible
check. Repeated fall-back minutes share one occurrence identity. Travel changes
the wall-clock delivery time; this version does not store a named time zone.

## Compatibility and rollout

New optional taskStartTime/taskBlockMinutes fields use the task metadata validation,
backup columns, mirror copying, MCP and repair paths. New fields have empty/zero
legacy defaults. Legacy Android-format export refuses to omit them. Full backups
retain recurrence completion maps. Deploy the new staging server before the
frontend, to enable the matching validation and MCP controls. Health must
report calendarPlanning: 1. No SQL migration or snapshot replacement is needed.
Production and native rollout require separate work.
