# Notebook shelf and outline controls

## References and decisions

- [Goodnotes notebook covers](https://support.goodnotes.com/hc/en-us/articles/7353696186511-Change-a-notebook-cover-in-Goodnotes): a recognizable cover provides a useful visual identity for a notebook.
- [Notability note covers](https://blog.notability.com/post/introducing-note-covers-styled-by-you): personalization supports fast recognition and individual subject identities.
- [Workflowy bullets](https://workflowy.com/help/bullets): disclosure triangles control expansion; the bullet itself remains a separate navigation target.

The implementation uses CSS artwork for built-in covers, not external stock images or network requests. Eight colors, four textures, and twelve symbols provide variation without a large asset library. Uploaded images stay local, are resized for storage, and can be repositioned. Cover identity carries into an optional softened study backdrop while flashcards retain a solid, readable surface.

Cover changes are drafted in a modal with a live preview. Apply saves; Cancel discards the draft. The shelf supports pinned notebooks. The desk background can be customized independently from each notebook.

Full backups include cover metadata, pinned order and required image assets. Android-compatible backups explicitly reject the new web-only customization data rather than silently losing it. Replaced images remain available in full backups; there is no automatic attachment deletion.

Horizontal action dots and SVG disclosure triangles have separate hit areas. Branch triangles remain visible when expanded. Dots are revealed only by row hover or direct keyboard focus on the menu button, not by selecting/editing a row. Expand/collapse-entire-branch commands operate on descendants without moving or removing content.

The shelf uses compact 3:4 portrait covers, up to 180 by 240 pixels, with a responsive multi-column layout and restrained metadata below. Uploaded images use contain sizing rather than cover sizing, preserving the entire image without distortion; generated cover lettering, shading and textures are hidden over uploaded artwork. The designer preview shares the same aspect ratio.
