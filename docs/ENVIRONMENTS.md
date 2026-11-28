# Development, staging and production

## Current state

### Remove and Trash for movies on web staging — 28 November 2026

Web staging runs branch `ccr-641b18bf-2fe80f`, commit `c4fa4c85fcad1295660d8f25615829097fbef261`, release `2026-11-14.1`. The branch includes `codex/emoji-artwork-packs`.

Changes:
- **Add movie sheet:** Remove, for mistaken adds and movies already in the list.
- **Grid, List and Table:** a Trash button on each item, with an Undo toast.

Web only.

Checks, all run locally:
- Unit tests: 826 passed.
- Browser scripts on desktop and phone: MovieSearch, collection toolbar (Trash and Undo), link collections, Smart Collections and collection scroll passed.

### TMDB/OMDb choice on web staging — 28 November 2026

Web staging runs branch `ccr-641b18bf-2fe80f`, commit `f5621e944eb18ae4008542d4871ad6d979bbe394`, release `2026-11-14.1`.

The branch includes `codex/emoji-artwork-packs` (`1069710`), which was on staging before this deploy, so its Twemoji/OpenMoji artwork stays live. An earlier deploy of `e7102cb` was cancelled before it went live, so it never replaced Codex's build.

Changes:
- "Use for movies" default in Settings → Connections → Movies.
- A TMDB | OMDb switch in the Add movie, Update and Match sheets.

Web only.

Checks, all run locally on the merged commit:
- Unit tests: 826 passed.
- MovieSearch browser script (both providers connected, OMDb default, per-sheet switch) passed on desktop and phone.

### Twemoji and OpenMoji on web staging — 28 November 2026

Owner-approved web staging runs `codex/emoji-artwork-packs` at
`0104c4eebc816c83d2e1ee5967b033861713f429`, release `2026-11-14.1`,
confirmed by staging-source.json. PR
[#124](https://github.com/renx777/remonook/pull/124) targets the preceding
`ccr-641b18bf-2fe80f` branch and retains its collection toolbar, MovieSearch,
infinite scroll and prior Phase 0–6 work.

- Full and inline emoji pickers offer 3,944 Twemoji and 3,963 OpenMoji static
  SVG choices alongside Noto/Fluent. The collection preference stays on this
  device for new insertions; existing artwork and Unicode text are preserved.
- Selected artwork is fetched from pinned paths, checked against Git blobs,
  validated and saved before insertion. Static previews do not load animations.
  Saved SVGs are reused offline. Attribution/license metadata travels inside
  each primary file through existing sync, backups, history and portable exports.
- [CI](https://github.com/renx777/remonook/actions/runs/46152654148) passed the
  build and all **825 tests**. Final local staging build/full suite also passed.
  Development and packaged desktop/light and phone/dark checks passed both
  pickers, preferences, insertion, reload, offline reuse, undo and Grid rendering.
  Live pinned source downloads and their CORS headers were verified separately.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/46153783169)
  completed successfully. Frontend Worker version:
  `05dca457-7751-40ba-b3c2-96b5d52aa440`. All **22 signed-in sync checks passed**,
  preserving this run's **4,240 of 4,240 baseline notes** through cleanup.
  This does not explain or resolve the historical baseline discrepancies.
- All hosted acceptance steps passed: collections, Inbox, Tasks, Calendar,
  Smart Collections, Grid/Calendar controls, History/portability, Library,
  weekly review/goals/citations and the new emoji checks on desktop and phone.
  Independent hosted emoji checks also passed; that local browser required a
  test-only HTTPS interception exception.
- Backend health remains healthy: syncProtocol 3, workdaysSchema 2,
  attachmentRecovery 1, aiAssist 1, aiEnabled true, bookmarkReader 1 and
  googleTasksConfigured true. No backend deployment or migration was needed.
- No production, main merge or native release. Older app builds need an update
  to render the new static styles; generic records/attachments remain compatible.
  Physical/native gates remain separate. See
  [EMOJI-COLLECTIONS.md](EMOJI-COLLECTIONS.md) and the PR screenshots.
  This release-record commit changes documentation only; deployed app source
  remains the exact tested commit above.


### Infinite scroll and smoother collections on web staging — 28 November 2026

Web staging runs branch `ccr-641b18bf-2fe80f`, commit `6d5d5c44ac074d21c8cc081ef33efe7756061918`, release `2026-11-14.1`.

Changes:
- Collections, Tasks and Inbox load more items as you scroll.
- Cards are memoized, so loading more draws only the new ones.
- Off-screen cards skip layout and paint (`content-visibility`).
- Images decode asynchronously.
- TMDB and IMDb posters load at the size the card needs (`srcset`).

Web only.

Checks, all run locally:
- Unit tests: 820 passed.
- Browser scripts: collection scroll (230 movies, about 17 ms per frame, no frames over 50 ms), collection toolbar, Tasks, Inbox and Smart Collections passed on desktop and phone.

### Search focus and Outline toolbar on web staging — 28 November 2026

Web staging runs branch `ccr-641b18bf-2fe80f`, commit `4695dabb749a0b46b69d05cac7b5e64672005c5b`, release `2026-11-14.1`.

Changes:
- Bordered search fields show a single focus ring.
- The Outline layout of a `#views` note uses the same toolbar as Grid, List and Table.
- Sources and History sit on one line in every layout.

Web only. Checks run locally: collection, views and Smart Collections tests (15 passed); views/tags, collection toolbar and MovieSearch browser scripts passed. This deploy was not re-checked on staging after it went live.

### Collections toolbar revamp on web staging — 28 November 2026

Web staging runs branch `ccr-641b18bf-2fe80f`, commit `1487495be7182cb56f7d3c1009ee6eaddf02f842`, release `2026-11-14.1`.

Changes (docs/TRAITS.md, docs/MOVIE-SEARCH.md):
- One-row collection toolbar: Find in list, Sort chip, Filter badge, icon Group/Properties/Configure, and the layout switch and movie actions moved into the bar.
- Sort by Date created and Last edited, with a direction switch.
- Movie keys can be kept on this device, synced to all devices (`web.providerKeys`, left out of backups), or kept until reload.

Web only: no Worker, migration, native or production change.

Checks:
- Unit tests: 820 passed locally.
- Run locally, desktop and phone: collection toolbar, MovieSearch (mocked TMDB), Smart Collections, link collections and views/tags browser scripts passed.
- On deployed staging: Smart Collections passed on desktop and phone, and the key-location choice renders with no page errors.

### MovieSearch v2 on web staging — 28 November 2026

Web staging runs branch `ccr-641b18bf-2fe80f`, commit `b6979181f0207eb0ad3c146f0fee61ed61476b09`, release `2026-11-14.1`. The branch includes everything on `codex/weekly-review-study-citations` (`e72ef79`), so nothing from the previous staging build is lost.

MovieSearch v2 (docs/MOVIE-SEARCH.md):
- Settings → Connections → Movies, with keys remembered per device and account.
- Add movie, Update from TMDB with a review step, and Match on TMDB.

Also fixed: `tests/review-planning.test.mjs` depended on the real clock and failed after 12:00 UTC on 28 November. Its card times are now pinned.

Web only: no Worker, migration, native or production change.

Checks:
- Unit tests: 818 passed locally.
- `scripts/e2e-movie-search.mjs` (mocked TMDB) passed locally on desktop and phone.
- On deployed staging, as a guest:
  - Movies connection row connected (mocked TMDB), with no page errors.
  - Tasks script passed on desktop and phone.

No real TMDB key was used.

### Phase 6: weekly review, study goals and citations — 28 November 2026

Web staging runs branch
`codex/weekly-review-study-citations` at
`cfd45d9cb5b0df207a77a5c8bfa631a5e7803635`, release `2026-11-14.1`,
confirmed by the public staging-source.json. PR
[#123](https://github.com/renx777/remonook/pull/123) targets the preceding
Phase 5 branch and retains the existing staging UI, MovieSearch and quota fixes.

- Tasks → Weekly review projects canonical captures/tasks, recent notes and
  actual spaced logs. Checklist/reflection drafts are device-local; explicit Save
  creates an ordinary linked review note. Completed tasks are labelled all-time.
- Study Desk → Study goals saves a snapshot of up to 500 new card source links,
  target date and time budget. Forecasts respect eligibility/daily limits and use
  observed response times or a 45-second fallback. They are lower bounds, not
  predictions of future FSRS repeats or readiness. Suggested new-card counts are
  advisory; Review uses the normal SPACED queue and resumes unfinished sessions.
- Sources on a zoomed note adds bibliographic Traits under References, outside
  answer trees. Saved reading anchors can prefill known facts; missing data stays
  blank. Exact quotes, stale/duplicate/formatted-field guards, safe links and
  CSL-JSON/BibTeX export are supported. No citation-style processor or lookup API.
- Final local staging build and full suite passed: **815 tests, zero failures**.
  [CI](https://github.com/renx777/remonook/actions/runs/46140849835) also passed all
  **815 tests**. Sync rejection reproduction: all batches accepted. A restricted
  sandbox run first hit existing subprocess/loopback permission failures; the
  permitted full run resolved those execution restrictions.
- Development, packaged and independent hosted guest checks passed on
  desktop/light and phone/dark: drafts/reload, task state, unchanged scheduling,
  goal creation, session resume, citation edits/export, undo/redo and overflow.
  Local hosted checking required a test-only HTTPS interception exception.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/46141129716)
  completed successfully. Frontend Worker version:
  `00348225-9ca1-4096-8ac1-7b47443d00c2`. All **22 signed-in sync checks passed**,
  preserving this run's **3,576 of 3,576 baseline notes** through cleanup.
  All hosted acceptance steps passed: collections, Inbox, Tasks, Calendar,
  Smart Collections, Grid/Calendar controls, History/portability, Library discovery
  and Phase 6 on both viewport/theme combinations. This does not explain or
  resolve the historical baseline discrepancies.
- Backend health remains healthy: syncProtocol 3, workdaysSchema 2,
  attachmentRecovery 1, aiAssist 1, aiEnabled true, bookmarkReader 1 and
  googleTasksConfigured true. No backend deployment or migration was needed.
- No main merge, production or native release. Physical-device gates remain
  separate. Saved data uses ordinary notes/Traits/links and normal undo, outbox,
  sync and backups; drafts remain device-local. See
  [REVIEW-GOALS-CITATIONS.md](REVIEW-GOALS-CITATIONS.md) for use and limits.
  Screenshots: docs/screenshots/review-{weekly,goals,sources}-{desktop,phone}.png.
  This release record changes documentation only; deployed application source
  remains the exact commit above.


### Phase 5: note history and portability — 28 November 2026

Owner-authorized web-staging source: branch
`codex/note-history-portability` at
`fd424cdd7df6ba8a72a4104eadb8271505af6bf1`, release `2026-11-14.1`.
The public staging-source.json confirms the branch/commit/release.
PR [#122](https://github.com/renx777/remonook/pull/122) targets the previous staging
branch, preserving MovieSearch, the UI consistency work and quota recovery.

- Meaningful local edits, deletions and remote adoptions retain before/after
  bullet revisions and media/emoji files in the same transaction as notes and
  their existing durable outbox. History is device-local and starts with observed
  saves; no automatic pruning or server-wide history claim.
- History restores a new ordinary note/media copy using canonical outline
  mutation, save, undo and sync. Current notes/files remain intact. Workspace
  history includes deleted bullets. Separate history ZIP export/import retains
  historical binaries independently of current attachment deletion.
- Backups adds reviewed Markdown/OPML portability: readable files plus note/media/
  emoji metadata, fresh imported identities, within-package link remapping,
  retained import reports and legacy formatting. Stale destinations, partial
  collisions, unsafe XML/ZIP, conflicting files/emoji libraries and oversized
  note+report operations refuse before insertion.
- [CI on the deployed commit](https://github.com/renx777/remonook/actions/runs/46111141315)
  passed the build and all **802 tests**. Sequential local build and full suite
  passed **801 tests** before the final legacy-formatting regression; all **10**
  focused tests then passed. Sync rejection reproduction: all batches accepted.
  An earlier parallel build/test attempt had three missing-dist artifact failures;
  the sequential run resolved that verification race.
- Local desktop/light and phone/dark browser acceptance passed revision preview,
  copy restore/undo, reviewed import/save/report, export, reload, creation metadata
  and overflow checks. Strict ordinary-typing proxies passed all four 1,000/
  10,000-bullet cases. The optimized 10,000-bullet phone-emulation proxy measured
  **13.8 ms typing p95 / 207.5 ms Enter p95**. Enter remains slower; these are
  browser proxies, not physical-device input measurements.
- [Staging frontend release](https://github.com/renx777/remonook/actions/runs/46111435602)
  completed successfully. Frontend Worker version: `a6008782-cadb-428c-97b5-705109a543d5`.
  All **22 signed-in sync checks passed**, retaining this run's **3,576** baseline
  notes through cleanup. This does not explain or resolve earlier count findings.
  All hosted guest acceptance passed: collections, Inbox, Tasks, Calendar planning,
  Smart Collections, Grid/Calendar controls, History/portability and Library
  discovery on desktop/light and phone/dark. Independent hosted Phase 5 checks
  also passed (the local browser required a test-only HTTPS interception exception).
  Backend health remains healthy: syncProtocol 3, workdaysSchema 2,
  attachmentRecovery 1, aiAssist 1, aiEnabled true, bookmarkReader 1 and
  googleTasksConfigured true. No backend was deployed.
  Screenshots: docs/screenshots/history-portability-desktop.png and
  docs/screenshots/history-portability-phone.png.
- Frontend only: no backend, migration, native, production or main release.
  Historical test-account count discrepancies remain unresolved. No claim is made
  to reconstruct unobserved past versions. Native/physical-device gates remain
  separate. Usage and limits: docs/HISTORY-PORTABILITY.md.


### MovieSearch on web staging — 28 November 2026

Owner requested web-staging publication of `codex/movie-search`, application
commit `2fdd7a3ccfd76270f344a3438cbb69189f5bb19e`, release `2026-11-14.1`.
PR [#121](https://github.com/renx777/remonook/pull/121) builds on the previous
Grid/Calendar staging branch and retains the current UI and quota fixes.

- `#MovieSearch` enables lookup on a zoomed note in outline or collection layout.
  Users supply their own TMDB v3 or OMDb key. Account/workspace-scoped keys stay
  in app-session memory and are never saved to notes, sync or backups.
- Individual lookup and exact title/year matching of up to 50 direct child
  movies prepare reviewed Poster URL changes. Ambiguous results remain unchanged.
  Apply uses normal note persistence and undo; stale titles/posters or deleted
  targets reject the batch without overwriting newer edits.
- [CI](https://github.com/renx777/remonook/actions/runs/46076937369) passed the
  build and **792 tests**. Local desktop/phone browser acceptance passed with
  mocked TMDB responses, including individual and child-poster apply, credential
  exclusion from notes and no horizontal overflow. No valid provider key was
  available for live-provider verification; licensing, allowances and CORS still
  apply. See docs/MOVIE-SEARCH.md.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/46077277825)
  published `2fdd7a3ccfd76270f344a3438cbb69189f5bb19e`; the public
  `staging-source.json` confirms the branch, commit and release. Hosted desktop
  and phone MovieSearch checks passed for individual and child-poster apply,
  credential exclusion from notes and no overflow, using mocked TMDB responses.
  This environment's browser needed its HTTPS interception certificate exception
  for that hosted test. Real-provider key access remains unverified.
  Backend health remains healthy with AI and Google Tasks enabled. The MovieSearch workflow subsequently completed successfully; its prior pending
  status is superseded by that result.
  No backend deployment, native release,
  production change or main merge. Earlier test-account preservation discrepancies
  are not claimed resolved by this feature.


### Collection emoji and collapsible calendar panel — 28 November 2026

Web staging runs `codex/grid-emoji-calendar` at
`744c4bc6a5f25a93ea487100c6488d1979ef7cc2`, release `2026-11-14.1`, confirmed
by `staging-source.json`. PR [#120](https://github.com/renx777/remonook/pull/120)
targets the preceding staging branch so its UI and quota recovery remain intact.

- Grid/poster, compact-list and table titles use the existing lazy emoji renderer
  instead of showing stored token strings. Default child collections retain their
  result count without the “this note’s children” source chip. Explicit workspace
  and branch sources remain visible and editable in Configure.
- The right Calendar panel has an accessible close control. The Agenda toggle
  reopens it; desktop collapse preference survives reload. Mobile hidden state
  now agrees with the toggle instead of being overridden by display:contents.
- Local full suite: **789 passed**, staging build passed with Node's 4 GB heap.
  Guest checks passed on development and packaged builds for desktop/light and
  phone/dark: emoji artwork in grid/list/table, clean count, collapse/reopen,
  keyboard, reload preference and overflow. Packaged Calendar planning acceptance
  also passed on both viewport/theme combinations.
- [CI](https://github.com/renx777/remonook/actions/runs/46057947594) passed.
  [Staging frontend](https://github.com/renx777/remonook/actions/runs/46057971256)
  completed successfully. Frontend Worker version:
  `aaf4971a-0a5b-44a6-8302-ae9bebc1fe25`. Deployed guest checks passed for
  collections, Inbox, Tasks, Calendar planning, Smart Collections, Grid emoji /
  Calendar collapse, and Library discovery on desktop/light and phone/dark.
  All **22 signed-in sync checks passed**, preserving this run's **3,575** baseline
  notes through cleanup. This is the observed baseline for this run, not proof
  of recovery of the earlier missing notes. CI also passed all **789 tests**.
- Frontend only. No backend, native, production or main change. This release does
  not resolve the historical test-account count discrepancy recorded below.


### Attachment quota recovery on web staging — 28 November 2026

Owner-approved staging release of `codex/attachment-quota-recovery`, application
commit `4cf0435d033f9a9d447d64fa6dd4c3fc046dc91c`, release `2026-11-14.1`.
The public `staging-source.json` confirms this source. It carries forward the
current staging UI (`ccr-641b18bf-2fe80f` through `35115cd`, UI at `b2a8e84`)
and the existing Phase 0–4 work. Production, main and native apps are unchanged.

- The separate [backend release](https://github.com/renx777/remonook/actions/runs/46047650902)
  deployed Worker `remo-sync-staging` from
  `95be971e9af1bc18be2c7521f71a7bc6a8aaea33`, version
  `dfc931b2-6269-4b24-b881-8d7f91a7344c`. Later commits change only client scope
  guards and the signed-in acceptance script; backend source is identical.
  Live variables, secrets, D1/R2/AI/service/DO bindings and cron schedules were
  retained and verified. No D1 migration or new binding is required.
- Health reports `ok: true`, `attachmentRecovery: 1`, `syncProtocol: 3`,
  `workdaysSchema: 2`, `aiAssist: 1`, `aiEnabled: true`, `bookmarkReader: 1`,
  `googleTasksConfigured: true` and all prior planning/reminder capabilities.
- Unreferenced attachment allocations are retired automatically, including
  legacy orphans. Trash, other-device references and upload leases remain
  protected. Physical R2 originals are retained for offline/undo recovery;
  restoring one reacquires quota. Physical garbage collection is a separate
  policy. Active 20 MiB attachment / 100 MiB combined limits remain enforced.
- Durable note and attachment-removal progress can pass a quota-blocked upload.
  Original pending batches and operation identities remain intact until their
  normal acknowledgement; progress alone never reports Synced. Account/workspace
  guards prevent a delayed request from crossing an account switch.
- Validation: local release build, Worker dry run and sync-rejection reproduction
  passed; dedicated quota tests **15 passed**, React sync runtime tests **16
  passed**. The backend release passed **788 tests**; application CI at `d2d3859`
  passed **789 tests**. [CI on `4513ec4`](https://github.com/renx777/remonook/actions/runs/46049602199)
  also passed **789 tests**. [CI on deployed `4cf0435`](https://github.com/renx777/remonook/actions/runs/46050624545)
  also passed **789 tests**. Final frontend acceptance results are recorded below.
- The [first frontend attempt](https://github.com/renx777/remonook/actions/runs/46048490422)
  published successfully but stopped at an outdated effort-estimate selector in
  the task-planning acceptance test. Prior sync checks and cleanup preserved all
  **4,765** baseline test-account notes. The script now opens the current task
  form's effort section and checks its current date/estimate controls.
- The [second frontend attempt](https://github.com/renx777/remonook/actions/runs/46049595839)
  passed 18 of 19 signed-in checks, including task planning and workspace isolation,
  but the final preservation assertion reported **3,576 of 4,765** baseline notes.
  The cause is unresolved. Diagnostic checkpoints now distinguish task planning,
  workspace isolation and cleanup; no claim is made that the missing baseline
  records have been recovered.
  Subsequent acceptance views were skipped by the workflow after that failure.
- The [final frontend release](https://github.com/renx777/remonook/actions/runs/46050616854)
  completed successfully, frontend Worker version
  `c592c946-1fd7-4e9f-a985-674c10e76cab`. All **22 signed-in checks passed**,
  including the added preservation checkpoints, against the subsequent **3,576**
  baseline notes; cleanup preserved all 3,576. This passing run does not explain
  or resolve the prior reduction from 4,765. PR
  [#119](https://github.com/renx777/remonook/pull/119) remains draft for that
  unresolved preservation finding. No merge or production rollout is authorized.
  Link collections, Inbox, Tasks, Calendar planning, Smart Collections and Library
  discovery acceptance also passed on desktop/light and phone/dark.
- The owner subsequently confirmed the affected account reached **Synced** after
  the quota fix. Both-device convergence was not independently observed here. The earlier unrelated three-note discrepancy is
  not claimed fixed by this release.


### Consistency pass on web staging — 27 November 2026

Web staging runs branch `ccr-641b18bf-2fe80f`, commit `b2a8e8450f96666fc7186b029431b00f653863a5`, release `2026-11-14.1`.

What changed (see docs/DESIGN.md):
- Six text styles across the app.
- Outline is an icon; Undo/Redo sit in the phone ⋯ menu.
- Tasks: a view menu and a filter sheet replace the dropdowns.
- Calendar: week strip on phones.
- Study Desk: folder boxes and a stats strip; notebook covers unchanged.
- Dashboard, Bookshelf, Bookmarks, Canvas and Mindmaps: the same header pattern.

Web only: no Worker, migration, native or production change.

Checks:
- Unit tests: 769 passed. The 2 failures (app DOM integration and the bookshelf UI) were tests still using the old controls; after updating them, both files pass.
- Staging build: clean.
- Deployed staging, guest acceptance scripts: Tasks, Inbox, Calendar planning and Smart Collections passed on desktop (light) and phone (dark).
- Run locally only: Library discovery and navigation passed. `e2e-view-outlines` fails at its "moved to Study Desk" toast step, and fails the same way without this change, so the failure predates it.

### Design philosophy on web staging — 27 November 2026

Web staging runs branch `ccr-641b18bf-2fe80f`, commit `3e013eeb7729d6175e4e4a7bdfd26bc9b98a6506`, release `2026-11-14.1`. The branch is Codex's `codex/library-discovery` (`2a880eb`) plus one commit. That commit applies docs/DESIGN.md:
- warm light theme and meaning-only colours;
- Newsreader page titles;
- natural-language quick add and Plan;
- relative dates;
- one-row Inbox with keys and an Undo toast;
- timeline-first Calendar with an Anytime tray and violet reminders;
- a Collection scope sentence.

Web only: no Worker, migration, native or production change. Local checks: 771 unit tests passed, and the staging build was clean. On deployed staging, the guest acceptance scripts for Tasks, Inbox, Calendar planning and Smart Collections passed on desktop (light) and phone (dark). Library discovery passed locally.


### Phase 4 library discovery: web staging — 27 November 2026

Web staging runs `codex/library-discovery` at
`d23c365299db81fcd4dff74ec5da971a96ad3499` (PR
[#118](https://github.com/renx777/remonook/pull/118)), release `2026-11-14.1`.
`staging-source.json` confirms the exact branch/commit/release. Frontend Worker
version: `a3d7c631-8f9b-43e9-83da-0392f4adeee4`.

- Search → **Search local library** indexes cached PDF pages, EPUB passages and
  saved articles on explicit opening. An account/workspace-scoped, content-hash
  cache reuses extracted text. Worker matching/EPUB parsing and PDF.js's parser
  worker keep extraction away from ordinary bullet typing. Missing originals,
  unreadable/scanned files and budgets are visible; originals are not downloaded
  automatically and no model or paid API is used.
- Results open the existing reader at the page/passage or an unambiguous article
  quote. Closing cancels work; deleted sources cannot project stale results.
  Local workspace deletion also deletes its derived index. The PDF worker URL
  uses Vite's asset transform, verified against real development/built/hosted PDFs.
- **Aliases** are ordinary `Aliases: ML, Machine learning` Traits, used by `[[`
  suggestions and the note chooser. **Unlinked mentions** live in the existing
  Connections/backlinks panel. Explicit reviewed linking rechecks passage and
  target, preserves formatting and uses one normal saved/undoable mutation.
  No shared-schema, protocol or server migration is required.
- The branch started from main `6d96cf0`, then carried forward the current Phase 3
  staging work without rewriting another branch. No other phase was advanced.
- Release build and **764 local tests** passed. [CI](https://github.com/renx777/remonook/actions/runs/45978821551)
  independently passed the build and all **764 tests** on the deployed commit.
  Desktop/light and phone/dark browser acceptance passed against development,
  built and hosted apps, including aliases, reviewed link/undo, PDF/EPUB/article
  navigation, cache reuse, workspace isolation and overflow checks.
- The strict typing proxy passed all four 1,000/10,000-bullet scenarios. At 10,000
  bullets, ordinary-typing p95 was **12.1 ms desktop / 12.8 ms phone emulation**;
  structural Enter remained **155.9 / 163.7 ms**, reported separately. All 120 new
  bullets survived reload. These are keyboard-to-frame proxies, not physical input.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/45978818261)
  passed every step, including **19 signed-in sync checks** retaining all **1,610**
  earlier test-account notes after additions, new-device sign-in and cleanup.
  Link collections, Inbox, Tasks, Calendar and Smart Collections acceptance also
  passed. These tests use dedicated/isolated data, not the owner's devices.
- No backend redeployment occurred. Sync Worker retains its preceding documented
  `f7d08c05-1447-4b1e-a3c7-ad908c3aa377` release. Live health still reports
  syncProtocol 3, workdaysSchema 2, taskPlanning/calendarPlanning/taskRecurrence/
  calendarDaily/backgroundReminders all 1, with AI enabled, books, article capture,
  Google Tasks and MCP available. No live bindings, secrets or settings changed.

Production, main and native apps are unchanged. Real-device/native gates remain
separate. The earlier unexplained three-note discrepancy is not claimed resolved
or restored by these preservation checks. Usage, limits and screenshots:
[LIBRARY-DISCOVERY.md](LIBRARY-DISCOVERY.md). A following documentation-only commit
changes no deployed application source.


### Phase 3 Smart Collections: web staging — 27 November 2026

Web staging runs `codex/smart-collections-rollout` at
`cc2156a8158499ff9d33d64a7d02a9abbee72067` (PR
[#117](https://github.com/renx777/remonook/pull/117)), release `2026-11-14.1`.
`staging-source.json` confirms the exact branch/commit/release. Frontend Worker
version: `73f8e603-0588-4783-b6a7-fc75338e2e4c`.

- Configure a `#views` collection to query Direct children, a selected note branch
  or Current workspace. Results are original canonical notes, mirror-deduplicated,
  with source paths and the existing Trait filters, sorting/grouping, saved views
  and grid/list/table layouts. No result notes are copied or relocated.
- Optional Book shelf, Movie shelf and Project recipes create ordinary Trait
  bullets only on new notes. Both New and the empty-state button respect the
  selected branch/recipe. Failed saves do not navigate to unsaved items.
- Legacy settings writers that omit scope/recipe fields retain the most recent
  explicit values for the same saved-view ID. Explicit clears remain effective,
  all revisions stay retained, and no startup rewrite is introduced. Deleted
  collections, missing branches and Traits sources fail closed; IDs are not
  truncated. Scope/saved-view/filter changes immediately reset paging to 24.
- This is the integrated rollout of PR #114's implementation, carried onto the
  current Phase 2B calendar/push work, plus review fixes. The branch started at
  main `6d96cf0`; no other branch was rewritten. Phase 4 has not started.
- TypeScript/build and **755 local tests** passed before the final paging fix;
  its focused regression passed, followed by final [CI](https://github.com/renx777/remonook/actions/runs/45974207296)
  passing the build and all **755 tests** on the deployed source. Desktop-light
  and phone-dark browser acceptance passed scoped queries, live filters, offline
  original edits/undo, recipes, placement and reload without page errors/overflow.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/45974199863)
  passed all steps, including **19 signed-in sync checks** that retained all
  **1,610** earlier test-account notes after adds, new-device sign-in and cleanup.
  Deployed Smart Collections, link collections, Inbox, Tasks and day-planning
  checks passed. The preceding frontend attempt was cancelled during its build,
  before publication, to include the paging fix.
- No backend redeployment, SQL/protocol migration, new binding or paid API/library
  is required. Sync Worker remains `f7d08c05-1447-4b1e-a3c7-ad908c3aa377`. Health
  retains syncProtocol 3, workdaysSchema 2, taskPlanning/calendarPlanning/
  taskRecurrence/calendarDaily/backgroundReminders all 1; AI enabled, books,
  article capture, Google Tasks and MCP remain available.

Production, main and native apps are unchanged. The earlier three-note discrepancy
remains unexplained; this run's preservation results do not establish its cause
or recovery. Physical/native gates remain separate. See
[SMART-COLLECTIONS.md](SMART-COLLECTIONS.md) for usage and examples. A following
release-record-only commit changes no deployed application source.


### Phase 2B completion: web staging — 27 November 2026

Web staging runs `codex/calendar-completion` at
`dfd9747a726ca7429d49bcf8dbd64255fdcf4153` (PR
[#116](https://github.com/renx777/remonook/pull/116)), release `2026-11-14.1`.
`staging-source.json` confirms the branch/commit/release. The branch starts from
main `6d96cf0` and includes the earlier editing, Inbox, Tasks, Calendar and recurring
task staging work; Smart Collections remains separate in PR #114.

- Daily Calendar reminders use additive metadata and the existing repeat enum;
  legacy forms cannot strip daily mode, and explicit false/deletion still apply.
- Calendar's main Day plan offers List / Timeline. Original task blocks and timed
  reminders support pointer/touch and keyboard moves, task resizing, precise
  forms and one-step undo/redo. Collision lanes, first-item scrolling, narrow
  layouts and completed-reminder states use the existing theme.
- Signed-in browsers can opt into private background Web Push using the existing
  account Durable Object and alarms. Push credentials stay outside note sync and
  backups. Payloads have no titles. Leases, bounded devices, encrypted requests,
  chunked receipts, provider retries/removal, IANA/DST, zone changes, permission
  errors, sign-out and active-worker/guard acknowledgement are covered. Provider
  I/O is outside the note-sync queue, and alarm failures cannot block note saves.
  No paid push API, new binding, deployment secret or global minute cron was added.
- [Final application CI](https://github.com/renx777/remonook/actions/runs/45970603951)
  passed **742 tests** and the build. Local build/Worker dry-run passed; the local
  full suite passed 740 before the final targeted frontend refinements, with
  focused and browser checks for those refinements followed by the final full CI.
- The separate [backend workflow](https://github.com/renx777/remonook/actions/runs/45969697115)
  passed build/full-suite, live configuration comparison, dry-run, deployment and
  preservation checks. Sync Worker version `f7d08c05-1447-4b1e-a3c7-ad908c3aa377`
  was deployed from `3eee9e6e0d9dc8e903f5e9b3a45ff96bc2db2c41`. The following
  frontend-only worker-readiness fix changes no backend code. Live variables,
  secret names, resource bindings and cron schedules were verified retained.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/45970593811)
  passed every step. Frontend Worker version
  `5cabfd42-5349-4187-9c61-f0aef94fbde3` published the source above. All **19**
  signed-in sync checks passed, retaining all **1,610** earlier test-account
  notes after each add, new-device sign-in and cleanup. Tasks, Inbox, collections
  and the new day-planning checks passed on deployed desktop-light/phone-dark
  browsers, including emulated touch drag, daily creation, undo/redo and reload.
- A separate isolated Chromium run against staging displayed a synthetic push
  notification with **zero app tabs open** and confirmed durable worker guard
  acknowledgement. `scripts/e2e-reminder-worker.mjs` reproduces it without an
  account, external subscription or server-note changes. This does not verify
  external FCM/APNs/Firefox service delivery or physical OS notification behavior.
- Health reports `syncProtocol: 3`, `workdaysSchema: 2`, `taskPlanning: 1`,
  `calendarPlanning: 1`, `taskRecurrence: 1`, `calendarDaily: 1`,
  `backgroundReminders: 1`, `aiEnabled: true`, `aiAssist: 1`, `aiImage: 1`,
  `bookmarkReader: 1`, books, Google Tasks and MCP enabled.

The earlier three-note discrepancy did not recur, but its original IDs/cause and
recovery are still unconfirmed. Do not describe it as fixed or restored; retain
strict preservation checks and review before main/production. Production, main
and native apps are unchanged. Physical external-provider delivery and native
notification integration remain device rollout gates. See
[CALENDAR-PLANNING.md](CALENDAR-PLANNING.md) for usage and limits. A subsequent
release-record/acceptance-script commit changes no deployed application source.


### Recurring task notes: web staging — 27 November 2026

Web staging runs `codex/recurring-tasks` at
`0f37bdbfef5d65cd65f904a1bec3fe30f8b40cc7` (PR
[#115](https://github.com/renx777/remonook/pull/115)), release `2026-11-14.1`.
The branch starts from main `6d96cf0` and carries forward editing, Inbox, Tasks
and Calendar planning. Smart Collections remains separate in PR #114.

- Tasks → Plan adds daily/weekly/monthly/yearly Repeat. Completion keeps the source
  note and generates one successor linked to its series context, with preserved
  month/leap anchors and a cleared deadline.
- Deterministic version-one creation updates prevent two offline creators from
  duplicating initial text. Per-source receipts prevent retries or intentional
  deletion from recreating tasks. Old-client completion is reconciled inside the
  v3 server's ordinary incremental commit. See [RECURRING-TASKS.md](RECURRING-TASKS.md)
  and [SYNC.md](SYNC.md). There is no SQL migration or snapshot replacement.
- TypeScript and application build passed; the full local suite passed **726 tests**.
  Desktop-light and phone-dark browser acceptance passed offline daily completion,
  undo/redo and reload. The targeted model/app/SQLite-backed server suite passed
  23 cases. [Application CI](https://github.com/renx777/remonook/actions/runs/45952403350)
  passed for the deployed source.
- The separately gated [backend release](https://github.com/renx777/remonook/actions/runs/45951183254)
  passed its build/full suite, configuration comparison, dry-run, deployment and
  post-deploy preservation checks. Worker version
  `988a12fe-337b-4800-a667-64a6dc083498` is live on `remo-sync-staging`, deployed
  from `29ebbeef0cfacd22c51fa0e20123503f32ad5934`. The later commit only changes
  the browser acceptance script; backend/application code is identical.
  Existing variables, bindings, secret names and cron schedules were retained.
- Health reports `syncProtocol: 3`, `workdaysSchema: 2`, `taskPlanning: 1`,
  `calendarPlanning: 1`, `taskRecurrence: 1`, `aiEnabled: true`, `aiAssist: 1`,
  `aiImage: 1`, `bookmarkReader: 1`, book storage/reader, Google Tasks and MCP enabled.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/45952398975)
  passed every step. Frontend Worker version
  `a59bdfde-29b2-4c33-b1c2-7e2e72edfbf0` published the source above. All **19**
  signed-in sync checks passed, including the additional checkpoints after each
  test note creation. The account retained all 1,610 earlier notes after new-device
  sign-in and fixture cleanup. Tasks/Inbox/collections acceptance passed on the
  deployed frontend; desktop-light and phone-dark Tasks checks include daily
  recurrence, offline completion, undo/redo and reload.
- **Unresolved observation:** the [first frontend attempt](https://github.com/renx777/remonook/actions/runs/45951677254)
  deployed successfully but failed two note-preservation assertions (1,613 → 1,610).
  Its other 14 signed-in checks passed. The failure did not recur after adding
  per-add checkpoints and ID/structure-only missing-row diagnostics; no assertion
  was disabled. The application and backend were unchanged between attempts.
  The original three IDs were not logged by the old test, so their cause and any
  recovery have not been established. Do not describe this as a fixed data-loss
  bug or infer that the earlier notes were restored. Review before main/production.
- `staging-source.json` confirms the deployed branch/commit/release. Use that
  source marker to identify staging; `release.json.applicationBase` is the static
  release baseline, not the deployed commit. This corrects the earlier prepared
  record's interpretation of `a0e324f` as a newer live release.

Production, main and native apps are unchanged. Physical devices and native
releases have not been verified. Closed-app push, daily Calendar reminder enums
and a visual drag timeline remain pending. A subsequent documentation-only commit
records this deployment without changing the tested application source.


### Calendar planning increment: web staging — 26 November 2026

Web staging runs `codex/calendar-planning` at
`57df99ddda269dee73b66ad76c6e6becf0d98b9d` (PR #111), release `2026-11-14.1`.
It carries the prior editing, Inbox and Tasks staging work forward without a main merge.

- Tasks → Plan adds local start time and reserved minutes, separate from effort
  estimates and deadlines. Calendar orders original task references by start time.
- Recurring Calendar completion uses date-keyed booleans alongside the legacy
  completed list. Concurrent completions retain both dates; completing the same
  occurrence produces one next occurrence from the single series, with no note
  generation or duplicate text. Weekly/monthly/yearly anchors are retained.
- Explicit browser notification opt-in lives in the Calendar top bar. Delivery is
  best effort while the app is open and visible, with device/account-local receipts,
  permission/storage errors and focus catch-up. Scans run on timer/focus checks,
  not on every note edit. See [CALENDAR-PLANNING.md](CALENDAR-PLANNING.md).
- Local build/full suite passed 714 tests; final targeted tests passed 7 cases.
  The final [application CI](https://github.com/renx777/remonook/actions/runs/45866071809)
  passed the full **716-test** suite, including permission denial/opt-out,
  concurrent recurrence completion, full-backup time blocks and New York DST.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/45866096460)
  passed all 16 signed-in sync checks plus deployed desktop-light/phone-dark
  Tasks, Inbox and collections checks. The Tasks browser test now also verifies
  start time and block duration after offline edits and reload. The earlier
  frontend attempt was cancelled before completing so the timer/focus performance
  correction could be included. The published source marker matches the SHA above.
- The separate [server deployment](https://github.com/renx777/remonook/actions/runs/45865287806)
  passed from `c95d04f4b0d97343537913a4671e7d4836d96a4c`, Worker version
  `573d43e9-5f67-4134-b2ce-f43a70ed0b83`. Live variables, secret names, resource
  bindings and cron schedules were verified retained. The later frontend-only
  correction does not change server code. No SQL migration was required.
- Health reports syncProtocol 3, workdaysSchema 2, taskPlanning 1,
  calendarPlanning 1, aiEnabled true, aiAssist 1 and bookmarkReader 1. Books,
  article capture, Google Tasks and MCP remain enabled.

Production and native apps are unchanged. Physical-device notification delivery
has not been verified. Closed-app push, automatic successor task-note creation,
new daily recurrence modes and a drag timeline are outside this increment.
A subsequent documentation-only commit records this deployment without changing
the application source marker. Phase 3 has not started.


### Tasks sync-server update: staging — 26 November 2026

The pending staging server update was deployed from `codex/tasks-workspace` at
`11db9c843c4755d71f6113f31ed3d2613cc42de1` using the successful rerun of
[CI](https://github.com/renx777/remonook/actions/runs/45846769125). Worker version
`0d20fb0f-6e27-4da9-9451-c7e1bad7f2f7` is live. The build/full suite and staging
configuration, package and deployment checks passed. Live bindings, variables,
secret names, schedules and existing capabilities were verified unchanged.
Health reports `syncProtocol: 3`, `workdaysSchema: 2`, `taskPlanning: 1`,
`aiEnabled: true`, `aiAssist: 1`, `bookmarkReader: 1`, book storage/reader,
Google Tasks and MCP enabled. The stricter task validation and cloud MCP planning
controls are now live on staging. The frontend remains at `1caf95d52e3b9d4be7c5931311767da66f122466`.
Production and native releases were not touched.

### Tasks workspace: web staging — 26 November 2026

Web staging runs `codex/tasks-workspace` at
`1caf95d52e3b9d4be7c5931311767da66f122466` (PR #110), release `2026-11-14.1`.
It includes the editing/Inbox work from PRs #108/#109 without merging to main.

- Open Tasks from the sidebar, command palette or **More → Tasks** on phones.
  Inbox, Today, Upcoming, Anytime, Someday, Waiting and Completed project the
  original task bullets. Plans add optional scheduled dates, priority and estimates;
  deadlines retain their meaning. Project/source filters, search and date/priority
  sort keep the source context accessible. Calendar shows/completes those same
  tasks, with no note copies or duplicate agenda reminders. Google Tasks is a
  separate explicit source using the existing connection. See [TASKS.md](TASKS.md).
- Optional fields retain legacy defaults without a startup rewrite. Planning forms
  write dirty fields against the latest document; normal saves, undo, full backups,
  mirror identity and the durable outbox remain authoritative. Legacy Android-format
  export refuses to omit planning metadata.
- TypeScript, the final production build and all **711 local tests** passed. The
  final targeted app/model/config suite passed all 11 tests. Desktop-light and
  phone-dark guest browsers passed offline planning, deadline/priority/estimate
  edits, filters, completion, undo/redo, optional Google source and reload.
- [Application CI](https://github.com/renx777/remonook/actions/runs/45847571129)
  and [Staging frontend](https://github.com/renx777/remonook/actions/runs/45847591418)
  passed for the deployed commit. All **16 deployed signed-in sync checks** passed,
  including offline planning remaining pending, propagation to another device,
  completion converging on the original, and exact cleanup preserving every earlier
  test-account note. Deployed collection, Inbox and Tasks desktop/phone acceptance
  checks passed. The public staging source marker matches the commit above.
- **Sync backend unchanged:** the first server attempt received 403 because the
  frontend token is restricted to its own Worker. The prepared separate deployment
  now uses `CLOUDFLARE_SYNC_STAGING_API_TOKEN`; its
  [server run](https://github.com/renx777/remonook/actions/runs/45846769125)
  stopped before any deployment because that secret was unavailable, including
  on retry. The owner subsequently added the secret and the rerun succeeded, as recorded above;
  no credentials belong in source, docs or chat.
- The existing v3 server accepts/transports the optional fields: this was verified
  by the deployed two-device check. Stronger server field validation/recovery and
  cloud MCP planning controls are now live following the separate
  sync-server deployment recorded above. The frontend workflow still deploys only the
  frontend. No migration or resource change was made.

Post-release backend health remained:
`ok: true`, `attachments: true`, `syncProtocol: 3`, `workdaysSchema: 2`,
`authProviders: [google.com, password]`, `bookStorage: 1`, `bookReader: 1`,
`aiAssist: 1`, `aiImage: 1`, `aiEnabled: true`, `bookmarkReader: 1`, `mcp: 1`,
`mcpOAuth: 1`, `bookmarkCapture: true`, `googleTasksConfigured: true`.
This health snapshot predates the subsequent server deployment recorded above.

Production and native apps are unchanged. Real Android keyboard/date controls and
owner-device task checks remain pending; automated browser clients are not a
physical-device claim. Phase 2B has not started. This release record may be a
later documentation-only commit than the application source marker above.


### Inbox processing: web staging — 26 November 2026

Web staging runs `codex/inbox-processing` at
`e3112a429d62bceec3614dbbcd2a7244ff43613d` (PR #109), release `2026-11-14.1`.
Phase 0 fixes from PR #108 are included; neither PR has been merged to main.

- Inbox is available in navigation, the command palette and its ordinary outline.
  New capture uses the normal editor. Dashboard quick capture now joins desktop,
  widget and Android note captures in the existing canonical Inbox.
- File moves the original branch; Link appends a reference; Make task marks the
  original bullet; Schedule creates/reschedules one linked Calendar reminder,
  leaving the note's deadline unchanged. Content, children, attachments and
  provenance stay with the original. Explicit Android bookmark captures stay in
  Bookmarks. Undo/redo and Trash use normal outline history and persistence.
- The final build and TypeScript check passed. The full local suite passed:
  **700 tests, zero failures**, including account isolation, pending outbox
  preservation, stale/failed-save UI behavior and concurrent offline file/text edits.
- [Application CI](https://github.com/renx777/remonook/actions/runs/45803482446)
  passed. [Staging frontend](https://github.com/renx777/remonook/actions/runs/45804078739)
  passed, including deployed sync, link collections and the new Inbox acceptance
  check. Desktop-light and phone-dark guest contexts passed offline processing,
  filing/link/task/reminder actions, undo/redo, Trash recovery, focus and reload.
- The published source marker matches the commit above. See [INBOX.md](INBOX.md)
  for the tutorial, scope and owner device checks.

Native apps, production and the sync backend were not released. There is no
schema migration. The staging workflow publishes the frontend separately from
the sync server. Real Android share/keyboard and native device checks remain
pending before native rollout; Phase 2 has not started.


### Editing reliability: web staging — 26 November 2026

Web staging runs `codex/editing-reliability` at
`dc8881e6e8aac6efa9f806acd3e04b8871d60274` (PR #108), release `2026-11-14.1`.
This is the first increment of Phase 0 in [PKM-ROADMAP.md](PKM-ROADMAP.md).

- The editor mounts, selects and focuses before paint, preventing a frame without
  an input target after switching bullets and removing delayed focus stealing.
- Android temporary paragraph splits survive flattened React echoes until the
  existing repair converts them to a new bullet.
- Staging checks no longer reference removed NookTraits tests; the new editor
  focus/composition regression is included.
- Local TypeScript/build and all **691 tests** passed. Four isolated 1k/10k-bullet
  browser fixtures retained 120 rapid-entered bullets exactly after reload.
  Ordinary typing p95 was 14.5–16.3 ms on the cloud VM; Enter transitions were
  87–167 ms, measured separately. These are not physical Android measurements.
- [CI](https://github.com/renx777/remonook/actions/runs/45784033336) passed.
  [Staging frontend](https://github.com/renx777/remonook/actions/runs/45784514140)
  passed, including deployed cross-device sync and link-collection checks.
- The published `staging-source.json` matches the commit above. Fresh guest
  sessions on the deployed build passed rapid typing, paragraph splitting and
  reload in desktop/light and phone-emulation/dark, without page errors. The
  local browser needed its test-only HTTPS error override for the environment's
  certificate trust; normal curl verification and GitHub deployment checks passed.

**Pending:** real Android IME/keyboard and second-device owner verification. The
Phase 0 device gate remains open; Phase 1 has not started. Native apps, backend
Workers and production were not released. The frontend workflow deploys separately
from the sync backend; this change requires no server deployment or migration.


### iPad fixes; native staging Android 0.1.48, Windows/macOS 0.1.36, iPad 0.1.4 — 26 November 2026

PR #106 merged as `b44273168446fde9181ddfda3f74f26245a101fc`. It contains three fixes:
- The app now sits below the status bar.
- iPad updates go through SideStore or AltStore, using a source feed.
- Pairing errors are clearer, and the iPad asks for Local Network permission when local sync is turned on.

Web staging and all native staging apps run that commit:
- **Android 0.1.48**
- **Windows/macOS 0.1.36**: no Linux build.
- **iPad 0.1.4**: 45,818,015 bytes. The SideStore/AltStore source `desktop/staging/ipad-source.json` lists `com.remonook.ipad.staging` 0.1.4. The icon is served (HTTP 200, 46,328 bytes).

Device checks by the owner are pending. No Worker, production or data change.

### Traits by name; native staging Android 0.1.47, Windows/macOS 0.1.35, iPad 0.1.3 — 25 November 2026

PR #104 merged as `f28f580cd4b81a1c23e25798146c0ad7fcfca40b`. Any bullet named exactly "Traits" now counts as a Traits bullet, even without the `#traits` marker. This fixes local vaults on Android and Windows: there, Traits bullets typed by hand or made by an older app showed no traits.

Web staging and all native staging apps run `main` at that commit:
- **Web staging:** `staging-source.json` reports `main` @ `f28f580`.
- **Android 0.1.47:** APK of 150,907,950 bytes.
- **Windows/macOS 0.1.35:** `latest.json` has `windows-x86_64`, `darwin-aarch64` and `darwin-x86_64`. Linux is paused.
- **iPad 0.1.3:** `.ipa` of 45,816,846 bytes, sideloaded.

All downloads return HTTP 200. Device checks by the owner are pending. No Worker, production or data change.

### Native staging apps: Android 0.1.46, Windows/macOS 0.1.34, iPad 0.1.2 (new) — 25 November 2026

All native apps were built from branch `feat/native-ipad`. That branch is `main` at `a13eb0c` plus the iPad workflow, iOS config and iPad detection; it has no other app changes. Web staging runs `main`.

- **Android 0.1.46:** [Android app #46](https://github.com/renx777/remonook/actions/runs/45695187136), commit `eaf08fa`. The [manifest](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/android.json) reports 0.1.46. The APK is 150,908,010 bytes, SHA-256 `9933cebfc0af2963c4f7eed779f42a349cf4391727ae0951f496578fa5e1fb62`, and includes the arm64, armv7 and x86_64 libraries.
- **Windows and macOS 0.1.34:**
  - Desktop app #34 published [latest.json](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/latest.json) with `windows-x86_64`, `darwin-aarch64` and `darwin-x86_64`. **No Linux entry:** Linux builds are paused, and installed Linux copies stay on 0.1.32 without an update offer.
  - Run #33 built 0.1.33 and uploaded the installers, but its publish step failed on a shell quoting bug, which is fixed in `b6d36e7`. So 0.1.33 was never offered.
- **iPad 0.1.2 (first iPad releases):** [iPad app #1](https://github.com/renx777/remonook/actions/runs/45695173492) published 0.1.1, and run #2 published 0.1.2. The [manifest](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/ipad.json) is live. The 0.1.1 `.ipa` was inspected: an arm64 app, `com.remonook.ipad.staging`, MinimumOSVersion 16.0, UIDeviceFamily [1, 2], camera/microphone/photos/local-network usage descriptions present. The `.ipa` is unsigned and is installed with Sideloadly; see docs/IPAD.md.

**Device checks are pending.** The owner reported that pairing the iPad and a Windows laptop by address fails with "did not answer" on both sides. The likely causes are the Windows firewall or a Public network profile, the iPadOS Local Network permission, a VPN, or Wi-Fi client isolation. Also pending on a real iPad: launch, Google sign-in (which uses a Safari callback), camera, dictation and widgets.

No Worker, production or web change.

### main merged and on web staging — 25 November 2026

PR #101 merged the web staging work into `main` as merge commit `8b10643b6701cdaf5706ed48810a2567e85e4634`, after CI run 45691258784 passed. Board and Calendar are hidden; their code stays on `feat/nooktraits-upgrade`.

Web staging now runs `main` at that commit (release `2026-11-14.1`). Checked on staging as a guest in dark mode at 1440 px:
- The view switch shows Outline, Grid, Compact list and Table.
- A `#views` collection with `#traits` items shows poster cards with stars.
- The table Summary min works.
- No page errors.

Production is unchanged. The production frontend, production Worker and D1 migrations (`cloud/ai.sql`, `cloud/ai-testing-quota.sql`) each need separate owner authorization.

### NookTraits removed; Board and Calendar layouts; table totals — 25 November 2026

Web staging runs branch `feat/nooktraits-upgrade`, commit `17cf8311d85c66d0f01758369af6edd89a336976`, release `2026-11-14.1`.

What changed:
- NookTraits (staging only, never on main) is removed. Its `web.nookTraits`/`web.noteProperties` data is kept and keeps syncing.
- `#views` gains Board and Calendar layouts.
- Tables gain a Summary row.

Web only: no Worker, migration or production change.

Checked on staging as a guest (dark, 1440 px):
- The bullet menu has no NookTraits entry, and it has Add traits.
- Board by Status: moving a card by menu and by drag works, emptied columns stay, and a new column can be added.
- Calendar by Watched shows the 4 items in November, the next month is empty, and tapping an item opens it.
- Totals: Average rating 4, Runtime sum 449, Unique status 1.

There were no page errors, and 688 tests pass. The count is lower because the NookTraits tests were removed with it.

Known and unrelated: at machine typing speed (10 ms per key), about 1 in 12–24 new bullets loses the first key after Enter. This also happens in plain bullets. At 80 ms per key nothing was lost. It has been suggested as a separate fix.

### Collections: new item, table editing, saved views, conditions, fill from links; emoji titles — 25 November 2026

Web staging runs branch `feat/nooktraits-upgrade`, commit `caf937ac0f582de46d358656c0aa15ac94a02be5`, release `2026-11-14.1`.

What changed:
- **New:** creates an item that already has the collection's trait names.
- **Table:** cells can be edited in place.
- **Saved views:** each collection can have several named views.
- **Filter:** up to 8 conditions, matched as all or any.
- **Fill traits from links:** reads each item's link and adds the traits it is missing.
- **Emoji:** animated emoji now render in the zoomed title, the breadcrumbs and flashcard deck titles.

Web only; no Worker, migration or production change.

Checked on staging as a guest, in dark mode at 1440 px:
- An emoji picked in a title renders in both the title and the breadcrumb.
- New → "Dune" opens with Director, My Rating and Year.
- A "Top rated" view (My Rating > 3) shows 2 of 4 and switches back to All.
- Editing a table cell set Year 2021.
- Filling from a Letterboxd link set the title to Chinatown and added Cover, Year 1974, Site and Link. Director is not filled: the preview has no "directed by" text.
- The IMDb link could not be read by the preview service (IMDb blocks it). The app says so: "Filled 1 of 2 · 1 could not be read".

No page errors. 720 tests pass.

### Traits: kept out of other views, image covers, stars, name suggestions, group — 25 November 2026

Web staging runs branch `feat/nooktraits-upgrade`, commit `929cf9e33735c36efb42719e8470dae0c295ea22`, release `2026-11-14.1`.
- Traits bullets are left out of mindmaps, canvas sources, search by meaning and the resurfacing widget.
- Outline search matches a note by its trait values.
- Pasted images in trait bullets can be covers.
- Rating traits show as tappable stars.
- Trait names are suggested while typing (Tab).
- Collections group by a trait.

Web only; no Worker, migration or production change.

Checked on staging as a guest (dark, 1440 px):
- 4 movies typed with suggestions.
- Searching "spielberg" returns the two movies.
- Stars show 3/5 → tap → 5/5, and an empty rating shows 0/5.
- Group by Director shows 3 groups, and they collapse.
- The grouped table shows stars.
- A pasted PNG becomes the card cover.

No page errors. On one of three runs the test's 4 ms typing lost a keystroke after Enter; the app was fine when retried. 715 tests pass.

### #views poster grid and Configure view, 25 November 2026

Web staging runs branch `feat/nooktraits-upgrade`, commit
`84d48275e459aaeafe7d6dbf482e547179d8f0bc`, release `2026-11-14.1`.
- **Poster grid:** an Obsidian-style poster grid for `#views` collections whose items have traits.
- **Toolbar:** a slim Sort / Filter / Properties / Configure / New bar.
- **Configure view:** card size, image property, image fit and aspect ratio.
- **Collections:** `#traits` on a `#views` bullet only removes the tag, and blank bullets are not items.

Web only; no Worker, migration or production change. Checked on staging in dark mode as a guest with an 8-movie collection. Configure, sort, filter, properties and reload all worked, with no page errors. 711 tests pass.

### Traits fix: #traits in a zoomed page title, 25 November 2026

Web staging runs branch `feat/nooktraits-upgrade`, commit
`a2052c36c557768283a43939caf6e00791541949`, release `2026-11-14.1`. Typing `#traits` in a zoomed page's
title did nothing, because the title hides tags. Leaving the title now adds the Traits bullet. Web
only; no Worker, migration or production change. Checked on staging as a guest:
- Enter after the tag, at typing speed, on desktop and on a Pixel 7 emulation.
- Clicking away, and the phone's Done button.
- A zoomed title.
- The Books `#views` sort, filter and cover flow.

All work, with no page errors. 710 tests pass.

### Traits as plain bullets, #views sort/filter/cover, 25 November 2026

Web staging runs branch `feat/nooktraits-upgrade`, commit
`b43394dc22140fdf799d6b64851d810da20d996c`, release `2026-11-14.1`, Staging frontend run
45579020894. This replaces the custom property rows from `f931b89` (run 45550811998, which passed).
Properties are now plain `Name: value` bullets under the Traits bullet. `#views` collections add
Sort, Filter, Cover and Traits shown controls, saved in `web.traitViews`. The change is web-only:
no Worker, migration or production change. Checked on staging as a guest by typing a Books
`#views` shelf with three books and their traits, then using the table columns, sorting by Year
in descending order, filtering by Author, choosing the Cover trait in the grid and reloading.
There were no page errors, and 710 tests pass.

### Traits blocks (`#traits`), 25 November 2026

Web staging runs branch `feat/nooktraits-upgrade`, commit
`f931b890738bbb4c600c0ddc2034fc60190432b1`, release `2026-11-14.1`, Staging frontend run
45550811998. Typing `#traits` on a bullet adds a collapsible "Traits" child whose `key:: value`
children render as Obsidian-style property rows (typed per property name). `#views` collections get
property columns and covers. Web-only change: no Worker, migration or production change. Checked
on staging with a guest flow at 1280 and 390 px: the tag becomes a block, text, list, number,
checkbox and date properties are added, the block collapses, and the data survives a reload; no
page errors. Tests: 711 passing.

### NookTraits: own note types, study starters and shelf tools, 24 November 2026

Web staging runs branch `feat/nooktraits-upgrade`, commit
`14c028fd63131e21ce20f3dd338a4f4296bb975d`, release `2026-11-14.1`, built on
`codex/nooktraits-shelves` (`0ca8f9e`). Adds user-defined note types, Topic and
Lecture starters, status tabs and New … for every type, group by, a table summary
row, CSV export and searchable note pickers. See TRAITS.md (NookTraits since removed). Frontend only;
the sync Worker is unchanged.

[Staging frontend #196](https://github.com/renx777/remonook/actions/runs/45449257154)
passed on the first attempt, including the 13 sync checks; the local suite passed
705 tests. A guest browser flow on deployed staging created a Recipes shelf and a
Recipe type, added items from status tabs, edited values (footer "Avg 22.5 ·
Sum 45"), grouped by Stage and exported CSV with no errors.

### NookTraits shelves and mobile study dock — web staging, 24 November 2026

Web staging runs `codex/nooktraits-shelves`, application commit
`ccf77f80b10ddfae25d65f4c5d2ff61bfc4e167d` in
[PR #100](https://github.com/renx777/remonook/pull/100), stacked on
`codex/nooktraits` without rewriting that branch. This replaces its initial
NookTraits preview for the owner-requested fixes. The live
[staging-source.json](https://staging.remonook.com/staging-source.json) confirms
the branch/SHA; the inherited release marker remains `2026-11-14.1`. Later
documentation commits do not change the deployed application.

Answer aloud has an aligned secondary row inside the study dock, separate from
the fixed reveal grid, hint and navigation. The voice panel scrolls within its
budget; card editing closes it before the dock becomes inert. NookTraits now
enables fields only; `#views` is a separate explicit layout opt-in. No existing
user tags are stripped.

Book/Movie shelves add original-child creation, movie status tabs, cover/poster
and attached-image cards, image fallbacks, search, typed all/any filters and
user-named views with independent layouts/columns/cover/sort. Scope/type remains
explicit and common to the shelf. Active views stay device-local per account;
archived views retain history and leave notes alone.
[Review, examples, screenshots and remaining Bases gaps](NOOKTRAITS-REVIEW.md).

Validation on the released application:
- Local TypeScript/build and **699 automated tests passed**, zero failures.
- [CI](https://github.com/renx777/remonook/actions/runs/45441065085) passed on
  the exact deployed application source.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/45441157277)
  passed the build, targeted regressions, Workdays/sync compatibility, backend
  health, deployment, end-to-end sync and live link-collection checks.
- Real Chromium Book/Movie flows passed cover/fallback rendering, typed filters,
  saved views/layout restoration, creation/undo and mobile light/dark fit.
- A fresh deployed-staging mobile guest flow, using ordinary UI without state
  seeding, passed both shelves, status/source isolation, search, Author saving,
  independent tag removal/restoration, hide/show and reload persistence. No
  runtime errors.
- The actual StudyDesk component in a synthetic-user app-shell fixture passed
  voice/reveal/hint/navigation geometry in normal and immersive study, including
  393×852 and 393×640 viewports. Microphone denial and ordinary reveal passed;
  no transcription/grading API calls were made. Physical-phone recording and
  transcription remain unverified by this environment.

The sync backend was not deployed. Its health still reports `syncProtocol:3`,
`workdaysSchema:2`, `aiAssist:1`, `aiEnabled:true`, `bookmarkReader:1`, and Google
Tasks configured. Normal v3 persistence and the durable outbox remain in use;
legacy single-filter configurations stay readable. Android staging remains
**0.1.45** (`87ce245c501a0d59639e83d8c9e9ecd3da0a595b`). No native binary update,
main merge or production deployment occurred.

### NookTraits — web staging, 24 November 2026

Web staging runs `codex/nooktraits`, application commit
`818b55057b71a7d9689e391fcf740382275afd63` in
[PR #99](https://github.com/renx777/remonook/pull/99), stacked on
`codex/pkm-templates-properties` to preserve the existing staging work. The owner
authorized replacing web staging for this task. The live
[staging-source.json](https://staging.remonook.com/staging-source.json) confirms
that branch/SHA; the inherited release marker remains `2026-11-14.1`. Later
documentation commits do not change the deployed application.

Adds explicit `#nooktraits` activation, optional note types and relevant inline
fields. The eye is on the heading line in zoomed/read/editing outlines and hides
traits without clearing metadata or collection configuration. Editable table,
cards and list views reference original notes, with Book views, columns, one
filter/sort and bulk edits in one undo step. Existing values and both sides of
concurrent edits remain retained. (NookTraits since removed; see [TRAITS.md](TRAITS.md)).

Validation:
- Local TypeScript/build and **686 app tests passed**, zero failures.
- [Application CI](https://github.com/renx777/remonook/actions/runs/45428025618)
  passed on the exact deployed application source.
- [Staging frontend](https://github.com/renx777/remonook/actions/runs/45428097916)
  passed build, targeted regressions (including NookTraits), Workdays/sync
  compatibility, backend health, deployment, end-to-end sync and live link collections.
- Chromium desktop/mobile/light/dark flows checked heading geometry, hide/show
  spacing, reload persistence, field edits, bulk undo, source/layout retention
  and viewport fit. A separate deployed-staging mobile guest flow passed through
  ordinary UI with no runtime errors. Physical-phone confirmation is still pending.

The unchanged sync backend health reports `syncProtocol:3`, `workdaysSchema:2`,
`aiAssist:1`, `aiEnabled:true`, `bookmarkReader:1`, and Google Tasks configured.
This release used the frontend workflow only; no sync-server deployment, native
binary update, main merge or production release occurred. Android staging remains
**0.1.45**, source `87ce245c501a0d59639e83d8c9e9ecd3da0a595b`.

### Templates, typed properties and adaptive Android widgets — 24 November 2026

Android staging **0.1.45** runs `codex/pkm-templates-properties`, application
commit `87ce245c501a0d59639e83d8c9e9ecd3da0a595b` in
[PR #98](https://github.com/renx777/remonook/pull/98), based on
`codex/android-widget-suite`. Subsequent documentation/screenshot commits do not
change the deployed application.

Adds reusable text-outline templates (five starters, saved branch versions,
variables, formatting/internal links and typed defaults) and seven property types.
Concurrent property edits retain both revisions. Inserts use ordinary note
persistence and one undo step. [Usage and browser renders](NOTE-TEMPLATES-PROPERTIES.md).

The existing six Android widgets now use actual launcher sizes and useful compact
layouts. Study reveal/paging/grading, Today Done, Focus controls, Rhythm range and
Resurface Next are native actions. Capture opens a small native input dialog;
Photo/voice review use their existing app interfaces. Snapshot 4 remains backwards
compatible; the original private review exchange, durable evidence, locking and
text budgets remain in place. [Native renders and limitations](widgets/adaptive-screenshots/README.md).

Validation for the released application:
- [CI #417](https://github.com/renx777/remonook/actions/runs/45319543199):
  TypeScript/build and **669 app tests passed**.
- [Widget verification #60](https://github.com/renx777/remonook/actions/runs/45319543425):
  **18 Rust tests**, **8 native renderer tests**, API 28/33 durable filesystem
  tests passed. Renderer checks include actual SizeF lists, legacy portrait
  dimensions, minimum-size timer typography, 200% text, lossless study paging,
  stale daily items, lock/privacy and all four palettes.
- Real local Chromium flows checked property save, template insertion, mobile
  layout, persisted dark theme and horizontal overflow with synthetic notes.
- [Android staging #45](https://github.com/renx777/remonook/actions/runs/45319536202)
  passed build/signing/resource retention/publication. The downloaded signed APK
  independently retained **325** required widget resources.

The public [manifest](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/android.json)
reports `0.1.45`; APK SHA-256 is
`c6792c67d3ac09ad0c68e659a8c2f665e22853b84c4d48d57f53095f9d1042d1`; [download the staging APK](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/RemoNook-staging_0.1.45_android.apk).
Builds #40–#44 were cancelled before publication during rendering checks; the
previous published Android version was `0.1.39`.

At that Android release, web staging was not replaced and still ran `feat/meaning-voice-photo`, commit
`ab72aa94af8bb973a7bcb68fac2df1c2ef9675fa`, release `2026-11-14.1`.
The owner subsequently authorized its replacement for NookTraits; see the newer
web staging record above.
No Worker, macOS/Windows/Linux binary, main merge or production release occurred.
The unchanged staging Worker health still reports syncProtocol 3,
workdaysSchema 2, aiAssist 1, aiEnabled true, bookmarkReader 1, and Google Tasks
configured. Physical-phone/launcher confirmation of this update remains pending.

### Android widget suite — Phase 2, 23 November 2026

Android staging **0.1.39** runs `codex/android-widget-suite`, app commit
`94bde89d7436a60c47396b4cfd654785f52d9809`. [PR #97](https://github.com/renx777/remonook/pull/97)
targets the phone-confirmed Phase 1 branch `codex/android-widget-palettes`.
Later documentation/screenshot commits do not change the deployed application.
Adds Today, Quick capture, Focus, Study rhythm and Resurface: six Android widget
types including the existing Study widget. No web, Worker, desktop or production
release was made.

[Android staging #39](https://github.com/renx777/remonook/actions/runs/45282664384)
passed build, signing, verification of all **323** required palette/drawable/layout/
provider resource names inside the signed APK, and publication. The public
[manifest](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/android.json)
reports `0.1.39`; the [APK](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/RemoNook-staging_0.1.39_android.apk)
was downloaded and independently passed the same resource check. Staging builds
#37/#38 were cancelled before publication during screenshot/accessibility fixes;
the previous published Android version was 0.1.36.

[CI #403](https://github.com/renx777/remonook/actions/runs/45282667873) and
[native verification #46](https://github.com/renx777/remonook/actions/runs/45282667880)
passed on the deployed app source. Local full suite: **656 passed**, zero failures;
TypeScript checks and the build passed. Rust: **17 passed**, zero failures.
Robolectric renders all five widgets in four palettes in light/dark and exercises
legacy layouts, scope/lock/private states, schema compatibility/bounds and 200%
font scale. Two real Android filesystem tests passed on **API 28 and API 33**
emulators, verifying rename/fsync publication, duplicate and colliding actions,
archive replay and widget removal preserving evidence. Native renderer screenshots
are [attached here](widgets/phase2-screenshots/README.md).

Today check-offs share the existing immutable inbox and normal app save/archive
path. Failed saves stay pending; edited/deleted sources keep a recovery note.
Schema 3 remains compatible with schemas 1/2. Review exchange, paging, budgets,
locking and the account durable outbox remain unchanged.

Focus controls open the app; the system Chronometer may show overtime until its
next refresh. Capture reuses Inbox/dictation/photo tools; text works offline,
voice/photo retain existing sign-in requirements. Resurface uses the opt-in
meaning index without a new AI request. Physical launcher/TalkBack/wallpaper,
voice/photo handoff and interaction with the new widgets on the owner’s phone
remain unverified. The owner confirmed that the preceding startup-fix build
0.1.36 opened successfully on their phone.


### Android widget startup recovery, 23 November 2026

Android staging **0.1.36** supersedes 0.1.35 on `codex/android-widget-palettes`.
The signed app source is `e7e50cac0474fa7b95c80471e8239cd995876613`;
`5233a2c2dfa272fe1ecb2aa6038983137290d4b8` only corrects the native regression
assertion. [PR #96](https://github.com/renx777/remonook/pull/96) still targets
`docs/widgets-spec`.

Root cause: the 0.1.35 release optimiser stripped 294 widget resources referenced
only through computed names. An unfinished widget configuration can leave an
allocated launcher ID; refreshing it at app resume then crashed the app. Debug
native screenshots had not exercised release resource stripping. The palette
generator now emits resource-shrinker keep rules. The Android workflow validates
all 312 expected names in the signed APK before publication. The validator fails
on the actual old 0.1.35 APK. Rendering failures are isolated per instance with a
minimal private recovery message; cached data and durable review evidence are
not deleted or reset.

[CI #396](https://github.com/renx777/remonook/actions/runs/45272095106) and
[native/Rust verification #39](https://github.com/renx777/remonook/actions/runs/45272095258)
passed. Local `npm test`: 646 passed, zero failures. Rust: 16 passed. Native tests
cover refresh of allocated/unconfigured widgets, a broken per-widget preference,
continued refresh of other instances and preservation of review files, as well
as the existing screenshots. APK-validator fixtures cover complete UTF-8/UTF-16
resource tables, stripped runtime colours and malformed resource tables.

[Android staging #36](https://github.com/renx777/remonook/actions/runs/45271611538)
passed signing, APK resource validation and publication. The public manifest and
APK were checked after publication. The owner subsequently confirmed 0.1.36 opened successfully on their phone;
full physical widget-interaction checks remain separate. Install the update over the
existing staging app using the same signing key; uninstalling is not needed.
Web hosting, Workers, desktop releases and production were not changed.


### Android Study widget Phase 1, 23 November 2026

Android staging runs **0.1.35**, branch `codex/android-widget-palettes`, application
commit `252d9bf5b13d5b8a10f4931b306645904a5a5986`, branched from
`docs/widgets-spec` (`a241632`). [PR #96](https://github.com/renx777/remonook/pull/96)
targets that specification branch. Later documentation/screenshot commits do not
change the deployed application. This release changes Android and the shared
widget-settings/snapshot code; web hosting, backend Workers and desktop releases
were not deployed by this task.

[Android #35](https://github.com/renx777/remonook/actions/runs/45162316815), dispatched
with `environment=staging`, passed signing, pagination tests, APK build and publish.
The public [update manifest](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/android.json)
was checked after publication: `version: 0.1.35`; the signed
[APK](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/RemoNook-staging_0.1.35_android.apk)
returned HTTP 200 (150,560,122 bytes).

[CI #393](https://github.com/renx777/remonook/actions/runs/45162326271) and
[Phase 1 verification #36](https://github.com/renx777/remonook/actions/runs/45162326204)
passed on the deployed source. Local `npm test`: 645 passed, zero failures;
`npm run check` passed. `cargo test` in `src-tauri`: 16 passed, zero failures.
Native Android rendering passed on API 33, with legacy palette-resource tests on
API 28; includes privacy on RemoteViews reuse, malformed-cache messages, sizing
and 200% font scale. Original palette tests and generated-file freshness passed.

[Sixteen screenshots](widgets/screenshots/README.md) cover Marigold Ink light and
Electric Iris dark for glance, prompt, full revealed, caught up, locked, too small,
configure and 200% text. These are native Robolectric renders using synthetic data.
Real launcher sizing, TalkBack, wallpaper colours and physical microphone/voice
handoff remain unverified on a device. The original durable review exchange,
locking, lossless text pager and budgets remain in place. Review intents stay
schema 1; snapshots accept schema 1 and 2.


### Meaning search, voice review, photo to notes and automatic occlusion, 22 November 2026

Web staging runs branch `feat/meaning-voice-photo`, commit
`ab72aa94af8bb973a7bcb68fac2df1c2ef9675fa`, release `2026-11-14.1`, on top of
`feat/dictation`. Adds opt-in meaning search (search results by meaning, Related
notes, duplicate flashcards), voice review in study sessions, photo to notes or
flashcards, and Detect labels in the occlusion editor. See AI-ASSIST.md.

The staging sync Worker was redeployed with owner approval: version
`abc482d4-5032-4ef4-9f9f-0c407f3fba39` (previous `d4593064-cc6a-4385-9ddb-e7e3cb249da6`),
adding `/ai/embed`, `/ai/grade` and `/ai/photo`; bindings matched the dry run, no
schema change, `/health` unchanged, and all three routes return 401 signed out.

[Staging frontend #193](https://github.com/renx777/remonook/actions/runs/45074198620)
passed all 13 sync checks on the first attempt; the local suite passed 640 tests.
Before release each feature ran end to end in Chromium against the real server
code and Workers AI models: meaning search found the lipase note for "enzymes that
digest lipids" and paired duplicate Mizoram questions (0.97) but not Nagaland;
voice review graded a spoken paraphrase Correct and a two-of-three answer Partly
right; a textbook-page photo became an accurate outline or 8 flashcards in about
7 s; Detect labels found all four labels of a test diagram on the device. On
staging as a guest, `/photo` is listed and the sign-in prompts appear without errors.

Not verified: signed-in use on staging, a real phone microphone and camera, and
Detect labels clicked inside the occlusion editor (the detection itself was
tested). Desktop and Android need microphone and camera permissions and a rebuild.

### Dictation, 22 November 2026

Web staging runs branch `feat/dictation`, commit
`36c9f987ce0c041be308a7118d442b9f7bbeaf8e`, release `2026-11-14.1`, on top of
`feat/ai-bulk-bar-slash` and `codex/ai-images-bulk`. `/dictate`, Dictate in the
bullet menu and a phone-toolbar microphone record speech; `POST /ai/transcribe`
runs Whisper large-v3-turbo and stores nothing. 10 dictation minutes per account
per UTC day inside the shared 8,000-neuron limit; no schema change.

The staging sync Worker was redeployed with owner approval: version
`d4593064-cc6a-4385-9ddb-e7e3cb249da6` (previous `30c3f801-ab2a-4f09-803e-57b355576278`,
Codex's image release, whose routes this branch keeps). Bindings matched the dry
run, `/health` is unchanged (`aiImage` still reported), and signed-out
`/ai/transcribe` and `/ai/status` return 401. The live database has only the
shared `ai_shared_limits` trigger, so dictation rows do not count against text.

[Staging frontend #192](https://github.com/renx777/remonook/actions/runs/45067247970)
passed all 13 sync checks on the first attempt; the local suite passed 626 tests.
Before release, Chromium's real MediaRecorder (fake microphone playing a spoken
sentence) produced WebM/Opus that live Whisper transcribed exactly, including a
four-chunk run inserted in order; MP4/AAC and Ogg were also accepted. On staging,
`/dictate` is listed and asks guests to sign in.

Not verified: signed-in dictation on staging and on a real phone microphone.
Desktop and Android need microphone permission entries and a rebuild.

### AI actions in the bulk bar and slash menu, 22 November 2026

Web staging runs branch `feat/ai-bulk-bar-slash`, commit
`22e4be655462004b43f4ea2216a83d989b3a037b`, release `2026-11-14.1`, built on
`codex/ai-images-bulk` (`df8caa9`). The bulk bar has an AI menu (Answer each,
Summarize, Outline, Flashcards, MCQs, Mindmap, and Generate image for one
bullet); the slash menu adds AI answer children, AI image, AI summary, AI
flashcards and AI MCQs. Frontend only; the sync Worker is unchanged.

[Staging frontend #191](https://github.com/renx777/remonook/actions/runs/45061437029)
passed all 13 sync checks on attempt 3. Attempt 1 failed "an offline edit syncs
after reconnecting" (not received in 30 s); attempt 2 failed "concurrent edits
to one bullet keep both and converge": both devices converged but the merged
text lost a space and a bracket (`n3[A]B]`). Neither area changed in this
commit, every attempt kept all 1,654 notes, and the preceding Codex run passed,
but the character loss needs its own investigation. Local suite: 621 tests passed.


### AI image generation and bulk answers on web staging, 22 November 2026

Web staging runs `codex/ai-images-bulk` at
`a8aba461d71588a89574e5a36cb995fef3174d8f`, release `2026-11-14.1`,
with frontend Worker version `832d0586-1ac4-4329-a984-188319c61d65`.
[Staging frontend #190](https://github.com/renx777/remonook/actions/runs/45022250636)
passed the build, regression, sync and link-collection checks. The local suite
passed 621 tests. Browser checks on live staging confirmed the image dialog at
desktop and mobile widths and the selected-question dialog on desktop.
Provider responses were covered by mocked tests.

The staging sync Worker runs version `30c3f801-ab2a-4f09-803e-57b355576278`
from `98d8ea7cbbc1ce04c59b0cb449b7bef94be09622`. The later frontend commit
changes only selected-question targeting and tests. The D1 testing migration
removed per-account quotas while retaining existing reservations and the single
8,000-Neuron daily cap. Health shows sync protocol 3, Workdays schema 2,
AI Assist 1, image AI 1 and AI enabled. The existing bindings, secrets, CPU limit
and scheduled cleanup were preserved. Production and native releases were untouched.

### Bullet images and OCR on web staging, 22 November 2026

Web staging ran `codex/bullet-image-capture` at
`eaea77aaaf62e47d872085e307163d8d40e69fcf`, release `2026-11-14.1`.
The frontend Worker version is `839194a8-e0f6-4c07-b463-d2268a75e49c`.

[Staging run #189](https://github.com/renx777/remonook/actions/runs/45017809871)
passed all 13 sync checks and desktop and mobile collection checks.
Guest browser acceptance on the live deployment confirmed file and HTML image
drops, crop, rotation, inversion, real English OCR, copy, safe retry and
persistence of the edited child note and both attachments after reload.
The rollout covers web staging.

### AI assist handoff to your own AI app, 20 November 2026

Web staging runs branch `feat/ai-apps-handoff`, commit
`bdb8967612021e03eb4e5f14a5a3243873b8e3e9`, release `2026-11-14.1`
(pull request [#94](https://github.com/renx777/remonook/pull/94), stacked on #93,
so staging also keeps everything below). AI assist drafts offer "Use your own
Claude or ChatGPT", and the MCP connector gains `write_mindmap`.

[Staging frontend #188](https://github.com/renx777/remonook/actions/runs/44678247247)
passed, including the 13 sync checks, and [CI #354](https://github.com/renx777/remonook/actions/runs/44678282281)
passed; the local suite passed 617 tests. The staging sync Worker was redeployed
with owner approval for the new tool: version `e6f22fb8-777c-4e95-b04a-e6b16f5bd284`
(previous `fdfae843-a18f-41c2-9c3b-2d257d027620`), same bindings, `/health`
unchanged, signed-out `/mcp` returns 401. Browser checks on staging: the section
renders, the copied prompt matches the action (including `write_mindmap`), both
app links carry the prompt and Set up AI apps opens Settings → AI apps.

Not verified: a real Claude or ChatGPT conversation carrying out the prompt, and
`write_mindmap` over the live connector (needs a connected test account).
Desktop and Android apps were not rebuilt; they pick up the panel change with
their next build, and their local MCP gains `write_mindmap` then.

### Narrow top bar, colored bullets, app link previews and /ai commands, 19 November 2026

Web staging runs branch `fix/narrow-header-colored-bullets-links`, commit
`9eeae2903aa1b76bb3e4e9ed65ac2e299a7860eb`, release `2026-11-14.1`
(pull request [#93](https://github.com/renx777/remonook/pull/93) into the
staging branch). The frontend Worker version is
`06fd8815-809d-454e-abc1-209193a887e6`.

[Staging frontend #185](https://github.com/renx777/remonook/actions/runs/44630764319)
on `ea8d7d8` deployed but failed the sync release check: the narrower top bar
folds search into an icon at the check's window size, so the check could not
type its query. No notes were lost (1,600 of 1,600 kept). The check now opens
the folded search first (`e9f43c2`).
[Staging frontend #186](https://github.com/renx777/remonook/actions/runs/44631843794)
on `e9f43c2` and [#187](https://github.com/renx777/remonook/actions/runs/44632913005)
on `9eeae29` passed all **13 sync checks** and the link-collection checks at
1280 and 390 px. [CI #351](https://github.com/renx777/remonook/actions/runs/44632898141)
passed; the local suite passed 614 tests.

The sync Worker `remo-sync-staging` was redeployed from this branch for the
new AI structure operations: version `fdfae843-a18f-41c2-9c3b-2d257d027620`
(previous `bc772e1b-c43d-4e44-8c91-b35fc3148cc4`). Bindings, variables, cron,
limits and secrets matched the live Worker before deploying. `/health` reports
sync protocol 3, Workdays schema 2, AI assist 1 with AI enabled; signed-out
`/ai/status` returns 401.

Two fixes were made during the release: the apps' native link-preview fetch
now decodes gzip, brotli and deflate responses (`24745a6`; Amazon sends
compressed pages), and the current page in the top bar shrinks last with an
ellipsis instead of being cut off with two panes at about 770 px (`9eeae29`).
Guest acceptance on staging passed: a colored bullet survives reload, and the
top bar has no overflow and shows the current page at 950 and 770 px with
the sidebar open and with two panes, and at 760 px.

[Desktop app #31](https://github.com/renx777/remonook/actions/runs/44632918243)
built Windows, macOS and Linux from `9eeae29` and published desktop staging
**0.1.31**; the staging `latest.json` advertises it. Desktop runs #29 and #30
were cancelled so the build includes both fixes.
[Android app #16](https://github.com/renx777/remonook/actions/runs/44637207438)
published Android staging **0.1.16** from `7940b43` (the same application
source plus this record); `android.json` advertises it and the APK downloads.

Not verified here: Amazon previews end to end (Amazon serves this test
machine a captcha), an amzn.in short link, live `/ai` generation with insert
and single undo, and colored bullets syncing to a second signed-in session.
These need the staging test account or the apps on a real device.

### Outline keyboard and staging fixture cleanup, 18 November 2026

Web staging runs branch `codex/outline-keyboard`, commit
`eaef658c8d60fc297404535e8d08d7a46b7a9e5b`, release `2026-11-14.1`.
The frontend Worker version is `fda47f75-39fa-4d8c-bf84-fe818419c28b`.

The editor handles Android paragraph insertion and backward deletion input
events, recalculates row measurements when opening a different outline,
and navigates visible bullets with Up and Down. Backspace can send the
first empty plain bullet to Trash. Desktop and phone-width Chromium checks
passed locally and on web staging, including simulated Android input, Undo
and navigation. Physical Android keyboard behavior has not been tested.

The staging test no longer seeds permanent baseline notes. [Staging run #182](https://github.com/renx777/remonook/actions/runs/44224929401)
removed the five untouched fixtures through sync, retained all 1,602 other
notes and passed all 13 sync checks. The local suite passed 608 tests and
[CI #346](https://github.com/renx777/remonook/actions/runs/44224935611) passed.

[Android build #14](https://github.com/renx777/remonook/actions/runs/44224218169)
published staging APK `0.1.14` from application commit
`7b0b543fcdebfabce18277c4e39971639b5a6769`. The later web commit updates
the cleanup and browser scripts. The live APK advertises 0.1.14 and its
signing certificate matches 0.1.13, allowing an in-place update.



### Stable note visibility on staging, 17 November 2026

Branch `codex/stable-note-visibility`, application source
`431490354070cc68104619ac8810c6db9730fc46`, is live on web staging.
[CI #339](https://github.com/renx777/remonook/actions/runs/44010314981)
passed **582 tests**, also passed locally after the staging build. TypeScript
checking and Chromium acceptance at 1280 × 850 and 390 × 844 passed. The same
browser acceptance passed against the deployed app: ordinary deck visibility,
Backspace, Undo, Tab, retained NotebookLM bookmark text and reload.

[Staging frontend #177](https://github.com/renx777/remonook/actions/runs/44010424477)
passed all **13 sync acceptance checks**. Offline reconnect completed in 969 ms;
concurrent edits retained both sides; device-only workspaces issued no sync
requests. Cleanup retained all 1,593 earlier notes. The live source marker matches
the branch and full application commit. Web staging Worker `remonook-staging`
version: `4639d969-171b-47d5-8b5f-6c75d0b9644f`.

Notes keeps ordinary pages registered as study decks visible. Filtered outlines
now supply their displayed row sequence to Backspace, Tab, arrow navigation,
context-menu indent and divider deletion. Hidden bookmark branches retain their
IDs, text and metadata, and Android capture names Library → Bookmarks as the
bookmark destination. See [NOTE-VISIBILITY.md](NOTE-VISIBILITY.md).

[Android app #12](https://github.com/renx777/remonook/actions/runs/44010998049)
published **Android staging 0.1.12** from the same application source. The live
Android update feed advertises 0.1.12, and the APK downloaded successfully. Its
APK v2 signing certificate exactly matches the previously published 0.1.11
package (SHA-256 `25daa19c392684e2c3c5ee5e9f8fe0a731ef8204cb7ea88cbcee35a57b87dff1`).
The workflow also passed native widget pagination tests and `apksigner verify`.
Install over the existing staging app; do not uninstall device-only workspaces.
No other native channel was published for this fix.

The sync backend was not deployed; health remains `syncProtocol: 3`,
`workdaysSchema: 2`, `aiAssist: 1`, `aiEnabled: true`, `bookmarkReader: 1`, with
books, attachments, capture, Google Tasks, email/Google authentication and MCP
capabilities retained. No migration, snapshot replacement, outbox changes,
production deployment or merge to main is involved. Affected-account/real Android
keyboard acceptance requires the owner's device check; browser tests do not
claim access to that account or installed app.

### Refined post previews on web staging, 16 November 2026

Branch `codex/refined-post-previews`, application source
`8f3eb43aae90400cf52c4a05dad4d6ea4f36553c`, is live on web staging.
[CI #337](https://github.com/renx777/remonook/actions/runs/43907779765) passed all
**579 tests** for that source. [Staging frontend #176](https://github.com/renx777/remonook/actions/runs/43907996455)
passed all **13 sync acceptance checks**, including offline reconnect in 975 ms,
concurrent edits, device-only isolation and cleanup retaining all 1,589 earlier
notes. The live source marker matches the branch and full commit.

The deployed **web staging Worker** (`remonook-staging`) version is
`04acdfb8-51d0-43e0-b52a-a9020a738ac5`. It now bundles the narrowly routed
`/api/reddit-preview` endpoint alongside static assets. Only that endpoint runs
Worker code first; normal assets retain asset-first serving. This is separate
from `remo-sync-staging`, which was not deployed or changed. No new secrets,
D1/R2 bindings, storage migrations, native app publication or production release
were performed. Sync-backend health exactly matches the pre-release snapshot,
including `syncProtocol: 3`, `workdaysSchema: 2`, `aiAssist: 1`, `aiEnabled: true`,
`bookmarkReader: 1` and retained Google Tasks/books/capture/MCP capabilities.

The owner's `/r/GadgetsIndia/s/hr9mfrsrFT` link resolves to post `1xxrpor`.
**Unmocked live staging acceptance returned HTTP 200** and rendered its actual
post title, author, community and text. Its optional thumbnail loaded successfully
on demand. The live-embed action uses the resolved `/comments/1xxrpor/` permalink,
not the short-link path. Personal-note saving and Undo passed on the live app;
desktop/mobile screenshots were inspected. The deterministic browser suite also
passed on staging, including light/dark, offline fallback and the existing
X/Instagram/Reddit flows; its external responses are fixtures.

Previews use one quiet source/actions row. Reddit text cards clamp long passages
until Read more, and images load only after Show image. Public Bluesky embeds
were verified against a live post. TikTok video/photo links use the official
player with autoplay off, but the documentation sample was unavailable; successful
media rendering for that sample is not claimed. Existing YouTube/Vimeo/Spotify
note embeds remain intact. See [SOCIAL-POSTS.md](SOCIAL-POSTS.md).

The first candidate's Reddit API failed before contacting Reddit because Node
accepts `fetch` redirect mode `error`, while Workers supports only `follow` or
`manual`. This was initially mistaken for a provider-access failure. The corrected
handler uses `manual`, and a real Miniflare/workerd regression test verifies short
resolution, feed parsing, absence of forwarded credentials and caching. Earlier
staging runs also encountered authentication/network failures during sync-test
cleanup; the final #176 passed without changing the sync transport or relaxing
acceptance. Public/private/deleted content and provider rate limits still govern
preview availability. Reddit text previews are not archival media imports.


### Social-post previews on web staging, 16 November 2026

Branch `codex/social-post-previews`, application source
`04ac6bcec3b450dc9e8188cee39c62bfa4d48d7a`, is live on web staging.
[CI #332](https://github.com/renx777/remonook/actions/runs/43859408595) passed for
that exact source. [Staging frontend #172](https://github.com/renx777/remonook/actions/runs/43859867016)
passed on attempt 2. The live `staging-source.json` matches the branch and commit.

The owner approved replacing the previous staging branch
`ccr-641b18bf-2fe80f` at `592c1aa890e8a490b98a58bb18c3d68434bcac2d`.
The new branch retains all work through that commit, including the phone-sharing
rename fixes and view-outline corrections. It was started from current
`origin/main` before fast-forwarding to that staging baseline.

Public X/Twitter, Reddit and Instagram post permalinks now display live previews
in notes and Bookmarks. Source-linked personal notes use ordinary Undo and
canonical persistence; local drafts survive unsuccessful submissions, and their
insertion ID prevents duplicate retries. Caption-plus-link incoming shares
recognise a bookmark and preserve all supplied text. See
[SOCIAL-POSTS.md](SOCIAL-POSTS.md) for usage, provider limits and Android follow-ups.
This is live embedding, not archival post-body/media capture.

Local TypeScript, staging build and **571 tests** passed. Desktop/mobile browser
acceptance passed against development, the built app and live staging, including
all three provider URL paths, note saving/Undo, captions, duplicate links,
light/dark and offline fallback. These deterministic tests mock provider content.
A separate **unmocked live staging X check** rendered public post 20 and received
its provider resize message. Reddit blocked this environment's network, and the
Instagram sample reported unavailable; successful content rendering for those
providers is not claimed. Private/deleted/blocked content retains an original
link and local personal notes.

Attempt 1 published successfully but its offline-reconnect acceptance case timed
out at 30 seconds; the other 12 checks passed and all earlier account notes were
retained. The unchanged source was rerun without weakening tests or changing the
sync transport. Attempt 2 passed **all 13 sync checks**, including reconnect in
971 ms, concurrent edit preservation, three-device convergence, device-only
isolation and cleanup restoring all 1,587 earlier notes. A similar timeout is
documented in the baseline history (commit `cd1010a`); this release does not claim
to have eliminated that intermittent timing condition.

Only the **web staging frontend** was published. No Android/desktop binaries,
backend Worker, migrations, main merge or production release were performed.
The shared Android capture improvements are prepared for a later native update
after web acceptance. Live backend health exactly matched the pre-release check:
`ok: true`, `syncProtocol: 3`, `workdaysSchema: 2`, `aiAssist: 1`,
`aiEnabled: true`, `bookmarkReader: 1`, with Google Tasks, books, attachments,
article capture and MCP capabilities retained. No new secrets or paid API are
required. The staging workflow deploys the frontend only.


### Incoming Android sharing and dedicated outlines, 16 November 2026

Branch `codex/android-share-view-outlines`, application source
`b0040a07c1859587841bfbe7db5bf25cc7bf49e2`, is live on web staging.
[Staging frontend run #170](https://github.com/renx777/remonook/actions/runs/43827341344)
passed, including sync acceptance. The live `staging-source.json` matches that
branch and commit. Desktop and mobile Chromium smoke checks passed against the
published site, with no page errors. Notes now focuses on ordinary notes;
Study Desk, Calendar, Mindmaps, Bookmarks and Bookshelf each offer **Outline**
for their existing source bullets. No notes are moved or copied.

Android staging **0.1.10** is published from the same source.
[Android run #10](https://github.com/renx777/remonook/actions/runs/43826105855)
passed native compilation, signing and publication. **Save to RemoNook Staging**
receives shared plain text/links and selected text, previews an editable capture,
and saves a note in Inbox or a bookmark. Device-local capture needs no login.
Original payloads remain durably queued until canonical local persistence succeeds;
native ownership claims prevent another account from receiving a claimed share.
See [ANDROID-SHARING-AND-VIEW-OUTLINES.md](ANDROID-SHARING-AND-VIEW-OUTLINES.md).

[Download Android 0.1.10](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/RemoNook-staging_0.1.10_android.apk).
Package `com.remonook.app.staging`, version code `1010`, minimum SDK `24`, target
SDK `36`; ABIs `arm64-v8a`, `armeabi-v7a`, `x86_64`; **150,068,407 bytes**;
SHA-256 `9e43549908e2bb6fb6b300abfca85229f4702fb387a6ee1e61c0adda9626fac2`.
Downloaded APK integrity, signature, incoming-share intent filters and existing
study-widget registration passed. The certificate matches staging 0.1.9; install
using **Update**, preserving device-only notes. Physical Android cold/warm sharing,
selected-text menu placement and launcher behavior still require owner acceptance.

Exact-source [CI #330](https://github.com/renx777/remonook/actions/runs/43826107234)
passed. Local TypeScript, staging build and the full **160-file test suite** passed.
Browser acceptance covered dedicated outline editing/undo, empty states, mobile
navigation, light/dark, guest capture, duplicate submission, failed save/retry and
account transitions. Real guest IndexedDB save preceded native acknowledgement in
the capture browser harness; native IPC in that harness was simulated.

Desktop staging run #25 is building the same source; the published desktop remains
0.1.24 until all three platform jobs and publication pass. This record will be
updated after the signed update is verified.

No backend deployment, database migration or production release was performed.
The unchanged staging health reports `ok: true`, `syncProtocol: 3`,
`workdaysSchema: 2`, `aiAssist: 1`, `aiEnabled: true`, `bookmarkReader: 1`;
Google Tasks remains configured and existing book, capture and MCP capabilities
remain enabled. The staging workflow deploys the frontend only.


### Native study widgets, published 15 November; verified 16 November 2026

Branch `codex/native-study-widgets` retains the navigation/Settings baseline through
`b292e89` and adds an opt-in Android home-screen study widget and compact study
windows for macOS, Windows and Linux. The desktop windows are ordinary app windows,
not OS widget-gallery extensions. macOS WidgetKit remains a separate Apple
signing/App Group milestone. See [NATIVE-STUDY-WIDGETS.md](NATIVE-STUDY-WIDGETS.md)
and [ANDROID-STUDY-WIDGET.md](ANDROID-STUDY-WIDGET.md) for setup, cache limits,
offline review reconciliation and physical-device acceptance.

Android staging **0.1.9** is published from
`757178ab8eafa69e777519b75d498cc8edf37ec0`;
[Android run #9](https://github.com/renx777/remonook/actions/runs/43762280763)
passed its four native pagination tests, compilation, signing and publication.
The downloaded APK passed ZIP integrity, widget component registration and
signature verification. Its signing certificate matches the previous staging
0.1.5, so install over the existing app with **Update**; do not uninstall device-only
notes. Package `com.remonook.app.staging`, version code `1009`, minimum SDK `24`,
target SDK `36`, ABIs `arm64-v8a`, `armeabi-v7a`, `x86_64`; **150,009,859 bytes**.
SHA-256 `02611bb868dca389ab82eba9874ece4c782cd030bd1aee5e6dabe7c6c092a535`.
[Download APK](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/RemoNook-staging_0.1.9_android.apk).

Desktop staging **0.1.24** is published from application commit
`5956fea063d17d393790d891d2d76bcc741b1283`.
[Desktop run #24](https://github.com/renx777/remonook/actions/runs/43760939230)
passed Windows, Linux and universal macOS installer builds, native storage tests
and the gated publication job. The live manifest reports `0.1.24`, with Windows
x86_64, Linux x86_64 and both macOS architectures. All three downloaded payloads
passed cryptographic updater-signature verification against the repository public
key. Binary checks confirmed a Windows PE installer, Linux ELF AppImage, and a
universal Mach-O with Intel and Apple silicon architectures. The previous public
desktop release was `0.1.22`. The Android release's intervening commit changes
only CI testing and documentation; application source is identical.

| Desktop artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Windows setup | 45,617,013 | `a751ae8cf45c6aab61621a13443700ffec5824a6d0c034a942617f59bb7e1301` |
| Linux AppImage | 125,356,536 | `7ee73f6e91ae3adb1fe1a15a9987a48069c0e5f9d7b2cc6ed5e18ef3094cfd1b` |
| Universal macOS update | 93,751,805 | `15807087a081e3570b593199905de13b0cf4a10fdd89608099672aa236fd1442` |

Desktop users can update the staging app, then enable **Settings → Study → Study
outside the main window** and choose **Open study window**. The tray also offers
**Study flashcards**. Android users enable the same preference, then add
**RemoNook → Study flashcards** from the launcher's Widgets picker.

Validation for the application commit: TypeScript/staging build, **556 full-suite
tests**, **14 model checks**, **15 React/persistence/worker checks**, Chromium study
window acceptance at normal/narrow widths in light/dark, and a packaged worker
load/complete-answer check all passed. Exact-source GitHub CI passed for both
application and Android release commits. The cache runs in a worker and ignores
stale results. A synthetic 10,000-card Chromium check observed a largest UI
heartbeat gap of 38 ms (9 ms at 1,000 cards); these are development-machine results.
Native compilation/tests and browser acceptance are not physical-launcher or
macOS/Windows/Linux desktop-shell testing. Owner device checks remain outstanding.

The native workflows publish **staging only**. No web frontend, backend Worker,
migration or production deployment was performed. The shared scheduler, canonical
local persistence, full backups and durable sync outbox remain authoritative.
Android's previous public version was `0.1.5`; earlier widget candidates were
withheld before publication. The existing staging backend health remains
`syncProtocol: 3`, `workdaysSchema: 2`, `aiAssist: 1`, `aiEnabled: true`,
`bookmarkReader: 1`.


### Android staging navigation update, 15 November 2026

Android staging **0.1.5** was built and published from
`codex/navigation-and-settings` at
`95274dee28ec81440e8d39e2a03b86b52fe3bb21`; application changes are commit
`e8ce011da1b6ff2fb1659fb78dd49c13fd04aa65` (the intervening commit only records
web deployment). [Android app run #5](https://github.com/renx777/remonook/actions/runs/43727805188)
passed all build, signing, artifact upload and publication steps, using the existing
release-key configuration. Exact-source GitHub CI had already passed.

The live staging Android manifest reports `0.1.5` and its APK download returned a
complete, valid ZIP. Parsed package: `com.remonook.app.staging`; version code
`1005`; minimum SDK `24`, target SDK `36`; native libraries for `arm64-v8a`,
`armeabi-v7a` and `x86_64`. APK size: **149,665,842 bytes**. SHA-256:
`3cfe94bbb30a8e2bf425a797344757dde8a0f45e8552a26b2274764a18ac3bd7`.
The published version before this update was `0.1.4`.

Download: [RemoNook Staging 0.1.5 APK](https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/RemoNook-staging_0.1.5_android.apk).
Install over the existing staging app and choose **Update**; do not uninstall,
which would remove device-only notes. Reopening the app starts its update check
about 15 seconds later. Physical-device confirmation of the navigation drawer,
Android Back button, existing notes and Settings remains the owner's acceptance
step. Browser acceptance and the full source regression suite passed before this
build; they are not physical-device testing.

Only Android staging distribution was updated. No production release, desktop
release, backend Worker deployment or migration was performed. Native flashcard
widgets remain a separate proposed feature and are not included in 0.1.5.


### Navigation and Settings refinement, 15 November 2026

Branch `codex/navigation-and-settings`, based on `origin/main` at
`2102f49`. Restores phone navigation with a native modal drawer, makes Calendar's
month/agenda support area explicitly collapsible on desktop and phone with
independent display preferences, and aligns Settings fields, spacing and backup
actions with the app's visual language. Native dialog focus/Escape handling and
Android's existing back-stack integration are reused; physical-device testing is
still required. No data model, sync protocol, durable outbox or backend change.

Validation: TypeScript and the staging build passed, the full 156-file regression
suite passed, and Chromium acceptance checks covered separate sidebar/calendar
preferences, phone drawer navigation and focus restoration, and every Settings
panel at phone widths. Light/dark desktop and phone views were inspected.
Deployed to web staging from application commit
`e8ce011da1b6ff2fb1659fb78dd49c13fd04aa65` on branch
`codex/navigation-and-settings`. The existing release marker is `2026-11-14.1`;
`staging-source.json` identifies the exact deployed application commit.
[GitHub CI](https://github.com/renx777/remonook/actions/runs/43710643759) and the
[Staging frontend workflow](https://github.com/renx777/remonook/actions/runs/43711089712)
both passed, including the latter's end-to-end sync check. Chromium acceptance
also passed against the live site for desktop/phone calendar disclosure,
independent preferences, phone navigation, focus restoration and every Settings
section. Backend health remained healthy with sync protocol 3, Workdays schema 2,
AI Assist 1, AI enabled and bookmark reader 1. No backend, production or native
binary was deployed during that web release. Android staging 0.1.5 now
includes these shared-UI fixes, as recorded above. The OS widget/PKM feasibility and priorities report is
[PRODUCT-RD-2026-11.md](PRODUCT-RD-2026-11.md); native study widgets are a proposal,
not part of this release.


### JSON Canvas web staging preview, 14 November 2026

Deployed branch `codex/json-canvas`, application commit
`ada624f7abfe1833df33e104ecea31784081f871`, release `2026-11-14.1`, based on staging source
`a0e324fd90753469aabbb6f99dac15bddfff5fe8` after starting from current `origin/main`.
The existing sidebar, Now bar, Dashboard naming and native work are preserved.
Canvas is exposed only in local/staging web navigation; native builds and production
have no entry point. This feature needs only the **Staging frontend** workflow;
the sync Worker, databases and bindings are unchanged.

The preview uses the existing React Flow library for spatial cards, groups,
connections, resizing and JSON Canvas 1.0 import/export. Editable text remains in
ordinary note rows and uses normal save, rich-text CRDT sync and undo. Full backups
retain layout and notes. External file paths are preserved as references; this
preview does not embed or fetch external files or group backgrounds. See
[JSON-CANVAS.md](JSON-CANVAS.md) and [SYNC.md](SYNC.md).

Local browser acceptance covers desktop pointer dragging and corner resizing,
phone editing, connections, linked note edits, import/export, placement undo and
reload recovery, with light/dark screenshots. A regression test ensures the
browser's deferred ResizeObserver notifications do not open the recovery screen;
real exceptions continue to do so. The final staging build and all 516 local tests
passed, including Canvas format, backup, two-client CRDT and recovery checks.
[GitHub CI](https://github.com/renx777/remonook/actions/runs/43634543259) passed for
that exact application commit.

The owner approved replacing the previous staging branch. The
[Staging frontend deployment](https://github.com/renx777/remonook/actions/runs/43635113066)
passed, including the targeted regression checks, Workdays migration checks,
integration-backend health verification and live end-to-end sync test. Both
`https://staging.remonook.com/staging-source.json` and `/release.json` report the
expected source/release. Chromium acceptance also passed against the live staging
site at desktop and phone sizes, including pointer dragging and corner resizing,
linked-note edits, connections, JSON import/export, undo and reload. The test
browser used the environment's supplied proxy CA with TLS verification enabled.
The backend still reports `syncProtocol: 3`, `workdaysSchema: 2`, `aiAssist: 1`,
`aiEnabled: true` and `bookmarkReader: 1`; it was not redeployed. Production and
native releases are unchanged. Implementation and release records remain in
[draft PR #83](https://github.com/renx777/remonook/pull/83), stacked on the previous
staging branch; nothing was merged to main.


### Desktop local PDF and bookmark follow-up, 10 November 2026

Branch `ccr-641b18bf-2fe80f`, release source
`4946affb0c0244f76b2bf1d4a1247da4c34d3361`, application commit
`1683bd1a05f54180a38382aca6e3bab0153ebf35` (following `b8ff311` and `6b2d8b1`): PDF validation no
longer requests a separate `book-files` module. Desktop startup retires old service-worker
shell caches without deleting user storage or reloading during editing. Local desktop bookmark capture fetches public
pages directly, without authentication or the cloud capture service, and persists sanitized
reader snapshots as workspace attachments. Article titles and workspace cache isolation are
preserved. See [BOOKSHELF-AND-READER.md](BOOKSHELF-AND-READER.md).

**Desktop app** [run #16](https://github.com/renx777/remonook/actions/runs/42857680785)
was dispatched with `environment=staging` for version `0.1.16`. Runs #13 and #14 were
cancelled before publication during final verification. Run #15 passed Windows and Linux but GitHub cancelled its queued macOS job:
"The job was not acquired by Runner of type hosted even after multiple attempts",
with ARM runner capacity annotations. The workflow now uses `macos-15-intel` to build
the same universal Apple silicon/Intel app. The previous
published staging desktop update is `0.1.12`. All three platform builds and publication succeeded. The staging update manifest reports
`0.1.16`, published `2026-11-10T17:25:56.123Z`. Signatures are present for all four
platform entries; Windows x64, Linux x64 and both macOS architectures returned HTTP 200
with nonempty installer downloads (45,563,671 / 125,266,424 / 93,520,821 bytes respectively).
GitHub CI also passed for the exact release source
([run](https://github.com/renx777/remonook/actions/runs/42857697262)).
The staging website, sync Worker and production are unchanged by this desktop release.

Validation: build and TypeScript checks passed; the full 152-file test suite passed.
GitHub CI passed for the final application commit
([run #290](https://github.com/renx777/remonook/actions/runs/42854655543)).
Additional title-preservation and desktop cache-cleanup regression checks passed.
Chromium verified offline PDF/EPUB imports and reading, highlights in Notes and reload;
a fixture through the native-capture bridge verified bookmark capture, reading and saved
snapshot recovery after reload, with zero cloud requests and zero browser errors. The
native HTTP command is compiled by the platform builds; this browser check does not run
the owner's Windows WebView or access their actual account/files.

### Local Bookshelf desktop update, 10 November 2026

Source branch `ccr-641b18bf-2fe80f`, application commit
`3e1cbee16198d4642236f0709d5174326a94a4fb` (following `6f097c7`): local/device-only
and folder workspaces can import PDF/EPUB originals, read offline and capture highlights
without signing in. Originals are isolated by workspace and included in local full backups,
folder copies and paired-device transfers. Cloud Bookshelf retains its account authentication
and storage limits. Missing cache files cannot delete a still-referenced folder original.

The **Desktop app** workflow was dispatched with `environment=staging`:
[run #12](https://github.com/renx777/remonook/actions/runs/42846469459), desktop version
`0.1.12`. All three native build jobs and the publish job succeeded. The staging
`/desktop/staging/latest.json` manifest reports version `0.1.12`, published
`2026-11-10T15:57:33.911Z`; signatures are present and all four platform download entries
(Windows x64, Linux x64, macOS Apple silicon and Intel) returned HTTP 200. The previous
manifest was `0.1.10`. GitHub CI also passed for the application commit
([run #285](https://github.com/renx777/remonook/actions/runs/42846482263)).
This desktop build does not replace the staging website or redeploy the sync Worker. Production is unchanged.

Local validation: TypeScript checks and the full 151-file test suite passed; real Chromium
checks imported/read PDF and EPUB offline, saved a highlight into Notes, reopened after reload,
and observed zero cloud requests or browser errors. The final folder-cache safeguard also
has a regression test. See [BOOK-STORAGE.md](BOOK-STORAGE.md) for local-original behavior.

Staging, 7 November 2026: sign-in for AI apps (OAuth) is on staging. `cloud/mcp-oauth.sql` was applied to D1
`remo-sync-staging`. `remo-sync-staging` version `86cc6d0d-3c3e-419e-aebf-5f96e5621f5b` and the staging frontend
(workflow run on `ccr-641b18bf-2fe80f`) were deployed. Discovery, registration, the authorize redirect to the consent screen and the
consent screen itself were checked live. Production is not yet updated.

Production frontend moved off ChatGPT Sites, 7 November 2026 (owner-authorized):
- `remonook.com` is served by Cloudflare Worker `remonook-production`, deployed by the "Production frontend" workflow
  (run #2) from `main` at `13354fe` (release `2026-11-06.1`, offline shell `8b03319a6504`).
- The custom domain `remonook.com` was attached in Cloudflare, replacing the apex A records that pointed to Sites.
  Rollback: remove the custom domain and restore `A 172.66.3.26` and `A 162.159.143.30` (DNS only).
- `www.remonook.com` keeps its redirect to `remonook.com`. The Sites URL `remo-notes.arenukaprasad.chatgpt.site` still
  serves the old `2026-11-02.2` release; retire or redirect it later.
- Verified on `remonook.com`:
  - release marker, security headers, `sw.js` revalidation and immutable assets;
  - browser load with no errors; service worker registers;
  - the sync API accepts the `remonook.com` origin;
  - the owner confirmed sign-in and sync.

Sync Worker CPU limit, 7 November 2026: sync saves validate the whole shared workspace and were being cut off by the free
plan's CPU limit (`503 exceededCpu`). Staging had been affected since 4 November; production started failing most saves
after the new release. The account moved to **Workers Paid**. `remo-sync` (version `9a9914a8-3561-4552-a1b4-aa1339e9e975`)
and `remo-sync-staging` (version `c79ae554-cb25-4c84-8fae-d4d7c6c44ca5`) were redeployed with unchanged code from
`13354fe` and `limits.cpu_ms = 30000` (now in `cloud/config.json` and `cloud/config.staging.example.json`). After the
redeploy, production showed no CPU cut-offs and queued device edits synced.

Production sync Worker, 7 November 2026: `remo-sync` was deployed from `main` at `13354fe` (PR #66; Worker
version `305f8bb6-4151-425b-a2db-9a395bb3764d`, Wrangler 4.157.0, `cloud/config.json` unchanged from the live
bindings). Before deploying, a D1 Time Travel restore point was recorded for `remo-sync`
(bookmark `0000016c-00000000-0000511c-24e0adf507c4a652135b70b1b823e1f5`, 06:31 UTC), then the additive
`cloud/bookmark-snapshots.sql`, `cloud/ai.sql` and `cloud/mcp.sql` were applied. `/health` reports
`workdaysSchema: 2`, `bookmarkReader: 1` and `mcp: 1`; AI assist and bookmark capture stay disabled in production
(no bindings). The owner authorized this release and publishes the matching production frontend
(`npm run build:production` from `13354fe`) through Sites. That frontend build was verified in a clean checkout of
`13354fe`: 460 tests pass; the marker is `2026-11-06.1`; the offline shell is `8b03319a6504`; the build uses only the production sync API, with no
staging references. It is packaged as `remonook-production-13354fe.zip`. As of this record it is not yet published:
both production URLs still serve `2026-11-02.2`, which is the rollback reference. The production frontend must not be older than this
server's release for Workdays v2 sync.

On 7 November 2026 (later the same day), `remo-sync-staging` was deployed from `ccr-641b18bf-2fe80f`,
application commit `1255d38` (Worker version `3560885b-2726-4bed-932e-76628872d523`, Wrangler 4.157.0), adding
connected AI apps (MCP). The additive migration `cloud/mcp.sql` (tables `mcp_tokens`, `mcp_activity`) was applied
to D1 `remo-sync-staging` first. The config was built from `cloud/config.staging.example.json` with AI assist kept
enabled, as it was live; bindings and secret names are unchanged. `/health` reports `mcp: 1` and
`googleTasksConfigured: true`; `/mcp` refuses requests without an access token. The deploy used a Cloudflare API
token stored as a network secret on the owner's personal cloud environment, never in the repository. The staging
frontend for the same commit was deployed by the staging workflow. Production is unchanged. See [MCP.md](MCP.md).

Earlier on 7 November 2026, `remo-sync-staging` was redeployed from
`ccr-641b18bf-2fe80f` at `f341221b77c0f96f4b63f503bf2cf6a37b2de976`, matching
the live staging frontend source (release `2026-11-06.1`). Worker version
`6ed9c98d-5e1c-4f11-8171-662d80b64c39` serves 100% of staging traffic.
The connected Cloudflare account deployed the Wrangler 4.157.0 dry-run bundle;
no CLI deployment token was available. All live bindings and secret names,
variables (including enabled AI), compatibility settings, observability and
cleanup cron were retained. Health confirms sync protocol 2, Workdays schema 2,
AI Assist 1 with AI enabled, Bookmarks reader/capture, books and Google Tasks.
Unauthenticated sync returns 401. Eleven backend regression test files and the
sync-rejection reproduction passed; CI also passed for the deployed source
([run 42338608126](https://github.com/renx777/remonook/actions/runs/42338608126)).
No migrations were needed, and no frontend or production deployment was performed.

Frontend release `2026-11-06.1` on `ccr-641b18bf-2fe80f` (application commit
`326aaa5`) adds persistent All / Notes / Calendar quick-access tabs, groups All
as Calendar → Flashcards/MCQs → Mindmaps → Bookmarks → Docs → ordinary notes,
and replaces mindmap library icons with bounded SVG snapshots of their actual
branches and styles. Notes excludes special-content subtrees while retaining
ordinary siblings in mixed pages. These are presentation filters: saved parents
and positions are unchanged. Daily notes uses the canvas background without a
frame. The full suite passes 135 files; Chromium acceptance covers mobile filters,
group order, real previews, keyboard tabs, and unframed daily notes in both themes.
This is a frontend-only staging release; the verified sync Worker below is retained.
Deployed frontend source: `1fea6a1e0ca3aca034618ee8c3086fbcbd1ac35c`, confirmed
by `/staging-source.json`. Both [staging run 42223022322](https://github.com/renx777/remonook/actions/runs/42223022322)
and [CI run 42222995319](https://github.com/renx777/remonook/actions/runs/42222995319)
passed. Chromium checks also passed against the deployed build using synthetic
guest notes, including mobile grouping, filtered editing views, keyboard tab
navigation, real mindmap snapshots, and borderless calendar notes in both themes.
The sync server was not redeployed, and production remains unchanged.

Staging sync recovery release `2026-11-05.2` uses branch
`ccr-641b18bf-2fe80f`, application commit `081280c`. The sync Worker was deployed
separately on 5 November 2026: version `242ad50e-7d15-40e1-9bbe-b02791a3b7f0`,
100% traffic. Health confirms `syncProtocol: 2`, `workdaysSchema: 2`,
`aiAssist: 1`, `bookmarkReader: 1`, `aiEnabled: true`, article capture and Google
Tasks configured. D1/R2, all existing variables and secret bindings, observability
and cleanup cron were compared before/after and retained. The requested Wrangler
command could not authenticate in this execution environment; the connected
Cloudflare account uploaded the tested Wrangler bundle instead. The ignored
local config was absent and was reconstructed from live staging settings.
The matching **Staging frontend** workflow succeeded at frontend commit
`419442ff0a596305e8334e5fd9edd5b9c7194f04`:
[run 42083418657](https://github.com/renx777/remonook/actions/runs/42083418657).
`/staging-source.json` confirms that branch, commit and release. CI also passed
on that commit ([run 42083391600](https://github.com/renx777/remonook/actions/runs/42083391600)).
The full local test suite passed all 134 files; `node tests/repro-sync-rejection.mjs`
accepted every batch. A live staging test using two separate synthetic actors
confirmed concurrent edits converge, both outboxes are acknowledged, and a
validation-rejected batch is preserved and accepted after automatic repair.
The owner confirmed the affected-account check succeeded on both devices:
both reached **Synced** and the previously pending edits appeared on both.
Production remains unchanged.

The Bookmarks preview (`feature/bookmarks`, release `2026-11-04.1`) is intentionally limited to local development and staging at the owner’s request. Production stays on its existing deployed release. Do not publish this preview through Sites. See [BOOKMARKS.md](BOOKMARKS.md) for staging-only backend bindings, migration and local cloud development.

GitHub `main` is the source for every environment. Release `2026-11-02.3` includes the flashcard editing, interactive mindmap, bulk actions and pane improvements from `678e82c`, plus an update notice for older open app sessions. `/release.json` identifies the release on each frontend. Sites uses a separate source-repository commit, whose application files must match GitHub byte for byte. Environment-specific build configuration, Firebase accounts, database contents and attachment buckets remain separate.

Do not publish changes only from the Sites checkout. Implement and test in the development checkout, commit to GitHub, wait for the staging workflow to succeed, then publish those exact source files through Sites. Before publishing, compare all tracked application files against the selected GitHub commit; exclude only generated `dist/` output and the Sites hosting manifest. After any emergency production edit, reconcile it into GitHub and the local checkout immediately, then wait for staging deployment before declaring the release complete.

Build production into a clean `dist/` using the production environment configuration; do not overlay individual new bundles onto an older build. The Sites archive and source commit must contain the complete matching build, including new generated files ignored by the canonical repository. In the Sites checkout, explicitly stage generated output with `git add -f dist .openai/hosting.json`. A release marker alone does not validate JavaScript dependencies: test a fresh production browser session, flashcard editing and the lazy-loaded mindmap after publishing.

Open app sessions check the deployed HTML entry on focus, reconnect and once per minute while visible. A changed entry displays **Save & update**; it never reloads automatically. Updating waits for durable device saves and refuses to reload while a dialog, composition, upload or cloud adoption is in progress or saving has failed. Pending cloud uploads survive reload through the existing outbox. No user storage is cleared. Tabs opened before this notice was introduced need one ordinary reload to receive it.

| Environment | Frontend | Authentication | Sync and attachments |
| --- | --- | --- | --- |
| Local | Vite on localhost | Disabled | Device-only IndexedDB |
| Staging | staging.remonook.com | remonook-staging (Spark) | remo-sync-staging Worker, separate D1 and R2 |
| Production | remonook.com | Existing remo-978fb | Existing remo-sync and remo-attachments |

Staging is deployed at https://staging.remonook.com with Google sign-in configured in Firebase project `remonook-staging`. Email/password sign-in uses the same account and sync paths; enable its Firebase provider separately as described in [EMAIL-AUTH.md](EMAIL-AUTH.md). D1 `remo-sync-staging` has its schema initialized and R2 `remo-attachments-staging` is private. The sync API is https://remo-sync-staging.remo-978fb.workers.dev. See `cloud/staging-resources.json`. The initial deployment was made through the Cloudflare API. Automatic frontend deployment is now enabled for pushes to `main`: GitHub holds the encrypted `CLOUDFLARE_API_TOKEN` secret and `STAGING_ENABLED=true`. The token has **Individual Workers Editor** access to **remonook-staging only**, and expires on **23 January 2027**. Rotate and update the GitHub secret before that date. Production remains on Sites hosting.

## Local

`npm ci`, `npm run dev`. No environment file is required. Optional `.env.local` can be copied from `.env.local.example`. The default build is local-only too. Sign-in deliberately reports that cloud authentication is disabled; testing sync requires staging.

Development, staging and production must use different browser origins. Folder connections and browser data are local to an origin. Never point a developer folder connection at a production backup folder.

## Staging activation checklist

1. Create a new Firebase project and register a Web app. Enable Google sign-in and authorize `staging.remonook.com`. Do not reuse `remo-978fb`.
2. Reuse the existing staging D1 and R2 resources recorded in `cloud/staging-resources.json`. Never bind the production database or bucket.
3. Copy `cloud/config.staging.example.json` to an untracked `cloud/config.staging.local.json`. The checked-in example already identifies the actual staging resources. Apply `cloud/schema.sql` to the new database only.
4. Bundle `cloud/worker.mjs` as an ESM Worker with esbuild, or let Wrangler bundle it. Deploy with the explicit staging config. Verify `/health`, allowed origins, authentication and private user isolation. This Worker now requires `FIREBASE_PROJECT_ID` and `ALLOWED_ORIGINS`; missing configuration returns 503.
5. Copy the public frontend settings from `.env.staging.example` to `.env.staging.local` for a manual build. The GitHub staging workflow already performs this copy. The frontend refuses the known production Firebase project or sync API in staging.
6. Add a least-privilege Cloudflare deployment token as the GitHub repository secret `CLOUDFLARE_API_TOKEN` (the account ID is already pinned in the workflow). Do not paste the token into a file or chat. Restrict it to the individual `remonook-staging` Worker using **Individual Workers Editor**. The existing token expires on 23 January 2027; replace the encrypted GitHub secret when rotating it.
7. Create/attach `staging.remonook.com` to frontend Worker `remonook-staging` after its first deployment. `wrangler.staging.jsonc` serves `dist/`. The existing custom domain is managed in Cloudflare; `workers_dev` and `preview_urls` are explicitly disabled, avoiding account-wide subdomain permissions for the deployment token.
8. Set GitHub repository variable `STAGING_ENABLED=true` only when all of the above is ready. The staging workflow then builds, tests and deploys pushes to main, or can be run manually. It deploys the frontend only; sync/schema changes need their separately reviewed staging deployment.

The actual staging `VITE_*` values are recorded in `.env.staging.example`. They are public build-time values. Environment files ending in `.local` are ignored. The deployment token is a secret.

Test with synthetic notes and test accounts. Verify Android phone, iPad, desktop, keyboard open/closed, offline reload, backup/restore and automatic concurrent merging before release. GitHub PR builds receive no deployment secrets.

## Production release

Do not enable GitHub auto-deployment to production yet. The existing Sites publication and domain must remain the active production route until a deliberate hosting migration.

### Who may release

Coding agents may prepare and execute production frontend releases with explicit owner authorization for each release (see AGENTS.md). Backend Workers, D1 migrations and infrastructure changes need their own separate authorization.

### How production is hosted

- Today `remonook.com` and `remo-notes.arenukaprasad.chatgpt.site` are served by ChatGPT Sites. The domain's DNS zone is in the owner's Cloudflare account; the Sites project lives in the ChatGPT (Codex) workspace under the git-ignored `.openai/`, not in GitHub. Only that workspace can publish a Sites version.
- **Moving off Sites (approved by the owner on 7 November 2026, in progress):** production moves to Cloudflare Worker `remonook-production` (`wrangler.production.jsonc`), mirroring staging's `remonook-staging`. `npm run build:production` writes `dist/_headers` from `cloud/production-headers`: nosniff, referrer policy, `sw.js` revalidation, immutable hashed assets.
  1. One-time owner setup:
     - create a Cloudflare API token with **Workers Scripts: Edit** for account `e9a5c70b…`, limited to what deploying `remonook-production` needs;
     - save it as GitHub secret `CLOUDFLARE_PRODUCTION_API_TOKEN`;
     - create the GitHub environment `production` with the owner as required reviewer.
  2. Deploy: run **Production frontend** (`.github/workflows/production.yml`) with the full SHA of an approved commit on `main`. It checks the commit is on `main`, builds cleanly, runs all tests, verifies the artifact and the production sync Worker, waits for owner approval, then deploys.
  3. Test at `https://remonook-production.remo-978fb.workers.dev`. That origin is not in Firebase authorized domains or the sync Worker's `ALLOWED_ORIGINS`, so it is for load, asset and header checks only.
  4. Switch: in Cloudflare, Workers & Pages → `remonook-production` → Settings → Domains & Routes → Add custom domain `remonook.com`. Cloudflare asks to replace the existing DNS record that points to Sites. The origin stays `remonook.com`, so offline data, the installed app, Firebase sign-in and sync are unaffected.
  5. Rollback: remove the custom domain and restore the previous DNS record to Sites (keep a note of it), or `wrangler rollback` to the previous Worker version.
  6. After a stable period: set `workers_dev` to false, then retire or redirect the Sites URL. Users of the `.chatgpt.site` address sign in again at remonook.com; their notes are in the cloud.

### Release label

The production workflow writes `dist/release.json` with a label of date plus run number
(for example `2026-11-08.7`) and the released commit. The smoke test then checks that
remonook.com serves this release, not the previous one. `public/release.json` is only the
placeholder used in local and staging builds.

### End-to-end sync check (release gate)

`scripts/e2e-sync.mjs` (`npm run e2e:sync`) runs real browsers as separate devices against a
deployed environment, using a dedicated staging test account. It checks that:
- the first sign-in and a brand-new device delete nothing;
- a new device receives every note;
- edits and new notes reach the other device live;
- an offline edit stays pending, then syncs after reconnecting;
- concurrent edits to one bullet keep both and converge;
- a third new device sees the same notes.

It keeps five baseline notes on the account, removes only its own notes, and checks that the
account ends with exactly the notes it started with. It was confirmed to fail on the
2026-11-07 data-loss build (`9647a6a`).

- **Staging workflow:** runs it after every staging deploy.
- **Production workflow:** releases only when two things hold:
  - staging serves the same tree as the commit being released;
  - the check passes there.
- **Secrets:** `STAGING_E2E_EMAIL` and `STAGING_E2E_PASSWORD` (repository secrets). Never
  put the credentials in files.
- **Locally:** set `E2E_EMAIL` and `E2E_PASSWORD`. Set `E2E_CHROMIUM` to a browser path when
  the Playwright browsers are not installed.

### Procedure

1. Owner authorizes the release and names the commit on `main`.
2. Verify `main` is at that full SHA, and that CI passed on it and staging was checked from the same code.
3. If the release needs backend changes, they must already be deployed and recorded (server first, then frontend), with separate authorization. Record a D1 Time Travel bookmark before any production migration.
4. In a clean checkout of the commit: `rm -rf dist`, remove `.env.local`, `cp .env.production.example .env.production.local`, `npm ci`, `npm run build:production`, delete `.env.production.local`, `npm test`.
5. Verify `dist/`:
   - `index.html`, `manifest.webmanifest`, `sw.js` and `release.json` (expected marker) exist;
   - `grep -r remo-sync-staging dist/` and `grep -r remonook-staging dist/` find nothing;
   - the main bundle references `remo-sync.remo-978fb.workers.dev`.
   Package `dist/` as `remonook-production-<shortsha>.zip`.
6. Record the live version for rollback: `curl https://remonook.com/release.json` and the current Sites version number.
7. In the Sites workspace, confirm its tracked application files match the commit (excluding `dist/` and the Sites hosting manifest). Replace the whole generated build with the verified archive, keep the hosting manifest, and publish to both production URLs.
8. Verify:
   - `https://remonook.com/release.json` and the `.chatgpt.site` URL report the new marker;
   - the app loads without Firebase or sync errors;
   - sign-in works, and notes reach Synced;
   - the release's new features work;
   - older tabs show Save & update.
9. If a material problem appears, republish the recorded previous Sites version (frontend only). Leave Workers and D1 unchanged.
10. Record the Sites version, commit, date, URLs, checks and matching Worker version under "Current state" through a pull request.

If deploying this repository's sync Worker (separately authorized), use `cloud/config.json` intentionally: it identifies the existing production resources. Compare it with the live Worker bindings before deploying, and verify `/health` afterwards. Do not assume a frontend rollback undoes database writes or migrations.

## Cloud-first storage and legacy folder migration

- Signed-in workspaces use their existing account-scoped IndexedDB as an offline cache and the matching environment's cloud workspace for cross-device sync. Staging and production must continue to use separate Firebase projects, D1 databases and R2 buckets.
- Automatic folder ZIP writing, Syncthing-style copying, and associated UI were retired. On first opening the updated app per account/guest workspace, the legacy folder connection entry is removed from its separate IndexedDB settings store. This does not access, overwrite, or delete anything in the old local filesystem folder. The old ZIP archives remain compatible with manual Restore from backup.
- Signed-in clients use sync protocol v2: incremental Yjs rich-text updates, an atomic durable local outbox, backend acknowledgements, idempotent operation IDs and a server journal. Concurrent updates merge automatically. Users are never asked to choose a device/cloud copy or resolve conflicts.
- Local data and pending edits survive offline periods and reloads. Genuine storage, authentication or quota failures remain actionable. The toolbar has no animated cloud indicator or manual sync control.
- The additive v2 schema and backend are deployed independently to both staging and production. Old snapshot clients receive an update-required response after account migration. See [SYNC.md](SYNC.md) for migration, recovery and compatibility limits.
- Preserve the browser's regular IndexedDB workspace and attachments for offline editing; never purge them as part of retiring the folder option.

## Workflow and costs

The working flow is local → staging → production:

1. Develop on a feature branch and verify locally (`npm run build`, `npm test`).
2. Push the branch and run the **Staging frontend** workflow on that branch (`workflow_dispatch`) so it can be tested on phones and other devices. Staging may run an unmerged branch during testing; record which branch and commit are live there.
   This workflow deploys **only the frontend**. Deploy the sync server separately
   with `npx wrangler deploy --config cloud/config.staging.local.json` from the
   same tested branch. Keep that local config ignored; compare its bindings and
   plain variables against live staging first. Preserve secrets, enabled AI,
   Google Tasks, article capture, D1/R2 and scheduled cleanup. Verify `/health`
   after deployment (`syncProtocol: 3`, `workdaysSchema: 2`, `aiAssist: 1`,
   `bookmarkReader: 1`, with `aiEnabled: true` while staging AI is enabled).
   When local credentials are unavailable, manually dispatch **CI** on the tested
   staging feature branch with `sync_staging=true`. This job uses the separate
   GitHub secret `CLOUDFLARE_SYNC_STAGING_API_TOKEN`, scoped for `remo-sync-staging`;
   the frontend's `CLOUDFLARE_API_TOKEN` is restricted to `remonook-staging` and
   receives 403 on the sync Worker. Never broaden or replace that frontend token
   to work around the separation. The server token needs Worker script/settings
   and schedule read/write access, plus any resource-read permissions Wrangler
   needs for the existing bindings. Its separate server job first
   runs the build/full suite, compares the checked-in staging example with live
   bindings and cron schedules, removes example variables and uses `keep_vars`
   to retain live settings/secrets. It refuses unknown/mismatched resources, then
   dry-runs, deploys **remo-sync-staging only** and verifies health, resource
   bindings, variable digests and secret names. Nothing logs secret values or
   commits the ignored generated local config. Review any mismatch rather than
   bypassing it. It never deploys production or publishes a frontend.
3. Open a PR into `main` once testing passes. CI runs Node 24, `npm ci`, a local-only build and the full tests.
4. Merge to `main`. A push to `main` also deploys staging automatically.
5. Release production explicitly from `main`. Before doing so, confirm `main` contains everything staging has been running, so the release and staging match.

Several AI tools work on this repository; see the multi-agent section of [AGENTS.md](../AGENTS.md). Branch protection and deployment-review features depend on the GitHub plan and are not configured by these files.

Free-tier build and usage quotas apply across the account. Staging does not multiply those allowances. R2 and any other metered resources can generate charges beyond their included usage; no zero-cost guarantee is implied.

## Reference

- https://firebase.google.com/docs/projects/dev-workflows/overview-environments
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
