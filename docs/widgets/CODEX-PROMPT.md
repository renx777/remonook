# Prompts for implementing the RemoNook widgets

Paste one prompt per phase into ChatGPT Codex (or any coding agent) with the `renx777/remonook`
repository. Each prompt is self-contained; the agent reads the spec and images from the repo.
Run them in order; start phase 2 only after phase 1 is on staging and reviewed.

---

## Phase 1 — Palette system + Android Study widget redesign

```
Repository: renx777/remonook. Start a new branch from the current staging branch (ask me which
branch staging currently runs if unsure; do not branch from main).

Read, in this order, and follow them exactly:
1. AGENTS.md, docs/ENVIRONMENTS.md, docs/ANDROID-STUDY-WIDGET.md
2. docs/WIDGETS.md (the implementation spec)
3. docs/widgets/palettes.json (the only source of widget colours)
4. Look at every image in docs/widgets/*.png. Images 04–07 are LAYOUT references drawn in an old
   steel-blue palette: copy their sizes, spacing, hierarchy, copy and states, but take colours only
   from palettes.json using the role mapping in docs/WIDGETS.md §3.1. Images 02 and 03 show the real
   palettes and the palette picker.

Implement phase 1 of docs/WIDGETS.md:
- scripts/gen-widget-palettes.mjs generating Android colour resources (values + values-night) and the
  per-palette background drawables from palettes.json, with a test that the generated files are up to date.
- Snapshot appearance (§3.3): schema 2 with appearance {palette, dynamic}; Rust (study_widget.rs,
  deny_unknown_fields), JS (study-widget.mjs / useStudyWidget.ts) and Kotlin (StudyWidgetStore.kt);
  schema 1 still accepted and defaults to marigold.
- App setting "Widget colours" in src/NativeStudyWidgetSettings.tsx exactly as the left panel of
  docs/widgets/03-palette-picker.png (four palettes, Marigold Ink default, Android 12+ "Match my
  wallpaper" checkbox, live preview), stored device-locally as described in §3.2; changing it refreshes widgets.
- Android Study widget redesign (§4, §5.1–5.5): glance 2×2, prompt 4×2, full 4×4 and message layouts;
  responsive RemoteViews on API 31+ and size-based layout choice on API 24–30; palette painting
  through one helper (setColorStateList on 31+, generated drawables below 31); dynamic colour mapping;
  all states from docs/widgets/05-android-study-states.png (question, revealed with Again/Hard/Good/Easy
  and interval captions, all caught up, dark, private/locked, too small, setup/error messages).
  "Answer aloud" is a deep link into the app's voice review for that card (§4).
- Rebuild StudyWidgetConfigureActivity like the middle panel of 03-palette-picker.png: deck dropdown,
  Colours row (App + four palettes), saved per widget.

Non-negotiables:
- Do not change the private review exchange, intent durability, locking, paging or budgets of the
  current widget. All existing tests must pass unchanged unless a test is about a removed layout id.
- tests/widget-palettes.test.mjs must stay green; do not edit palettes.json colours to make code fit.
- Touch targets >= 48dp, content descriptions on icon buttons, works at 200% font scale.
- Run npm test, cargo test, and the Android build. Attach screenshots (Marigold light and Electric Iris
  dark at minimum: 2x2, 4x2, 4x4 revealed, all caught up, locked, configure screen) to the PR.
- Release to staging only (android.yml, environment=staging) and record it in docs/ENVIRONMENTS.md.
  Never deploy production or merge to main. Never commit secrets.

Report: PR link, CI and staging run results, screenshots, and anything you could not verify.
```

---

## Phase 2 — More Android widgets

```
Repository: renx777/remonook. Branch from the branch/PR that delivered widget phase 1 (now on staging).
Read AGENTS.md, docs/WIDGETS.md (§2, §5.7, §5.8), docs/widgets/palettes.json and images
docs/widgets/01-design-language.png and 04-android-home.png (layout reference; colours from palettes.json).

Implement phase 2: Today (4x2, 4x4), Capture (2x2, 4x1), Focus (2x2), Rhythm (4x1, 4x2) and Resurface
(4x2) as separate AppWidgetProviders sharing the WidgetPaint helper and the appearance/palette model,
each with an App/palette choice in its configure screen.
Extend the snapshot to schema 3 with the bounded optional sections in §5.7 (today, focus, rhythm,
resurface) in Rust, JS and Kotlin, keeping schemas 1–2 readable. Ticking a Today item writes an
immutable intent applied by the app with the same durability rules as grades. Capture, Focus
Pause/End and Resurface open the app through remonook:// deep links (§5.7); add those routes in the app.
Same non-negotiables, tests, screenshots and staging-only release as phase 1.
```

---

## Phase 3 — macOS widgets (blocked until Apple signing exists)

```
Repository: renx777/remonook. Do not start until the owner confirms the Apple Developer team,
Developer ID certificate, notarization credentials and App Group id are available as repository
secrets (docs/WIDGETS.md §6.1). Ask for them by name; never put them in code, docs or prompts.

Read AGENTS.md, docs/ENVIRONMENTS.md, docs/WIDGETS.md (§1, §3, §4, §6), docs/widgets/palettes.json and
images 06-macos-desktop.png, 07-macos-sizes-modes.png and 03-palette-picker.png (right panel).

Implement §6: a WidgetKit + AppIntents extension (macOS 14+) in macos-widget/, generated
WidgetPalettes.swift from palettes.json, Study widget in small/medium/large/extra large with
full-colour palettes and correct tinted/clear rendering (widgetAccentable, no palette colours in those
modes), AppIntent configuration (Deck, Colours), Reveal/Grade/Next intents writing the same immutable
review intents into the App Group container, snapshot written there by study_widget.rs, a Swift
bridge to reload timelines, and the desktop.yml changes to build, embed, sign inside-out and notarize.
Then Today, Focus, Capture, Rhythm and Resurface if phase 2's snapshot sections exist.
Attach Xcode preview screenshots for each family x palette x light/dark plus tinted and clear.
Release a signed staging build only; record it in docs/ENVIRONMENTS.md.
```
