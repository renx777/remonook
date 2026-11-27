# Smart Collections (Phase 3)

Use an existing `#views` note, open it, choose Grid, Compact list or Table, then
**Configure → Notes from**:

- **Direct children** keeps the existing collection behavior.
- **A note branch** searches all descendants of a selected note, including note
  references placed there. Search for the branch by its title; source paths
  distinguish similarly named notes. A removed/missing branch yields no results
  until you explicitly choose another; it never silently expands to the workspace.
- **Current workspace** searches this workspace only. It never opens or queries
  other local folders, accounts or workspaces.

Outline continues to show physical children; source queries apply to Grid, Compact
list and Table.

Use the existing Filter conditions (title or Trait values), Sort, Group,
Properties and saved view tabs to refine the result. For example, choose Current
workspace and an Author → is not empty condition to collect books kept in several
branches. Source choices are saved independently with each saved view.

Results are canonical references. Mirrors are deduplicated; Traits rows,
collection roots and the current collection's ancestors are excluded. Grid/list
cards and table rows show their source path in broad scopes. Open note returns to
the original. Editing a table Trait or rating edits its original bullet through
the normal save, undo and durable outbox paths; no results are copied or relocated.
Changing the source never modifies note content or parent/position values.

## Optional Trait recipes

Configure → Trait recipe for new items offers Book shelf, Movie shelf and Projects.
A recipe provides ordinary Trait bullet names (for example Author, Status, Rating,
Cover), ready to fill. It does not introduce a second property database, mandatory
fields, API calls or automatic metadata retrieval. Existing notes and their values
are untouched. Without a recipe, New reuses available Trait names, or makes a plain
note when no Trait names exist.

New creates a note under the selected branch for branch sources; otherwise it
creates under the collection. The original editor opens immediately. A recipe
item can initially fail an active value filter until you fill its values; the
note stays available in its source. New never guesses another destination after
a branch or collection is removed.

## Storage and compatibility

Source, sourceBranch and recipe extend existing append-only `web.traitViews`
revisions, including saved view settings. Missing fields default to Direct
children and no recipe, without a startup rewrite. Full backups retain them.
Existing native builds preserve the metadata but cannot display Smart Collection
queries until updated. Query evaluation occurs only in the collection view;
branch membership uses one tree traversal. Results are paged in batches of 24.
No sync protocol, Worker, SQL or replacement snapshot is required for this web
release. MCP's existing source-note and Trait-bullet edits remain canonical and
update the results; a dedicated collection-query MCP tool is not added.

## Verification

Model tests cover legacy defaults, source boundaries, mirror identity, live Trait
filters, branch deletion, recipe insertion without modifying existing notes, full
backup round trips and concurrent query/text edits in both delivery orders. App
and browser checks cover Configure, original table edits, undo, recipes, source
navigation, reload and mobile layout. Physical-device/native checks remain
separate from browser emulation.
