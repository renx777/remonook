# FSRS scheduling

Spaced reviews use the supported FSRS-6 model in pinned `ts-fsrs` 6.0.0. RemoNook composes the library’s default scheduling policies synchronously so grading and its atomic local save do not wait for an asynchronous model download. Default weights are the upstream FSRS-6 preset; this release does not train personalized weights.

## Behavior

All spaced grades, including MCQ correctness and image occlusion reviews, pass through the same scheduler. Again means forgotten; Hard means recalled with effort. New cards learn at 1 minute and 10 minutes; relearning uses 10 minutes. Easy can graduate directly. Due learning cards can be reviewed again without spending another daily new/review slot. A finished session shows the next learning due time and offers another review as soon as cards become due. Cram and missed-question practice do not update FSRS memory.

The default desired retention is 90%, adjustable from 80% to 97%. Global maximum interval is 1–36,500 days. Deck retention overrides follow the card’s owning (nearest nested) deck, even when reviewing all cards. Clearing an override restores the global target. Configuration changes affect future grades only. Fuzzing is disabled so previews and committed schedules agree.

## Migration and compatibility

Existing due dates, suspension/burial, content, and review records remain unchanged on upgrade. On first spaced grading, chronological SPACED history is replayed when it reaches the last recorded review; PRACTICE is excluded. Incomplete history uses the existing interval/stability and difficulty as an estimate, never a claim of precise reconstructed history. The new grade then stores real FSRS memory. Later older-client reviews invalidate a stale snapshot by its last-review timestamp and seed the next FSRS review again.

`cards.fsrsState` is a scalar JSON snapshot containing model version and the complete scheduled card. The pre-existing stability, difficulty, due, repetition and interval fields are updated alongside it. Legacy ease remains for compatibility and no longer controls web intervals. `review_logs.fsrsReview` stores compact before/after memory, retention and maximum interval. Version 6 snapshots use `b`/`a` arrays in this order: stability, difficulty, state, dueAt, lastReviewAt, reps, lapses, scheduledDays, learningStep. `readFsrsReview` expands them. Existing log fields retain card ID, timestamp, grade and next due date. Random safe-integer review IDs prevent independent offline devices from reusing max-ID+1.

Extra columns are declared before saving, so full backups and CRDT sync preserve them. Global preferences use primitive `fsrsRetention` and `fsrsMaximumInterval` keys to remain compatible with the archive preference contract. Android-compatible exports warn that older Android schedulers do not use FSRS; use a full web backup to retain the whole web setup. There is no destructive startup migration, history wipe or bulk due-date rewrite. Undo continues to restore a review’s card, log and session together through normal workspace history.

## Verification

`tests/fsrs.test.mjs` checks four-grade sequences against the upstream DefaultScheduler, learning/relearning, migration, retention, limits, practice isolation and daily budgets. `tests/fsrs-storage.test.mjs` verifies durable reload, full backup/restore and concurrent offline convergence. Existing study/MCQ/occlusion tests cover their shared grading path. The historical `scheduler-v1.json` fixture documents the retired Android SM-2-style scheduler; it is no longer the expected web behavior.

References:
- https://github.com/open-spaced-repetition/ts-fsrs
- https://open-spaced-repetition.github.io/ts-fsrs/guide/model/
- https://open-spaced-repetition.github.io/ts-fsrs/guide/scheduler/
