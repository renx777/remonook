# Flashcards and rich media

## Notes are the source of truth

- Use a bullet’s action menu → **Turn into question**. Its children and their nested content form the answer; individual children do not need an Answer type.
- Use **Make Q&A deck** on a container bullet. The menu previews the number of cards. Its children with answers become questions; deeper alternating question/answer levels are included. This registers the branch without rewriting the notes. New pairs added later join the deck automatically.
- Explicit nested questions become separate cards and do not leak into another question’s answer. Duplicate deck membership does not create duplicate card IDs.
- A branch containing just one question with direct answer children also works as a one-card deck; when there are no deeper question/answer pairs, the root supplies the question.
- A question or answer may contain only an image. Blank answer containers can also contain meaningful descendants.
- Rich formatting, hierarchy, images, and supported media players are rendered directly from the source bullets. Source edits preserve card IDs, schedules, and review history. Deleting source content deactivates the associated card.

## Study Desk

Study Desk lists all flashcards and each registered branch deck. It shows available cards, cards ready for review, daily activity, and a resumable session. Each deck has a source link and independent daily new/review limits; −1 means unlimited, 0 disables that category. Nested decks own their own limits. The All flashcards limits apply to questions outside registered decks.

**Cram** visits available cards in the exact expanded outline order, ignoring collapse state and daily spaced budgets. Reveal the answer, then advance. Practice is logged, but schedules remain unchanged.

**Spaced repetition** selects new and due cards within daily budgets, then shuffles that eligible queue. It does not pull future cards forward at random. Again/Hard/Good/Easy use the existing tested SM-2 adaptation: Again returns in 10 minutes, with later intervals based on repetitions, interval, and ease. Interval previews appear on the rating buttons. Scheduling and the review event are saved together. Imported schedules remain usable.

Pause a session or leave for the source notes and resume later, including after reload. The saved queue, cursor, reveal state, and review count are preserved. Cards removed, suspended, or buried during a session can be skipped safely. Hide until tomorrow uses the browser’s next local midnight; suspended cards can be restored from Study Desk. Same-day relearning does not use an extra daily budget slot. Note undo does not rewind completed reviews.

### Immersive study and stable controls

Both modes support **Immersive** during a session, or **Start in immersive mode** before starting/resuming. This requests native fullscreen from the button gesture and hides navigation behind a focused study surface. If fullscreen is unsupported or denied, the same distraction-free focus view remains available with an explanatory notice. Exit immersive or Escape returns to the normal session without grading, advancing, or losing the revealed answer. Pause & return saves the session and leaves fullscreen. Opening source notes also exits safely.

Show answer and Next card occupy the same centered, fixed-size button in a bottom dock in both normal and immersive sessions. Spaced rating buttons use the same reserved dock area. Only card content scrolls; long text, images, embeds, and the next card cannot move the controls. New cards reset the content scroll, and revealing an answer below the visible area scrolls it into view. Mobile layout reserves room for navigation and safe-area insets. Keyboard focus stays within immersive study; background navigation and outline shortcuts are inactive.

Keyboard: Space reveals the answer; in cram, Space also advances after reveal. In spaced review, 1–4 rates the revealed answer. F toggles immersive. Escape leaves immersive first; in a normal session it pauses. The start-in-immersive checkbox applies while Study Desk is open, not to saved scheduling data.

## Images and share links

Add one or several images from a bullet menu, paste clipboard images into its editor, or drop image files onto a bullet. Originals stay in local IndexedDB and full/Android-compatible ZIP backups. Individual images can be removed from a bullet and restored with Undo. Limits follow existing backups: 64 MB per attachment, 1 GB total.

The renderer supports browser-decodable image formats, including JPEG, PNG/APNG, GIF, WebP, AVIF, SVG, BMP, and ICO. Other accepted image types, including HEIC/HEIF, TIFF, JXL, PSD, and RAW, retain their originals and show a download fallback when that browser has no decoder. This is not a universal image conversion service; no files are uploaded to a conversion server. [Browser image-format reference](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types).

Pasting a supported share URL into a bullet automatically produces a media card. **Insert media link** also accepts a URL or iframe embed code, extracting only the source URL. YouTube watch/share/shorts/live links, Instagram public post/reel/TV links, Vimeo, direct image links, and ordinary web links are recognized. Arbitrary iframe HTML is never executed. Embedded players load on click; other links stay ordinary links. YouTube time offsets are preserved. Private/deleted posts, embedding-disabled videos, provider cookie restrictions, and network failures may prevent playback, so every player retains an original-source link. [YouTube embed reference](https://developers.google.com/youtube/player_parameters).

## Storage and compatibility

No account or AI service is required. Card metadata, reviews, daily limits, and sessions use existing schema-11 tables. Cram uses mode NORMAL and PRACTICE logs; spaced reviews use SPACED. Web spaced queues are shuffled after due/budget filtering, while the Android reference documents due-time order. Explicit-question answers now include ordinary child notes and meaningful descendants; this extends the earlier W1 explicit Answer-kind qualification rule. Originals and progress are tested through both backup variants. An Android reader’s rendering of the new image formats or remote players is not guaranteed by the web implementation.

## Validation

Domain tests cover outline order, image-only questions/answers, daily budgets, nested-deck ownership, schedule changes, session serialization, URL allowlisting, and timestamp normalization. App integration tests exercise question creation, SVG attachment persistence, image-rich answer reveal, cram logging, and unchanged scheduling. Immersive regression checks cover fullscreen lifecycle, rejected-fullscreen fallback, background isolation, keyboard exit, resume preference, source navigation, and grading focus. Backup tests cover review logs, sessions, and image bytes in full and Android-compatible ZIPs.

Live browser checks cover bulk conversion of a three-question branch, ordered cram, due-count changes after grading, pause/resume UI, and conversion of a YouTube share link into an iframe. Automated browser file selection was blocked by the Chrome extension’s file-URL permission; the normal file-picker save path was verified through app integration tests instead.

Immersive acceptance checks used a separate local test workspace in Chrome: native fullscreen entry from Start/Resume, Escape preserving the current revealed card, long-answer scrolling, and responsive 390px mobile layouts. At a 1920 × 935 desktop viewport the cram action retained the exact 240 × 52 rectangle at (840, 811) across reveal, advance, and scrolling. At 390 × 844 immersive mobile size it remained at (75, 724); spaced ratings retained the dock bounds across reveal. Preview: [immersive study](immersive-study.jpg). Physical iOS fullscreen behavior remains unverified; unsupported browsers use the focus-view fallback.
