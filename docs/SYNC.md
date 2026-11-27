# RemoNook sync protocol v2

> **Sync v3** ([SYNC-V3.md](SYNC-V3.md)) replaces the transport and storage described
> here: bucketed CRDT state in a Durable Object per account. The merge rules below still
> apply. Sections about whole-document validation, repair writes and recovery describe v2.

The cloud owns acknowledged shared state. IndexedDB preserves local work and a
pending operation outbox; it is not an independently chosen workspace copy.
There are no user-facing conflict decisions or force-overwrite actions.

## Shared data

`src/sync-crdt.mjs` uses Yjs Y.Text for each bullet's text and character-range
formatting. Known record tables merge by stable ID, with field-level Y.Map
registers. Node location is one atomic parent/position value. Calendar reminders,
study folders and Workdays policies use keyed data; date metadata merges by field.
Browser-only collapse and calendar-view state stays local.

Traits are ordinary bullets (a `traitsBlock: true` bullet whose children read `Name: value`),
so they merge like any bullet. Collection view choices (`web.traitViews`) are append-only
revision maps; the latest revision wins. NookTraits was removed from the app on 25 November 2026,
but its stored data (`web.nookTraits`, `web.noteProperties`) is kept and keeps syncing unchanged.
No protocol migration or server deployment is required. See [TRAITS.md](TRAITS.md).

Aliases are ordinary `Aliases: value, other name` Trait rows; reviewed unlinked
mentions insert a normal internal link through the saved outline mutation path.
They require no shared schema or transport change and survive existing sync and
backups. The account/workspace-scoped `-library-search` IndexedDB database is a
rebuildable, device-local extraction cache, excluded from shared state and backups.
See [LIBRARY-DISCOVERY.md](LIBRARY-DISCOVERY.md).

Concurrent rich-text insertions, deletions and formatting converge deterministically.
A merge can retain both competing words; it cannot infer the writer's intended
sentence. Node splits currently create/remove text across distinct node records;
there is no cross-block text-slice implementation. Same-field non-text changes
use Yjs register ordering, with all accepted operations retained in the journal.

Server normalization repairs move cycles and missing parents without deleting
notes. A concurrently edited deleted record is recovered; deleting after observing
that edit removes it normally. Concurrent attachment/deck references recover their
retained source note. Invalid shared data and quota failures are rejected without
acknowledging the pending batch.

## Recurring task initialization

Recurring task successors use deterministic row IDs and version-one immutable
creation records. On first insertion only, the CRDT writer integrates a frozen
initial update under a reserved high-range actor (ordinary session actors remain
uint32). Two offline completions therefore share initial character identities;
subsequent user edits use normal rich-text operations. Known/deleted creation
actors are never reseeded. This does not replace a workspace or existing text.
Keep the version-one factory and writer stable across releases.

Completion receipts at `web.taskRepeatReceipts[sourceId][patternId]` route to the
source bullet's bucket. They prevent retries and intentional successor deletion
from regenerating work. The v3 server reconciles old-client completions inside its
ordinary atomic commit/journal before acknowledgement. Existing outbox, backup,
undo, recovery and account isolation rules apply unchanged. See
[RECURRING-TASKS.md](RECURRING-TASKS.md) for dates, copies, mirrors and compatibility.

## Durable local operations

Each `save` transaction writes note records and their CRDT update into the same
account-specific IndexedDB transaction. One client actor is used per browser
session; reloads use fresh actors. This avoids both reused clocks and a new actor
for every save. Binary shared state, the local projection and received remote
state are retained separately, so incoming updates cannot erase active typing.

Before POST, the client persists a stable operation ID and the exact claimed
outbox IDs. Retries reuse that request. Acknowledgement removes only those IDs;
edits made during a request stay queued. Attachments upload before references are
submitted, and acknowledged hashes are not reuploaded on each text change.

The client starts sync 500 ms after a durable edit, polls visible tabs every two
seconds using state vectors/conditional requests, and resumes on reconnect,
foreground return and editor blur. Background mobile tabs may remain suspended
until reopened. Incoming content can apply to a focused editor with a CRDT-relative
caret; IME composition defers visual adoption. New typing during local adoption
queues behind the same persistence chain.

## Backend acknowledgement and history

`GET /sync/v2` returns missing Yjs updates, or 304 for an unchanged revision.
`POST /sync/v2` submits a claimed batch and state vector. Firebase authentication
and per-user database keys isolate users. The existing D1 database and private R2
bucket are retained for each environment.

A D1 batch atomically commits the new CRDT state, its operation journal entry and
the compatible workspace projection. Compare-and-swap retries serialize concurrent
writers. Replaying the seed plus journal deltas reconstructs accepted state. An
operation ID reused with different update bytes is rejected. A lost HTTP response
cannot cause the accepted edit to be applied twice.

Migration keeps the original snapshot in `sync_imports` and, when R2 is configured,
a private `uid/sync-recovery/<hash>.json` object. Seed state and incremental accepted
updates are retained in `sync_journal`. There is no automatic history pruning yet;
monitor journal growth and add checkpoint/archive retention before large-scale
rollout. Recovery storage is internal, not a required user sync workflow.

## Compatibility and rollout

Apply additive `cloud/sync-v2.sql` before deploying the backend, then release the
frontend. Authenticated accounts migrate lazily on their first v2 request. Legacy
snapshot writes remain supported for accounts that have not migrated. Once an
account has v2 state, legacy PUTs receive 426 and cannot overwrite it. Their local
edits remain in IndexedDB until the updated app imports them.

The legacy adapter maps changed snapshot text onto surviving server characters;
this one-time import cannot reconstruct CRDT identities that did not previously
exist. The original snapshot is retained. Unknown legacy formatting remains intact.
Later edits use shared CRDT identities rather than this adapter. If older code
writes to local storage, the next v2 pass captures differences against the last
mapped projection before adopting incoming state.

Do not roll the backend back to a v1-only worker after accounts migrate. Use a
forward fix, or a frontend version that still understands the v2 outbox. Keeping
schema changes additive does not make a protocol downgrade safe.

Limits: 3 MiB projected workspace and 7 MiB encoded v2 state per account, 2 MiB per
attachment and 20 MiB per account's stored attachment hashes; request batches are
bounded. The state bound is the real one: every commit loads the whole CRDT state into
the Worker (a 6.8 MB state peaks near 100 MB of the 128 MB isolate). A refused save
says how full the workspace is, and nothing is applied. Sign-in/storage/quota errors
stay actionable, and
pending work is never described as Synced.

### Large-value storage

A state or notes copy above 512 KiB is written to R2 (`FILES`) at
`<uid>/sync-store/{state|body}/<state digest>` before the D1 compare-and-swap, and
D1 stores `r2:<key>` in `sync_documents.state` / `workspaces.body`. Smaller values
stay inline, so existing accounts are unchanged until they grow. After each commit
attempt, objects no row references (superseded copies, or a lost CAS's own) are
deleted; a reader that finds its object already replaced re-reads the row. Every
reader goes through `loadStored`. This is forward-only: a Worker older than this
change cannot read `r2:` pointers, so never roll the sync Worker back past it.

## Permanent validation rejection recovery

A decoded, projectable batch rejected with HTTP 400 and
`SYNC_VALIDATION_FAILED` is recovered automatically. Network, authentication,
quota, attachment-upload and protocol errors do not take this path. A fresh GET
obtains acknowledged server operations; it never replaces the workspace.

Before retrying, one account-scoped IndexedDB transaction retains the immutable
rejected request, all pending operations, local/received CRDT states and the local
projection in a recovery entry. It merges server operations into the existing
CRDT, repairs only the failing validation domain against acknowledged values, and
adds readable copies of the affected content under **Recovered from this device**.
The exact recovery entry remains available as a download in Account settings.
This is automatic preservation, not a device/cloud choice or force overwrite.

The correction is another incremental Yjs operation. The replacement request
contains the original pending operations AND the correction, with a new stable
operation ID. Integrating the original structs preserves dependencies for later
edits. No pending ID is removed during recovery; only the server acknowledgement
of the corrected request can remove its claimed IDs. Edits during the request stay
queued. Storage failure rolls the transaction back; failed recovery/oversized
recovery stays visibly pending. Recovery itself is not an acknowledgement.
The server's recovery request marker skips only legacy Workdays reinterpretation;
the merged result still passes all ordinary validation, storage and attachment
checks. It does not rewrite the v2 switch marker or replace any shared snapshot.

A durable notice is delivered once after recovery is saved, explaining that some
content was preserved in recovered notes and sync is still pending. Reopening the
app does not repeatedly recover the same request. A second rejection of that
repair is surfaced rather than generating an endless chain of recovered notes.
Recovery entries are account-local and are never automatically pruned. Recovered
notes follow ordinary synchronization and backups.

## Workdays sender vectors and representation repair

Yjs updates include the entire historical delete set. When the server already
has Workdays v2, `workdaysLegacyIntent` checks whether the sender's state vector
includes the item that set `web.workdays.version = 2`. If so, removals already
deleted on the server are history, not a fresh v1 edit. New legacy insertions and
newly observed removals still require conversion. A client that has never seen
the v2 item retains legacy handling, including offline Clear actions.

For new outbox entries, retain the vector at authorship and the migrated context
of v1 Workdays edits. A claimed batch that mixes pre-switch and post-switch edits
uses the first legacy entry's authorship vector (`workdaysVector`) and the last
legacy context. Its ordinary `vector` remains the current response-delta vector.
Older immutable requests without this metadata continue using their original
`vector` and the existing context retry. Never rewrite a claimed request in place.
A batch containing its own v2 conversion already expresses that migration.

Shared validation repairs stray v1 policies/allowances and entry fields beside
v2 data, and repairs blank, oversized or non-string holiday names. Existing v2
slots win; an unambiguous legacy-only row becomes two half-day slots. Original
changed values are copied to recovered notes and the repair is journalled with
the accepted operation. Unsupported representations remain eligible for durable
client recovery; quota and storage failures are never acknowledged as success.

## Verification

Tests exercise actual React hooks with IndexedDB and SQLite-backed Worker routes,
three-client concurrent updates in every arrival order, independent formatting,
Unicode positions, journal replay, transaction rollback, duplicate/reused IDs,
account isolation, offline reload, response loss, edits during requests, IME
adoption deferral, attachment uploads and legacy write protection. A real Tiptap
application test verifies that a focused editor receives remote text, preserves its
caret and continues syncing subsequent typing.

## Reading originals

Books use a separate lazy file transfer path with a 25 MiB/file limit and 100 MiB
combined account quota. Existing attachment limits remain 2 MiB/file and 20 MiB
for the attachment category. See [BOOK-STORAGE.md](BOOK-STORAGE.md). Book metadata
uses the normal CRDT workspace; binary files are never included in note sync.

### Canvas web preview

Canvas layouts use generic root metadata (`web.canvases`), with board/card/edge IDs
as map keys. Position and size are atomic pairs; distinct cards and independent
fields merge through the existing v3 buckets. Editable card text is stored as
ordinary bullet rows under a board root, or references an existing source bullet,
and retains rich-text CRDT merging. Import creates a new board and backing notes;
it never replaces a snapshot or trusts imported workspace identities. Removing a
placement tombstones its metadata and connections, leaving note content intact.
Full web backups retain this domain; Android-compatible export explicitly refuses
to omit it. The durable outbox, acknowledgement and pending-status rules are
unchanged. See [JSON-CANVAS.md](JSON-CANVAS.md) for the preview's limits.

## Native study widget reviews

Android home-screen widgets and the desktop study window use an opt-in, private
presentation cache. They do not open another workspace writer or implement their
own FSRS scheduler. Each grade first becomes an immutable account/workspace-scoped
intent with a stable UUID, source fingerprint, question, answer and grade. Native
inbox files and failed desktop drafts survive process restarts and account changes.

The main app reconciles those intents through the existing study engine and normal
save/outbox path, after the active editor and pending save are idle. A successful
review adds `widgetEventId` to its ordinary review log; replay sees that durable
receipt and cannot grade again. Changed/deleted/incompatible cards preserve the
original question, answer and grade in ordinary **Recovered widget reviews** notes
and a receipt in `web.widgetReviewRecoveries`. This metadata and content are kept
by full backups; legacy Android-compatible export reports that a full backup is
required when widget receipts exist.

Only after the canonical save succeeds does the bridge publish the updated cache
and archive the native event. Publishing precedes archive so removal from the
pending queue cannot reveal an already-graded old cached card. A failed save or
cache refresh leaves the event pending for retry. Malformed records remain on the
device and report a neutral issue without blocking later valid records. Archived
evidence remains in private native storage; changing accounts or disabling widgets
clears presentation, never the pending inbox.

“Saved on this device · pending app” describes an enqueued widget action, not a
server acknowledgement. After application, the normal durable cloud outbox and
server acknowledgement still determine synchronization status. See
[NATIVE-STUDY-WIDGETS.md](NATIVE-STUDY-WIDGETS.md) and
[ANDROID-STUDY-WIDGET.md](ANDROID-STUDY-WIDGET.md) for platform boundaries and setup.

Widget presentation generation runs in a dedicated worker. Results are published
only if the account generation, original document identity and editor readiness
still match. A concurrent edit, worker failure or timeout leaves native review
acknowledgements pending; the canonical receipt makes the next retry idempotent.

## Android incoming shares

Android shares and selected-text actions first retain the original payload under
private native `remonook-shares/inbox`. They do not modify the workspace until the
user confirms the preview's destination. Before insertion, an immutable native
claim binds the capture UUID to that account/workspace storage scope. Native
inbox reads filter claimed captures before returning their text to JavaScript;
archive acknowledgement verifies that same scope.

The normal note/bookmark mutation stores an `androidShareReceipts` entry alongside
the inserted data in the canonical save. Its content fingerprint prevents repeat
insertion after a crash between saving and native acknowledgement; receipts contain
a hash and note identity, not another full copy of the passage. Failed persistence
leaves the native payload pending. The UI can retry the same capture and normal
undo remains available. Full backups preserve the receipt; legacy Android-format
export requires a full backup when these receipts exist. Native acknowledgement
archives the original payload after successful canonical persistence. It does not
acknowledge cloud sync; the normal durable outbox and server acknowledgement remain
authoritative. No sync conflict controls or shared-state replacement are added.

Dedicated-view outlines are projections of the existing bullets. They neither move
nor duplicate content. View mode and scope are UI state; all edits use the normal
editor, persistence, undo and CRDT paths. See
[ANDROID-SHARING-AND-VIEW-OUTLINES.md](ANDROID-SHARING-AND-VIEW-OUTLINES.md).


### Note templates, typed properties and launcher actions

Reusable templates and property data travel in ordinary `web` metadata through
v3 buckets, backups and the durable outbox. No replacement snapshot is introduced.
`web.noteTemplates[id].versions[editId]` retains previous template bodies;
`web.noteProperties` (version 1) stores shared definitions and per-note property
revision maps. Concurrent revisions keep both values and project a deterministic
latest value. A property form sends only its dirty fields. Renaming/archiving
never deletes values, options or earlier revisions. Mirrors resolve to the source
note's property identity. See [NOTE-TEMPLATES-PROPERTIES.md](NOTE-TEMPLATES-PROPERTIES.md).

Android Focus and text capture use distinct immutable events in the existing
private widget inbox; reviews retain their original schema and scheduler path.
Focus actions carry causal previous-event IDs and original session fingerprints;
changed targets preserve the action as an ordinary recovery note. Captures append
an idempotent Inbox bullet; colliding content is also retained in recovery notes.
Neither a local widget action nor a local app save claims cloud acknowledgement.
The broker archives evidence only after the existing durable save path succeeds.
See [ANDROID-STUDY-WIDGET.md](ANDROID-STUDY-WIDGET.md) for the exchange details.

## Optional task planning metadata

Tasks adds optional bullet fields `scheduledDate`, `taskPlanning`, `taskPriority`
and `taskDurationMinutes`; `dueDate` keeps its deadline meaning. Legacy absent or
null values retain their defaults without a document-wide startup rewrite. They
use the existing field-level CRDT/outbox paths, mirror propagation and note update
timestamps. Dirty-field planning forms do not write stale task text or completion.
Both v2 shared validation and v3 bucket projection validate these fields; malformed
values use the existing recovery path, retaining originals in recovery notes.

Full backups append optional columns only when used and retain sparse legacy
rows. The legacy Android-format exporter refuses to silently omit this metadata.
MCP supports planning changes with expected-version checks; legacy notes keep
identical version hashes. Existing current native clients preserve unknown fields.
No new SQL migration or snapshot replacement is required.

The existing v3 server transports optional bullet fields without a whitelist, so
web planning can be released independently after deployed cross-device checks.
The prepared sync-server update adds strict field validation/recovery and cloud
MCP planning controls; those server enhancements are not live until its separate
deployment succeeds. Health then reports `taskPlanning: 1` alongside
`syncProtocol: 3`. The separate manual CI staging-server job prepares an ignored
config from the current example, checks it against live resources, retains live
variables and secrets, then verifies bindings, schedules and enabled capabilities.
The **Staging frontend** workflow still deploys only the frontend.

## Calendar planning

Task time blocks add optional taskStartTime/taskBlockMinutes fields through the
existing task validation, backup, mirror, repair and MCP paths. Calendar series
completion writes a date-keyed completions boolean map as well as retaining the
legacy completed array. A map entry takes precedence over the old array; dates
merge independently through ordinary root CRDT leaves. Two offline completions
of the same date project one next occurrence of the single series, without
creating another note or inserting duplicate text. Reopen/undo retain normal
history. Browser delivery preferences/receipts are device/account-local and never
acknowledge cloud operations. Health calendarPlanning: 1 identifies this server.


## Calendar delivery and daily compatibility

Daily Calendar reminders retain `repeat: none` and add `daily: true`. New forms
write explicit false to turn it off. The v3 server preserves true if a legacy
form omits that unknown field while leaving the same nonrepeating enum; deletion
of the whole event and explicit false still apply normally. Dates, completion
maps, timeline edits and daily metadata use normal incremental shared storage.

Web Push subscriptions, VAPID private keys, device leases and delivery receipts
live only in private per-account server storage, outside the shared document,
MCP reads, ZIP exports and durable note outbox. They never acknowledge note edits.
A scheduling change nudges an alarm only after its normal journal commit.
Provider I/O runs outside the account's sync queue, and failed notification
attempts do not discard or block pending notes. See CALENDAR-PLANNING.md.


## Smart Collections

Collection source, sourceBranch and recipe are additive settings in the existing
append-only web.traitViews revisions and each saved view. They query the current
workspace projection, never replace it. Result rows are original bullet identities;
mirrors deduplicate to canonical sources and edits use normal source mutations.
Recipes create ordinary Trait bullets only for explicitly created new notes.
Full backups preserve the settings and previous revisions. No protocol migration,
new Worker or durable-outbox change is required. Older apps preserve the metadata
but display their existing direct-child views until updated.

## Attachment quota recovery

Design recorded before implementation; staging rollout only.

A 413 from attachment upload must not trap later text edits and explicit removals
behind an immutable in-flight request. A separate durable progress operation sends
only non-attachment buckets from the pending outbox. Its acknowledgement records
which bucket fragments progressed, but does not remove or rewrite the original
pending entries or claimed operation. Original batches replay normally after
capacity recovers. Until every original entry is acknowledged, status stays pending.
Progress operations retain their own stable identity and exact bytes across retries.

On a quota failure, a second durable progress lane sends only Yjs delete sets
from pending attachment operations. No new attachment structs are sent. These are
the device's already-recorded removals, including deletions of additions in an older
blocked batch; they are normal incremental CRDT updates, not a replacement manifest.
The client proposes obsolete hashes from known uploads absent from its staged
manifest. An authenticated v3 maintenance request runs in the account's serialized
Durable Object. It checks the latest manifest plus media, Trash, emoji/catalog,
study covers and reactions against retained path/hash associations. Active upload
leases protect reservations through manifest acknowledgement; a completed upload
can also be retired on an explicit device removal. Only unreferenced allocation records are retired, including legacy orphan
allocations discovered from the account-scoped storage index. Failed uploads
release unreferenced reservations; expired leases are recovered on quota retry.
Other devices' live references take precedence; no arbitrary document is adopted.

Stored R2 bytes are retained for recovery; this change does not hard-delete any
binary. Reusing a retained blob recreates its allocation under the normal quota
checks before accepting a new manifest reference. This makes accounting match
active retained attachments without destroying older/offline recoverability.
Physical retention/garbage collection remains a separate policy, not a sync fix.

Normal retries then replay the original immutable request. The server can apply
previously delivered deletion sets to the older attachment structs, so an addition
removed before upload does not block the account. No validation/network/auth error
is silently acknowledged, no outbox is discarded, and no force-overwrite/snapshot
replacement or user conflict choice is introduced. Existing limits stay enforced;
a genuinely full active library stays pending with an honest quota message.
