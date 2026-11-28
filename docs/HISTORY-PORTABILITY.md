# Phase 5: note history and portability

Design before implementation, approved Phase 5 scope. Web staging first; no
production or native release. No sync protocol/server change.

History is device-local, scoped to the existing account/workspace IndexedDB.
Each meaningful bullet change retains its before/after record, media metadata and referenced emoji definitions
inside the same transaction as notes and the durable outbox. It uses namespaced
keys in the existing recovery store, so there is no IndexedDB version change.
Collapse/position normalization alone does not create revisions. Remote updates
adopted on this device are also recorded; this is not a claim of server-wide
history or revisions that predate installation. No automatic pruning.

Immutable historical blobs are retained in that local store, independently of
current attachments, keyed by version and reused between text revisions. History
storage failure aborts the save rather than silently omit a revision. Restoring
creates an ordinary new note (and new media records) through the existing
mutation/save/outbox and undo path; it never replaces a snapshot or original
note and does not restore old scheduler state. A deleted note can be recovered
from the workspace history list. Mirrors resolve to source histories. Restored
copies retain the chosen bullet's text, formatting and local attachments; children
have their own histories rather than pretending every keystroke is a whole-tree
snapshot. Export/import history separately as a recovery ZIP to retain its blobs;
ordinary workspace backups are not implicitly advertised as including local history.

Portability exports a readable nested Markdown file and OPML, media files, an
import report and a versioned note/media sidecar. The sidecar preserves bullet
fields and internal identities for remapping; generic Markdown/OPML readers can
ignore it. It is not a full workspace/study-progress backup. Imports always add
a new branch with fresh identities, never replace existing notes. Imported note
links and mirrors remap within the imported tree; external/unresolved note links
are reported. Missing files, unsupported fields and metadata-only media are
reported, not silently claimed preserved. Plain Markdown reuses the existing
parser; plain OPML uses a non-executing XML parser with DTD/entities rejected.
ZIP parsing rejects traversal, duplicate/unsafe entries, oversized files and
expansion budgets before reading. File selection prepares a preview; only the
explicit Import action mutates notes. Recheck account/workspace and destination
at commit. Save failure keeps the prepared import for retry, using fixed imported
IDs to prevent duplicate insertion. No HTML execution or network fetching.

Tests: atomic journal/save rollback, reload/account isolation, delete/remote history,
restore/undo and attachment retention; Markdown/OPML nesting/formatting, note link
remapping, duplicate names, attachment byte round trips, unsafe XML/ZIP, import
reports, stale destination, retries and desktop/phone browser acceptance.


## Use

- Open a bullet and select **History** beside its heading. Choose a revision,
  inspect Before/After, then **Restore as new note**. The original remains intact.
  Undo removes the restored copy through ordinary note undo.
- Settings → Backups → **Markdown & OPML** contains portable export/import and
  workspace history, including deleted bullets. History export is scoped to the
  current bullet when opened from that bullet, otherwise the current workspace.
- Importing Markdown/OPML/portable ZIP first shows counts and warnings. Explicit
  confirmation adds a new root branch and an ordinary **Import report** note.
- Full workspace backups preserve scheduling/settings; portable notes packages
  intentionally contain note rows and media only. Export local history separately
  before changing devices or clearing browser storage. Import history ZIP adds
  recovery entries without changing notes.

## Bounds and limits

Portable archives are limited to 64 MiB expanded and 10,000 bullets; each import
must also fit a conservative 2 MiB encoded sync-operation preview. Split larger
imports. History archives are limited to 63 MiB expanded on export; individual
bullet history exports can be used when a workspace-wide archive is too large.
Local history retains all recorded revisions until browser/workspace storage is
removed; it is not a substitute for an exported backup or server-wide versioning.
Older revisions that predate this release cannot be reconstructed. Missing
historical blobs are reported and cannot be silently substituted with newer bytes.

Unresolved internal links become readable labels with their exact original link
stored in the import report, preventing accidental linking to an unrelated current
note with the same ID. Mirrors with absent sources become ordinary notes with a
warning. Imported recurring-task initialization is omitted with a report; reconfigure
recurrence on the imported task if wanted. Custom OPML attributes are preserved
as report text. No remote image/article is automatically downloaded.


Referenced animated/custom emoji definitions, artwork, posters and attribution
files are also retained in history and portable packages. Imports/restores reuse
only identical existing emoji definitions and refuse a token conflict instead of
overwriting either library. Attachment path collisions with different bytes also
refuse before a note commit. Use a separate workspace for conflicting libraries.


## Release verification — 28 November 2026

Web staging source fd424cdd7df6ba8a72a4104eadb8271505af6bf1, PR #122.
CI passed 802 tests; staging workflow 46111435602 passed all 22 signed-in sync
checks and the desktop/light + phone/dark guest acceptance. Phase 5 checks verify
revision preview, copy restore/undo, import preview/save/report, Markdown/OPML
export, reload, creation metadata and no page overflow. Ten focused storage/
portability tests include atomic rollback with the durable outbox, deleted media
and emoji bytes, remote adoption, unsafe XML/ZIP and legacy formatting preservation.

Strict ordinary-typing proxies passed 1,000/10,000-bullet desktop/phone cases;
the optimized 10,000-bullet phone-emulation result was 13.8 ms typing p95 and
207.5 ms Enter p95. Structural Enter remains slower. These are browser timing
proxies; physical-device input, native rollout and production remain unverified/
unreleased. This feature cannot reconstruct historical versions not observed by
the device and does not resolve the earlier test-account count discrepancy.
