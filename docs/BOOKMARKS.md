# Bookmarks — local and staging

Bookmarks saves public URLs and immutable article snapshots, with a searchable library, tags, read/favourite/archive filters, a reader, source-linked quote notes, editable side notes, article search/outline, reading position and screenshot crop/preview/save. Removing a library item keeps source-linked notes readable. Bookmarks and article libraries are distinct from Bookshelf.

The library uses a quiet, serif article list with optional cached thumbnails, source/reading-time metadata and source-linked note counts. Secondary actions live in an accessible overflow menu. Mobile navigation scrolls horizontally with four tabs visible and reveals the active tab. Side notes reuse the Notes rich-text editor, colour/highlight palettes, rough annotations, headings, quotes, mask, code and undo/redo; rich formatting survives reload and sync. Only the active side note mounts an editor. Thumbnails are derived from privately embedded article images in the account-local cache, never remote tracking URLs or the shared sync document.

Mobile reading uses a full-screen, width-constrained serif article with compact controls. Floating UI anchors selection tools on desktop; the mobile selection toolbar is docked clear of native selection handles, with highlight swatches and an optional comment. Radix provides the accessible mobile notes sheet, with a single title and one source-linked card per note; highlight navigation/removal is integrated rather than duplicated in a separate quote list.

## Capture and storage

The authenticated staging sync API exposes `POST /bookmarks/capture`, plus authenticated `GET`, `PUT` and `DELETE /bookmarks/snapshots/:sha256`. Capture requires `ARTICLE_CAPTURE` and `ARTICLE_RATE_LIMITER` bindings. The rate limiter allows 10 capture requests per 60 seconds per account. Invalid or unsupported pages remain saved links with Retry reader and Open original.

The capture Worker has no storage/secret bindings and no public workers.dev or preview endpoint. It uses strictly-public fetch routing, rejects IP literals/local destinations/URL credentials/unsafe redirects, does not execute page scripts, and bounds HTML, redirects, images and processing time. Readability + LinkeDOM extracts content. Up to eight raster images are privately embedded within a 512 KiB aggregate image budget. DOMPurify sanitizes browser output; remote image URLs are not loaded from saved content.

Snapshots are private R2 objects with D1 ownership/quota/lifecycle records. The byte limit is 2 MiB per snapshot. Atomic reservations share the existing 100 MiB account allowance with books and attachments; snapshots do not consume the legacy 20 MiB attachment allowance. Failed or abandoned pending saves retain quota until scheduled cleanup deletes the object successfully. Ready snapshots referenced by bookmarks (including removed records) or source notes cannot be deleted through the snapshot endpoint. This deliberately favours retaining source material over aggressive garbage collection.

Article bodies do not enter note sync or its attachment manifest. Devices download snapshots only when opened and cache them in separate account-scoped IndexedDB stores with checksum validation. Cards distinguish Saved link, Download on open and Available offline. Full backups include locally cached snapshots and explicitly identify unavailable snapshots. Restore validates/imports cached bodies; signed-in restore uploads article bodies before publishing their references. A signed-in restore containing articles requires a connection; guest restore remains local.

Highlights store offsets, exact quote and surrounding context against an immutable snapshot. Offset recovery is preferred, context matching is used when needed, and ambiguous passages are not attached arbitrarily. Quotes and comments are committed alongside their source metadata. Ordinary note edits do not change original quotes. Reading sources distinguish books from webpages without changing PDF/EPUB formats.

## Local cloud development

`npm run dev:staging` serves the local app at `http://127.0.0.1:5173` using the public staging configuration. It uses staging accounts/storage, never production. The staging API allows that loopback origin and `http://localhost:5173`. Google popup sign-in also requires the selected loopback hostname in Firebase authorized domains. `npm run dev` retains device-only local development.

## Staging rollout

1. Apply `cloud/bookmark-snapshots.sql` to **remo-sync-staging** database `8343200b-cb13-4d6a-a165-d6881873e306` only.
2. Deploy `remonook-article-capture-staging` from `cloud/article-capture-worker.mjs`; keep its public endpoint disabled.
3. Deploy the sync backend with existing staging D1/R2, authentication and Google Tasks settings preserved, adding the capture service and rate-limit bindings from `cloud/config.staging.example.json`.
4. Require `/health` to report `bookmarkReader:1` and `bookmarkCapture:true` before the staging frontend deploys.
5. Build/test the exact feature commit and dispatch the Staging frontend workflow for `feature/bookmarks`. Production is not part of this rollout.

## Verification

Node tests cover URL deduplication, safe article extraction, redirect rejection, quote-note idempotence, private snapshots, account isolation, atomic combined quotas, failed-write cleanup, cache integrity, backups, source anchoring and ordinary editor/storage/sync regressions. See `qa/bookmarks/README.md` for a repeatable credential-free browser fixture using actual backend routes, synthetic content and a local test identity.

Browser-engine checks are not physical-device certification. Live signed-in staging verification is separate and must not log credentials. Production publication remains a separate explicit action.
