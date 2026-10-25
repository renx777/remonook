# Image tools and image occlusion

Attached images in Notes and Calendar have a corner resize handle. Drag it horizontally/diagonally to change width while preserving proportions. Arrow keys on the handle adjust width by 5%; Home/End choose 15%/100%. Reset size returns to full width. One drag creates one undoable change, and the saved percentage adapts to the available space.

Click an image or choose **View full screen** to open a viewport-sized viewer that fits the entire original. Escape or Close returns focus to the image tool. Loaded linked images also support full view.

Choose **Image occlusion** under an attached image. Draw rectangular regions, add optional answer labels, choose Hide all/reveal one or Hide one/reveal one, and create a new deck or add the cards to an existing flashcard deck. One region creates one real outline question and its answer; existing topic navigation, cram/spaced review, suspension, sessions and statistics apply normally. Generated notes initially collapse to keep the outline compact.

Study cards keep normalized masks aligned with the picture at any size, including full view. Show answer reveals only the current region. Edit card opens the region editor; existing regions retain their card IDs and schedules. New regions join the next session, and removed regions become unavailable. Backups retain masks, image widths, progress and the original file. Repeated cards reference the same stored image rather than duplicating its bytes. Legacy Android-compatible exports are blocked when extended image metadata would be lost.

Validation: 111 automated tests, including end-to-end pointer resizing, drawing regions, creation, study reveal, editing/cancel, topic scoping, schedule preservation, shared image bytes, malformed masks and full backup round trips. Desktop and 390px-wide browser checks cover full view, creation/editing, both hide modes and the responsive study layout.
