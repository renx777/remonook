# Development, staging and production

## Current state

Staging, 7 November 2026: sign-in for AI apps (OAuth) is on staging. `cloud/mcp-oauth.sql` was applied to D1
`remo-sync-staging`. `remo-sync-staging` version `86cc6d0d-3c3e-419e-aebf-5f96e5621f5b` and the staging frontend
(workflow run on `ccr-641b18bf-2fe80f`) were deployed. Discovery, registration, the authorize redirect to the consent screen and the
consent screen itself were checked live. Production is not yet updated.

Production frontend moved off ChatGPT Sites, 7 November 2026 (owner-authorized):
- `remonook.com` is served by Cloudflare Worker `remonook-production`, deployed by the "Production frontend" workflow
  (run #2) from `main` at `13354fe` (release `2026-11-06.1`, offline shell `8b03319a6504`).
- The custom domain `remonook.com` was attached in Cloudflare, replacing the apex A records that pointed to Sites.
  Rollback: remove the custom domain and restore `A 172.66.3.26` and `A 162.159.143.30` (DNS only).
- `www.remonook.com` keeps its redirect to `remonook.com`. The Sites URL `remo-notes.arenukaprasad.chatgpt.site` still
  serves the old `2026-11-02.2` release; retire or redirect it later.
- Verified on `remonook.com`:
  - release marker, security headers, `sw.js` revalidation and immutable assets;
  - browser load with no errors; service worker registers;
  - the sync API accepts the `remonook.com` origin;
  - the owner confirmed sign-in and sync.

Sync Worker CPU limit, 7 November 2026: sync saves validate the whole shared workspace and were being cut off by the free
plan's CPU limit (`503 exceededCpu`). Staging had been affected since 4 November; production started failing most saves
after the new release. The account moved to **Workers Paid**. `remo-sync` (version `9a9914a8-3561-4552-a1b4-aa1339e9e975`)
and `remo-sync-staging` (version `c79ae554-cb25-4c84-8fae-d4d7c6c44ca5`) were redeployed with unchanged code from
`13354fe` and `limits.cpu_ms = 30000` (now in `cloud/config.json` and `cloud/config.staging.example.json`). After the
redeploy, production showed no CPU cut-offs and queued device edits synced.

Production sync Worker, 7 November 2026: `remo-sync` was deployed from `main` at `13354fe` (PR #66; Worker
version `305f8bb6-4151-425b-a2db-9a395bb3764d`, Wrangler 4.157.0, `cloud/config.json` unchanged from the live
bindings). Before deploying, a D1 Time Travel restore point was recorded for `remo-sync`
(bookmark `0000016c-00000000-0000511c-24e0adf507c4a652135b70b1b823e1f5`, 06:31 UTC), then the additive
`cloud/bookmark-snapshots.sql`, `cloud/ai.sql` and `cloud/mcp.sql` were applied. `/health` reports
`workdaysSchema: 2`, `bookmarkReader: 1` and `mcp: 1`; AI assist and bookmark capture stay disabled in production
(no bindings). The owner authorized this release and publishes the matching production frontend
(`npm run build:production` from `13354fe`) through Sites. That frontend build was verified in a clean checkout of
`13354fe`: 460 tests pass; the marker is `2026-11-06.1`; the offline shell is `8b03319a6504`; the build uses only the production sync API, with no
staging references. It is packaged as `remonook-production-13354fe.zip`. As of this record it is not yet published:
both production URLs still serve `2026-11-02.2`, which is the rollback reference. The production frontend must not be older than this
server's release for Workdays v2 sync.

On 7 November 2026 (later the same day), `remo-sync-staging` was deployed from `ccr-641b18bf-2fe80f`,
application commit `1255d38` (Worker version `3560885b-2726-4bed-932e-76628872d523`, Wrangler 4.157.0), adding
connected AI apps (MCP). The additive migration `cloud/mcp.sql` (tables `mcp_tokens`, `mcp_activity`) was applied
to D1 `remo-sync-staging` first. The config was built from `cloud/config.staging.example.json` with AI assist kept
enabled, as it was live; bindings and secret names are unchanged. `/health` reports `mcp: 1` and
`googleTasksConfigured: true`; `/mcp` refuses requests without an access token. The deploy used a Cloudflare API
token stored as a network secret on the owner's personal cloud environment, never in the repository. The staging
frontend for the same commit was deployed by the staging workflow. Production is unchanged. See [MCP.md](MCP.md).

Earlier on 7 November 2026, `remo-sync-staging` was redeployed from
`ccr-641b18bf-2fe80f` at `f341221b77c0f96f4b63f503bf2cf6a37b2de976`, matching
the live staging frontend source (release `2026-11-06.1`). Worker version
`6ed9c98d-5e1c-4f11-8171-662d80b64c39` serves 100% of staging traffic.
The connected Cloudflare account deployed the Wrangler 4.157.0 dry-run bundle;
no CLI deployment token was available. All live bindings and secret names,
variables (including enabled AI), compatibility settings, observability and
cleanup cron were retained. Health confirms sync protocol 2, Workdays schema 2,
AI Assist 1 with AI enabled, Bookmarks reader/capture, books and Google Tasks.
Unauthenticated sync returns 401. Eleven backend regression test files and the
sync-rejection reproduction passed; CI also passed for the deployed source
([run 42338608126](https://github.com/renx777/remonook/actions/runs/42338608126)).
No migrations were needed, and no frontend or production deployment was performed.

Frontend release `2026-11-06.1` on `ccr-641b18bf-2fe80f` (application commit
`326aaa5`) adds persistent All / Notes / Calendar quick-access tabs, groups All
as Calendar → Flashcards/MCQs → Mindmaps → Bookmarks → Docs → ordinary notes,
and replaces mindmap library icons with bounded SVG snapshots of their actual
branches and styles. Notes excludes special-content subtrees while retaining
ordinary siblings in mixed pages. These are presentation filters: saved parents
and positions are unchanged. Daily notes uses the canvas background without a
frame. The full suite passes 135 files; Chromium acceptance covers mobile filters,
group order, real previews, keyboard tabs, and unframed daily notes in both themes.
This is a frontend-only staging release; the verified sync Worker below is retained.
Deployed frontend source: `1fea6a1e0ca3aca034618ee8c3086fbcbd1ac35c`, confirmed
by `/staging-source.json`. Both [staging run 42223022322](https://github.com/renx777/remonook/actions/runs/42223022322)
and [CI run 42222995319](https://github.com/renx777/remonook/actions/runs/42222995319)
passed. Chromium checks also passed against the deployed build using synthetic
guest notes, including mobile grouping, filtered editing views, keyboard tab
navigation, real mindmap snapshots, and borderless calendar notes in both themes.
The sync server was not redeployed, and production remains unchanged.

Staging sync recovery release `2026-11-05.2` uses branch
`ccr-641b18bf-2fe80f`, application commit `081280c`. The sync Worker was deployed
separately on 5 November 2026: version `242ad50e-7d15-40e1-9bbe-b02791a3b7f0`,
100% traffic. Health confirms `syncProtocol: 2`, `workdaysSchema: 2`,
`aiAssist: 1`, `bookmarkReader: 1`, `aiEnabled: true`, article capture and Google
Tasks configured. D1/R2, all existing variables and secret bindings, observability
and cleanup cron were compared before/after and retained. The requested Wrangler
command could not authenticate in this execution environment; the connected
Cloudflare account uploaded the tested Wrangler bundle instead. The ignored
local config was absent and was reconstructed from live staging settings.
The matching **Staging frontend** workflow succeeded at frontend commit
`419442ff0a596305e8334e5fd9edd5b9c7194f04`:
[run 42083418657](https://github.com/renx777/remonook/actions/runs/42083418657).
`/staging-source.json` confirms that branch, commit and release. CI also passed
on that commit ([run 42083391600](https://github.com/renx777/remonook/actions/runs/42083391600)).
The full local test suite passed all 134 files; `node tests/repro-sync-rejection.mjs`
accepted every batch. A live staging test using two separate synthetic actors
confirmed concurrent edits converge, both outboxes are acknowledged, and a
validation-rejected batch is preserved and accepted after automatic repair.
The owner confirmed the affected-account check succeeded on both devices:
both reached **Synced** and the previously pending edits appeared on both.
Production remains unchanged.

The Bookmarks preview (`feature/bookmarks`, release `2026-11-04.1`) is intentionally limited to local development and staging at the owner’s request. Production stays on its existing deployed release. Do not publish this preview through Sites. See [BOOKMARKS.md](BOOKMARKS.md) for staging-only backend bindings, migration and local cloud development.

GitHub `main` is the source for every environment. Release `2026-11-02.3` includes the flashcard editing, interactive mindmap, bulk actions and pane improvements from `678e82c`, plus an update notice for older open app sessions. `/release.json` identifies the release on each frontend. Sites uses a separate source-repository commit, whose application files must match GitHub byte for byte. Environment-specific build configuration, Firebase accounts, database contents and attachment buckets remain separate.

Do not publish changes only from the Sites checkout. Implement and test in the development checkout, commit to GitHub, wait for the staging workflow to succeed, then publish those exact source files through Sites. Before publishing, compare all tracked application files against the selected GitHub commit; exclude only generated `dist/` output and the Sites hosting manifest. After any emergency production edit, reconcile it into GitHub and the local checkout immediately, then wait for staging deployment before declaring the release complete.

Build production into a clean `dist/` using the production environment configuration; do not overlay individual new bundles onto an older build. The Sites archive and source commit must contain the complete matching build, including new generated files ignored by the canonical repository. In the Sites checkout, explicitly stage generated output with `git add -f dist .openai/hosting.json`. A release marker alone does not validate JavaScript dependencies: test a fresh production browser session, flashcard editing and the lazy-loaded mindmap after publishing.

Open app sessions check the deployed HTML entry on focus, reconnect and once per minute while visible. A changed entry displays **Save & update**; it never reloads automatically. Updating waits for durable device saves and refuses to reload while a dialog, composition, upload or cloud adoption is in progress or saving has failed. Pending cloud uploads survive reload through the existing outbox. No user storage is cleared. Tabs opened before this notice was introduced need one ordinary reload to receive it.

| Environment | Frontend | Authentication | Sync and attachments |
| --- | --- | --- | --- |
| Local | Vite on localhost | Disabled | Device-only IndexedDB |
| Staging | staging.remonook.com | remonook-staging (Spark) | remo-sync-staging Worker, separate D1 and R2 |
| Production | remonook.com | Existing remo-978fb | Existing remo-sync and remo-attachments |

Staging is deployed at https://staging.remonook.com with Google sign-in configured in Firebase project `remonook-staging`. Email/password sign-in uses the same account and sync paths; enable its Firebase provider separately as described in [EMAIL-AUTH.md](EMAIL-AUTH.md). D1 `remo-sync-staging` has its schema initialized and R2 `remo-attachments-staging` is private. The sync API is https://remo-sync-staging.remo-978fb.workers.dev. See `cloud/staging-resources.json`. The initial deployment was made through the Cloudflare API. Automatic frontend deployment is now enabled for pushes to `main`: GitHub holds the encrypted `CLOUDFLARE_API_TOKEN` secret and `STAGING_ENABLED=true`. The token has **Individual Workers Editor** access to **remonook-staging only**, and expires on **23 January 2027**. Rotate and update the GitHub secret before that date. Production remains on Sites hosting.

## Local

`npm ci`, `npm run dev`. No environment file is required. Optional `.env.local` can be copied from `.env.local.example`. The default build is local-only too. Sign-in deliberately reports that cloud authentication is disabled; testing sync requires staging.

Development, staging and production must use different browser origins. Folder connections and browser data are local to an origin. Never point a developer folder connection at a production backup folder.

## Staging activation checklist

1. Create a new Firebase project and register a Web app. Enable Google sign-in and authorize `staging.remonook.com`. Do not reuse `remo-978fb`.
2. Reuse the existing staging D1 and R2 resources recorded in `cloud/staging-resources.json`. Never bind the production database or bucket.
3. Copy `cloud/config.staging.example.json` to an untracked `cloud/config.staging.local.json`. The checked-in example already identifies the actual staging resources. Apply `cloud/schema.sql` to the new database only.
4. Bundle `cloud/worker.mjs` as an ESM Worker with esbuild, or let Wrangler bundle it. Deploy with the explicit staging config. Verify `/health`, allowed origins, authentication and private user isolation. This Worker now requires `FIREBASE_PROJECT_ID` and `ALLOWED_ORIGINS`; missing configuration returns 503.
5. Copy the public frontend settings from `.env.staging.example` to `.env.staging.local` for a manual build. The GitHub staging workflow already performs this copy. The frontend refuses the known production Firebase project or sync API in staging.
6. Add a least-privilege Cloudflare deployment token as the GitHub repository secret `CLOUDFLARE_API_TOKEN` (the account ID is already pinned in the workflow). Do not paste the token into a file or chat. Restrict it to the individual `remonook-staging` Worker using **Individual Workers Editor**. The existing token expires on 23 January 2027; replace the encrypted GitHub secret when rotating it.
7. Create/attach `staging.remonook.com` to frontend Worker `remonook-staging` after its first deployment. `wrangler.staging.jsonc` serves `dist/`. The existing custom domain is managed in Cloudflare; `workers_dev` and `preview_urls` are explicitly disabled, avoiding account-wide subdomain permissions for the deployment token.
8. Set GitHub repository variable `STAGING_ENABLED=true` only when all of the above is ready. The staging workflow then builds, tests and deploys pushes to main, or can be run manually. It deploys the frontend only; sync/schema changes need their separately reviewed staging deployment.

The actual staging `VITE_*` values are recorded in `.env.staging.example`. They are public build-time values. Environment files ending in `.local` are ignored. The deployment token is a secret.

Test with synthetic notes and test accounts. Verify Android phone, iPad, desktop, keyboard open/closed, offline reload, backup/restore and automatic concurrent merging before release. GitHub PR builds receive no deployment secrets.

## Production release

Do not enable GitHub auto-deployment to production yet. The existing Sites publication and domain must remain the active production route until a deliberate hosting migration.

### Who may release

Coding agents may prepare and execute production frontend releases with explicit owner authorization for each release (see AGENTS.md). Backend Workers, D1 migrations and infrastructure changes need their own separate authorization.

### How production is hosted

- Today `remonook.com` and `remo-notes.arenukaprasad.chatgpt.site` are served by ChatGPT Sites. The domain's DNS zone is in the owner's Cloudflare account; the Sites project lives in the ChatGPT (Codex) workspace under the git-ignored `.openai/`, not in GitHub. Only that workspace can publish a Sites version.
- **Moving off Sites (approved by the owner on 7 November 2026, in progress):** production moves to Cloudflare Worker `remonook-production` (`wrangler.production.jsonc`), mirroring staging's `remonook-staging`. `npm run build:production` writes `dist/_headers` from `cloud/production-headers`: nosniff, referrer policy, `sw.js` revalidation, immutable hashed assets.
  1. One-time owner setup:
     - create a Cloudflare API token with **Workers Scripts: Edit** for account `e9a5c70b…`, limited to what deploying `remonook-production` needs;
     - save it as GitHub secret `CLOUDFLARE_PRODUCTION_API_TOKEN`;
     - create the GitHub environment `production` with the owner as required reviewer.
  2. Deploy: run **Production frontend** (`.github/workflows/production.yml`) with the full SHA of an approved commit on `main`. It checks the commit is on `main`, builds cleanly, runs all tests, verifies the artifact and the production sync Worker, waits for owner approval, then deploys.
  3. Test at `https://remonook-production.remo-978fb.workers.dev`. That origin is not in Firebase authorized domains or the sync Worker's `ALLOWED_ORIGINS`, so it is for load, asset and header checks only.
  4. Switch: in Cloudflare, Workers & Pages → `remonook-production` → Settings → Domains & Routes → Add custom domain `remonook.com`. Cloudflare asks to replace the existing DNS record that points to Sites. The origin stays `remonook.com`, so offline data, the installed app, Firebase sign-in and sync are unaffected.
  5. Rollback: remove the custom domain and restore the previous DNS record to Sites (keep a note of it), or `wrangler rollback` to the previous Worker version.
  6. After a stable period: set `workers_dev` to false, then retire or redirect the Sites URL. Users of the `.chatgpt.site` address sign in again at remonook.com; their notes are in the cloud.

### End-to-end sync check (release gate)

`scripts/e2e-sync.mjs` (`npm run e2e:sync`) runs real browsers as separate devices against a
deployed environment, using a dedicated staging test account. It checks that:
- the first sign-in and a brand-new device delete nothing;
- a new device receives every note;
- edits and new notes reach the other device live;
- an offline edit stays pending, then syncs after reconnecting;
- concurrent edits to one bullet keep both and converge;
- a third new device sees the same notes.

It keeps five baseline notes on the account, removes only its own notes, and checks that the
account ends with exactly the notes it started with. It was confirmed to fail on the
2026-11-07 data-loss build (`9647a6a`).

- **Staging workflow:** runs it after every staging deploy.
- **Production workflow:** releases only when two things hold:
  - staging serves the same tree as the commit being released;
  - the check passes there.
- **Secrets:** `STAGING_E2E_EMAIL` and `STAGING_E2E_PASSWORD` (repository secrets). Never
  put the credentials in files.
- **Locally:** set `E2E_EMAIL` and `E2E_PASSWORD`. Set `E2E_CHROMIUM` to a browser path when
  the Playwright browsers are not installed.

### Procedure

1. Owner authorizes the release and names the commit on `main`.
2. Verify `main` is at that full SHA, and that CI passed on it and staging was checked from the same code.
3. If the release needs backend changes, they must already be deployed and recorded (server first, then frontend), with separate authorization. Record a D1 Time Travel bookmark before any production migration.
4. In a clean checkout of the commit: `rm -rf dist`, remove `.env.local`, `cp .env.production.example .env.production.local`, `npm ci`, `npm run build:production`, delete `.env.production.local`, `npm test`.
5. Verify `dist/`:
   - `index.html`, `manifest.webmanifest`, `sw.js` and `release.json` (expected marker) exist;
   - `grep -r remo-sync-staging dist/` and `grep -r remonook-staging dist/` find nothing;
   - the main bundle references `remo-sync.remo-978fb.workers.dev`.
   Package `dist/` as `remonook-production-<shortsha>.zip`.
6. Record the live version for rollback: `curl https://remonook.com/release.json` and the current Sites version number.
7. In the Sites workspace, confirm its tracked application files match the commit (excluding `dist/` and the Sites hosting manifest). Replace the whole generated build with the verified archive, keep the hosting manifest, and publish to both production URLs.
8. Verify:
   - `https://remonook.com/release.json` and the `.chatgpt.site` URL report the new marker;
   - the app loads without Firebase or sync errors;
   - sign-in works, and notes reach Synced;
   - the release's new features work;
   - older tabs show Save & update.
9. If a material problem appears, republish the recorded previous Sites version (frontend only). Leave Workers and D1 unchanged.
10. Record the Sites version, commit, date, URLs, checks and matching Worker version under "Current state" through a pull request.

If deploying this repository's sync Worker (separately authorized), use `cloud/config.json` intentionally: it identifies the existing production resources. Compare it with the live Worker bindings before deploying, and verify `/health` afterwards. Do not assume a frontend rollback undoes database writes or migrations.

## Cloud-first storage and legacy folder migration

- Signed-in workspaces use their existing account-scoped IndexedDB as an offline cache and the matching environment's cloud workspace for cross-device sync. Staging and production must continue to use separate Firebase projects, D1 databases and R2 buckets.
- Automatic folder ZIP writing, Syncthing-style copying, and associated UI were retired. On first opening the updated app per account/guest workspace, the legacy folder connection entry is removed from its separate IndexedDB settings store. This does not access, overwrite, or delete anything in the old local filesystem folder. The old ZIP archives remain compatible with manual Restore from backup.
- Signed-in clients use sync protocol v2: incremental Yjs rich-text updates, an atomic durable local outbox, backend acknowledgements, idempotent operation IDs and a server journal. Concurrent updates merge automatically. Users are never asked to choose a device/cloud copy or resolve conflicts.
- Local data and pending edits survive offline periods and reloads. Genuine storage, authentication or quota failures remain actionable. The toolbar has no animated cloud indicator or manual sync control.
- The additive v2 schema and backend are deployed independently to both staging and production. Old snapshot clients receive an update-required response after account migration. See [SYNC.md](SYNC.md) for migration, recovery and compatibility limits.
- Preserve the browser's regular IndexedDB workspace and attachments for offline editing; never purge them as part of retiring the folder option.

## Workflow and costs

The working flow is local → staging → production:

1. Develop on a feature branch and verify locally (`npm run build`, `npm test`).
2. Push the branch and run the **Staging frontend** workflow on that branch (`workflow_dispatch`) so it can be tested on phones and other devices. Staging may run an unmerged branch during testing; record which branch and commit are live there.
   This workflow deploys **only the frontend**. Deploy the sync server separately
   with `npx wrangler deploy --config cloud/config.staging.local.json` from the
   same tested branch. Keep that local config ignored; compare its bindings and
   plain variables against live staging first. Preserve secrets, enabled AI,
   Google Tasks, article capture, D1/R2 and scheduled cleanup. Verify `/health`
   after deployment (`syncProtocol: 2`, `workdaysSchema: 2`, `aiAssist: 1`,
   `bookmarkReader: 1`, with `aiEnabled: true` while staging AI is enabled).
3. Open a PR into `main` once testing passes. CI runs Node 24, `npm ci`, a local-only build and the full tests.
4. Merge to `main`. A push to `main` also deploys staging automatically.
5. Release production explicitly from `main`. Before doing so, confirm `main` contains everything staging has been running, so the release and staging match.

Several AI tools work on this repository; see the multi-agent section of [AGENTS.md](../AGENTS.md). Branch protection and deployment-review features depend on the GitHub plan and are not configured by these files.

Free-tier build and usage quotas apply across the account. Staging does not multiply those allowances. R2 and any other metered resources can generate charges beyond their included usage; no zero-cost guarantee is implied.

## Reference

- https://firebase.google.com/docs/projects/dev-workflows/overview-environments
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
