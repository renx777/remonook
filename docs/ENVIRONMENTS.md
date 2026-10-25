# Development, staging and production

## Current state

GitHub is the source for future development. Production is still the existing Sites version 43. No DNS, live Worker, database or bucket has been changed by this import. Do not edit the Sites checkout and GitHub checkout independently and deploy both: choose the tested GitHub commit as the source for the next release.

| Environment | Frontend | Authentication | Sync and attachments |
| --- | --- | --- | --- |
| Local | Vite on localhost | Disabled | Device-only IndexedDB |
| Staging (planned) | staging.remonook.com | New Firebase project | New Worker, D1 and R2 |
| Production | remonook.com | Existing remo-978fb | Existing remo-sync and remo-attachments |

Staging D1 `remo-sync-staging` and private R2 `remo-attachments-staging` have been created, with the schema initialized in D1. See `cloud/staging-resources.json`. Firebase and the staging frontend are still pending. `STAGING_ENABLED` must remain unset until provisioning and isolation checks are complete.

## Local

`npm ci`, `npm run dev`. No environment file is required. Optional `.env.local` can be copied from `.env.local.example`. The default build is local-only too. Sign-in deliberately reports that cloud authentication is disabled; testing sync requires staging.

Development, staging and production must use different browser origins. Folder connections and browser data are local to an origin. Never point a developer folder connection at a production backup folder.

## Staging activation checklist

1. Create a new Firebase project and register a Web app. Enable Google sign-in and authorize `staging.remonook.com`. Do not reuse `remo-978fb`.
2. Reuse the existing staging D1 and R2 resources recorded in `cloud/staging-resources.json`. Never bind the production database or bucket.
3. Copy `cloud/config.staging.example.json` to an untracked `cloud/config.staging.local.json`. Replace the project and database placeholders with the new resources. Apply `cloud/schema.sql` to the new database only.
4. Bundle `cloud/worker.mjs` as an ESM Worker with esbuild, or let Wrangler bundle it. Deploy with the explicit staging config. Verify `/health`, allowed origins, authentication and private user isolation. This Worker now requires `FIREBASE_PROJECT_ID` and `ALLOWED_ORIGINS`; missing configuration returns 503.
5. Set the frontend settings from `.env.staging.example`, either in `.env.staging.local` for a manual build, or as GitHub repository variables for the staging workflow. The frontend refuses the known production Firebase project or sync API in staging.
6. Add a least-privilege Cloudflare deployment token as the GitHub repository secret `CLOUDFLARE_API_TOKEN` and its account as repository variable `CLOUDFLARE_ACCOUNT_ID`. Do not paste the token into a file or chat. Scope it to the account and Worker deployment permissions required for this frontend.
7. Create/attach `staging.remonook.com` to frontend Worker `remonook-staging` after its first deployment. `wrangler.staging.jsonc` serves `dist/`.
8. Set GitHub repository variable `STAGING_ENABLED=true` only when all of the above is ready. The staging workflow then builds, tests and deploys pushes to main, or can be run manually. It deploys the frontend only; sync/schema changes need their separately reviewed staging deployment.

All required `VITE_*` names are listed in `.env.staging.example`. They are public build-time values. Environment files ending in `.local` are ignored. The deployment token is a secret.

Test with synthetic notes and test accounts. Verify Android phone, iPad, desktop, keyboard open/closed, offline reload, backup/restore and sync conflict handling before release. GitHub PR builds receive no deployment secrets.

## Production release

Do not enable GitHub auto-deployment to production yet. The existing Sites publication and domain must remain the active production route until a deliberate hosting migration.

Record the exact tested commit SHA, make independent data backups, then build using `.env.production.example` copied to `.env.production.local` and `npm run build:production`. An environment value in `.env.local` overrides mode files, so remove conflicting local overrides first. CI/release jobs should use explicit environment variables. Preserve `remo-978fb`, the existing D1 ID and R2 bucket when migrating hosting.

If deploying this repository's sync Worker, use `cloud/config.json` intentionally: it identifies the existing production resources and includes the new required environment variables. The currently deployed Worker does not change until such a deployment. Apply additive schema migrations before dependent application changes. Keep older clients compatible through the service-worker update window.

Publish the tested GitHub commit through the retained Sites workflow during transition, or later through a reviewed Cloudflare production workflow. Record a release tag and the frontend/backend versions. Do not assume a frontend rollback undoes database writes or migrations.

## Workflow and costs

Use short-lived feature branches and PRs into `main`. CI runs Node 24, `npm ci`, a local-only build and the full tests. Staging is opt-in; production is an explicit release. Branch protection and deployment-review features depend on the GitHub plan and are not configured by these files.

Free-tier build and usage quotas apply across the account. Staging does not multiply those allowances. R2 and any other metered resources can generate charges beyond their included usage; no zero-cost guarantee is implied.

## Reference

- https://firebase.google.com/docs/projects/dev-workflows/overview-environments
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
