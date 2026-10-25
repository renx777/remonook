# Workdays in Calendar — phase 1

Enable **Workdays** in Calendar. The optional layer provides Day/Month views, a compact monthly office goal, attendance and future plans, multi-date actions, holiday import and annual leave balances. Turning it off preserves its data.

## Records and plans

- Marking today or a past date records confirmed attendance. Marking a future date creates a plan.
- A plan never becomes confirmed automatically. On or after its date, use **Confirm** or mark what actually happened. The original plan is retained separately.
- Planned office days contribute to projected coverage, never completed progress. Unconfirmed past plans contribute to neither.
- Work status, note content and reminders are independent. Navigating dates with this layer enabled does not create note bullets. Use the daily note area to write.
- **Select dates** applies WFH, WFO, Leave, Holiday or Clear to a group. The top-bar Undo/Redo includes Workdays changes.

## Policy and calculation rules

Settings configure working weekdays, an optional employment start date, office targets and whether leave is excluded. Policies are effective-dated; a newer policy does not rewrite earlier dates. Saving an existing effective date explicitly replaces that policy version.

Only scheduled days on or after employment starts and covered by a policy qualify. Holidays are always excluded. Confirmed leave and future planned leave are excluded when configured; an unconfirmed past leave plan does not reduce the denominator.

Percentage targets are the ceiling of eligible days multiplied by the configured percentage. Fixed weekly/monthly targets are prorated for partial periods or policy segments using scheduled days, capped to eligible days. Full periods retain their fixed target even when holidays or leave reduce the available days, until that cap is reached. Contributions are summed and rounded up once for the selected month. The monthly view reports aggregate coverage, not a guarantee that every individual week meets a separate company requirement.

Leave balances distinguish confirmed usage from future reservations. Holidays, unscheduled weekdays, dates before employment starts and unconfirmed plans do not spend leave. Allowances are per calendar year; this release supports full days without accrual, half days or carry-over.

## Holiday import

Paste ISO dates, DD/MM/YYYY, DD-Mon-YYYY or Month D, YYYY with names. A bare year heading changes the default year; otherwise missing years use the selected calendar year. The preview lists invalid/duplicate lines and conflicts. Existing attendance, plans and different holiday names are skipped unless replacement is explicitly selected. Replacement affects Workdays records only and can be undone. Imports are limited to 366 valid rows per operation.

## Storage and compatibility

Versioned structured metadata lives in `web.workdays`, so existing account-scoped IndexedDB, cloud workspace sync, folder saving and full web backups retain it. Metadata is validated on local load/save, cloud download and backup restore. No new backend service or D1 migration is required. Android-format note export is blocked when Workdays metadata exists to prevent silent loss; use a full web backup.

This phase does not include background location detection, push notifications while closed, native widgets, Workday backup import, trend reports or long-weekend suggestions. These remain later phases.
