# Feature parity — W1 / web v0.1.0

Status reflects source inspection and web implementation, not fresh Android device verification.

| Feature                                           | Android v0.17.0                          | Web W1                                                  | Next                                |
| ------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| Nested bullets and persistent empty bullets       | Implemented                              | Implemented                                             | Device acceptance                   |
| Branch zoom and breadcrumbs                       | Implemented                              | Implemented                                             | Device acceptance                   |
| Drag before/after/inside, autoscroll              | Implemented                              | Implemented                                             | Real pointer/touch checks           |
| Indent/outdent, expand/collapse                   | Implemented                              | Implemented                                             | Device acceptance                   |
| Text and structural undo/redo                     | Implemented                              | Implemented, grouped local history                      | Selection/caret polish              |
| Bulk selection/move/duplicate                     | Implemented                              | Deferred                                                | W2                                  |
| Bold/italic/underline/color/highlight/inline code | Implemented                              | Implemented                                             | Cross-device selection checks       |
| Configurable quick toolbar                        | Implemented                              | Fixed basic toolbar                                     | W2                                  |
| Lists                                             | Implemented                              | Per-node presentation/control; imported values retained | Group actions W2                    |
| Code blocks/syntax highlighting                   | Implemented                              | Imported code displayed; literal newline retained       | Creation/highlighting W2            |
| Auto-highlight                                    | Offline heuristic                        | Preserved, not executed                                 | W2                                  |
| Tags                                              | Text hashtags and descendant aggregation | Text preserved; filters deferred                        | W3                                  |
| Tasks and due dates                               | Implemented                              | Basic checkbox; dates preserved                         | Calendar W2                         |
| Images/GIFs                                       | Local attachment import/view             | File picker, clipboard/drop, originals/backups, preview fallback | Device codec checks          |
| Animated emoji and JSON/TGS import                | Implemented                              | Inline vector playback, picker/import, motion settings, tokens/assets preserved | Atom editor / pack integration later |
| Calendar/daily notes                              | Implemented                              | Existing records editable in Notes                      | Navigation W2                       |
| Linked Q&A decks                                  | Implemented                              | Live source questions, bulk decks and rich answers       | Device acceptance                   |
| Study Desk selection/pins                         | Implemented                              | Deck selection/search; imported pins retained            | Pin control                         |
| Normal study and tag filters                      | Implemented                              | Ordered cram implemented; tag filters deferred           | Tag filters                         |
| Spaced repetition                                 | SM-2 adaptation                          | Rated due-card sessions, eligible queue shuffled         | Device acceptance                   |
| Card browser, suspension, tomorrow hiding         | Implemented                              | Suspension/unsuspend and tomorrow hiding implemented     | Full card browser                   |
| Daily limits and study statistics                 | Implemented                              | Per-deck limits and daily review counts                  | Extended statistics                 |
| Saved current session and review undo             | Implemented                              | Queue/cursor/reveal resume; review undo deferred          | Review undo                         |
| Themes/fonts                                      | Implemented                              | Implemented, browser font families differ               | Device acceptance                   |
| Backup/restore and recovery snapshot              | Implemented                              | Implemented; schema 10/11 import                        | Android device round trip           |
| Trash restore                                     | Implemented                              | Implemented                                             | Device acceptance                   |
| Offline app shell                                 | Native app                               | Generated service worker                                | Real offline acceptance             |
| Android widgets                                   | Implemented, placement OS-dependent      | Intentional platform difference                         | Optional in-app compact study later |
| Accounts/cloud sync/AI card generation            | No active implementation found           | Not added                                               | Separate discussion                 |
| Legacy Goals/Library/Insights screens             | Hard-coded, inactive in main navigation  | Not copied; underlying data preserved                   | No scope commitment                 |

Intentional differences: desktop navigation rail/mobile navigation; Tab/Shift+Tab and Escape; browser fonts; capped visual indentation after eight levels while full hierarchy remains intact; web-only operation journal; unsupported formatting paused rather than stripped; explicit rejection of unsupported ZIP64 archives. Browser storage and clipboard limitations require user-visible errors and downloadable backups. Threads do not synchronize automatically.
