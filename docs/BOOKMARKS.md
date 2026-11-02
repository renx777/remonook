# Bookmarks implementation

The Bookmarks tab saves public URLs, deduplicates fragments, filters by read/favourite/archive state, and opens saved reader snapshots. Article selections create linked quote bullets and optional child thoughts; notes can be edited beside the article. Citations reopen their source. Reader search, outline, appearance controls and screenshot selection/preview are included.

Capture uses Mozilla Readability with LinkeDOM in a service-bound Worker. The capture Worker has no storage bindings, no public workers.dev endpoint, and uses strictly-public fetch routing. Requests reject credentials, IP literals, local names and unsafe redirects, and have bounded HTML, image and time budgets. At most eight raster images are embedded within a 512 KiB aggregate budget. Client rendering uses DOMPurify. No page script executes. Unsupported pages remain usable bookmarks.

The authenticated sync Worker requires ARTICLE_CAPTURE and ARTICLE_RATE_LIMITER bindings. Without either, capture returns 503 while URL saving remains available. The rate limiter must be configured to 10 capture requests per 60 seconds per account. Deploy distinct capture services for staging and production; never copy account data between environments.

Current storage integration reuses durable attachment blobs (`articles/<sha256>.json`), so snapshots participate in existing atomic persistence, backup/restore and cloud synchronization. Each snapshot is limited to 2 MiB and currently counts against the existing 20 MiB attachment allowance as well as the combined account allowance. This differs from the proposed dedicated 100 MiB on-demand snapshot store: that storage migration, lazy download and independent garbage collection are not implemented yet. Removed bookmark metadata and referenced notes are retained; captures do not silently discard notes or highlights.

Remaining release gates: dedicated snapshot storage, mobile screenshot adjustment handles, cross-browser capture validation, robust ambiguous-anchor recovery, bookmark-specific backend isolation/quota tests, extraction deployment and environment parity. The feature is not production-ready until those gates pass.

## Verified implementation increment

TypeScript passes and all 114 test files pass. Native Chromium verified guest URL saving, opening a seeded immutable snapshot, text selection, automatic linked note creation, screenshot preview encoding and saving a screenshot attachment. Extraction fixtures cover content parsing, absolute links, local-address rejection and unsafe redirects. Existing durable storage, sync and typing checks pass.

These checks do not constitute production capture activation or cross-browser/mobile sign-off. No production deployment was made for this increment.
