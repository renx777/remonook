# Android home-screen study widget

This is a native `AppWidgetProvider`/`RemoteViews` surface, not a shortcut opening the main app. Setup deliberately opens a small native deck chooser; Reveal, text pagination, Next and grading broadcasts stay outside the foreground app.

## Setup and use

1. In RemoNook, open **Settings → Study → Study outside the main window** and enable widgets for this workspace on this device.
2. On the Android launcher, long-press the home screen → Widgets → RemoNook → **Study flashcards**. Choose a cached deck for this instance. Each instance has independent configuration.
3. Text starts hidden by default. Tap **Show question**, read all question parts, then **Reveal answer**. Long text is split without dropping words; grading appears only after the final answer part. Tapping the answer returns to the question. **Next** skips a card without grading.
4. Again/Hard/Good/Easy first save an immutable private review intent. The widget advances locally and says **saved on device · pending app**. The canonical app engine applies the grade and normal durable sync when it runs. The widget does not implement FSRS or claim a server sync acknowledgement.
5. When the cached supported due-card queue is exhausted, open RemoNook to apply pending reviews and refresh it. This does not mean the entire deck has been completed. Unsupported media, MCQs and other card types stay in the app.

A narrow or short widget shows a resize instruction rather than displaying a clipped question/answer. Text budgets account for font scaling and wide characters; launcher resize events rebuild the view. Night-mode resources provide explicit high-contrast colors. Privacy configuration can keep content hidden until the person taps it; the widget is declared only for home-screen hosts, not lock-screen use.

## Private exchange and durability

Tauri Android `app_data_dir()` resolves to `PathPlugin.getDataDir()` → `Activity.dataDir`/`applicationInfo.dataDir` (not `filesDir`). Both Kotlin and Rust therefore use `<applicationInfo.dataDir>/remonook-study-widget`.

The snapshot and event schema are shared with the Rust broker and canonical JavaScript engine. Snapshot changes are atomic replacement of `snapshot.json`. `MainActivity` watches `CLOSE_WRITE`/`MOVED_TO`/`DELETE` while its process is alive, refreshes widgets on resume, and the OS also requests periodic updates. If the app is stopped, cached native study and intent storage still work; newer notes require an app refresh.

Review files are fully written and fsynced under a temporary ignored filename, then published with `android.system.Os.link` as a no-overwrite operation. The inbox directory is fsynced afterward. Existing IDs are never replaced. A private reference index is committed before publication and excludes a card only if the referenced immutable file actually exists in `inbox/` or `processed/`. This handles crashes before/after publication, fast repeated taps, multiple widget instances and a main-app refresh before acknowledgement without relying on device clocks. Old fingerprints are retired from the derived index when absent from the published snapshot, while immutable review evidence is retained by the broker.

Scope changes/disabled sharing hide cached content and require a new deck selection. Launcher-instance deletion clears only its preferences, never pending review intents. There are no tokens, API keys, passwords or cloud sessions in widget JSON. Malformed/unreadable event files are left untouched for canonical recovery.

## Verification

`StudyWidgetPagesTest` checks lossless pagination, surrogate pairs, empty/unbroken content and font/size budgets. Run `bash scripts/test-android-study-widget.sh` to compile and run these exact app/test sources with Kotlin 2.2.10 (matching the Android project) and JUnit 4. Pinned public compiler/test dependencies are checksum-verified. This pure JVM gate runs before APK compilation and avoids dependence on Tauri-generated Gradle flavor/test task names; the APK build separately compiles the full Android integration.

Compilation and pure JVM checks are not physical-device acceptance. Test a real launcher at normal/large font sizes and light/dark mode; reconfigure two widgets to different decks; reveal and grade with the main app closed; double-tap grades; force-stop/reboot; reconnect offline reviews; edit/delete a source while a card is revealed; switch account/workspace; and remove a widget with pending reviews. Confirm the main app's review log/schedule and synced device preserve every accepted event exactly once.

## Palette and size redesign (Phase 1)

Widget colours in Settings uses the four approved palettes. The app default is
stored under the account-local `remo-widget-appearance` key. Each launcher
instance can follow App or select its own palette. System light/dark mode selects
the matching resources. Wallpaper colours are available on Android API 31 and
later when following the app default.

Snapshot schema 2 adds `appearance` and optional canonical scheduler interval
captions per card. Schema 1 snapshots continue to load with Marigold Ink.
Review intents remain schema 1 and retain the existing private durable exchange.

Android API 31+ uses responsive RemoteViews for glance, prompt and full layouts.
Older Android versions select by the launcher's minimum dimensions and rebuild
on resize. Large text can select a two-row grade layout or a resize message.
The privacy and locked states continue to hide card contents. The microphone
opens the current card in the app's voice-review flow through
`remonook://study?deck=…&card=…&voice=1`; it does not record from the widget.

The generated palette resources are checked with
`node scripts/gen-widget-palettes.mjs --check`. Regenerate after an approved
palette-source change with `node scripts/gen-widget-palettes.mjs`.
The native rendering verification workflow applies the actual RemoteViews and
exports screenshots in an artifact, including Marigold light and Iris dark.


The schema also accepts optional deck progress (`doneToday`, `tomorrow`) for
launcher captions, calculated in the canonical app. It does not change scheduling
or review-intent acknowledgement. An explicit launcher-instance palette opts out
of wallpaper colours; choose **App** to follow the wallpaper setting.

[Phase 1 screenshots and verification](widgets/screenshots/README.md) cover all
required sizes and states, plus 200% text. The native suite also tests reapplying
a previously revealed RemoteViews: hiding the answer clears its accessibility
label as well as its visible text.


## Release resource retention and startup recovery

`WidgetPaint` selects palette resources by computed names. Release optimisation
cannot infer those references. The palette generator therefore emits
`res/raw/keep_widget_palettes.xml` with Android resource-shrinker keep rules for
widget colours and drawables. Do not remove it. Debug rendering tests alone do
not prove the signed release contains these resources.

Before publishing, `android.yml` runs `scripts/check-widget-apk.py` against the
signed APK's actual `resources.arsc`, requiring every palette/shape/progress resource name and all Phase 2 layout/provider
resource names (323 total in the Phase 2 release). The original 0.1.35 staging APK fails this check. UTF-8/UTF-16
fixtures test the validator, including missing resources and malformed tables.

Android may retain a widget ID after an incomplete configuration attempt.
Refreshing such an instance from app resume or the snapshot observer must never
prevent the app opening. Each instance now catches rendering errors independently,
logs the exception and attempts a minimal private recovery message using static
resource references. Other instances continue. This recovery does not clear
snapshots, widget preferences, outboxes or immutable review files.


## Phase 2: five additional Android widgets

The launcher now offers **Today**, **Quick capture**, **Focus timer**, **Study rhythm**
and **Resurface**, alongside Study flashcards. Enable widgets for the workspace in
Settings → Study, then add each widget from the launcher. Each instance follows
App colours or chooses one of the four palettes. Configuration also offers a
private-home-screen mode; all note text is hidden while the device is locked.

- Today caches up to eight dated bullets (including daily-note children) and
  reminder occurrences. Tap a row to open its note or Calendar. A check-off is a
  **set-to-done**, not a toggle; its caption says saved on device / pending app.
  Smaller sizes show the next unfinished task with a native Done button. Midnight/timezone
  changes hide stale daily lists until the app refreshes.
- Capture has a compact and a wide layout. Speak and Type open a small native
  input dialog, not the main app. Drafts survive closing; Save queues a durable
  capture for Inbox. Speech uses the installed OS provider with transcript review.
  Photo opens the existing photo-to-notes processing UI with its availability
  requirements. No new API or AI allowance is introduced.
- Focus reads an existing Dashboard focus timer. The launcher host renders the
  system Chronometer; no timer service runs in the widget. Start/Pause/End act
  natively and queue immutable events pinned to the cached session. The app
  reconciles these events through canonical dashboard mutations and saves history. An overdue countdown can show
  overtime until the app/launcher next refreshes it; no exact alarm is scheduled.
- Rhythm shows 28 local calendar days of spaced-review counts and the total.
  Practice and future-dated reviews are excluded. Tap to switch 7/28 days.
- Resurface is available only when meaning search is enabled. It rotates an
  existing note daily, preferring notes not touched today, plus a connection
  already in the device’s meaning index. Next thought cycles up to eight cached
  candidates locally. It makes no new AI request.

### Snapshot and completion protocol

Snapshot schema **3** introduced optional bounded Today (8 × 200 UTF-8 bytes), Focus
(label 80 bytes), Rhythm (28 counts), and Resurface (text 240, path 120, related
text 160 bytes). Schema 1 and 2 remain readable. Clearing/disabling widgets
publishes an empty, unscoped snapshot; no pending action files are deleted.

Today uses the **existing private inbox and processed directory**, with distinct
immutable schema-1 events: `{type:"complete", id:<event UUID>, scope, targetId,
text, date, fingerprint, at}`. `targetId` distinguishes `bullet:` from `reminder:`.
The original review event format, receipt index, text pager and budgets are
unchanged. The native writer fsyncs a temporary file, publishes under the store
lock without replacing an existing event, and fsyncs the inbox. Duplicate taps
and other widget instances recognise already pending matching actions.

The main app checks the current workspace and original content/date fingerprint,
sets the task or reminder occurrence to done through normal mutations, and saves
an idempotency receipt in `web.widgetActionReceipts`. If the source was edited or
deleted, it preserves the check-off in **Recovered widget actions** instead.
Only after a successful durable save and snapshot refresh does the normal broker
archive the original event. Failed saves leave it pending. Review events continue
through their existing canonical scheduler path. Both action types remain in the
same durable inbox across account/workspace switches.

Deep-link delivery waits for the app’s save acknowledgement before consuming the
native intent. A stable delivery UUID prevents repeated polling from creating
extra Inbox bullets. Scope checks prevent stale launcher instances from capturing
into a different workspace. Android date/time/configuration broadcasts refresh all
providers, and per-instance rendering errors cannot block app startup.


Phase 2 filesystem tests run on Android API 28 and 33 emulators using actual
`Os.rename`, directory `open` and `fsync`. Robolectric covers rendering and reads
of already queued actions; its host filesystem cannot open directories for fsync,
so it is not used to claim durable publication. Emulator tests verify publication,
retries, collision preservation, archive replay and widget removal retaining files.

## Adaptive sizing and native actions (staging follow-up)

Actual launcher `OPTION_APPWIDGET_SIZES` drive responsive RemoteViews on API 31+.
Legacy portrait uses MIN_WIDTH × MAX_HEIGHT; landscape MAX_WIDTH × MIN_HEIGHT.
The previous fixed SizeF map could choose a smaller view than the visible slot.
Valid small widgets now retain a useful action rather than requiring resizing.
Study text is further paginated by measured font/space within the original lossless
character budgets. At compact sizes, grades are selected using Grade / Other.
Resizing and font/orientation changes reset text paging to avoid skipping text.

Study reveal/paging/grading, Today completion, Focus Start/Pause/End, Rhythm range
switching and Resurface Next thought run natively without opening MainActivity.
Capture opens a small native input dialog; typed drafts stay private on device,
speech uses the installed OS provider with editable transcript. Photo still opens
the existing photo-to-notes UI because it needs selection and processing.

Snapshot **4** adds Focus duration/fingerprint and up to eight opt-in Resurface
cards; schemas 1–3 remain readable. No new AI request is made. Focus and capture
publish immutable schema-1 events into the existing private durable inbox using
fsync + no-replace publication under the existing lock. Review event format,
private exchange, budgets and processed evidence remain unchanged.

Focus events carry the original timer fingerprint, previous event ID, action,
cycle and timestamp. The app orders causal chains even after clock rollback,
checks the current timer against durable receipt fingerprints, applies canonical
dashboard mutations, and keeps changed/deleted-target actions in Recovered widget
actions. Capture events retain text/newlines and use a stable ordinary Inbox note
ID for idempotency. Events are acknowledged only after normal durable app save.
Native pending presentation is device-local and explicitly says pending app;
it does not claim cloud synchronization. Account/workspace switching never
reassigns queued events. Widget deletion never deletes them.
