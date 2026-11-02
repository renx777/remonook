# Signed-in typing performance — release 2026-11-02.1

Explore and signed-in typing have different persistence costs. A previous guest-only environment comparison did not exercise account saves or automatic cloud sync and could not rule out account-specific stalls.

## Change

Account saves, Yjs document reconstruction/encoding, outbox processing, projections and selection mapping now run in a dedicated browser worker. The worker uses the existing IndexedDB transactions and protocol, including atomic workspace/outbox writes, stable operation IDs, backend acknowledgements and automatic concurrent merging. Account identity is captured per operation. Guest saves retain their existing path.

Worker save acknowledgements return only the new revision. The live workspace keeps its existing object references, preventing an acknowledged save from invalidating the outline unnecessarily. Cloud status subscribers update the status controls without rendering the whole application.

Autosave remains 180 ms and automatic polling remains 2 seconds. Flashcard derivation remains synchronous, preserving immediate card consistency. Remote document adoption rechecks the active document, attachments and pending edits after asynchronous selection mapping, so typing during worker requests is not overwritten.

Worker startup failure falls back to the original store before dispatch. A failure after dispatch is surfaced as a saving error; it never blindly repeats a potentially committed operation. Edits remain in the tab and existing saving/unload protections apply. No database migration or backend release is required.

## Browser measurements

Two repetitions per condition, fresh Chromium, 1,000 synthetic notes and 500 question cards. The signed-in fixture uses synthetic authentication and the real local sync/v2 backend. Each run types the same 111 characters with short pauses that exercise autosave. Runs were sequential, without concurrent compilation. These are controlled reproductions, not measurements of the owner's production account or physical phone.

| Condition | Long tasks across two runs | Worst main-thread long task | Mean active keyboard-action wall time |
| --- | ---: | ---: | ---: |
| Desktop, guest before | 0 | — | 1,445 ms |
| Desktop, account before | 40 | 469 ms | 8,234 ms |
| Desktop, account after | 0 | — | 1,667 ms |
| Desktop, guest after | 0 | — | 1,394 ms |
| 4× CPU throttle, guest before | 2 | 69 ms | 2,704 ms |
| 4× CPU throttle, account before | 24 | 2,044 ms | 16,961 ms |
| 4× CPU throttle, account after | 5 | 88 ms | 3,948 ms |
| 4× CPU throttle, guest after | 3 | 78 ms | 3,077 ms |

Keyboard-action wall time includes automation overhead and requested inter-key delays; it is not input-to-photon latency. A beforeinput-to-animation-frame proxy alone misses time spent waiting for a blocked event loop before the handler starts. Long tasks and total main-thread task time establish the account-specific regression more clearly.

All measured runs preserved exact text, derived answers and final server acknowledgement. Native worker requests were observed in the updated account runs. A separate blocked-worker test verified fallback save/sync correctness; its timings are excluded because compilation ran concurrently.

The remaining throttled-device tail is close to the guest baseline, not a claim of zero latency on every device. The owner's signed-in production experience still needs confirmation after loading this release.

## Regression coverage

The suite covers durable storage, sync retries, simultaneous edits, reconnects, attachments, authentication/quota errors, editor typing, Undo/Redo and composition. Added checks cover account changes during asynchronous saves, structural sharing on acknowledgement, and status changes without rendering the editor owner. The staging gate includes account persistence and cloud-sync runtime tests.
