# Calendar planning (Phase 2B)

## Design

Time blocks belong to original task bullets. Set a Scheduled date, Start time and
Time block minutes in Tasks → Plan. The block is separate from the effort estimate
and deadline. Calendar orders tasks by start time. Overlaps are allowed, never
silently moved. Times are local wall-clock times on the displayed date; a block
can cross midnight, but is listed on its starting day. No hours-long grid or drag
interaction is required to plan on a phone.

Calendar reminders support daily, weekly, monthly and yearly repetition. A series
stays one reminder; occurrences are computed from the original date, preserving
month-end and leap-day anchors. Completion now writes a date-keyed boolean map
alongside the legacy completed list. Different dates merge independently; two
devices completing the same occurrence produce one completed occurrence and one
next occurrence, with no generated note/text duplication. Undo/reopen uses the
same map and ordinary save/history. The old list is retained for compatibility;
new map entries take precedence. All data uses the existing CRDT and outbox.
The recurring-task follow-up adds actual successor task notes with daily, weekly,
monthly and yearly cadences; see [RECURRING-TASKS.md](RECURRING-TASKS.md). This is
separate from Calendar reminder series. Daily Calendar mode uses additive metadata
alongside the existing enum, described below.

## Browser delivery

In Calendar, choose Enable browser reminders in the top bar. Permission is asked
only on that click. This device/account-local option checks timed reminders and
active timed task blocks every 15 seconds while RemoNook is open and visible,
and checks again on focus. A missed time earlier today is delivered on return;
previous days are left visible in Calendar without flooding notifications.

Receipt keys include source ID and occurrence date. Device-local receipts reset
each day; Web Locks serialize tabs where supported, and notification tags replace
identical occurrences. Storage/permission/delivery failures stay honest. Local
receipts never acknowledge sync. Open-app notifications are best effort, with no exact-second alarm or cross-device
notification suppression. Background Web Push is a separate per-browser opt-in
described below. Each opted-in device can notify independently. Browsers/native
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
report `calendarPlanning: 1`, `calendarDaily: 1` and `backgroundReminders: 1`. No SQL migration or snapshot replacement is needed.
Production and native rollout require separate work.

## Completion increment: daily reminders, timeline and Web Push

Daily Calendar reminders use `daily: true` alongside the existing `repeat: none`
value. `daily: false` explicitly turns it off. This additive representation avoids
making older native validators reject an unknown repeat enum. Older clients show
only the original date and need an update for daily controls; metadata must not
be stripped by legacy export. Daily occurrences and completion receipts remain
keyed by date, using calendar days rather than 24-hour elapsed durations.

The day view offers List / Timeline. Timed tasks and reminders appear on a 24-hour
axis with collision lanes. Task blocks can move/resize in 5-minute increments;
reminders can move their time without moving the series anchor. Equivalent form
controls and keyboard operations are available. A pointer release commits one
normal edit/undo step against the latest document, writing only time/block fields;
concurrent text stays intact, and deleted targets cannot be recreated. Short
blocks keep an accessible minimum hit area. Unscheduled/carryover tasks remain in
the list. No extra event copies are generated.

Background web reminders are explicit per-device opt-in for signed-in accounts.
Standard Web Push uses the existing per-account SQLite Durable Object and alarms,
not a paid provider or frequent global cron. A maintained Web Crypto Web Push
library handles RFC encryption/authentication. VAPID keys are generated once per
account into private server storage and never returned except the public key.
Subscriptions have a bounded count, validated push-service endpoints, expiring
leases and per-device delivery receipts. Push credentials never enter note sync,
backups, exports or logs. Payloads contain no note titles; notification clicks
open Calendar. Enabling on a different account first removes the browser's old
subscription, and sign-out revokes it before clearing authentication.

Schedule edits/completions invalidate the next alarm, while ordinary typing and
position normalization do not scan/rematerialize the workspace. Alarm delivery
uses the latest acknowledged notes; unsynced edits cannot change server reminders.
Each subscribed device stores its IANA zone, renewed on app focus when it changes. Calendar-local times are converted
with explicit spring-gap catch-up and first-occurrence fall-back semantics.
Only today's overdue times are caught up; old days are not flooded. Endpoint
410/404 removes subscriptions, transient failures retry with bounded backoff,
and notification tags replace duplicates after a crash. Browser/OS delivery can
be delayed or suppressed; this is not an exact alarm guarantee. iOS requires an
installed Home Screen web app. Native notification integration and physical-device
validation remain distinct rollout gates, not claims based on web emulation.

The earlier three-note discrepancy has no retained baseline IDs. Keep strict
preservation checkpoints and metadata-only missing-ID diagnostics; do not claim
it repaired or reconstruct/delete notes speculatively. Re-run account preservation
against staging before declaring this increment verified.


## Try the completed web flow

1. In **Calendar**, add a reminder and choose **Every day**. Completing today's
   occurrence leaves tomorrow available; other days and the original series stay
   intact. Month/year repeats still preserve their anchor.
2. In **Tasks → Plan**, choose a scheduled date, start time and block length.
   In Calendar's main **Day plan**, choose **Timeline**. Drag the grip to move a
   block, or the resize control to change its length. Up/Down change five minutes;
   Shift+Up/Down change fifteen. Click the title for precise time/duration fields.
   Undo/redo treats one complete drag as one edit. Overlapping blocks have separate
   lanes; the timeline scrolls horizontally when a narrow screen needs more room.
   List stays available, and daily notes remain below the plan.
3. Sign in, then open **Background reminder settings** (the bell in Calendar's
   top bar). Enable background reminders and accept the browser permission prompt.
   Create a timed reminder a few minutes ahead and wait until notes say Synced.
   Close the tab. The browser's push service can deliver a generic notification
   without an app tab. Opening it brings you to Calendar. An already open app is
   messaged instead of reloaded, so its pending edits can save first.
4. On iPhone/iPad browsers, install the Home Screen web app first. Browser/OS
   notification settings, battery-saving and networking can delay delivery. This
   is not an exact native alarm. A fully exited browser may depend on its OS push
   support; native Tauri webviews do not acquire native notification support here.
5. Disable the option to revoke this browser. Sign-out unsubscribes and clears the
   service-worker device guard. A device lease lasts 30 days and renews when an
   opted-in account opens the app. At most eight browsers per account are supported.

When background delivery is enabled and online, the open-app notification loop
stands down to avoid duplicate local/server alerts. Offline, the existing local
reminder loop remains available if separately enabled. Notification receipts
never mark an outbox as synced.

## Storage and cost

No paid notification API, new D1/R2 binding, deployment key or global minute cron
is required. The existing account Durable Object adds private `reminder_devices`
and chunked `reminder_receipts` tables plus one private VAPID key in its meta store.
An index selects timed task records and their ancestors; alarms do not decode the
whole workspace. Only scheduling/completion changes nudge the alarm. Receipt keys
are batched to bound SQL writes, and expired devices are removed automatically.
Cloudflare's account-wide free-tier request, CPU and storage allowances still
apply; this is not a promise of unlimited free traffic. Existing scheduled cleanup
and live AI/Google Tasks/storage configuration must be retained during deployment.

## Verification boundaries

Model and SQLite-backed server tests cover daily compatibility/backup, old-client
metadata retention, IANA DST gaps/overlaps, leases, device limits, isolated keys,
real encrypted request construction, retries and endpoint removal. Service-worker
unit tests simulate receipt with no open app tab, account revocation, Calendar
routing and messaging an open editor instead of reloading it. Browser acceptance
covers mouse drag and emulated touch drag, keyboard/form alternatives, one-step
undo/redo, daily reminder creation, reload and guest isolation in light/dark views.
These checks do not constitute an external FCM/Apple/Firefox delivery test on a
physical phone or a native release. Those remain explicit device rollout gates.

A push receipt means the provider accepted the encrypted request, not that a person
saw it. Push acceptance never completes a Calendar reminder or task.

The browser checks the active service worker protocol and waits for its durable
device-guard acknowledgement before claiming opt-in success. An older worker asks
for Save & update instead of registering a subscription it cannot handle.


The isolated browser acceptance script can also inject a synthetic Chrome push
with zero app tabs and inspect the resulting browser notification:

```sh
REMINDER_WORKER_URL=https://staging.remonook.com node scripts/e2e-reminder-worker.mjs
```

It creates no account/subscription and edits no server notes. This tests the
browser service-worker APIs against the built/deployed worker, not an external
provider or physical OS notification. A separate real-device test is still needed.
