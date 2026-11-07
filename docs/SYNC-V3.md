# Sync protocol v3: bucketed workspaces

Status: **implemented, on staging**. Production still runs v2 until it is released.
Rules from `AGENTS.md` still apply: automatic sync, backend acknowledgement and
journal, durable outbox, rich-text CRDTs, no user conflict decisions, no snapshot
replacement.

## Why

In v2 every request opened the whole account in the Worker. A 6.8 MB state needed
about 100 MB of the 128 MB isolate and about 1.7 s of CPU, so an account topped out
at roughly 1,700–10,000 bullets. v3 makes each save cost what it touches.

Measured with 50,000 bullets (44 MB of CRDT state in 267 buckets, Node, the same code):

| Step | v3 |
|---|---|
| App: find the change for one edit | ~2 ms (shared rows are skipped) |
| App: write it to its bucket | ~35 ms, 1 bucket sent |
| Server: commit one edit | 32 ms cold, 9 ms warm |
| Server: pull two revisions | 2 ms, 1 bucket returned |
| AI apps: search / open a page / list 5,000 pages | 46 ms / 2 ms / 164 ms, from projected records (whole document ~0.9 s, used only for writes and complex searches) |

## Model

The v2 CRDT layout is already keyed per record: `rows["[table,id]"]`,
`fields["row",key,field]`, `text:<key>` and root fields by JSON path. Yjs items
under different keys never reference each other. v3 therefore stores an account
as many ordinary Yjs documents ("buckets"), and routes every key to a fixed bucket
with one shared function (`src/sync-buckets.mjs`):

| Bucket | Holds |
|---|---|
| `b0`–`b255` | Row data by FNV-1a of the row key: text, location, fields. Also `web.noteTimes[id]`, which travels with its bullet. |
| `r0`–`r15` | Root fields by their first two path segments, so each settings domain (Workdays, dashboard, …) stays together. `r0` also lists table names. |
| `a` | Attachment manifest. |

A bullet's text, location and fields are always in one bucket, so moves never cross
buckets. Merging is identical to v2. A fuzz test with three offline devices checks
that every delivery order produces the same projection as a single v2 document.

**Read-time repair** (deterministic, never written back):
- a missing parent becomes a root;
- a move cycle is broken at its smallest id;
- invalid mirror links are dropped.

Every device and the server compute the same view, so the server does not need the
whole tree to accept a save.

## Server: one Durable Object per account (`cloud/sync-v3.mjs`)

`SyncSpace` uses SQLite storage:

| Table | Contents |
|---|---|
| `buckets`, `blobs` | Bucket states as binary, in 1 MB chunks. |
| `journal` | One entry per accepted batch: operation id, request hash and per-bucket updates. The last 5,000 are kept. |
| `records` | Projected rows (JSON) and per-row root entries, for the AI apps connection and other server readers. |

**Push** (`POST /sync/v3 {operationId, updates:{bucket:update}, since}`):
1. Opens only the touched buckets (from an LRU cache of about 24 MB).
2. Checks every changed record (bullet shape, dates, metadata), all root domains when
   a root bucket changed, and the attachments manifest (limits and uploaded hashes).
3. Commits the buckets, journal entry, records and revision in one transaction.
4. Replies with the deltas since `since`.

A replayed operation id is acknowledged once. Reusing it with other content gets 409.
A refused batch commits nothing.

**Pull** (`GET /sync/v3?since=`):
- Returns journal deltas merged per bucket, in pages of about 4 MB.
- A device older than the journal gets whole buckets page by page
  (`after`, `target`). Merging a whole bucket is idempotent.

**Live updates:** `GET /sync/v3/ws` (token in the query, because browsers cannot set
WebSocket headers) sends `{revision}` after every commit, using the hibernation API.
While it is connected, the app's 2-second poll becomes a 30-second safety net.

**Server-side changes** (AI apps): `commitServerChange` and `readServerDocument`
dispatch to v3 for v3 accounts. The tool runs on the projected document. Only the
changed keys are sent (`diffPatch`), and they are applied with text rebase onto
whatever devices committed meanwhile.

**Limits:**
- 8 MB per bucket;
- 1 GB per account;
- 4 MB per request;
- 2 MB per attachment and 20 MB of attachments.

A 100,000-bullet account is about 90 MB of state, or about 0.35 MB per row bucket.

## App (`src/sync-outbox-v3.mjs`, `src/data-store.ts`, `src/useCloudSync.ts`)

- **Same outbox semantics as v2:**
  - a stable operation id is persisted before sending;
  - claimed batches are acknowledged by id;
  - edits made during a request stay queued.
- **Bucket storage:** states live in the IndexedDB store `syncBuckets`, as
  `L:<bucket>` (this device's writes) and `R:<bucket>` (everything known). A save
  reads and writes only the buckets it touches, in the same transaction as the notes.
- **Diffing:** the app shares unchanged rows between document versions, so the diff
  skips them by reference and compares in place only the rows that changed.
- **Projection:** cached per bucket version, so only changed buckets are decoded.
- **First sync on a device:** an empty account receives the device's notes; otherwise
  the device adopts the account.
- **Refused batches are repaired automatically.** The app pulls, then runs the server's own
  checks (`src/sync-checks.mjs`) on the received document. An invalid field is reset, a
  failing settings key is removed, and invalid attachments are dropped. The originals are
  kept under "Recovered from this device", and one notice is shown. The correction is
  queued after the original edits and sent with a new operation id. If nothing needs
  repair, the server's reason stays visible and the edits stay pending.
- **After a sync with nothing new**, inspect returns at once. The assembled projection
  is reused, rows are shared instead of cloned, and read-time repair is copy-on-write.

## First use and compatibility

- **First v3 request for an account:** the space copies the account's v2 projection,
  if any, into buckets. It then marks the v2 row (`state_hash='v3'`), so older app
  versions get 426 "Update RemoNook" and cannot write v2 changes.
- **v2 outbox:** pending v2 edits on a device are not carried over.
- **Rollback:** forward-only, as for v2.

## Release order (production)

1. Deploy the sync Worker with the `SYNC_SPACE` Durable Object binding and
   migration (`cloud/config.json`).
2. Release the frontend.

The frontend speaks only v3. Releasing it before step 1 would stop sync.

## Next

- App: when remote changes arrive, the projection is still re-assembled (O(rows)). That
  is fine at tens of thousands of bullets; a per-bucket incremental merge could follow.
- AI apps: plain-word search, page reads and page lists query `records` (an expression
  index on `parentId`). Writes and searches with fields, OR or non-ASCII words still read
  the whole document.
- Spaces and selective cloud sync: add a space id to bucket names.
