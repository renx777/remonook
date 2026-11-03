# Bookmarks library and Trash review

## Findings and implemented changes

The existing list retained the useful, quiet reading-list aesthetic, but oversized rows and weak controls made it difficult to organise a growing collection. Search text was clipped, reading states were hidden in menus, and managing several saved pages required repeated actions.

- Keep serif article titles, with compact sans-serif metadata and two-line excerpts. Constrain the library width and thumbnail dimensions; allow long titles, domains and tags without horizontal page overflow.
- Give search a complete labelled field and a clear action. Match all query words across title, URL, excerpt and tags. Provide distinct empty-library and no-results states.
- Add counted All, Unread, Read, Favourites and Archive views. On narrow screens, the view tabs scroll while Select remains accessible. Tag filtering and remembered newest/oldest/title/website sorting support retrieval.
- Put favourite/read toggles beside each item and make its linked-note count actionable. Keep archive, tags, original-page access and removal in the existing accessible menu.
- Add Select visible, individual selection and bulk read/archive/unarchive/removal. Hidden selections are cleared. Removal confirms the scope and preserves source-linked notes/citations.
- Replace the inline save form with a focused URL dialog. Retain the existing capture, fallback saved-link and reader flow.

Existing Radix Dialog/Dropdown Menu and Lucide icons cover these requirements; no additional dependency is needed. Reader rendering, Floating UI selection tools, annotations, offline snapshots and source-linked rich notes remain on their existing paths.

## Empty trash

Trash now exposes its item/bullet count and an Empty trash action with a permanent-deletion confirmation. The confirmation snapshots the reviewed IDs, so items arriving from another device afterwards remain in Trash. A single durable save removes the reviewed records and only attachments no longer referenced by live content or remaining Trash. Already-restored records are skipped. Cancel leaves everything intact; existing backup archives remain intact.

## Validation and limits

Automated coverage exercises library filtering/sorting and bulk updates, preserved source notes, attachment-reference protection, corrupt-payload rejection, and the actual Empty trash confirmation/persistence flow. Browser regression uses synthetic data in isolated desktop/mobile Chromium contexts and checks library navigation, menus, selection, dialogs and narrow-screen overflow. Existing reader regression checks capture, highlights, rich-note editing, screenshots and offline reload. Browser viewport testing does not substitute for physical Android/iOS verification.

Release is limited to local development and staging, as requested. Production is unchanged.
