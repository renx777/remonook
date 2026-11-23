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
signed APK's actual `resources.arsc`, requiring all 312 palette/shape/progress
resource names. The original 0.1.35 staging APK fails this check. UTF-8/UTF-16
fixtures test the validator, including missing resources and malformed tables.

Android may retain a widget ID after an incomplete configuration attempt.
Refreshing such an instance from app resume or the snapshot observer must never
prevent the app opening. Each instance now catches rendering errors independently,
logs the exception and attempts a minimal private recovery message using static
resource references. Other instances continue. This recovery does not clear
snapshots, widget preferences, outboxes or immutable review files.
