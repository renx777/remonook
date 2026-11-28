# Phase 6: weekly review, study goals and citations

Design recorded before implementation. Owner authorized the next roadmap phase.
Web staging first; no native or production deployment and no new server/schema.

## Weekly review

Tasks → Weekly review opens an explicit, read-only projection of canonical Inbox,
overdue deadlines, waiting tasks, the next seven days, recently edited notes and
spaced-review logs from the past seven local calendar days. Mirrors deduplicate.
Completed task totals are labelled all-time: task update timestamps are not
completion timestamps. Recorded response times are not total time spent studying.
A reviewed checklist and Wins/Next week draft stay account/workspace/week-local.
Only Save review note creates a normal #WeeklyReview note with links, recorded
summary and reflection; it never completes tasks or changes schedules. Stable
attempt IDs make retry safe. Saved review notes sync/back up normally.

## Study goals

Study Desk → Study goals creates a normal root #StudyGoal note with Traits and a
bounded snapshot of unintroduced card source links, up to 500 cards. Deck, target
date, daily minutes and optional seconds/card are ordinary editable Traits.
Progress uses spaced-review evidence for those original card identities. Deleted,
suspended, buried, moved and otherwise unavailable targets are reported separately,
not counted as completed. Source identity survives ordinary links and backups.

Planning uses current eligible/due cards, existing daily limits, recent valid
response-time samples or an explicit 45-second fallback. New cards reserve two
passes. Known scheduled work is a lower-bound estimate: future repeats/relearning
and real pace may add work; no promised exam readiness. Local calendar days, not
24-hour arithmetic, determine remaining days across DST. Goals never change FSRS,
due dates, retention or daily limits. Starting review uses the normal SPACED
session path and resumes an unfinished session without silently replacing it.
The suggested new-card count is advisory; Review uses the normal deck queue and
daily limits rather than imposing a separate planner quota.

## Citations

A note's Sources action opens a bibliography editor. Sources are ordinary
#Citation records under a root References branch, with a Cited note link and
Traits for title, author, publication date, DOI, URL, locator and optional quote.
They live outside the cited note's answer tree, so citations cannot become study
answers or change its schedule. Adding/editing uses normal save/undo/sync and
optimistic version guards; it never invents bibliographic facts.

Existing book/article highlights can prefill actual stored metadata and source
anchors. Missing authors/dates stay blank. No lookup, paid API or network scraping.
Original quote/page/passage and source-note links remain in Traits. Reader
navigation reuses the existing source context; missing originals do not erase the
citation. User-entered URL schemes/credentials and DOI/date values are validated.
Plain citation copy and CSL-JSON/BibTeX export preserve exact entered metadata.
There is no claim of a full citation-style processor or guaranteed scholarly data.

## Compatibility, privacy and verification

No new root fields or row types: saved data is normal bullets/Traits/internal links.
Canonical mutations preserve existing card state/logs and durable outbox semantics.
Drafts/checklists are device-local; saved notes follow ordinary synchronization.
Portable imports remap internal links; book/article binaries remain separate
library/full-backup domains. Never mark pending notes synced or replace snapshots.

Test local-day boundaries, source/mirror deduplication, missing targets, workload/
limit estimates, suspended/buried cards, empty history/outliers, goal progress and
unchanged FSRS state. Verify citation stale saves, safe URLs, missing metadata,
reader anchors, exports/escaping, save retry, undo, reload, account isolation,
normal backups/portable links and multi-client convergence. Run sequential build/
full suite and desktop/phone browser checks, then stage and record exact release.

## Try it

1. Open Tasks → Weekly review, check the original items and write Wins/Next week.
   Save review note creates a linked ordinary note. Closing before saving keeps
   the reflection draft on this device.
2. Open Study Desk → Study goals. Pick a deck, target date, daily minutes and the
   number of new cards. Start with the fallback pace or enter your own seconds.
   Review uses the normal spaced queue; progress counts introductions, not mastery.
   Open goal note to edit its Traits or Archive goal to retain it without listing.
3. Zoom into a note → Sources. Enter source facts or Use saved reading source
   when available. Save citation creates a linked References record. Edit there,
   copy a plain citation or export CSL-JSON/BibTeX. Do not put reference metadata
   into a study answer simply to cite it.

Saved notes support normal Undo/Redo and backups. Unfinished drafts and checklist
marks are local to this browser, account and workspace; export saved notes for
portability. Forecasts are lower bounds, not predictions of future FSRS repeats
or exam readiness. Reader files must still be available to open original passages.
