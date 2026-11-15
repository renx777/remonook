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

`StudyWidgetPagesTest` checks lossless pagination, surrogate pairs, empty/unbroken content and font/size budgets. After Tauri generates Gradle variants, run `:app:testUniversalReleaseUnitTest` if present (the universal APK flavor), otherwise `:app:testReleaseUnitTest`; use `:app:tasks --all` to inspect the generated task names.

Compilation and pure JVM checks are not physical-device acceptance. Test a real launcher at normal/large font sizes and light/dark mode; reconfigure two widgets to different decks; reveal and grade with the main app closed; double-tap grades; force-stop/reboot; reconnect offline reviews; edit/delete a source while a card is revealed; switch account/workspace; and remove a widget with pending reviews. Confirm the main app's review log/schedule and synced device preserve every accepted event exactly once.
