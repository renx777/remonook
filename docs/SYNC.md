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

Existing limits remain: 900 KiB projected workspace, 2 MiB per attachment and
20 MiB per account's stored attachment hashes. V2 encoded state has a 6 MiB bound;
request batches are bounded. Sign-in/storage/quota errors stay actionable, and
pending work is never described as Synced.

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
