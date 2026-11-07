# Sync v3 design: bucketed workspace state

Status: **proposal, awaiting owner approval**. Nothing here is implemented yet.
It extends the v2 architecture in [SYNC.md](SYNC.md) and keeps every rule in
`AGENTS.md`: automatic sync, backend acknowledgement and journal, durable outbox,
rich-text CRDTs, no user conflict decisions, no snapshot replacement.

## Problem

Every v2 request opens the account's whole Yjs document in the Worker, applies the
batch, projects and validates the whole workspace, and writes the whole state back.

Measured (synthetic workspace, Node, same code as the Worker):

| Encoded state | Notes JSON | Worker memory, retained / peak | CPU per commit |
|---|---|---|---|
| 6.8 MB | 2.3 MB | 61 MB / ~100 MB of 128 MB | ~1.7 s |

The owner's staging account (1,178 bullets, 469 cards) is at 4.9 MB of state. The
ceiling is about 7 MB, roughly 1,700–10,000 bullets depending on content and edit
history. Polls also re-open the whole state when the client lacks a capability header.
Storage size is no longer the issue (large values are in R2); memory and CPU per
request are.

## Key observation

The v2 CRDT layout is already keyed per record (`src/sync-crdt.mjs`):

- `rows` map: `[table,id] → exists`
- `fields` map: `["row", rowKey, field] → value` and root paths such as `["web", …]`
- `text:<rowKey>`: one Y.Text per bullet

Yjs items under different map keys or different root texts never reference each
other. So the document can be divided by key into independent Yjs documents without
changing merge behaviour: concurrent edits to one record always meet in the same
place. A bullet's location (`_syncLocation`), text and fields share its row key, so
moves never cross between parts.

## Options considered

1. **Cloud as an opaque relay** (server stores change logs, devices validate).
   Rejected for now: it removes backend validation and acknowledgement, which
   `AGENTS.md` requires to be preserved and extended. The AI apps connection would
   also need the full document per request again. It may return later for
   end-to-end encrypted spaces.
2. **Split the existing single document on the server only**, by rewriting Yjs
   binary updates (foreign items replaced by GC placeholders). No app change, but
   it relies on unsupported internals, and a mistake causes silent loss on clients
   that apply placeholder ranges before real ones. Too fragile for user data.
3. **Bucketed documents in protocol v3 (chosen).** Each account's state is N
   ordinary Yjs documents. The server and every device route each key to its bucket
   with one shared, deterministic function. Only standard Yjs APIs are used.

## Design

### Buckets

- `B = 64` record buckets plus root buckets. The bucket function lives in
  `src/sync-buckets.mjs`, shared by app, server and tests:
  - row data (`rows[k]`, `fields["row",k,…]`, `text:k`) goes to `fnv1a(k) mod 64`;
  - root fields go to a root bucket chosen by their top two path segments.
    `web.noteTimes` is split further by its third segment, because it has one entry
    per bullet.
- Each bucket is a normal `Y.Doc` with the same root types as today.
  `project(buckets)` merges the per-bucket projections; `applyIntent` routes each
  changed key to its bucket's document.
- A bucket holds about 1/64 of the account. At 100,000 bullets that is about
  1.5 MB of state per bucket.

### Storage (D1 + R2, no new services)

- `sync_buckets(uid, bucket, state, state_hash, vector)` holds each bucket's
  encoded state, inline or as an `r2:` pointer.
- `sync_documents` keeps one row per account with `revision`, the protocol version
  and the bucket-vector digest.
- `sync_journal` entries record `{bucket: update}` for the batch, so replay still
  reconstructs every accepted state.
- `workspaces.body` keeps the validated projection (notes JSON). It is needed for
  validation (below), for the AI apps connection and for bookmarks.
- One commit is one D1 batch: compare-and-swap on the account revision, the
  touched bucket rows, the journal entry and the projection. All buckets of a batch
  become visible together, as v2 batches do today.

### Protocol v3

`POST /sync/v3` sends `{operationId, updates: {bucket: base64}, vectors: {bucket: base64}}`:

1. The server loads only the touched buckets and applies their updates.
2. It projects only the changed records and patches them into the stored projection.
3. It runs the existing whole-workspace validation and repairs (`sharedSnapshot`
   rules) on that projection. Repairs are written as normal CRDT operations into
   the relevant buckets.
4. It commits and returns the deltas for buckets whose vectors differ from the
   client's.

`GET /sync/v3` returns deltas only for buckets newer than the client's per-bucket
vectors. Per-bucket vectors are stored, so unchanged buckets are never opened, and
`If-None-Match` on the account revision still answers unchanged polls with 304.
Operation IDs, request hashes, replay protection and response-loss safety work as
in v2.

### Validation cost

Phase 1 still validates the whole projection on each commit, but the projection
is about 6× smaller than the CRDT state and needs no Yjs objects. Estimated
ceiling: about 30,000–50,000 bullets, versus about 1,700–10,000 today. Phase 2
makes validation incremental, checking only changed records and what references
them, with an outline index (`id, parent, position`) for cycle checks. That
removes the ceiling.

### App changes

- `sync-outbox.mjs`: queued entries become `{bucket: update}`. Claim, ack and
  retry semantics are unchanged.
- `useCloudSync.ts`: keeps per-bucket vectors and merges per-bucket deltas.
  Polling and focus handling are unchanged.
- IndexedDB: the local, received and mapped states are stored per bucket in the
  same account-scoped transaction as notes. One transaction still covers a save.
- Recovery (`sync-recovery.mjs`) keeps its behaviour. Corrections are computed
  per bucket.

### Migration

1. **Server, per account, lazily on the first v3 request.**
   - Seed the buckets from the current validated v2 projection (new CRDT
     identities, like the v1→v2 import).
   - Keep the v2 state and journal untouched and read-only for recovery.
   - Journal a `__v3_seed__` entry.
2. **Updated app.**
   - Its pending v2 outbox is carried over by intent: project the local v2
     document with pending edits, then apply the difference against the last
     acknowledged projection to the v3 buckets with `applyIntent(..., rebase)`.
   - This is the same adapter that moved accounts from v1 to v2. Both sides of a
     concurrent text edit made during the switch are kept, as today.
3. **Old app versions on a migrated account.** They receive 426 "Update RemoNook
   to keep syncing", as the Workdays upgrade does. Their edits stay in their
   outbox until the app updates. v2 is never written again for that account, and
   a v2 PUT/POST cannot overwrite v3.
4. **AI apps connection, bookmarks, legacy GET.** These read the stored projection
   and write through a v3 `commitServerChange` that touches only the affected
   buckets.

Rollback: forward-only once an account is on v3, the same rule as for v2. The
retained v2 state keeps a recovery path.

### Limits after phase 1

- Per-bucket state bound: 4 MB.
- Projection bound: about 20 MB.
- Request bound: unchanged.
- Refused saves say how full the workspace is (already implemented).

## Verification plan

- **Bucket function:** deterministic across app and server, with every key of a
  record mapping to the same bucket.
- **Equivalence fuzz:** random edit scripts on 3 simulated devices in every arrival
  order. A v2 single document and a v3 bucketed document must give identical
  projections.
- **Existing v2 sync tests ported to v3:** concurrent rich text, delete vs edit,
  move cycles, attachments, response loss, reused IDs, offline reload, IME
  deferral, recovery.
- **Migration tests:**
  - an offline v2 device with pending text, move and delete edits converges after
    updating;
  - an old app gets 426 and keeps its outbox.
- **Load test:** 50,000 bullets, commit memory and CPU measured per request.
- **Staging soak:** migrate the owner's staging account and use it normally for a
  few days before any production request.

## Phases and estimate

1. Shared bucket function, bucketed `project`/`applyIntent`, equivalence fuzz.
2. Server v3 endpoints, storage, migration, `commitServerChange` on buckets.
3. App outbox, sync hook and IndexedDB per bucket; v2 outbox carry-over.
4. Staging deploy, migration of the staging account, soak.
5. Production: database migration, backend and frontend, each with explicit
   owner authorization.
6. Later: incremental validation (no ceiling); spaces and selective cloud sync
   build on the same buckets.

About 4–5 working sessions for phases 1–4.

## Open questions for the owner

- Approve option 3 (buckets) over the relay model for now?
- Is a one-time "Update RemoNook" prompt on old app versions acceptable during
  the switch?
