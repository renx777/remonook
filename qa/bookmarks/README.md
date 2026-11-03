# Bookmark browser regression

This fixture uses an inert identity (`local-test-token`), synthetic pages, local SQLite/R2 substitutes and the real application/backend routes. It cannot authenticate to staging or production. It sends no email and requires no credentials.

1. `npm ci` and `npx playwright install chromium firefox webkit` (install host dependencies where needed).
2. `node qa/bookmarks/build.mjs`.
3. In another terminal, `node qa/bookmarks/server.mjs` (loopback ports 4193 and 4194).
4. `node qa/bookmarks/run.mjs`. Repeat with `BOOKMARK_QA_ENGINE=firefox` and `BOOKMARK_QA_ENGINE=webkit`.

Use `REMONOOK_CHROMIUM` to override the Chromium executable. `PLAYWRIGHT_MODULE` can point to a provisioned Playwright module. `BOOKMARK_QA_BUILD` changes the temporary build directory. The script exercises desktop and mobile viewports, capture/private storage, highlight-to-note, editing, adjustable crop preview, nonblank image pixels, durable reload and cached reading during a simulated cloud outage.

These are browser-engine checks, not a claim of physical iOS/Android device testing. Live signed-in staging smoke tests are separate and must never log credentials.

`node qa/bookmarks/touch-reader.mjs` uses Chromium touch events to check long press, app selection handles, copy/select-all/search, ordinary swiping, a 320 px toolbar and nested note actions. `node qa/bookmarks/mind-calendar.mjs` checks local calendar typing, read-only date browsing, trackers and mindmap styling; sync requests are isolated so synthetic notes from the other fixture runs cannot populate the tested empty day. These scripts still require real-device follow-up for Android contextual overlays and mobile keyboards.

`node qa/bookmarks/workdays.mjs` exercises the Workdays workspace, half-day leave, custom quotas, quarterly targets, routines, CSV imports and charts on desktop/mobile. It also imports text/scanned PDFs using the actual PDF.js/OCR pipeline. Provide `/tmp/workdays-holidays-text.pdf` and `/tmp/workdays-holidays-scan.pdf` with three rows (`2027-01-01 New Year`, `2027-05-01 Labour Day`, `2027-12-25 Christmas`). The scanned fixture should contain a rasterized copy of the text PDF, without embedded text. Sync traffic is isolated; fixture data cannot reach staging or production.
