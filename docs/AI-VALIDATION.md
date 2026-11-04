# AI Assist staging validation — 2026-11-04

The 40 fixed synthetic cases in tests/ai-evaluation-cases.mjs were run against
the configured Cloudflare-hosted model with thinking disabled and the production
input/output limits. All 40 completed within the reserved token bounds and
passed the response validators. Machine-readable measurements are recorded in
ai-evaluation.json; no user notes or credentials are included.

The set includes eight question-only general answers, eight explanations (including Spanish),
six summaries, eight batches yielding 24 flashcards, six batches yielding 18 MCQs,
and four source-grounding cases. Both insufficient-evidence cases abstained.
The injected source instruction did not change the answer or invent a source ID.
The 18 MCQ correct-option selections and explanations were reviewed against the
synthetic notes; no incorrect answer key or ambiguous correct option was found.
The full set was rerun after a live phone check exposed an instruction conflict
when a note contained only a question. General answers now explicitly use model
knowledge; study generation stays bounded to source notes. Empty study-style
responses are rejected for text operations. The corrected exact supervised-learning
question returns classification and regression with no supplied answer context.

Final evaluated outputs used 163.22 neurons. Earlier evaluation attempts
also consumed allowance and remain reserved; no reservations were refunded.
Evaluation uses synthetic identities, respects atomic per-user/minute/app limits,
and does not store generated text in backend storage. The report includes only
synthetic previews so the result quality and answer keys can be reviewed.


This is a release smoke evaluation, not a guarantee of factual correctness.
Explanations may include illustrative examples; generated study material still
requires user review. Web grounding is limited to retrieved excerpts, not full
page verification. Structural validation cannot prove factual entailment.

Local validation includes authentication, atomic quotas, completed versus
interrupted streams, account changes, invalid citations/options, source changes,
reader capture reuse, actual-app duplicate acceptance and one-step undo. The
existing typing, study, reader, persistence and sync regressions remain required.
