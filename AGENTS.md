# RemoNook product requirements

## Automatic cross-device sync

The owner requires a seamless experience: users must never be responsible for
choosing a device/cloud copy or resolving sync conflicts. Do not add conflict
resolution, force-overwrite, or manual-sync controls to Settings. Ordinary backup
export/import remains a separate user feature.

Sync retries, ordering, merging and recovery are application responsibilities.
Upcoming sync protocol changes must move reconciliation and durable recovery into
the backend, with incremental operations and rich-text CRDT support. Preserve
both sides of concurrent edits; never silently discard one version to remove a
warning. Prefer automatic convergence, and keep recovery history out of routine
sync flows. An optional future note history is not a required sync decision.

A pending update must not be described as Synced. Genuine storage, sign-in or
quota failures may need an honest, actionable status. Do not conceal those errors.
This requirement is not a claim that the current snapshot protocol implements
CRDT merging: complete the versioned backend migration before making that claim.
