# RemoNook product requirements

## Automatic cross-device sync

The owner requires a seamless experience: users must never be responsible for
choosing a device/cloud copy or resolving sync conflicts. Do not add conflict
resolution, force-overwrite, or manual-sync controls to Settings. Ordinary backup
export/import remains a separate user feature.

Sync retries, ordering, merging and recovery are application responsibilities.
The v3 protocol (docs/SYNC-V3.md; bucketed state, one Durable Object per account)
uses backend acknowledgement/journaling, incremental operations and rich-text CRDTs. Preserve and extend that architecture. Preserve
both sides of concurrent edits; never silently discard one version to remove a
warning. Prefer automatic convergence, and keep recovery history out of routine
sync flows. An optional future note history is not a required sync decision.

A pending update must not be described as Synced. Genuine storage, sign-in or
quota failures may need an honest, actionable status. Do not conceal those errors.
Never reintroduce snapshot replacement for migrated accounts or remove the durable
outbox as a workaround. See docs/SYNC.md for migration, limits and rollback rules.

## Environment parity

GitHub `main` is the canonical application source. Keep the local development
checkout, staging and production on the same tested application release when
releasing changes. Stage and validate before publishing production. If production
is edited first, reconcile the exact changes into GitHub and the local checkout
and verify the staging deployment before declaring completion. Preserve distinct
environment configuration, Firebase projects, databases and buckets; source parity
never means copying production user data into staging. See docs/ENVIRONMENTS.md.

## Multi-agent and environment workflow

Several AI tools (Claude Code, Codex and others) work on this repository. These rules apply to all of them.

- **Flow:** local → staging → production. Develop on a feature branch, test locally, then push the branch to staging to test on a phone or other device. Production is released only from code merged into `main`.
- **Branches:** never commit directly to `main`. Start each task from the latest `origin/main`. Use one branch per task, named for its tool or topic (e.g. `codex/…`, `ccr-…`, `feature/…`).
- **Ownership:** before editing, check `git log origin/main..<branch>` and any open PRs for work already in progress in the same area. Do not rewrite or force-push another agent's branch.
- **Staging:** staging runs one branch at a time. Record the branch, commit and release on each staging deploy, and tell the user which branch is live there. Do not replace a branch someone else is testing without asking.
- **Production (frontend):** Claude Code, Codex and other authorized coding agents may prepare and execute production frontend releases, under these rules:
  1. Every production release needs explicit owner authorization for that release. Authorization for one release does not carry over to the next.
  2. Release only a specific approved commit that is already merged into GitHub `main`. Name its full SHA in the release record.
  3. Before publishing, verify the source (exact commit, clean checkout, CI passed), the build (clean `npm run build:production`, tests) and the artifact. The artifact must use the production sync API, contain no staging endpoints or Firebase project, and include its HTML, manifest, service worker and offline shell, with the expected `release.json` marker.
  4. Keep the existing production hosting workflow (ChatGPT Sites) and its rollback mechanism. Record the previous published version before publishing, and roll back only the frontend if a release misbehaves.
  5. Do not deploy backend Workers, run database migrations or change production infrastructure (DNS, hosting, Firebase, bindings) unless the owner separately authorizes that specific change.
  6. After publishing, run smoke tests and report the release version, commit, deployment URL, test results and any failures. Never report unverified checks as passed.
  7. Never commit directly to `main`. Release records go in through a pull request.
  See "Production release" in docs/ENVIRONMENTS.md for the procedure.
- **Merging:** a PR to `main` needs passing CI and a review by a different tool or person than the author where possible. Before a production release, confirm that everything on staging has been merged, so `main`, staging and production match.
- **Credentials:** never write tokens, keys or passwords into code, docs, commits or prompts. Deployment secrets live only in GitHub secrets or in the owner's agent-environment secret store (for example a Claude Code environment network secret), never in files.
- **Commits and PRs:** follow the attribution and PR-template instructions in your tool's own configuration. Do not include model names in commit messages or PR text.
