# Responsive typing

The previous note-edit path called `startTransition` around the model mutation,
but that callback still ran synchronously. Every character scheduled the whole
workspace, advanced a React history tick, and rebuilt formatting controls even
when their visible state had not changed. Hidden color/annotation palettes also
constructed their complete contents during these renders.

## Updated path

- ProseMirror keeps its immediate native editing surface. Every transaction still
  updates `docRef`, mirrors, derived cards and undo history synchronously, so an
  immediate Enter, Backspace, Undo, backup or save reads all the latest text.
- Passive React workspace echoes coalesce until a 220 ms typing pause. Leaving
  an editor, opening commands/menus, finishing a book note or making a structural
  edit publishes the current snapshot immediately. Older echoes reconcile against
  the authoritative model and cannot replace newer characters.
- The existing 180 ms durable-save scheduling and atomic Yjs outbox remain intact.
  Saving can acknowledge a snapshot without forcing the whole workspace to render
  mid-word. Storage failures remain actionable. Device status uses a small local
  signal with its own subscriber; it changes immediately. Cloud acknowledgement
  revisions keep pending local changes from being displayed as Synced.
- Formatting subscriptions compare selection/mark state rather than refreshing
  for every character. The mobile toolbar subscribes only on mobile.
  Closed color and annotation panels mount their contents only when opened.
- Zoomed titles own an immediate field draft and reconcile from the live model.
  Composition cannot submit a title or be overwritten by a passive echo. Remote
  adoption retries automatically while a title is composing, as for ProseMirror.
- Outline search owns an immediate input draft. Its expensive filtering consumer
  waits 120 ms for a pause; blur/Enter/filter actions flush it. Composition and
  navigation/clear cancellation are covered. Command and shortcut-reference input
  state remains local to their existing components.

## Validation

A matched production-build Chromium comparison used 2,000 synthetic notes with
1,000 question cards, 57 typed characters and 4× CPU throttling. Observed
beforeinput-to-next-animation-frame times were:

| Observation | Previous | Revised |
| --- | ---: | ---: |
| Median | 25.8 ms | 19.2 ms |
| 95th percentile | 46.0 ms | 32.9 ms |
| Maximum | 83.4 ms | 51.2 ms |

These are controlled browser observations including frame scheduling/profiling,
not field INP or a guarantee for every device. The development-build CPU profile
also confirmed that the workspace stopped rendering on ordinary keystrokes.

All 109 regression files and the production build passed. After the final
acknowledgement-status refinement, targeted typing, pane and sync tests passed
again. Browser checks covered rapid typing while saving, mid-word deletion,
Undo/Redo, native Japanese composition in both notes and titles, immediate command
search for a freshly typed title, outline search/clear, and mobile formatting.
The browser fixture initialized a real local Yjs outbox and verified exact saved
note/card content plus pending outbox entries, without real account data.

The new regression suite checks status isolation, pending acknowledgement display,
formatting subscriptions, stale title echoes, search coalescing, composition,
blur/navigation reconciliation and cancellation on unmount. Existing sync tests
continue to cover automatic merging and rich-text preservation.

The live release check also caught an immediate-Undo case: Undo could restore
text equal to the last React prop before a passive echo, so a dependency-limited
reconciliation effect did not run. Notes, reader notes and titles now reconcile
on every published render, with their existing equality checks preventing
unnecessary content replacement. Regression tests cover Undo/Redo while rendered
props remain identical, plus the older-echo case.

Live pointer testing found that blurring a pending search could remount its
conditional Clear button between pointer-down and click. Clear now prevents the
pointer-down focus transfer, retaining the intended input focus and allowing its
click to cancel the pending query. A regression assertion and 20 consecutive
real-pointer browser cycles passed.
Blur now requests reconciliation after publishing instead of briefly resetting
the draft to the previous parent value. This also keeps a keyboard-focused Clear
button mounted. Native Tab/Enter activation passed alongside the pointer cycles.
