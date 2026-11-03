# RemoNook product requirements

## Automatic cross-device sync

The owner requires a seamless experience: users must never be responsible for
choosing a device/cloud copy or resolving sync conflicts. Do not add conflict
resolution, force-overwrite, or manual-sync controls to Settings. Ordinary backup
export/import remains a separate user feature.

Sync retries, ordering, merging and recovery are application responsibilities.
The v2 protocol uses backend acknowledgement/journaling, incremental operations
and rich-text CRDTs. Preserve and extend that architecture. Preserve
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
- **Production:** no agent deploys to production or edits the Sites checkout. Production releases are performed explicitly by the owner from `main`.
- **Merging:** a PR to `main` needs passing CI and a review by a different tool or person than the author where possible. Before a production release, confirm that everything on staging has been merged, so `main`, staging and production match.
- **Credentials:** never write tokens, keys or passwords into code, docs, commits or prompts. Deployment secrets live only in GitHub secrets.
- **Commits and PRs:** follow the attribution and PR-template instructions in your tool's own configuration. Do not include model names in commit messages or PR text.
