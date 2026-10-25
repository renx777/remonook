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
