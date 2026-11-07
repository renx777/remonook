# RemoNook sync protocol v2

The cloud owns acknowledged shared state. IndexedDB preserves local work and a
pending operation outbox; it is not an independently chosen workspace copy.
There are no user-facing conflict decisions or force-overwrite actions.

## Shared data

`src/sync-crdt.mjs` uses Yjs Y.Text for each bullet's text and character-range
formatting. Known record tables merge by stable ID, with field-level Y.Map
registers. Node location is one atomic parent/position value. Calendar reminders,
study folders and Workdays policies use keyed data; date metadata merges by field.
Browser-only collapse and calendar-view state stays local.

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
