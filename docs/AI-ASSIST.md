# AI Assist

Staging-only rollout. The outline menu offers AI assist and Research answer;
the reader toolbar offers Explain selected passage with AI. Opening an interface
never searches or generates. Account-scoped IndexedDB drafts stay outside workspace
exports and sync. Accepted content uses ordinary notes, reading annotations and
study configuration, including one-step undo and the durable sync outbox.

## Model and limits

Pin `@cf/google/gemma-4-26b-a4b-it`, prompt version 1, temperature 0.2,
`chat_template_kwargs.enable_thinking=false`, `store=false`, and 2,048 maximum
completion tokens. Both max_tokens and max_completion_tokens use that cap.
The model schema supports these fields. No tools, alternate providers, automatic
retries, gateway billing or paid fallback are enabled.

The complete two-message JSON prompt is at most 8,192 UTF-8 bytes. User context
is at most 6,000 bytes; the remaining budget includes instructions, question,
JSON encoding and, in web mode, three bounded search excerpts. Oversized prompts
are rejected without inference. Reserve worst-case cost using one input token
per UTF-8 byte, 512 template tokens, 2,048 output tokens, the current rates of
9,091 input and 27,273 output neurons/million, and a 20% margin, rounded up.
Changing model, tokenizer/template, rates or token limits requires revalidating
the bound before activation.

A D1 BEFORE INSERT trigger atomically enforces 8,000 reserved neurons/app/UTC day.
During staging testing there are no individual-account quotas.
An attempt is admitted only after complete prompt validation. Failed or stopped
inference is never refunded. UUIDs reject duplicate submissions without replay.
The 120-second operational lease exceeds the 90-second provider deadline.
The hourly existing cleanup retains seven days of reservations.

These limits reserve app usage only. Cloudflare's free 10,000-neuron allocation
is account-wide. The owner confirmed Workers Free and no other AI workloads on
2026-11-04. Do not upgrade or activate another workload without revisiting this
budget. Free-tier exhaustion may still stop requests earlier than the app limit.

## Source handling and insertion

General answers are labeled AI-generated. Web mode performs the existing bounded
Bing RSS excerpt search on the server, with no arbitrary URL fetch. Excerpts are
untrusted data, not instructions or full-page evidence. Source IDs are checked;
insufficient evidence cannot be accepted as a sourced answer. Links stay in the
preview; saved answer bullets contain plain text.

Study output is validated before acceptance. Three candidates are requested; one
to three valid candidates can be reviewed. Every MCQ needs four distinct options,
one correct option and an explanation. Accepted candidates create a new child
study set; MCQs remain excluded from All flashcards. Existing notes and study
types are preserved. Reader acceptance atomically captures/reuses the passage
note and appends the accepted result. Deleted targets disable insertion; changed
note context requires explicit acknowledgement. Duplicate acceptance uses a
persisted insertion identity, including when retrying a failed local save.

## Rollout and operations

1. Apply additive cloud/ai.sql to staging D1 only. Keep existing schemas/data.
2. Deploy the tested matching Worker with an AI binding, AI_ENABLED=false and
   AI_FREE_TIER_CONFIRMED=false. Preserve all existing bindings, secrets and cron.
3. Confirm the account/model/free-tier limits, run the synthetic evaluation and
   enable the two switches only for staging. No other environment is changed.
4. Deploy the feature branch through the staging workflow after coordinating
   with the current staging tester. Record branch, SHA and release on deployment.
5. Validate mobile and desktop generation, editing, acceptance, undo/redo,
   reload, account isolation, source failures and quota exhaustion.

GET /ai/status returns availability and the shared UTC reset.
POST /ai/generate accepts requestId, operation, mode, question and context;
it streams progress/text/done/error NDJSON. A completion is actionable only after
server validation. Search with zero sources returns a non-supported JSON result
without invoking AI. Requests require the existing Firebase identity and CORS.

No prompts, source excerpts or responses enter server storage, logs or shared
caches. Reservation metadata records completion timing and outcome. Inspect
Cloudflare AI usage and operational events for errors/latency. AI_ENABLED=false
is the kill switch; notes, drafts and sync continue working.

## Structure operations and /ai commands

The outline slash menu offers `/ai list`, `/ai outline`, `/ai diagram`, `/ai mindmap`
and `/ai answer`. Each opens the same reviewed draft for the bullet, with the
bullet text as the editable topic (add an instruction such as "names only"). The
operations `list`, `outline`, `mindmap` and `diagram` request JSON
(`{"items"}`, `{"outline"}` or `{"mermaid"}`), use general knowledge with the
bullet and its children as context, and share the existing model, byte limits,
quota and reservation path; no new model or provider is used.

`validateAiResult` normalizes them to editable preview text: one item per line,
two-space indentation (at most four levels and 80 entries) or Mermaid source that
must start with a known diagram type. Nothing is inserted until accepted. Lists and
outlines become child bullets after existing children; mindmap also sets the
bullet's existing `mindmap` flag; diagrams become one fenced Mermaid bullet, shown
with the normal diagram renderer in the preview. The first new bullet carries the
insertion identity, so retries never duplicate and one undo removes the insertion.

Generated images are not offered: the configured model is text-only. Adding an
image model would change the reserved neuron bound above and needs a separate
budget review, media upload path and staging validation.

## Using your own AI app

Every AI assist draft for a bullet (not reader passages) has **Use your own Claude
or ChatGPT**. It builds a prompt for an app connected through Settings → AI apps
(MCP; see [MCP.md](MCP.md)): read the bullet with `read_page`, then add the result
under it with `write_notes`, `write_mindmap`, `create_flashcards` or
`create_mcqs`, matching the chosen action. The prompt carries the bullet id, its
title as a label and the typed request; the app reads the note itself through the
connector. **Copy prompt** copies it, and **Open in Claude** / **Open in ChatGPT**
open a new chat with it filled in (system browser in the apps).

The work runs on the person's own AI plan and writes back as an ordinary AI app
change (listed in recent activity, synced, undoable like other connector edits).
It uses none of the built-in daily allowance, so the section opens by itself when
generation is paused, the account's 10 daily generations are used, or the shared
allowance is spent. Nothing is sent anywhere until the person sends the prompt in
their app.

## Images and selected questions

Choose Generate image from a bullet menu, edit the prompt, generate, then attach
the reviewed JPEG. The Worker calls FLUX.1 Schnell at four steps and reserves
120 neurons to cover up to a 2048 × 2048 result. It returns the image directly
and keeps only operational metadata. Accepted images use ordinary attachments.

Select multiple bullets and choose Answer selected bullets with AI. The dialog
generates one answer per question in order using general knowledge. It keeps
finished answers available when an attempt fails, is stopped or hits the shared
budget. Review, edit or deselect the answers, then append them together in one
undo step. Mirrored bullets resolve to their source.

For an existing staging database run `cloud/ai-testing-quota.sql` before rolling
out the updated client. It installs the shared guard, retires the earlier
per-account trigger and preserves every reservation already recorded.

## Where AI actions appear

- **Bullet menu (⋯):** Ask AI, Answer selected bullets, Generate image.
- **Bulk bar** (several bullets selected): an **AI** button opens Answer each
  (one answer under every selected root), Summarize, Outline, Flashcards, MCQs
  and Mindmap (the selection is the context and the result goes under the first
  selected bullet), and Generate image when one bullet is selected.
- **Slash menu:** `/ai list`, `/ai outline`, `/ai diagram`, `/ai mindmap`,
  `/ai answer`, `/ai answer children` (answers each child as its own question),
  `/ai image`, `/ai summary`, `/ai flashcards` and `/ai mcqs`.

All of them open the same reviewed drafts and dialogs; nothing is added until
accepted, and limits are unchanged.

## Dictation

Type `/dictate`, choose Dictate from the bullet menu, or tap the microphone in the
phone editing toolbar. A pill shows "Listening" with the time left today; Done (or
Escape) stops, and the transcript goes in at the cursor, or is appended to the
bullet if editing has ended, so a late transcript is never lost. Capitals and spaces
are joined to the text before it (`src/dictation-text.mjs`).

The browser records with MediaRecorder at 32 kbps (WebM/Opus in Chrome, Edge,
Firefox and Android; MP4/AAC in Safari and macOS WebViews) in one-minute chunks,
each a complete file sent in order to `POST /ai/transcribe?id=<uuid>` with the
audio as the body (at most 3 MB). The Worker runs `@cf/openai/whisper-large-v3-turbo`
with voice-activity filtering and returns `{text, language, duration,
remainingSeconds}`. Audio and text are never stored; `ai_requests` keeps only the
usual operational row, with an `audio:` id prefix.

Cost: the model is about 46.63 neurons per audio minute; the Worker reserves 56 per
minute (20% margin) for a full two-minute chunk, then settles the row to the
measured duration. Each account has 10 dictation minutes per UTC day (counted from
those rows, separately from text and images) inside the shared 8,000-neuron app
limit; `/ai/status` reports `audioRemainingSeconds`. Language is detected
automatically. A sentence can be split where one chunk ends and the next begins.
