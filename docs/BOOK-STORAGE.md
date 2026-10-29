# Book storage

Settings → Storage imports private PDF/EPUB originals. This release implements
storage for the upcoming reader; dashboard tabs and daily reading are separate.
Books download only when requested and cache in an account-scoped IndexedDB
separate from note attachments. No book binary enters Yjs, the durable note
outbox, or the normal attachment download loop. Device-only accounts must sign
in before adding books. There is no paid API or server-side document processing.

## Allocation

- 25 MiB maximum PDF/EPUB compressed file size; up to 100 active books per account.
- 100 MiB total combined cloud allocation, including ordinary attachments,
  pending book reservations, uploads in progress, and deletions awaiting cleanup.
- Ordinary attachments keep their 2 MiB/file and 20 MiB category limits. The
  existing SQLite assets constraint is unchanged.
- Each private original is stored once per account by SHA-256. Widget references
  do not duplicate files or change reading position. Different accounts remain
  isolated; there is no cross-account deduplication.

Reading metadata is `web.readingBooks`, keyed by stable book ID. It includes
filename, title, hash, format, size, creation time, position and deletion flag.
It uses normal workspace persistence, CRDT synchronization and full web backups.
Book originals are not embedded in workspace backups; the UI explicitly tells
users to download originals separately. Restoring metadata never downloads books
or blocks notes if the original is unavailable. Reimport the original in that
account when needed. Android export blocks rather than silently losing metadata.

## API and failure behavior

All endpoints require the existing Firebase identity; every object is scoped by
that verified UID. R2 objects use `uid/books/id`; ordinary attachments retain
`uid/hash`. Downloads force attachment disposition and octet-stream content.

- GET /storage: authoritative stored/reserved byte totals, limits, upload status.
- GET /books: ready original metadata only (maximum 100).
- POST /books: reserve `{id,name,size,hash}` atomically against both categories.
- PUT /books/:id: claim the reservation once and stream exactly the reserved
  byte length. R2 validates SHA-256; Workers never buffer/hash entire books.
- GET /books/:id: stream a ready private original; no automatic downloading.
- DELETE /books/:id: delete the object before releasing quota. This requires an
  explicit user confirmation and leaves a deleted identity to prevent replay.

Pending reservations expire after 15 minutes; uploads expire after one hour,
with a maximum ten-minute transfer. Cleanup runs hourly, processing 25 expired
records at a time, and on the account's storage/reservation requests. Failed R2
deletions retain allocation until cleanup succeeds. Uploads in progress cannot
be deleted or claimed twice. Lost responses recover ready books through the
metadata listing; reopening Storage registers missing metadata in the workspace.

## Staging rollout

1. Apply additive `cloud/books.sql` to the staging D1 database only.
2. Deploy the matching Worker, preserving existing bindings and all secrets.
3. Explicitly set `BOOK_UPLOADS_ENABLED=true` for staging. Missing or any other
   value pauses new book reservations and transfers, while allowing reads,
   progress sync, storage status and deletion.
4. Set cleanup schedule to `17 * * * *` (hourly at minute 17 UTC). The same
   scheduled handler also cleans expired Google Tasks handoffs and receipts.
5. The frontend release gate requires `/health` to advertise `bookStorage:1`.
6. Deploy the frontend after backend verification. Production is a separate
   release with its own schema, bucket and operator switch.

## Free allowance operations

R2 Standard includes 10 GB-month storage, 1 million Class A and 10 million Class B
operations monthly across the Cloudflare account; egress is free. Current
pricing: https://developers.cloudflare.com/r2/pricing/ . Workers and D1 have
separate daily limits. These app quotas are not a billing cap.

Review the R2 account overview before launch and daily while onboarding readers;
check all production/staging/other buckets, not just the book prefix. Review
storage and operation metrics at **6,000,000,000** and **7,000,000,000 bytes**.
At **8,000,000,000 bytes**, pause book uploads by setting the plain-text variable
`BOOK_UPLOADS_ENABLED=false` on every deployed sync Worker. Cloudflare Settings
→ Variables and Secrets → Deploy applies the switch. Existing downloads and
notes remain enabled. Only resume after usage is below 7 GB and temporary uploads
and stored originals have been reviewed. Check operation allowances as well as
storage; seek an explicit cost decision before enabling any paid upgrade.

Monitoring and switching are operator-managed in this initial release. Billing
metrics are delayed, and GB-month uses daily peaks; deleting files does not undo
storage already metered. The 2 GB buffer reduces exposure but cannot guarantee
zero charges. Do not auto-delete user originals to stay under a threshold.
