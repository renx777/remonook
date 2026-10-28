# Research beside notes

Bullet actions → Research answer opens a desktop side panel or mobile sheet. A separate query opens Google in a new tab. The answer draft accepts ordinary paste, editing, and line breaks. Clipboard reading is attempted only through the explicit paste button. The destination stays attached to its source bullet, including when opened through a mirror.

Drafts live in the account database's `meta/research-drafts` record, outside workspace records, sync, and archives. A local generation rotates atomically during backup restore or importing guest notes into an account. Unfinished drafts can be resumed from bullet actions or Outline options → Research drafts; missing destinations remain available for copying.

Insertion journals the planned child ID in the draft before the outline edit, appends one ANSWER child, expands its parent, and waits for ordinary local persistence. A retained insertion ID lets a retry finish saving without appending a second child. Successful device saving clears the draft; the answer then follows ordinary sync and backup paths. Insertion is one outline undo step and does not change the parent's study type.

Tutorial: `/guides/research`.
