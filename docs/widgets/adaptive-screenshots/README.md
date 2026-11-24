# Adaptive widgets and native actions

These are actual RemoteViews renders from synthetic notes in the API 33
Robolectric renderer, source `87ce245c501a0d59639e83d8c9e9ecd3da0a595b`.
[Native verification run](https://github.com/renx777/remonook/actions/runs/45319543425).
They are not physical-launcher captures. The tests also exercise API 28 resources
and actual durable event publication on Android API 28 and 33 emulators.

| 110 × 110 dp | Default text | 200% text |
| --- | --- | --- |
| Study | ![Study](adaptive-study-1.webp) | ![Study at enlarged text](adaptive-study-2.webp) |
| Today | ![Today](adaptive-today-1.webp) | ![Today at enlarged text](adaptive-today-2.webp) |
| Capture | ![Capture](adaptive-capture-1.webp) | ![Capture at enlarged text](adaptive-capture-2.webp) |
| Focus | ![Focus](adaptive-focus-1.webp) | ![Focus at enlarged text](adaptive-focus-2.webp) |
| Rhythm | ![Rhythm](adaptive-rhythm-1.webp) | ![Rhythm at enlarged text](adaptive-rhythm-2.webp) |
| Resurface | ![Resurface](adaptive-resurface-1.webp) | ![Resurface at enlarged text](adaptive-resurface-2.webp) |

Small layouts preserve their primary native action. Secondary actions/context
appear as space permits. Long study text is paged without dropping characters;
Next stays on one line and exposes progress to accessibility services. A small
revealed card offers grade selection and Other; larger cards show all four grades.

Focus also has regression captures at its 100 dp resize limit:

| 110 × 100 dp, 200% | 180 × 100 dp, 200% |
| --- | --- |
| ![Narrow timer](adaptive-focus-min-110-2.webp) | ![Wide timer](adaptive-focus-min-180-2.webp) |

| Marigold revealed study | Electric Iris dark revealed study |
| --- | --- |
| ![Marigold answer and grades](marigold-4x4-revealed.webp) | ![Iris dark answer and grades](iris-4x4-revealed.webp) |

Study reveal/paging/grading, Today Done, Focus Start/Pause/End, Rhythm range and
Resurface Next run natively. Capture uses a small native input dialog. Photo and
voice review still open their existing app interfaces. Setup, locked, stale-cache
and genuine error states may require opening the app; they do not pretend to
complete an unavailable action. Old review evidence is never deleted.

The owner still needs to verify the update on their phone/launcher. These renders
do not prove OEM launcher sizing, system keyboard behavior or speech-provider
availability on a particular device.
