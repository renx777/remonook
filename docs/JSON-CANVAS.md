# Canvas (web staging preview)

Canvas is a spatial workspace for notes, using the open [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/) interchange format. It is available in the web app in local development and staging, under Library → Canvas. Native apps and production do not expose this preview.

## Use

1. Choose **New canvas**, then rename it using the title field (saved when you leave the field or press Enter). Every board's note sits under one top-level **Canvases** bullet in Notes; the board's name is that note's text, so renaming either renames both.
2. Add **Text** to create an ordinary note under the board's root note. Select the card to edit it. Markdown renders on the card; the inspector edits the backing note.
3. Choose **Link note** to place an existing note. Mirrors resolve to their original source. Editing updates that same note; **Open in Notes** opens its outline.
4. Select several cards with Shift-click or Shift-drag; dragging moves them together. **Delete**/Backspace removes the selection, ⌘/Ctrl+D duplicates it, arrow keys nudge it (Shift for bigger steps), ⌘/Ctrl+A selects every card and Esc clears the selection. New cards go beside the selected card, or at the nearest free spot in the middle of the view. Drag cards to arrange them; drag selected card corners to resize. The inspector also provides numeric width/height controls. Drag connection handles or use **Connect to** in the inspector. Select a connection to edit its label, color or destination arrow.
5. **Group** wraps the selected cards (or adds an empty frame). **URL** and **File reference** ask for the link or path first. URL cards open only on an explicit click. File cards preserve a relative path and subpath; this preview does not upload, resolve or embed external files or group background images.
6. **Export .canvas** downloads an interoperable file. **Import .canvas** creates a separate board and new backing text notes, never overwriting an existing board or trusting imported note identities.

The phone version uses Library in bottom navigation, a pannable/zoomable board, and a compact bottom inspector. Undo/redo are available in the Canvas toolbar and normal app history. Removing a text card made on the board moves its note to Trash (unless another card still shows it); removing a card that links a note from elsewhere removes only the placement. Undo restores both. If a card's note is removed in Notes, Canvas shows the note's last text from Trash (or the snapshot from placement) and labels the source unavailable.

## Storage and collaboration

Board metadata lives in `web.canvases`, keyed by board ID. Cards and connections are maps keyed by their interchange IDs. Position `[x,y]` and size `[width,height]` are atomic values; separate cards can move concurrently without replacing a whole board. Layout commits happen at drag/resize end (one change for a multi-card drag, one for a burst of arrow-key nudges); text fields save on blur, so typing is one undo step and one sync write. Text uses existing bullet rows and their rich-text CRDTs, durable outbox, local persistence, sync and undo. No backend protocol, binding, migration or server deployment is introduced. Removal tombstones preserve card/connection metadata.

Unknown interchange properties are retained separately from trusted internal fields and restored during export. Node array order is preserved as stacking order. Linked note cards export readable Markdown snapshots, not a private identity that another workspace would automatically follow. Full web backups include board metadata and text; Android-compatible export refuses to silently drop board metadata.

Archive a board from its options menu to remove it from the main list while keeping notes and layout. The archived section offers Restore.

Limits: 2 MiB input and total board metadata, 400 cards and 800 connections per board; 40 active boards, 200 stored boards. Existing account/document storage and sync limits still apply. Malformed geometry, unsafe property names, duplicate IDs, dangling edges, unsafe URL protocols and invalid standard fields are rejected before mutation. Markdown is sanitized and remote media is not automatically loaded. Exports retain unresolved file paths and do not bundle their files. Saving re-validates only boards whose objects changed since they last passed (boards are replaced, never edited in place), so typing in Notes does not re-check canvases.

## Validation

`tests/json-canvas.test.mjs` covers standard node/edge and extension round-trips, untrusted internal-field injection, invalid input, source loss, placement removal, backup/persistence and two-client offline layout/text merging. Real-browser acceptance covers desktop and phone editing and import/export. See the staging release record in ENVIRONMENTS.md for the deployment result.

## Roadmap

Agreed with the owner; each phase ships to web staging only, and native apps or production need separate approval.

1. **Phase 1 — fixes (done):** Canvases parent bullet and title sync, save-on-blur fields, multi-select drag, keyboard (Delete, duplicate, nudge, select all, Esc), card placement, Group from selection, link/file forms, incremental validation, card notes to Trash, stacking order, zoom controls and Canvas icon.
2. **Phase 2 — feel:** type on the card, floating selection bar, icon toolbar, paste URL/drop image, snap and alignment guides, minimap, real thumbnails, phone pass.
3. **Phase 3 — RemoNook edge:** drag bullets from a Notes panel onto the board, Bookshelf highlights/bookmarks/flashcards as cards, group → outline and outline → board, links to a board, better note picker.
4. **Phase 4 — polish:** sections and presenting, AI grouping/connections/summaries, permanent delete of archived boards and tombstone clean-up, 400-card performance check, native rollout.
