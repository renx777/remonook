# AI Assist staging validation — 2026-11-04

The 40 fixed synthetic cases in tests/ai-evaluation-cases.mjs were run against
the configured Cloudflare-hosted model with thinking disabled and the production
input/output limits. All 40 completed within the reserved token bounds and
passed the response validators. Machine-readable measurements are recorded in
ai-evaluation.json; no user notes or credentials are included.

The set includes eight general answers, eight explanations (including Spanish),
six summaries, eight batches yielding 24 flashcards, six batches yielding 18 MCQs,
and four source-grounding cases. Both insufficient-evidence cases abstained.
The injected source instruction did not change the answer or invent a source ID.
The 18 MCQ correct-option selections and explanations were reviewed against the
synthetic notes; no incorrect answer key or ambiguous correct option was found.
Summaries were rerun after strengthening the instruction against adding outside
material; their final results replace the earlier measurements in the report.

Final evaluated outputs used 185.12 neurons. Earlier summary attempts also
consumed allowance and remain reserved; no reservations were refunded. Evaluation
uses four synthetic identities per round, respects the same atomic per-user,
minute and app limits, and does not store generated text in backend storage.

This is a release smoke evaluation, not a guarantee of factual correctness.
Explanations may include illustrative examples; generated study material still
requires user review. Web grounding is limited to retrieved excerpts, not full
page verification. Structural validation cannot prove factual entailment.

Local validation includes authentication, atomic quotas, completed versus
interrupted streams, account changes, invalid citations/options, source changes,
reader capture reuse, actual-app duplicate acceptance and one-step undo. The
existing typing, study, reader, persistence and sync regressions remain required.
