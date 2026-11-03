# Mindmaps and Calendar review

Scope: local and staging only; production is unchanged.

## Research and decisions

[MindMeister topic styling](https://support.mindmeister.com/hc/en-us/articles/360017494280-Customize-Your-Map-s-Appearance) separates node fill, borders and connecting lines, supports individual/branch styling and offers a reset. Its [text formatting tools](https://support.mindmeister.com/hc/en-us/articles/360017501000-Format-and-Stylize-Text) expose text size and colour separately. We adopt a focused topic inspector with fill/text/border colours, bold/italic, size and shape; users can apply changes to the selected topic or its entire branch. Automatic foreground contrast makes preset fills readable. Styles are stored separately from note content, and renaming retains marks on unchanged text. Large fonts increase layout spacing. Existing React Flow, D3 and Radix Popover cover these interactions; another graph library would add migration cost without solving the discovery problem.

The Mindmaps destination is now a searchable library of every original converted bullet, including nested roots. A bullet badge opens its map directly; global navigation opens the complete library. Opening a map retains an All mindmaps control. Map conversion flags are included in full backups alongside styles.

[Notion calendar views](https://www.notion.com/help/calendars) distinguish navigation, adding a page and displaying properties. We keep these separate: selecting a date is read-only; the first meaningful input creates a daily note. A native draft field remains mounted throughout initial typing, so committing the first letter cannot steal the caret. Each change updates the authoritative model and durable save flow; empty browsing and untouched composers create no hierarchy. The date picker opens at the month view, uses Radix positioning/focus/dismissal, and no longer exposes nonfunctional Range/Format/Remove date actions.

## Optional daily trackers

Daily trackers are opt-in single-choice fields shown on each selected calendar day. Workdays reuses the existing attendance/policy model, with WFH/WFO radios. Future selections are plans; past/today selections record attendance. Plans never silently become attendance. Advanced goals, leave, holidays, bulk planning and policies remain under Workdays planning & goals.

Users can add Mood, Energy and Exercise templates or define a named field with 2–8 options. There is no default answer. Choices have explicit Clear controls. Disabling a field retains history. Trackers do not create notes. Definitions and per-date answers use stable keys in shared web metadata, allowing the existing CRDT to merge independent dates/fields. Full backups retain definitions and answers; Android exports block unsupported web-only metadata instead of dropping it.

No existing empty journal records are deleted: blank notes may contain children, media or deliberate structure. The fix prevents new navigation-only records.

## Validation

Model tests cover validation, explicit clearing, disabled-history retention, independent tracker/date merges, branch styling, reset, readable foregrounds, rename formatting and full backup/restore. App regressions cover read-only date browsing, immediate durable first-note typing, all-map discovery and existing map editing/Workdays workflows. Native browser checks cover desktop/mobile layout, radio controls, custom fields, rapid initial typing, map discovery and styling.
