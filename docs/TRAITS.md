# Traits — properties that are just bullets (web staging)

Traits replace NookTraits, which was removed on 25 November 2026 (see below). Type `#traits` on any bullet to give it a **Traits** child; each child written `Name: value` is a property. A `#views` parent shows, sorts, filters, groups and lays out its items by their traits.

## How it works

- Type `#traits` (any case) on a bullet. When the cursor leaves it, the tag is removed and a child bullet **Traits** (marked `traitsBlock: true`) is added first, with one empty bullet under it. If you left by pressing Enter, the cursor goes straight into that empty bullet instead of the new sibling. The bullet menu's **Add traits** does the same.
- Each child of Traits written as `Name: value` (or `Name:: value`) is a property, e.g. `Author: Stephen Hawking`. There is no special editor: properties are typed, edited, moved, collapsed, synced and undone like any bullet. Names are whatever you choose. A name has no colon, and the value starts after a space, so a bare URL is never a property. Other text under Traits is ignored.
- Property bullets show as one plain line: links in them get no preview card.
- `#traits` on a `#views` bullet only removes the tag: the collection's items carry traits, not the collection.
- Blank items (empty bullets with no children or images) are left out of collections.
- **Grid with traits** shows poster cards like Obsidian's Cards layout: image on top, then title and the shown traits. **Configure** sets card size (140–420 px), image property, image fit (cover or contain) and image aspect ratio (height ÷ width, 0.5–2). Sliders save when released.
- **`#views` collections** read their items' traits. A bar shows the result count and Sort, Filter, Properties, Configure and New, each opening a small panel:
  - **Sort**: outline order, title or any trait; ascending/descending. Numbers sort as numbers. Items without the trait go last.
  - **Filter**: text contained in one trait, or in any trait or the title.
  - **Cover**: Automatic (link previews and attached images first, then a trait named like cover/poster/image/thumbnail/art/photo, or any trait whose value is an image link), No covers, or a specific trait.
  - **Traits shown**: which traits appear as table columns and on cards (defaults to the six most used). Cards show up to four text traits; link-valued traits appear in the table.
  - These choices are saved per collection in `web.traitViews[id]` as append-only revisions (latest wins), so they sync and merge safely.
- The Traits bullet is never an item of a collection or part of a flashcard answer.
- **Kept out of other views:** Traits bullets and their properties stay in the outline and in collections only. Mindmaps (and their previews), canvas sources, search by meaning and the resurfacing widget leave them out (`traitBulletIds`). Outline search does not list them as results. Instead a note matches its own trait values, so searching "spielberg" finds Jaws, and `trait:spielberg` works too (`traitTextByNote`). AI context still includes them, since they describe the note.
- **Pasted images as covers:** an image pasted or uploaded into a trait bullet (e.g. a bullet "Poster" or "Cover:" with the image) can be a card's cover. Automatic picks a cover-like name first, then any trait bullet with an image. Its name appears in Configure → Image property (`traitImageRow`, `imageTraitNames`).
- **Ratings:** a trait named like Rating, Stars or Score shows as stars on cards and in the table. Accepted values are `4`, `4/5`, `8/10`, `★★★☆☆`, or empty. Tapping a star sets the value in the bullet, keeping `:` or `::`. Tapping the current star clears it (`ratingOf`, `setTraitValue`).
- **Name suggestions:** while typing a bullet directly under Traits, names already used in the workspace are suggested ("Dir" → Director). Tab or a tap fills in `Director: `, Up/Down move, and Escape hides. Tab indents as usual when nothing is suggested (`TraitNameSuggest`).
- **New item from the collection:** **New** creates an item with an empty title and a Traits bullet already listing the collection's trait names (`Director:`, `Year:` …), and opens it (`newCollectionItem`).
- **Edit in the table:** clicking a table cell edits the value in place (Enter saves, Escape cancels). It rewrites the item's trait bullet, or adds the Traits bullet and trait when the item lacks them (`setNoteTrait`). Link values open as links, with a pencil to edit them; ratings use stars.
- **Saved views:** the "All ⌄" menu at the left of the bar lists named views per collection, e.g. All, Watchlist, Top rated. A new view copies the current one. Each keeps its own sort, group, filters, traits shown and layout settings. Views can be renamed or deleted, but the last one stays. They are stored in the same `web.traitViews` revision as `tabs` and `active` (`switchTraitTab`, `addTraitTab`, `renameTraitTab`, `deleteTraitTab`).
- **Conditions:** the Filter panel adds up to 8 conditions on a trait or the title: contains, does not contain, is, is empty, is not empty, greater than, less than. Numbers compare as numbers and ISO dates compare as dates. Match all or any (`conditions`, `match`).
- **Fill traits from links:** Properties → **Fill traits from links** reads each item's link (in its title, or a Link/URL/IMDb/Letterboxd/Goodreads trait) through the existing link preview service. It adds the traits the item is missing: Cover, Year, Director, Author, Site. It never overwrites. An item whose title is only a link gets the page's clean title, and the link moves to a Link trait (`itemLink`, `traitsFromPreview`, `applyPreviewTraits`).
- **Group:** group a collection by a trait, ascending or descending; empty values come last. Groups collapse and work in grid, list and table (`groupCollection`, saved as `group`/`groupDir`).

Code: `src/traits-block.mjs` (parsing, adding the Traits bullet, sort/filter/cover), `src/BulletCollection.tsx` (`TraitViewBar`), `src/traits-block.css`, tests in `tests/traits-block.test.mjs`.

- *Board and Calendar layouts are built on branch `feat/nooktraits-upgrade` but held back from the `main` release (hidden from the view switch); they will ship separately.*
- **Board layout:** a column for each value of a trait, chosen in Configure → Columns from (defaults to the Group trait, else the first trait). Drag a card to another column, or use its **Move to** menu on touch, to change that trait in the item's bullet. Add empty columns with **New …**. Moving the last card out of a column keeps the column; empty added columns can be removed. "No …" collects items without the trait (`boardColumns`, saved as `boardKey`/`boardExtra`).
- **Calendar layout:** items on the date in a date trait, chosen in Configure → Date trait. Accepted forms are `2026-11-20`, `2026-11-20T18:30`, `20 Nov 2026` and `Nov 20, 2026`. Weeks start on Monday, with previous and next month and Today. Tapping an item opens it. On phones, days show dots and the month's items are listed below the grid (`dateOf`, `calendarMonth`, `monthGrid`, saved as `dateKey`).
- **Table totals:** a Summary row under each table. Each trait column can show Filled, Empty, Unique, Sum, Average, Min or Max. Numbers are read from the start of values (`120 min` counts as 120), ratings count as their stars, and items without a number are skipped (`traitTotal`, saved as `totals`).

## NookTraits removed

NookTraits (`#nooktraits`, note types, the heading eye, Manage NookTraits and its shelf views) was only ever on web staging. It was removed on 25 November 2026 so that one simple system remains. What was removed: `src/nooktraits.mjs`, `src/NookTraits.tsx`, `src/nooktraits.css`, their tests and harness, the bullet-menu and command-palette entries, and the NookTraits parts of note templates.

**Data is kept, not deleted.** `web.nookTraits` and `web.noteProperties` stay in the workspace untouched and keep syncing, so nothing a tester entered is lost, and it could be converted later if wanted. `#nooktraits` tags are now ordinary tags.

## Collection toolbar

One row, left to right:
- **Find:** searches titles and every Trait value, and every word must match. The search is not saved with the view.
- **Sort:** shows what it does, e.g. "Year ↓" or "Last edited ↓".
- **Filter:** with a badge counting the active conditions.
- **Group, Properties and Configure:** small icons.
- **Layout switch:** Outline / Grid / Compact list / Table.
- **Movie actions:** for movie collections.
- **New.**

**Sort** opens a list:
- Outline order
- Title
- Date created
- Last edited
- each Trait

Then a direction switch: Ascending/Descending, or Oldest/Newest first for dates.

The dates come from the synced note clock (`web.noteTimes`). **Last edited** counts edits anywhere inside an item, including its Traits. **Date created** and **Last edited** start newest first.
