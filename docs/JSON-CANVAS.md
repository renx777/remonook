# Canvas (web staging preview)

Canvas is a spatial workspace for notes, using the open [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/) interchange format. It is available in the web app in local development and staging, under Library → Canvas. Native apps and production do not expose this preview.

## Use

1. Choose **New canvas**, then rename it using the title field (saved when you leave the field or press Enter). Every board's note sits under one top-level **Canvases** bullet in Notes; the board's name is that note's text, so renaming either renames both.
2. **Add cards** from the dock at the bottom: text card, a note from Notes, image, web link, group and file reference. Double-click empty board space for a text card there.
3. **Type on the card.** A new text card opens for typing; double-click a card (or select it and press Enter) to edit it in place, Esc to finish. Text cards are ordinary notes under the board; a card linking a note from elsewhere edits that same note (mirrors resolve to their source).
4. **The floating bar** above the selection: remove, colour (six colours or none; coloured cards are tinted), edit / rename, group (several cards), zoom to selection, open in Notes, and More (duplicate, bring to front, send to back, connect to). A selected connection gets its own bar: remove, colour, label, arrow.
5. **Images:** paste one (Ctrl/⌘+V puts whatever image is on the clipboard on the board), drop image files, or pick them from the dock. Images over 2 MB (large screenshots) are scaled down to WebP. Each image is stored like a bullet image (same limits, local storage and sync) on its own bullet under the board.
6. **Links and videos:** paste or drop a web address, or use the dock. YouTube, Vimeo and Spotify links become cards that play in place (the YouTube poster image loads from YouTube; the player loads when you press play). Pasted plain text becomes a text card.
7. **Arrange:** Shift-click or Shift-drag to select several; drag to move (snap to a 20px grid is on by default; toggle it in the controls at the bottom right, beside zoom, undo/redo and the overview map). Delete/Backspace removes, ⌘/Ctrl+D duplicates, arrows nudge (Shift for bigger steps), ⌘/Ctrl+A selects all, Esc clears. Drag a selected card's corners to resize (images keep their shape). Drag the dots on card edges to connect cards.
8. **Group** wraps the selected cards (or adds an empty frame) and asks for its name on the spot; double-click a group to rename it. Moving a group moves the cards inside it.
9. **Export .canvas** (in ⋯ on phones) downloads an interoperable file; images export as file references by name. **Import .canvas** creates a separate board and new backing text notes, never overwriting an existing board or trusting imported note identities.

The board list shows each board's real layout as its thumbnail. On phones the header is one row, the dock sits above the bottom navigation, and the floating bar moves below the selection when it would be hidden at the top. Removing a text or image card made on the board moves its note (and image) to Trash, unless another card still shows it; removing a card that links a note from elsewhere removes only the placement. Undo restores both. If a card's note is removed in Notes, Canvas shows the note's last text from Trash (or the snapshot from placement) and labels it.

## Storage and collaboration

Board metadata lives in `web.canvases`, keyed by board ID. Cards and connections are maps keyed by their interchange IDs. Position `[x,y]` and size `[width,height]` are atomic values; separate cards can move concurrently without replacing a whole board. Layout commits happen at drag/resize end (one change for a multi-card drag, one for a burst of arrow-key nudges); text fields save on blur, so typing is one undo step and one sync write. Text uses existing bullet rows and their rich-text CRDTs, durable outbox, local persistence, sync and undo. No backend protocol, binding, migration or server deployment is introduced. Removal tombstones preserve card/connection metadata.

Unknown interchange properties are retained separately from trusted internal fields and restored during export. Node array order is preserved as stacking order. Linked note cards export readable Markdown snapshots, not a private identity that another workspace would automatically follow. Full web backups include board metadata and text; Android-compatible export refuses to silently drop board metadata.

Archive a board from its options menu to remove it from the main list while keeping notes and layout. The archived section offers Restore.

Limits: 2 MiB input and total board metadata, 400 cards and 800 connections per board; 40 active boards, 200 stored boards. Existing account/document storage and sync limits still apply. Malformed geometry, unsafe property names, duplicate IDs, dangling edges, unsafe URL protocols and invalid standard fields are rejected before mutation. Markdown is sanitized and images inside Markdown are not loaded; video cards load their player only when played. Exports retain unresolved file paths and do not bundle their files. Saving re-validates only boards whose objects changed since they last passed (boards are replaced, never edited in place), so typing in Notes does not re-check canvases.

## Validation

`tests/json-canvas.test.mjs` covers standard node/edge and extension round-trips, untrusted internal-field injection, invalid input, source loss, placement removal, backup/persistence and two-client offline layout/text merging. Real-browser acceptance covers desktop and phone editing and import/export. See the staging release record in ENVIRONMENTS.md for the deployment result.

## Roadmap

Agreed with the owner; each phase ships to web staging only, and native apps or production need separate approval.

1. **Phase 1 — fixes (done):** Canvases parent bullet and title sync, save-on-blur fields, multi-select drag, keyboard (Delete, duplicate, nudge, select all, Esc), card placement, Group from selection, link/file forms, incremental validation, card notes to Trash, stacking order, zoom controls and Canvas icon.
2. **Phase 2 — feel (done):** type on the card, floating selection bar with colours, dock toolbar, images by paste/drop/pick, YouTube/Vimeo/Spotify cards that play in place, paste links and text, snap to grid, overview map, real thumbnails, phone pass. Alignment guides moved to Phase 4.
3. **Phase 3 — RemoNook edge:** drag bullets from a Notes panel onto the board, Bookshelf highlights/bookmarks/flashcards as cards, group → outline and outline → board, links to a board, better note picker.
4. **Phase 4 — polish:** alignment guides, sections and presenting, AI grouping/connections/summaries, permanent delete of archived boards and tombstone clean-up, 400-card performance check, native rollout.
