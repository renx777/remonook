# Research beside notes

Bullet actions → Research answer opens a desktop side panel or mobile sheet. The question automatically fetches web excerpts inside the panel. Users can edit the query and search again. Choosing Use as answer (or Use selected text) puts result text into the editable answer field. Source links are optional for checking the original page. The answer draft accepts ordinary paste, editing, and line breaks. Clipboard reading is attempted only through the explicit paste button. The destination stays attached to its source bullet, including when opened through a mirror.

Drafts live in the account database's `meta/research-drafts` record, outside workspace records, sync, and archives. A local generation rotates atomically during backup restore or importing guest notes into an account. Unfinished drafts can be resumed from bullet actions or Outline options → Research drafts; missing destinations remain available for copying.

Insertion journals the planned child ID in the draft before the outline edit, appends one ANSWER child, expands its parent, and waits for ordinary local persistence. A retained insertion ID lets a retry finish saving without appending a second child. Successful device saving clears the draft; the answer then follows ordinary sync and backup paths. Insertion is one outline undo step and does not change the parent's study type.

Tutorial: `/guides/research`.

## In-app search

`POST /api/research/search` accepts `{query}` and returns `{query, provider, results:[{title,text,url,source}]}`. The staging frontend Worker and local Vite middleware share the same implementation. It requests the Bing RSS feed for the question subject, rejects unrelated or unsafe entries, and shows excerpts without presenting them as generated answers or Google AI Overview text. Responses are bounded, time-limited, and marked no-store. Queries are sent only when opening Research answer or explicitly searching again. Search results are not persisted with drafts or notes.

The result list handles loading, no matches, unavailable providers, retry, and stale request cancellation when a panel or destination changes. Existing drafts, insertion IDs, and answer-saving behavior are preserved. The endpoint lives beside the staging assets, outside the private sync service. Publishing to another host requires providing this endpoint there; it must not fall through to the SPA document.
