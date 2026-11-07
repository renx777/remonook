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

## Tag settings and behaviours (shipped)

- Settings live in the synced workspace as `web.tags = { [key]: { color?, icon?, description?, pinned?, effect? } }`,
  read through `sanitizeTagSettings` (invalid values are dropped, never thrown). The sync server does not validate
  `web.tags`; like `web.starredSearches` it is free-form workspace data.
- Built-in smart tags (`BUILTIN_TAGS` in `src/tags.mjs`) give defaults; a user's settings override them, and sub-tags
  inherit colour, icon and effect from their parent.
- Effects: ring, band (in the tag colour), dim, blur, strike, checkbox (`#todo` ⇄ `#done`), question (`?` bullet,
  `#answered` closes it), quote. Icons replace the bullet dot.
- Settings dialog (`src/TagSettings.tsx`): from ⋯ or right-click on a sidebar tag, or "Tag settings" on a tag page.
  Rename everywhere (merges when the new name exists; sub-tags and settings follow; formatting stays on its text),
  remove from every bullet, icon, colour, effect, pin, description. Each is one undo step.
- Sidebar: pinned tags first, sort (most used, recent, A–Z), and a Pinned section listing `#pin` bullets.
- On leaving a bullet: `#today`/`#tomorrow` become its date; `#review` makes it a flashcard (kind QUESTION).
- Tag page for a question tag lists open questions with "Make flashcards".

## Possible follow-ups

- A Dashboard widget for `#pin` bullets.
- Hiding the tag text and showing only its effect.
