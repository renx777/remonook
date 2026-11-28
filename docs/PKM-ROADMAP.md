# PKM workflow roadmap

Approved direction: daily productivity first; small, gated releases. Media metadata
catalogues and API integrations are parked. Each phase goes through local checks,
web staging and owner feedback before the same commit reaches Android, Windows,
macOS and iPad staging. Linux remains paused. Production requires separate approval.

| Phase | Deliverable | Completion gate |
| --- | --- | --- |
| 0 | Dependable editing and repeatable performance checks | No lost characters, IME gaps or broken keyboard focus; offline convergence; real-phone confirmation |
| 1 | Process the existing capture Inbox | File/link/make task/schedule preserve IDs, sources, attachments and undo |
| 2A | Tasks: Inbox, Today, Upcoming, Anytime, Someday, Waiting, Completed | One underlying task bullet everywhere; deadline separate from scheduled date |
| 2B | Calendar time blocks, recurrence and reminder delivery | Offline/concurrent completion produces one successor; DST and delivery limitations tested |
| 3 | Workspace/branch Smart Collections and optional Trait recipes | Live original references, source paths and mirror deduplication; no replacement property model |
| 4 | Local library search, aliases and unlinked mentions | Incremental indexing stays off typing's critical path; source passage navigation and workspace isolation |
| 5 | Durable note history, then Markdown/OPML portability | Restore as a new edit; preserve both versions; attachments/links and import reports |
| 6 | Weekly review, goal-based study planning, then citations | Realistic workload estimates; preserve FSRS scheduling and source relationships |

Do not advance automatically through these gates. New shared fields require
additive validation, sync, backup and MCP compatibility work. Keep the durable
outbox, CRDT merging and automatic convergence. Never add device/cloud conflict
choices or snapshot replacement.

## Phase 0 implementation

The first increment fixes two reproduced failures:

- Mount/select/focus the bullet editor in a layout effect. Do not queue Tiptap's
  deferred focus: it leaves a frame where fast typing has no target and can later
  steal focus from another control.
- Preserve an Android IME's temporary paragraph split across a flattened React
  echo. The existing repair waits for composition to finish, then turns the split
  into an outline operation. Literal code/equation/diagram lines keep their path.

The sidebar already slides using a transform, with an immediate main-width change;
no width/grid animation needs to be introduced. Keep reduced-motion support.

### Repeatable verification

```sh
NODE_OPTIONS=--max-old-space-size=4096 npm run build
NODE_OPTIONS=--max-old-space-size=4096 npm test
npm run dev -- --port 5197
# In another terminal:
CHROMIUM_PATH=/usr/bin/chromium node scripts/e2e-outline-gaps.mjs
CHROMIUM_PATH=/usr/bin/chromium EDITING_REPORT=/tmp/editing-results.json node scripts/e2e-editing-reliability.mjs
```

The editing browser test uses isolated guest contexts, 1,000/10,000-bullet fixtures
and thirty rapid Enter/type sequences per viewport. It verifies durable exact
text/order, keyboard navigation, and reports ordinary-typing keydown-to-next-frame p95 against
50 ms desktop / 100 ms phone-emulation targets, with Enter latency reported
separately. Set EDITING_STRICT=1 to enforce the typing targets. This is a proxy, not physical
input-to-paint. Run it without concurrent builds/tests; do not call phone emulation
a real Android keyboard or hardware test. The fixture is served through Vite's
source imports, so this script is local-only and cannot target hosted staging.

Existing app tests cover active-editor remote adoption and caret preservation,
undo/redo, durable saves and sync-v3 offline convergence. The staging workflow
must retain those checks and include the editor focus/composition regression.

### Owner device gate

On Android with the normal keyboard, type rapidly after Enter, commit composing
words, use Shift+Enter, delete an empty first child and navigate using a hardware
keyboard if available. Check the caret stays visible above the keyboard and the
sidebar is responsive. On a second signed-in device, confirm both reach Synced
and the edits survive reload. Do not mark this gate complete based on automation.

### Local results — 26 November 2026

Linux x86_64 cloud VM, AMD EPYC 9V74 (3 logical CPUs, 10 GiB RAM), Node
24.19.0, headless Chromium 154.0.8037.57, Vite development build. Thirty
Enter/type sequences at 10 ms per character in each isolated guest workspace:

| Viewport | Background bullets | Typing p95 | Enter p95 |
| --- | ---: | ---: | ---: |
| Desktop 1440×1000 | 1,000 | 16.1 ms | 87.0 ms |
| Desktop 1440×1000 | 10,000 | 15.0 ms | 166.9 ms |
| Phone emulation 412×915 | 1,000 | 16.3 ms | 91.6 ms |
| Phone emulation 412×915 | 10,000 | 14.5 ms | 161.4 ms |

All 120 new bullets retained their exact text/order and survived reload; Up/Down
focus transfer passed. Ordinary typing meets the reference targets. Structural
Enter remains slower and is explicitly reported, not included in the ordinary
character metric. These development-mode results are not native-device claims.
The full Phase 0 gate remains open until the owner device checks pass.

## Phase 1 implementation

The dedicated Inbox processing view is implemented; see [INBOX.md](INBOX.md) for
behavior, preservation rules and the tutorial. Advancing to Phase 1 was explicitly
authorized by the owner on 26 November 2026. This does not claim the outstanding
physical-device checks from Phase 0 have been completed.

## Phase 2A implementation

The owner authorized the next phase on 26 November 2026. The Tasks workspace
implements the seven planning views over canonical task bullets, separate
scheduled dates/deadlines, optional priority/estimate, project/source filters,
Calendar references and an explicit Google Tasks source. See [TASKS.md](TASKS.md).
It includes the Phase 0/1 staging work without merging either branch into main.
Web staging is the first release; physical-device gates remain open. The Phase 2B
calendar-planning increment is described below.

## Phase 2B implementation

Calendar planning adds task time blocks (local start time and reserved minutes,
separate from estimates), safely merged recurrence occurrence completion and
explicit opt-in browser delivery while the app is visible. See
[CALENDAR-PLANNING.md](CALENDAR-PLANNING.md) for semantics and limits. Repetition
uses existing Calendar series. The [recurring-task follow-up](RECURRING-TASKS.md)
adds actual successor notes, including daily tasks, through optional metadata
compatible with older clients. The completion branch adds daily Calendar reminders
through an additive `daily` flag, a main-pane drag/resize timeline and explicit
background Web Push through the existing account Durable Object. See
[CALENDAR-PLANNING.md](CALENDAR-PLANNING.md) for usage and delivery limits. Web
staging acceptance passed in PR #116 with 742 CI tests and 19 deployed signed-in
sync checks. Desktop/phone-emulated pointer planning and a browser notification
with zero app tabs passed. Physical external-provider delivery and native rollout
remain separate verification gates; synthetic Chrome push is not a physical
FCM/APNs result. The earlier sync-count anomaly remains unexplained and must not
be described as fixed merely because subsequent preservation checks pass.


## Phase 3 implementation

Smart Collections extends existing #views with current-workspace and branch
sources, canonical mirror-deduplicated results, source paths and optional Trait
recipes. Existing filtering, grouping, saved views and table edits are reused.
See [SMART-COLLECTIONS.md](SMART-COLLECTIONS.md). Web staging runs the integrated
rollout in PR #117, preserving Phase 2B. The final full CI suite passed 755 tests;
19 deployed signed-in sync checks and desktop/phone-layout Smart Collections
acceptance passed. Physical/native checks remain separate. Phase 4 was implemented subsequently as described below.

## Phase 4 implementation

Local library discovery is an explicit Search menu action. Cached PDF pages,
EPUB passages and saved articles get an account/workspace-scoped derived index;
content hashes reuse extracted units. Search matching and EPUB parsing run in a
worker; PDF.js uses its existing parser worker with yielding page orchestration.
Opening Notes or typing bullets does not start extraction or download originals.
Unavailable, scanned/unreadable and budget-limited sources are reported separately.
Results open the existing reader at the page/passage or an unambiguous article quote.

Aliases use ordinary `Aliases: ML, Machine learning` Traits, retained by normal
sync and backups. They work in the inline `[[` picker and note chooser. The existing
Connections/backlinks panel offers explicit reviewed unlinked mentions, with
chunked scanning, Unicode boundaries and code/link/URL/Traits/mirror exclusions.
Linking revalidates the source and target through the normal saved outline path
and remains one undo step. There is no competing backlinks panel or shared schema
migration. See [LIBRARY-DISCOVERY.md](LIBRARY-DISCOVERY.md) for usage and limits.

Release checks and physical-device gates are recorded in ENVIRONMENTS.md.
Native deployment and the next roadmap phase remain separate owner decisions.

## Phase 5 implementation

The owner authorized completion of Phase 5 on 28 November 2026. History records
meaningful bullet changes and media versions in the existing account/workspace
save transaction, alongside notes and the durable outbox. It is device-local,
captures future local edits and remote adoptions, and keeps deleted-note versions.
History exports retain original blobs independently of current asset deletion.
Restoring creates a new ordinary note and attachment identities through normal
save/undo/sync, preserving the original and rejecting cross-workspace callbacks.

Markdown/OPML portability adds readable note packages with a lossless note/media
sidecar, fresh-ID import, internal-link remapping, safe XML/ZIP parsing, attachment
bytes, explicit preview and retained ordinary import reports. It never adopts a
workspace snapshot. History and scheduling/settings are clearly separate exports.
Missing files and unsupported data are reported. See
[HISTORY-PORTABILITY.md](HISTORY-PORTABILITY.md) for use, limits and retention.

The web-staging implementation is first; physical-device verification and native
rollout remain separate gates. Phase 6 has not started.
