# Palette and shortcut reference review

The previous palette recursively fuzzy-scored the full text of every note and
sorted every matching note on each input. The palette and native shortcut dialog
also used full-viewport backdrop blur, and the shortcut dialog animated its
entire scroll surface on opening.

The revised search has bounded, linear matching on a preview, exact/token matching
across the full note, and a maximum of 40 ranked results. A local worker handles
large collections; unavailable workers fall back to cancellable, yielded batches.
Query sequence IDs prevent stale responses from replacing current results.
Small outlines use the same ranking synchronously. Accent folding, duplicate
note IDs, full-content matches and notes beyond the initial result page are
covered by tests.

Both surfaces open immediately with plain dimming. The palette retains its height
while filtering, and hover no longer changes keyboard selection. Both lists have
explicit overflow boundaries and automatic rather than animated scrolling.
Keyboard help now groups existing shortcuts by Workspace, Writing, Formatting
and Outline, adds search and keeps its heading/close control visible.

## Measured stress test

Chromium development build, 4× CPU throttling, 20,001 synthetic notes including
long excerpts. The same four queries were entered before and after the change:

| Query | Previous input-to-result | Revised input-to-result |
| --- | ---: | ---: |
| unique | 7,917 ms | 461 ms |
| unique n | 7,868 ms | 151 ms |
| unique nee | 9,345 ms | 143 ms |
| unique needle | 9,423 ms | 141 ms |

These Playwright wall-clock observations include browser automation and result
polling; they are a stress comparison, not production INP or a guarantee for
individual devices. Main-thread long tasks during the measured sequence changed
from roughly 7.8–9.4 seconds per query to two observed tasks of 161 and 58 ms.
The initial worker startup still has a cost. No threshold claims are made for
physical devices or assistive technology.

All 108 regression files, TypeScript and the production build passed. Additional
Chromium checks passed for a real worker, late-note selection, stable modal
bounds, pointer/wheel behavior, grouped shortcut search, a fixed help header and
320px/390px mobile layouts. The worker-free test path also verifies cancellation
and the latest query winning.

Final checks also covered repeated PDF/EPUB reader commands with unchanged
records, and returning focus to the command trigger when closing keyboard help.
After that focus correction, the affected app/palette/search/help tests and
TypeScript passed again.
