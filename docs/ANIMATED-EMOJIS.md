# Animated emojis

## Microsoft Fluent and combined collection picker

Explore now offers **All**, **Google Noto**, and **Microsoft Fluent**. The default is All; the last filter is remembered on this browser and shared with the inline `:` picker. Existing note artwork never changes when the filter changes. My library continues to mix saved Google, Microsoft and custom items. Categories use the same labels across both artists, and Unicode-equivalent artwork shares search aliases (for example, Google's “Smile” and Microsoft's “Grinning face”). The inline picker provides separate collection tabs and keeps the search when switching.

The pinned Microsoft snapshot includes **814 supported animations** alongside Google's 881. Microsoft's repository contains 2,241 animation files: 1,402 exceed the existing 2 MB per-attachment limit, and 25 multi-person tone drawings lack a reliable standard Unicode sequence in the upstream metadata. These are excluded rather than offering choices that cannot be saved or assigning incorrect tokens. Refresh metadata, size records and license with `node scripts/sync-fluent-emojis.mjs`; it fetches Git trees, metadata and small Git LFS pointers, not the multi-GB artwork repository. Provenance, revisions, byte sizes and SHA-256 digests are recorded in `src/fluent-emoji-catalog.json`.

Fluent uses distinct `:fluent_<codepoint>:` tokens and original APNG bytes stored as `emoji/fluent_<codepoint>.png`. First insertion downloads the pinned official Git LFS asset with a 30-second timeout, validates its length, SHA-256, PNG checksums, frame sequence and dimensions, and extracts its default PNG image as `emoji/fluent_<codepoint>.poster.png`. No image conversion service or new playback dependency is used. Static catalog previews use Microsoft's matching 3D artwork where available; otherwise the Unicode fallback remains visible until animation playback. Previews request only visible artwork, and Fluent animation previews play on hover/focus or explicit Replay. Search and note content are never sent to Microsoft or GitHub.

Saved animations use local blobs, follow motion settings and reduced motion, and detach offscreen. Original APNG, static poster and `emoji/fluent-LICENSE.txt` travel together through full backups, automatic asset repair and the durable sync outbox. Incomplete browser caches preserve all three cloud manifest entries. Android-compatible export is blocked for either catalog until the Android renderer supports their image formats. Catalog choices do not use the 500-custom-emoji allowance; existing per-file and workspace attachment budgets still apply. Microsoft artwork and the supplied test fixtures are MIT licensed; see `LICENSES/fluentui-emoji-MIT.txt` and `THIRD-PARTY-NOTICES.md`.

The Google-only behavior below remains available through the Google Noto filter.

While editing a bullet, type `:` to open the inline picker at the caret, then narrow the results with a name or tag (`:rocket`, `:head_nod`). The selected tab searches Google Noto, Microsoft Fluent or My library, with a scrollable full-catalog grid and one selected animated preview. Use Up/Down to browse, Enter/Tab or a click to insert, and Escape to dismiss without leaving the editor. The typed query is replaced and the caret stays after the inserted token so you can continue writing. Saved assets work offline; first-use downloads show progress and preserve your query on failure. URLs, times, completed tokens, code marks and code/diagram blocks do not trigger suggestions. The picker follows the current theme and stays within the viewport.

Open a bullet’s action menu → **Insert animated emoji…**. The default Noto tab includes all **881 animations in nine categories** from [Google’s animated emoji catalog](https://googlefonts.github.io/noto-emoji-animation/), including skin-tone and joined Unicode sequences. Search by name, tag, emoji or codepoint; filter by category and browse 48 results per page. Pagination limits mounted previews, not the available collection. **My library** shows previously inserted/imported items; **Remo** retains Smile, Heart, Sparkle and Done. Local `.json` / `.tgs` imports remain supported.

Choosing an item inserts it at the captured selection, or appends it when the bullet is not being edited. Undo/redo covers insertion and library records. Notes retain editable `:noto_<codepoint>:` tokens while editing; reading views display the animation.

## Google Noto collection

The bundled catalog is a snapshot of Google’s official `data/api.json`; provenance and its source SHA-256 are recorded in `src/noto-emoji-catalog.json`. Refresh it with `node scripts/sync-noto-emojis.mjs`; `--fixtures` also downloads representative face, joined-sequence, skin-tone and Rocket test images. `--verify` checks all animation/static image endpoints with bounded-concurrency HEAD requests. `--validate-posters` fetches and validates the actual static SVG content. Unicode asset paths are zero-padded where needed, fixing the source catalog’s otherwise-broken copyright and registered-symbol URLs. All 1,762 endpoints passed verification, and all 881 SVG payloads passed content validation for this snapshot. The synchronizer reads JSON and never executes the upstream site’s JavaScript.

31 legacy Illustrator exports (including Rocket) need safe normalization: only the standard SVG 1.1 DTD is removed, and eight fixed Adobe namespace entity values may be inlined. Arbitrary, recursive, external, duplicate and parameter entity declarations remain rejected, as do scripts/event handlers and linked resources. Normalized SVG is revalidated before storage. The illustration geometry is unchanged. This avoids blocking a valid animation because of harmless editor metadata in its static image.

Only visible catalog previews request images from Google’s Fonts CDN. Search/filtering is local: no note text or search query is sent to Google. A first insertion needs internet and downloads the original 512px animated WebP and static SVG, validates their format/size, and saves both in IndexedDB. Subsequent insertion reuses those files, including cached files retained after undo. Closing the picker cancels a pending download. Errors do not change notes or pause workspace saving. The Noto catalog does not consume the custom-import allowance.

Inserted Noto emojis use local blob URLs exclusively. Reading a saved note does not contact Google, even when an asset is missing. Offscreen animated images are detached; reduced motion, the app’s motion setting, and hidden tabs use the locally saved static image. Missing or failed images fall back to the Unicode glyph. **Replay previews** temporarily plays Noto previews for five seconds; original Lottie previews replay one cycle.

Google Noto animation artwork is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), not the font’s OFL license. The picker credits Google and links the source/license. Animation bytes are unmodified; legacy static SVG export metadata may be normalized as described above, and catalog labels are reformatted. Each selected collection also stores `emoji/noto-LICENSE.txt`, including the normalization notice, so **full web backups preserve animations, static images and attribution**. Android-compatible export is explicitly blocked for Noto WebP records until the Android renderer supports them; custom Lottie/TGS compatibility is unchanged.

The four built-ins are original Remo vector artwork, not redistributed Telegram assets. The player is the locally bundled MIT-licensed Lottie SVG light build, loaded on demand. [Lottie player reference](https://github.com/airbnb/lottie-web). Telegram TGS is gzip-compressed Lottie JSON; TGS decompression requires a browser with DecompressionStream, otherwise import JSON. [Telegram format reference](https://core.telegram.org/api/stickers).

## Reading and editing

Registered tokens render inline in note reading views, calendar notes, and source-linked flashcard questions/answers, including immersive study. While editing, they remain plain editable tokens so existing text offsets, formatting, split/merge, copy/paste and undo semantics are unchanged. Leave editing to resume the preview. Code marks and code-language bullets retain literal tokens. Unknown tokens are left untouched. Titles/sidebar/search labels remain plain text. Atomic rich-editor emoji nodes are not part of this implementation.

Settings & backups → **Animate emojis** switches between animation and static previews. The OS/browser reduced-motion preference also stops autoplay and reacts to changes. **Replay previews** deliberately plays previews even with reduced motion enabled, without changing your settings. Off-screen instances are disposed and recreated when visible; hidden tabs pause playback. Missing, malformed or unsupported assets show a labeled fallback without crashing the note. Accessible image labels identify emojis without announcing every frame.

## Local import and safety

Imports are validated before changing the workspace, all-or-nothing per selection. Limits: 20 files per selection, 1 MB per input, 2 MB expanded, 500 library records, 2048px canvas, 120 fps, 30 seconds and bounded object depth/layer count. Large or animated repeaters are rejected. Only self-contained vector shape/solid/composition/null layers are supported. Scripts/expressions, images, text/fonts, external assets, segmented animations, missing/circular references and invalid solid paints are rejected. No expression engine is bundled. This deliberately excludes some valid general-purpose Lottie animations.

Original file bytes live under `emoji/<fileName>` in IndexedDB. Tokens, labels and file names use the existing schema-11 `emojis` table. Full and Android-compatible ZIP exports preserve custom Lottie/TGS registry entries and bytes; playback in a particular Android app is not guaranteed. Noto WebP/SVG uses full web backups as described above. There is no upload, external conversion service, Telegram login, subscription, Telegram pack URL importer, .lottie archive or WebM sticker support. Only import artwork you have permission to use.

## Validation

Automated checks cover built-in validation, JSON/TGS equivalence, input/expanded-size limits, expression/resource rejection, cyclic references, expensive repeaters, literal token matching, selection/format offsets, picker insertion/undo/redo, rejected-file recovery, saved TGS imports, and full/Android backup round trips. Browser checks verify actual SVG rendering and motion rather than relying on static test fallbacks.

Noto-specific checks cover catalog completeness/uniqueness, all categories, real animated WebP and safe SVG fixtures, anonymous allow-listed downloads, response-size limits, offline re-insertion, cancellation, nonfatal download failures, saved-blob playback/static switching, offscreen/hidden-tab behavior, restored image MIME types, URL cleanup and full-backup attribution preservation. Browser acceptance additionally verifies loaded 512px WebP previews and inline playback from a local blob URL.

Chrome acceptance verified all four picker SVGs, inline question/answer SVGs, and a changed SVG transform after one-shot playback. The test computer reports reduced motion enabled, so autoplay appropriately remained stopped. File-picker import was covered by DOM integration tests, not a live browser upload. [Picker preview](animated-emoji-picker.jpg).
## Inline picker performance

The `:` picker has separate Google Noto, Microsoft Fluent and My library tabs.
It keeps the editor selection while searching or switching tabs. Arrow keys
select results, Enter/Tab inserts, Escape closes, and Alt+Left/Right switches
collections. Touch selects a preview; the Insert button commits it. Successful
insertions become device-local recent suggestions, limited to 20 tokens.

The eight-column browsing grid keeps the full catalog available; fixed-height row virtualization mounts only viewport rows plus a small overscan. Category icons and an editable panel search narrow choices without changing the captured note shortcode. One selected preview starts after
150 ms; it cancels pending downloads on selection changes or closure, and stays
static for reduced motion, disabled animation or a hidden page. Validated preview
files live in a 16 MiB memory LRU; normal insertion can reuse them through the
existing quota checks and durable asset/outbox path. Previewing never saves note
content or workspace attachments. Search strings are indexed independently of
editor transactions, and only visible results receive image elements.
