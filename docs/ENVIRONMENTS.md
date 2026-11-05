# Development, staging and production

## Current state

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

Record the exact tested commit SHA, make independent data backups, then build using `.env.production.example` copied to `.env.production.local` and `npm run build:production`. An environment value in `.env.local` overrides mode files, so remove conflicting local overrides first. CI/release jobs should use explicit environment variables. Preserve `remo-978fb`, the existing D1 ID and R2 bucket when migrating hosting.

If deploying this repository's sync Worker, use `cloud/config.json` intentionally: it identifies the existing production resources and includes the new required environment variables. The parity release applies additive book/Google Tasks tables and deploys the same tested backend bundle to both environments, preserving their existing D1/R2 bindings. Production enables book uploads and hourly cleanup. Google Tasks remains unavailable in production until its own OAuth client and encryption secrets are configured; staging credentials must not be reused. Apply additive schema migrations before dependent application changes. Keep older clients compatible through the service-worker update window.

Publish the tested GitHub commit through the retained Sites workflow during transition, or later through a reviewed Cloudflare production workflow. Record a release tag and the frontend/backend versions. Do not assume a frontend rollback undoes database writes or migrations.

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
