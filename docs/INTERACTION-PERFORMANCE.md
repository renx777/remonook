# Application interaction performance review

## Measured scenario

Before and after use the production build in Chromium at 1440 × 900, with 4× CPU throttling and a fresh synthetic workspace of 3,300 bullets (3,000 notes, 300 of them questions with answer children). Typing uses 59 characters at a requested 45 ms interval. Keydown-to-next-animation-frame is a responsiveness proxy, not an INP measurement or a device-wide guarantee. Long tasks and Chrome performance counters are collected over the same scenario.

| Measurement | Before | After |
| --- | ---: | ---: |
| Median keydown to next frame | 120 ms | 48 ms |
| 95th percentile | 210 ms | 68 ms |
| Maximum | 309 ms | 119 ms |
| Long tasks during the typing sample | 60 | 19 |
| Layout count during sidebar close | 8 | 3 |
| Layout duration during sidebar close | 39 ms | 8 ms |

These are controlled local samples. They do not measure actual user accounts, mobile hardware, or network latency.

## Findings and changes

- Ordinary text/formatting edits ran the complete structural normalization path. The new content-only update keeps the validated hierarchy, propagates content to mirrors, updates note timestamps, and refreshes derived flashcards when the changed content belongs to a question or deck. Structural commands still use full normalization. Differential tests compare both paths, including schedules and exclusions.
- Inline emoji context recreated its map and matcher whenever the parent supplied a new insertion callback. The stable provider now retains that catalogue and calls the latest insertion callback through a ref. Picker search indexes are built on demand and reused across editor mounts.
- Link suggestions sorted the workspace while closed. They now run only while requested. Link breadcrumbs, outlines, sidebar trees, and pane headers share read indexes keyed by immutable snapshots; generic mutable domain callers retain uncached indexing.
- Search queries were parsed for every candidate note. Their compiled groups are now reused. Ordinary editing avoids creating an unused search index.
- Row measurement observers reconnected and measured every visible row on each character. Persistent observers now report actual size changes, with explicit measurement retained for attachment, width, and fallback paths. Estimated offscreen heights are reused per node and layout width.
- Sidebar width and padding animations repeatedly resized the outline. The sidebar now slides via transforms, and the main pane performs one layout change with a compositor position animation. Rapid reversals, reduced motion, and keyboard focus return are handled without remounting the editor. Save/sidebar shortcuts also work while editing.
- Saving now avoids serializing unchanged record objects for comparison. The editor reuses serialized ProseMirror content for the same immutable document. Code and tag decorations cache unchanged documents, and unchanged code readers are memoized.
- Broad `transition: all` rules were narrowed to visual color properties. Calendar note badges reuse the current index and reminder list.

## Safety and validation

No delayed text publishing or increased save debounce was introduced. Document refs still update synchronously, and local persistence, operation journaling, v2 CRDT outbox/acknowledgements, and cloud retry behavior retain their existing paths. Errors still report saving failures.

Regression coverage includes content-update equivalence, formatting, mirrors, review schedules, backups, immutable index reuse, emoji context freshness, syntax decoration reuse, editor selection, image layout, and focused-editor cloud updates. Chromium acceptance checks cover 320, 393, 768, 850, and 1440 pixels, including Japanese IME composition, rapid sidebar toggles, caret stability, reduced motion, undo/redo, mirrored typing, quick search, and split panes.

Release to staging first. Physical device and real-account latency can vary; production remains a separate release.

## Follow-up: keeping input ahead of surrounding views

The next target is median keydown-to-next-frame below 30 ms and p95 below 50 ms in the same throttled scenario. ProseMirror updates the editable DOM and the authoritative workspace synchronously. React transitions let surrounding note views yield to input; this adds no debounce to publishing text, saving, or the durable outbox. Controlled title inputs retain synchronous React updates.

Editor reconciliation reads the authoritative current node. An intermediate React render can contain an older text echo; applying that echo would overwrite newer typing and move the caret. A deterministic regression test reproduces this case and checks that genuine external updates still apply. Browser acceptance also types 180 characters without delay, then immediately splits the bullet and saves.

Unchanged rich-text readers and icons now use React memoization. Content-only flashcard refreshes derive answers only for affected ancestor IDs, including mirrored instances. Full structural mutations retain complete derivation. Differential tests cover blank-question activation/deactivation, nested FLAT/TOPICS decks, exclusions, mirrors, and scheduling.

Final production-build samples retain the same 3,300-bullet fixture, 59-character input, 45 ms requested input interval, and 4× CPU throttling. Desktop width is 1440 pixels; the mobile layout sample is 393 pixels and remains desktop Chromium rather than physical mobile hardware.

| Edited content / layout | Median | p95 | Maximum | Long tasks |
| --- | ---: | ---: | ---: | ---: |
| Ordinary note, desktop | 17 ms | 23 ms | 44 ms | 0 |
| Question, desktop | 23 ms | 31 ms | 85 ms | 1 |
| Answer child, desktop | 25 ms | 32 ms | 70 ms | 1 |
| Ordinary note, mobile layout | 22 ms | 30 ms | 76 ms | 1 |

All four samples meet the median/p95 target. Occasional longer frames remain; these samples are not a promise for all devices or workspaces. The earlier implementation remeasured at 46 ms median and 65 ms p95 for ordinary notes in this session. The follow-up passes all 80 test files and the production build; browser checks cover rapid input and immediate split/save, controlled titles, IME, focus stability, mirrors, undo/redo, quick search, split panes, and reduced motion at 320–1440 pixels.
