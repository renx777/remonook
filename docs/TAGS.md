# Tags

Design canvas: https://claude.ai/artifact/CWzDJ2JxgvbNXSvVM6dBFy (private to the owner).

## Shipped

- `src/tags.mjs`: tag parsing and index. Tags are `#word`, nested with `/` (`#study/ml`),
  case-insensitive (key is lower case; label keeps the first spelling). `tagMatches` treats a
  parent as matching its sub-tags. Search (`relations.mjs` `matchesQuery`, `search.mjs`) follows the same rule.
- Sidebar (`OutlineSidebar` in `src/OutlineChrome.tsx`): a Tags tree replaces the notes tree.
- Tag page header (`src/TagHeader.tsx`): shown in Notes when the search is exactly one tag.
- `#` autocomplete: tag mode of `InlineConnections` in `src/Connections.tsx`.
- Smart tags (styling only, `smartTagClasses` in `src/relations.mjs`, styles in `src/tags.css`):
  `#imp`/`#important`/`#urgent` ring, `#done`/`#complete` strike and dim, `#later`/`#someday` dim until hover,
  `#key`/`#highlight` row band, `#private` blur until hover or focus.

## Next (phase 2): tag settings and management

1. Store settings in the synced workspace as `web.tags = { [key]: { color?, icon?, description?, pinned?, effect? } }`.
   Follow docs/SYNC.md: add the field to the shared schema and the server acceptance check (`src/sync-validate.mjs`),
   validate types (color is one of the table colour names in `src/table.mjs` `TABLE_COLORS`; effect is one of
   `ring|band|dim|blur|strike|checkbox|icon|quote`; icon is one emoji). Unknown keys are ignored, never rejected.
2. Settings popover from the sidebar (right-click / long-press a tag, or a ⋯ on hover) and from the tag page header:
   name, icon, colour, effect, pin, description. `tagColor` should prefer the saved colour.
3. Rename / merge / remove everywhere: one outline mutation that rewrites the tag text in every bullet
   (respect `noteLinks` ranges and code bullets; keep sub-tags: renaming `#study` turns `#study/ml` into `#new/ml`),
   recorded as one undo step. Remove asks for confirmation with the count.
4. Pinned tags first in the sidebar; sort menu (most used, A–Z, recent).

## Later (phase 3): behaviours

- `#todo` bullet becomes a checkbox; ticking swaps `#todo` for `#done`.
- Icon bullets: a tag's emoji replaces the bullet dot (`#idea` → 💡 by default).
- `#q`/`#question`: "?" bullet, open questions on the tag page, one-tap convert to flashcard.
- `#quote` shown as a quote block in the outline (it already feeds the Quotes widget).
- `#pin`: top of its page plus a Dashboard widget. `#review`: Study Desk queue. `#today`/`#tomorrow`: convert to a date.
- Per-tag effect picker wired to `web.tags[key].effect`.

Each step needs app tests next to `tests/sidebar.test.mjs` and `tests/table.test.mjs`, and a staging check.
