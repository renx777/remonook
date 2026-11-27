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
No sync protocol, Worker deployment, SQL or replacement snapshot is required for this web
release. MCP's existing source-note and Trait-bullet edits remain canonical and
update the results; a dedicated collection-query MCP tool is not added.

## Verification

Model tests cover legacy defaults, source boundaries, mirror identity, live Trait
filters, branch deletion, recipe insertion without modifying existing notes, full
backup round trips and concurrent query/text edits in both delivery orders. App
and browser checks cover Configure, original table edits, undo, recipes, source
navigation, reload and mobile layout. Physical-device/native checks remain
separate from browser emulation.

## Rollout review

The Phase 3 rollout includes the current Phase 2B calendar/push work; it does not
replace it with the earlier PR's base. Before release, verify legacy settings
writers cannot erase collection scope merely by omitting new fields. Missing
scope/recipe fields inherit the most recent explicit values for that saved-view
ID from retained revisions; explicit Direct children / no recipe still clears
them. This is read-time compatibility, not a rewrite or conflict choice.

Deleted collections and source branches that become Traits must return no
results and refuse insertion until an ordinary source is selected. Collection
queries must remain linear in notes/media membership and independent of another
account's workspace. The prior sync-count discrepancy remains an unresolved
release observation; preserve all strict deployed checks.


The empty-state Add your first item button uses the same selected destination
and recipe as New. A save failure keeps the collection visible and shows an
error; it does not navigate to an unsaved item. Branch IDs are retained verbatim.
Workspace querying indexes attached-media membership once, avoiding a media scan
for every blank note.

### Examples

- **Book shelf:** make `Books #views`, choose Table or Grid, then Configure →
  Current workspace. Set Author → is not empty in Filter, and choose the Book
  shelf recipe for new items. Existing books stay in their original branches;
  fill Author, Status, Rating and Cover on new books using ordinary Trait bullets.
- **Movie shelf:** use Director → is not empty and the Movie shelf recipe. Keep
  a saved Watchlist view filtered by Status → is → Watchlist. A second view can
  show highly rated movies without duplicating the movie notes.
- **Project review:** choose A note branch, select the project, and filter by
  a Status or Due trait. New items are inserted under that project, while edits
  in the table update each original note.

Recipes do not fetch movie/book metadata or install a second property system.
