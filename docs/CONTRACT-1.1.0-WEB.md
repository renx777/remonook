# Web study behavior revision 1.1.0

This revision extends the web behavior in the proposed 1.0.0 baseline; it does not change the Android application or the schema-11 archive layout. Implementation details and examples are in [STUDY-FEATURES.md](STUDY-FEATURES.md).

1. Explicit QUESTION bullets use all ordinary child notes, including meaningful descendants beneath blank containers, as answers. A marked image-only question can qualify. Nested questions remain separate and excluded from enclosing answers.
2. Deck registration derives alternating levels without rewriting node kinds. If no deeper pairs exist, the deck root and its direct answer children form one card. Card identities remain source bullet IDs and content updates retain scheduling.
3. Cram uses NORMAL sessions and PRACTICE logs in outline traversal order. SPACED sessions filter by availability/due time and daily budgets, then shuffle the eligible queue. The existing scheduler formulas and shared scheduling test vectors are unchanged.
4. Sessions, integer review IDs, daily limits, suspensions, and burial use the existing shared tables/fields. Daily boundaries use the browser's local timezone.
5. New image attachments use the existing media table and archive assets. Share links remain ordinary bullet text and their players are derived on display. No new shared table or column is emitted.
6. Full web metadata records `studyVersion: 2` after a one-time source-card refresh, including single-pair decks. Independent imported cards are retained. The shared baseline version and archive schema stay unchanged; Android-compatible exports omit web operational metadata as before.

Compatibility: both backup variants round-trip the stored fields and original attachment bytes. Exact Android behavior for ordinary unmarked answer children, image codecs, web players, and shuffled queues differs from this web revision. No claim of cross-device UI or behavior parity is made.
