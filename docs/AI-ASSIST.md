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

A D1 BEFORE INSERT trigger atomically enforces ten attempts/user/UTC day,
two/user/minute, one active request/user and 8,000 reserved neurons/app/UTC day.
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

GET /ai/status returns availability, personal remaining attempts and UTC reset.
POST /ai/generate accepts requestId, operation, mode, question and context;
it streams progress/text/done/error NDJSON. A completion is actionable only after
server validation. Search with zero sources returns a non-supported JSON result
without invoking AI. Requests require the existing Firebase identity and CORS.

No prompts, source excerpts or responses enter server storage, logs or shared
caches. Reservation metadata records completion timing and outcome. Inspect
Cloudflare AI usage and operational events for errors/latency. AI_ENABLED=false
is the kill switch; notes, drafts and sync continue working.
