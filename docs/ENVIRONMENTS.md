# Development, staging and production

## Current state

GitHub is the source for future development. Production is still the existing Sites version 43. Production DNS, Worker, database and bucket remain unchanged. Do not edit the Sites checkout and GitHub checkout independently and deploy both: choose the tested GitHub commit as the source for the next release.

| Environment | Frontend | Authentication | Sync and attachments |
| --- | --- | --- | --- |
| Local | Vite on localhost | Disabled | Device-only IndexedDB |
| Staging | staging.remonook.com | remonook-staging (Spark) | remo-sync-staging Worker, separate D1 and R2 |
| Production | remonook.com | Existing remo-978fb | Existing remo-sync and remo-attachments |

Staging is deployed at https://staging.remonook.com with Google sign-in configured in Firebase project `remonook-staging`. D1 `remo-sync-staging` has its schema initialized and R2 `remo-attachments-staging` is private. The sync API is https://remo-sync-staging.remo-978fb.workers.dev. See `cloud/staging-resources.json`. The initial deployment was made through the Cloudflare API. Automatic frontend deployment is now enabled for pushes to `main`: GitHub holds the encrypted `CLOUDFLARE_API_TOKEN` secret and `STAGING_ENABLED=true`. The token has **Individual Workers Editor** access to **remonook-staging only**, and expires on **23 January 2027**. Rotate and update the GitHub secret before that date. Production remains unchanged.

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

Test with synthetic notes and test accounts. Verify Android phone, iPad, desktop, keyboard open/closed, offline reload, backup/restore and sync conflict handling before release. GitHub PR builds receive no deployment secrets.

## Production release

Do not enable GitHub auto-deployment to production yet. The existing Sites publication and domain must remain the active production route until a deliberate hosting migration.

Record the exact tested commit SHA, make independent data backups, then build using `.env.production.example` copied to `.env.production.local` and `npm run build:production`. An environment value in `.env.local` overrides mode files, so remove conflicting local overrides first. CI/release jobs should use explicit environment variables. Preserve `remo-978fb`, the existing D1 ID and R2 bucket when migrating hosting.

If deploying this repository's sync Worker, use `cloud/config.json` intentionally: it identifies the existing production resources and includes the new required environment variables. The currently deployed Worker does not change until such a deployment. Apply additive schema migrations before dependent application changes. Keep older clients compatible through the service-worker update window.

Publish the tested GitHub commit through the retained Sites workflow during transition, or later through a reviewed Cloudflare production workflow. Record a release tag and the frontend/backend versions. Do not assume a frontend rollback undoes database writes or migrations.

## Cloud-first storage and legacy folder migration

- Signed-in workspaces use their existing account-scoped IndexedDB as an offline cache and the matching environment's cloud workspace for cross-device sync. Staging and production must continue to use separate Firebase projects, D1 databases and R2 buckets.
- Automatic folder ZIP writing, Syncthing-style copying, and associated UI were retired. On first opening the updated app per account/guest workspace, the legacy folder connection entry is removed from its separate IndexedDB settings store. This does not access, overwrite, or delete anything in the old local filesystem folder. The old ZIP archives remain compatible with manual Restore from backup.
- The existing cloud sync API still exchanges whole workspace snapshots protected by atomic revision compare-and-swap. Updated clients also cache the last confirmed workspace and attachment manifest per account for safe **three-way record merging** on divergent revisions. Separate bullet IDs and other stable-ID rows, metadata maps (e.g., `web.noteTimes`), and distinct attachment paths merge automatically. Simultaneous edits to the same record, invalid parent-child links, incompatible metadata, or same-path attachment changes enter the manual conflict workflow.
- The merge engine validates the combined outline and dependent records, takes a local recovery snapshot before uploading a merge, and checks server revision again when writing. A 409 means another device wrote first: do not overwrite, retry from its newer snapshot. Local browser edits made while a merge is uploading are never silently replaced.
- Legacy checkpoints (revision + key only) lack the common ancestor required for safe merging. The client seeds a baseline only after the device and cloud are confirmed identical; existing conflicts continue to require manual resolution. **Both devices must run the updated release and complete a clean sync to benefit consistently.**
- Always export a full backup from every device with important unsynced changes before resolving conflicts or changing browser storage. In a conflict, users can download the device and cloud versions separately and must confirm which version to retain. A local recovery snapshot is saved before replacing either version.
- This is an initial compatibility-safe record-level merge, not yet a per-node HTTP API, character-level collaborative editor, or CRDT. Reordering siblings concurrently and editing the same node on two devices can still require user review. Keep server changes and a possible future operation-log protocol as separately reviewed milestones.
- Preserve the browser's regular IndexedDB workspace and attachments for offline editing; never purge them as part of retiring the folder option.

## Workflow and costs

Use short-lived feature branches and PRs into `main`. CI runs Node 24, `npm ci`, a local-only build and the full tests. Staging frontend deployment is enabled; production is an explicit release. Branch protection and deployment-review features depend on the GitHub plan and are not configured by these files.

Free-tier build and usage quotas apply across the account. Staging does not multiply those allowances. R2 and any other metered resources can generate charges beyond their included usage; no zero-cost guarantee is implied.

## Reference

- https://firebase.google.com/docs/projects/dev-workflows/overview-environments
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
