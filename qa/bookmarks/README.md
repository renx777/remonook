# Bookmark browser regression

This fixture uses an inert identity (`local-test-token`), synthetic pages, local SQLite/R2 substitutes and the real application/backend routes. It cannot authenticate to staging or production. It sends no email and requires no credentials.

1. `npm ci` and `npx playwright install chromium firefox webkit` (install host dependencies where needed).
2. `node qa/bookmarks/build.mjs`.
3. In another terminal, `node qa/bookmarks/server.mjs` (loopback ports 4193 and 4194).
4. `node qa/bookmarks/run.mjs`. Repeat with `BOOKMARK_QA_ENGINE=firefox` and `BOOKMARK_QA_ENGINE=webkit`.

Use `REMONOOK_CHROMIUM` to override the Chromium executable. `PLAYWRIGHT_MODULE` can point to a provisioned Playwright module. `BOOKMARK_QA_BUILD` changes the temporary build directory. The script exercises desktop and mobile viewports, capture/private storage, highlight-to-note, editing, adjustable crop preview, nonblank image pixels, durable reload and cached reading during a simulated cloud outage.

These are browser-engine checks, not a claim of physical iOS/Android device testing. Live signed-in staging smoke tests are separate and must never log credentials.
