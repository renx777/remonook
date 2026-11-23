# RemoNook widgets: Android and macOS implementation spec

Status: design approved for implementation. Owner decisions: four selectable widget palettes
(Marigold Ink default, Electric Iris, Forest & Peach, Graphite & Coral); Android first, then macOS.

Everything an implementer needs is in this file and `docs/widgets/`:

| File | What it is |
|---|---|
| `docs/widgets/palettes.json` | **Single source of truth for widget colours.** Four palettes × light/dark × 13 roles, plus grade colours. |
| `tests/widget-palettes.test.mjs` | Keeps every palette at WCAG AA (4.5:1) for all text pairs. Must stay green. |
| `docs/widgets/01-design-language.png` | Principles, type, shape, motion, widget set. |
| `docs/widgets/02-palettes.png` | The four palettes on the same widgets. |
| `docs/widgets/03-palette-picker.png` | Palette choice: app Settings, Android configure screen, macOS Edit widget sheet. |
| `docs/widgets/04-android-home.png` | Android home screen with the widget set (layout reference). |
| `docs/widgets/05-android-study-states.png` | Android Study widget sizes and every state. |
| `docs/widgets/06-macos-desktop.png` | macOS desktop widgets (Liquid Glass). |
| `docs/widgets/07-macos-sizes-modes.png` | macOS sizes and rendering modes (default light/dark, tinted, clear). |

**Images 04–07 are layout references.** They were drawn in an earlier steel-blue palette. Take sizes,
spacing, hierarchy, copy and states from them; take every colour from `palettes.json` (see the role
mapping in §3). Images 02 and 03 show the real palettes.

Read first: `AGENTS.md`, `docs/ANDROID-STUDY-WIDGET.md` (current widget, private review exchange),
`docs/ENVIRONMENTS.md` (staging before production). Never deploy to production or merge to `main`
as part of this work.

---

## 1. Design language: "Still Water"

A calm surface that holds one thing at a time. Glance, recall, act, without opening the app.

1. **Readable in three seconds.** One job per widget, one hero element (a number, a question, one line).
2. **Act where you look.** Reveal, grade, tick off and capture happen in the widget.
3. **Calm, never nagging.** No red badges, no streak shaming. Progress is a ring that fills; an empty queue is a rest state ("All caught up").
4. **Native, not ported.** Android: Material 3 Expressive (rounded expressive shapes, bold numerals, optional dynamic colour). macOS: WidgetKit with the system glass material, vibrancy and tinted/clear rendering.
5. **Private at a glance.** Answers stay hidden until revealed. Locked device: counts and titles only.
6. **Grows with its size.** Small = essence, medium = + action, large = + context. Never clip text: reflow, page it, or ask to be resized.

### Type (system fonts on device)
| Style | Size / weight | Use |
|---|---|---|
| Hero numeral | 44–52 sp/pt, 700, tabular figures, tight tracking | Due count, timer |
| Prompt | 16–18 sp/pt, 600, up to 3 lines | Card question |
| Body | 14 sp/pt, 400 | Answers, list rows |
| Eyebrow | 11–12 sp/pt, 600–700, ALL CAPS, +0.08em | Deck name, widget name |
| Caption | 12 sp/pt, 400–500 | Counts, times, status |

Android: Roboto/Google Sans via `?android:attr/textAppearance…` with sp sizes (respects font scale).
macOS: SF Pro via `.font(.system(size:weight:))` / `.title2.weight(.bold)` with `.monospacedDigit()` for numerals.

### Shape and spacing
- Concentric corners: **outer = inner + padding**. Android widget 28 dp outer (use `@android:dimen/system_app_widget_background_radius` on API 31+), inner panels/buttons 16 dp, pills fully rounded. macOS: the system container shape; inner panels 12–14 pt continuous.
- 8-point grid; widget padding 16 (Android 14–18 dp, macOS 16 pt); gaps 8–12.
- Touch targets: **≥ 48 dp** Android, **≥ 44 pt hit area** macOS (visual pills may be 32–40 pt tall inside a 44 pt hit area).

### Motion
Reveal: answer fades in and rises 8 px, 250 ms. Grade: content cross-fades to the next card, 350 ms spring.
Respect Reduce Motion (cross-fade only). Android RemoteViews: rely on the launcher's default update
transition; do not animate manually.

### Accessibility (acceptance criteria)
- All text pairs ≥ 4.5:1 (enforced by the test). Grade buttons always show a text label.
- Every icon-only button has a content description / accessibility label ("Answer aloud", "Dictate a note").
- Works at 200% font scale: text reflows or pages; never clipped mid-word.

---

## 2. Widget set and phasing

| Widget | Android sizes | macOS families | Phase |
|---|---|---|---|
| **Study** (existing, redesigned) | 2×2 glance, 4×2 prompt, 4×4 full | small, medium, large, extra large | **1 (Android)**, 3 (macOS) |
| **Today** (dated bullets, reminders, tick off) | 4×2, 4×4 | medium, large | 2 |
| **Capture** (speak / type / photo into Inbox) | 2×2, 4×1 | small | 2 |
| **Focus** (running focus session) | 2×2 | small | 2 |
| **Rhythm** (days studied heat map) | 4×1, 4×2 | medium | 2 |
| **Resurface** (older note + a related one) | 4×2 | medium | 2 (needs meaning search enabled) |

Phase 1 ships the palette system and the Study widget redesign on Android. Phase 2 adds the other
widgets on Android. Phase 3 is macOS (blocked on Apple signing, §6.1). Each phase is its own branch
and PR into the current staging branch, released to staging only.

---

## 3. Palettes and how users choose them

### 3.1 Tokens
`docs/widgets/palettes.json` defines, per palette and per mode (`light`, `dark`):

| Role | Used for |
|---|---|
| `surface` | Widget background |
| `surfaceAlt` | Inner panels (revealed answer box, list rows) |
| `onSurface` / `muted` / `eyebrow` | Primary text / secondary text / caps labels on surface |
| `primary` / `onPrimary` | Filled primary button (Reveal, Pause, Add widget) and the **Easy** grade |
| `accent` / `onAccent` | Secondary pill (Answer aloud mic), progress-ring arc on surface, Capture tile |
| `hero` / `onHero` / `heroAccent` | Emphasis tiles (Study 2×2 glance, Capture widget) with their text and ring |
| `outline` | Hairlines and dividers only (never text) |

Grade colours (`grades.light` / `grades.dark`): Again, Hard, Good backgrounds and text are shared by
all palettes; **Easy = `primary` / `onPrimary`** of the active palette.

Mapping the steel-blue reference images to roles: dark teal fills (`#0F4A62`, `#1F5873`) → `primary`
on buttons, `hero` on tiles; light mist panels (`#E3F0F5`, `#F4FAFC`) → `surfaceAlt` / `surface`;
pale blue pills (`#D3E8F0`) → `accent` for the mic pill and `surfaceAlt` elsewhere; eyebrow blue →
`eyebrow`; ring arc → `accent` on surface, `heroAccent` on hero.

**Generate, don't hand-copy.** Add `scripts/gen-widget-palettes.mjs` that reads `palettes.json` and writes:
- Android: `res/values/widget_palette_colors.xml` and `res/values-night/widget_palette_colors.xml`
  with names `widget_<palette>_<role>` (e.g. `widget_marigold_surface`), plus the per-palette
  background drawables listed in §5.3.
- macOS (phase 3): `WidgetPalettes.swift` with a `WidgetPalette` enum and `Color` values per mode.
Run it in `npm run build` or as a checked-in output with a test that it is up to date.

### 3.2 Choice model
- **App default** (one per device): Settings → Study → *Study outside the main window* → **Widget
  colours**. Options: the four palettes (default **Marigold Ink**). Android only: a checkbox **Match
  my wallpaper on Android 12 and later** (dynamic colour, §5.4). See `03-palette-picker.png`.
  Store it device-locally (it is an appearance preference for this device, not workspace data):
  `localStorage` key `accountLocalKey('remo-widget-appearance')` → `{"palette":"marigold","dynamic":false}`.
- **Per-widget override**: each widget instance can pick **App** (follow the default) or one palette.
  Android: in `StudyWidgetConfigureActivity` (reconfigurable). macOS: an AppIntent configuration
  parameter shown in the Edit widget sheet.
- Light/dark always follows the system. No in-widget toggle.
- Changing the app default refreshes every widget immediately (Android `StudyWidgetProvider.refreshAll`,
  macOS `WidgetCenter.reloadAllTimelines()`).

### 3.3 Passing the default to native code
The snapshot is the only app → widget channel. Add an `appearance` object:

```json
{"schema": 2, "scope": "...", "workspaceName": "...", "updatedAt": 0, "revision": 0,
 "appearance": {"palette": "marigold", "dynamic": false},
 "decks": [ ... ]}
```

- `src/study-widget.mjs` / `src/useStudyWidget.ts`: include `appearance` when publishing the snapshot;
  re-publish when the setting changes.
- `src-tauri/src/study_widget.rs`: `Snapshot` has `#[serde(deny_unknown_fields)]`, so add
  `appearance: Option<Appearance>` with `palette` restricted to the four ids and `dynamic: bool`;
  bump `schema` to 2 and keep accepting schema 1 (no appearance → default palette).
- `StudyWidgetStore.kt` parses it; an unknown or missing palette falls back to `marigold`.

---

## 4. Study widget: content and states (both platforms)

Use `05-android-study-states.png` and `07-macos-sizes-modes.png`.

| Size | Shows | Actions |
|---|---|---|
| Glance (Android 2×2, macOS small) | Eyebrow (deck), hero due count, "cards due · about N min", progress bar/ring (done today ÷ (done + due)) | Tap → opens Study Desk for that deck |
| Prompt (4×2, medium) | Eyebrow "Deck · N due", position "5 / 17", question (≤ 3 lines, else paged) | **Reveal answer** (primary), **Answer aloud** (accent pill, mic icon) |
| Full (4×4, large) | Prompt + revealed answer panel (`surfaceAlt`) + "How well did you recall it?" | **Again / Hard / Good / Easy** with next-interval captions (1 min, 2 d, 5 d, 12 d) |
| Extra large (macOS only) | Decks due today list (name + count, 44 pt rows) + "Next card" panel | Reveal, Answer aloud |

States (all sizes where they fit):
- **Question** → **Revealed** → graded → next card.
- **Voice result**: verdict chip (Correct / Partly right / Not quite), "2 of 3 points", transcript in
  italics, ✓/✗ per answer point, **Accept · Hard** (primary) and **Other grade**. Widgets cannot record
  audio themselves: **Answer aloud opens the app** straight into voice review for that card
  (Android: `Intent` to `MainActivity` with `remonook://study?deck=<id>&card=<id>&voice=1`; macOS:
  `OpenURLIntent` / `widgetURL`). The result screen is in the app; the widget mockup shows what the
  app returns to. Phase 1 may ship the mic pill as this deep link only.
- **All caught up**: check icon, "All caught up", "Next N cards tomorrow morning". Uses `grades.goodBg`
  as background and `grades.goodFg` as text.
- **Dark**: same layout, dark tokens.
- **Private / locked**: eyebrow "RemoNook", two placeholder bars (`outline`), "12 cards due · unlock to
  study". Never show question or answer text while the device is locked (keep the current behaviour:
  `locked`/`visible` logic in `StudyWidgetProvider`).
- **Too small**: "Make this widget wider to study" (existing text budget logic stays).
- **Not set up / needs a deck / cache needs attention**: keep the current messages and the
  **Open RemoNook** / deck chooser actions.
- Status line (caption): "N saved on device · pending app" exactly as today.

Copy rules: sentence case, no exclamation marks, no blame ("Make this widget taller", not "Widget too small").

---

## 5. Android implementation (phases 1–2)

Code lives in `src-tauri/gen/android/app/src/main/` (checked in; Kotlin + XML RemoteViews).

### 5.1 Keep (do not change behaviour)
- The private exchange: snapshot file, immutable review-intent files, `UNHIDE`/`REVEAL`/`NEXT`/
  `QUESTION`/`PREVIOUS`/`PART`/grade actions, tokens, locking, paging of long text, budgets.
- `docs/ANDROID-STUDY-WIDGET.md` verification steps must still pass. Update that doc.

### 5.2 Layouts
- Replace `res/layout/study_widget.xml` with size-specific layouts:
  `study_widget_glance.xml` (2×2), `study_widget_prompt.xml` (4×2), `study_widget_full.xml` (4×4),
  plus `study_widget_message.xml` for setup/too-small/error states.
- API 31+: build `RemoteViews(mapOf(SizeF(…) to glance, SizeF(…) to prompt, SizeF(…) to full))`
  (responsive layouts). API 24–30: pick the layout in `render()` from `OPTION_APPWIDGET_MIN_WIDTH/
  MIN_HEIGHT` (already read for budgets) and re-render in `onAppWidgetOptionsChanged`.
- Update `study_widget_info.xml`: `targetCellWidth=4`, `targetCellHeight=2`, `minResizeWidth=110dp`,
  `minResizeHeight=110dp`, `maxResizeWidth`/`maxResizeHeight` generous; add `previewLayout`
  (API 31+) pointing at the prompt layout and a static `previewImage` for older launchers.
- Rounded corners: background drawables with 28 dp radius; on API 31+ add `android:clipToOutline="true"`
  on the root and use `@android:dimen/system_app_widget_background_radius`.

### 5.3 Applying palettes in RemoteViews
- Text colours: `views.setTextColor(id, color)` (all API levels).
- Backgrounds and button fills:
  - API 31+: `views.setColorStateList(id, "setBackgroundTintList", ColorStateList.valueOf(color))`
    on views whose background is a neutral rounded shape (`widget_shape_28.xml`, `widget_shape_16.xml`,
    `widget_shape_pill.xml`).
  - API 24–30: tint is not settable; ship generated drawables per palette and role
    (`widget_<palette>_<role>_<shape>.xml`) and set with `views.setInt(id, "setBackgroundResource", R.drawable…)`.
  Put both paths behind one helper: `WidgetPaint.background(views, viewId, palette, role, shape)`.
- Resolve the effective palette per widget: per-widget pref `palette` in
  `StudyWidgetStore.preferences(context,id)` (`"app"` or an id) → else `snapshot.appearance.palette`
  → else `marigold`. Mode from `context.resources.configuration.uiMode and UI_MODE_NIGHT_MASK`.
- Re-render all widgets on configuration change (night mode) via the provider.

### 5.4 Dynamic colour (optional checkbox, API 31+)
When `appearance.dynamic` is true and API ≥ 31, map roles to system tonal colours instead of the
palette: `surface`=`system_neutral1_10` (dark `system_neutral1_900`), `surfaceAlt`=`system_accent1_50`
(dark `system_accent1_800`), `onSurface`=`system_neutral1_900` (dark `system_neutral1_50`),
`muted`=`system_neutral2_700` (dark `system_neutral2_200`), `primary`/`hero`=`system_accent1_600`
(dark `system_accent1_200`), `onPrimary`/`onHero`=`system_accent1_0` (dark `system_accent1_800`),
`accent`=`system_accent3_200` (dark `system_accent3_300`), `onAccent`=`system_accent3_900`.
Grades keep their fixed colours. Below API 31 the checkbox is hidden.

### 5.5 Configure activity
Rebuild `StudyWidgetConfigureActivity` to match `03-palette-picker.png` (middle panel): title,
**Deck** dropdown, **Colours** row of five 56 dp circular swatches (**App** + four palettes, each
showing its `hero` and `accent`; selected = 3 dp ring in `onSurface`; `contentDescription` = palette
name), helper text, **Add widget** / **Save** primary button. Save the choice in the widget's prefs and
re-render. Style the activity with the effective palette.

### 5.6 App settings UI
In `src/NativeStudyWidgetSettings.tsx` add the **Widget colours** section from `03-palette-picker.png`
(left panel): 2×2 radio cards with three swatches each and the name (Marigold Ink marked Default), the
Android-only dynamic checkbox (show only on Android 12+; detect via a small native query or hide when
`isMobileApp()` reports API < 31), and a live preview (prompt card + glance tile) using the chosen
tokens. Use real `<input type="radio">` in a `<fieldset>` with a visually hidden `<legend>`.
Read colours from `docs/widgets/palettes.json` (import it; Vite supports JSON imports).

### 5.7 Phase 2 widgets (Android)
New `AppWidgetProvider`s, each with its own `appwidget-provider` XML, sharing `WidgetPaint` and the
appearance model. Extend the snapshot (schema 3) with bounded, optional sections, each capped:
- `today`: up to 8 items `{id, text ≤ 200, time?, done}` for bullets dated today + reminders. Ticking
  writes an immutable intent `{type:"complete", id, at}` in the same review-intent directory; the app
  applies it like a grade (reuse the durability rules).
- `focus`: `{running, endsAt, label ≤ 80}`. Pause/End are deep links to the app (no background timers in the widget).
- `rhythm`: last 28 days as integers (cards reviewed per day) + total.
- `resurface`: `{id, text ≤ 240, path ≤ 120, relatedText ≤ 160}`; only when meaning search is on.
- Capture: no data; three buttons deep-link to the app: `remonook://capture?mode=voice|text|photo`
  (voice opens dictation into Inbox, photo opens Photo to notes into Inbox).

### 5.8 Android testing
- Unit tests (JVM) for palette resolution, layout choice by size, snapshot parsing (schema 1/2/3).
- `scripts/` emulator check or Robolectric screenshots of each layout × 4 palettes × light/dark
  if feasible; otherwise manual screenshots attached to the PR for: 2×2, 4×2, 4×4, revealed, caught up,
  locked, too small, configure activity, in Marigold light and Iris dark at minimum.
- `npm test` (including `tests/widget-palettes.test.mjs`), `cargo test`, Android CI build.

---

## 6. macOS implementation (phase 3)

### 6.1 Prerequisites (owner action, blocking)
macOS widgets are a WidgetKit **app extension** (`.appex`) embedded in the app. It must be signed,
sandboxed and share an **App Group** with the app. The desktop build is currently not code-signed
(`.github/workflows/desktop.yml`). Before phase 3:
1. Apple Developer Program team; Developer ID Application certificate and a provisioning setup for
   the App Group (macOS app groups for Developer ID use the team prefix, e.g. `<TEAMID>.com.remonook.shared`).
2. Repository secrets for signing and notarization (certificate, password, Apple ID or API key).
   Never commit them.
3. Staging uses its own bundle id and group (`com.remonook.app.staging`, `<TEAMID>.com.remonook.staging.shared`).

### 6.2 Structure
- `macos-widget/` (new): an Xcode project or Swift package with target `RemoNookWidgets`
  (WidgetKit + AppIntents, deployment target **macOS 14** so `Button(intent:)` works; the app itself
  stays at 11.0 and simply has no widgets on older systems).
- Build in `desktop.yml` (macOS job): `xcodebuild` the extension for universal arch, copy
  `RemoNookWidgets.appex` into `RemoNook.app/Contents/PlugIns/` (Tauri `bundle.macOS.files` or a
  post-bundle step), then sign inside-out (appex with its entitlements, then the app), notarize, staple.
- Entitlements: extension `com.apple.security.app-sandbox`, `com.apple.security.application-groups`;
  app gets the same application group.

### 6.3 Data exchange
- On macOS, `study_widget.rs` also writes `snapshot.json` to
  `~/Library/Group Containers/<group>/study-widget/` (0700), atomically, as it does today.
- Review intents from the widget are written by the extension's AppIntents into
  `…/study-widget/reviews/` using the **same immutable intent format** as Android; the app applies
  them with the existing code path (`intent_valid`, durable writes). Never let the widget write the workspace.
- Reload after publishing: a tiny Swift bridge (`swift-rs` or a static lib built by `build.rs`)
  exposing `remonook_reload_widgets()` → `WidgetCenter.shared.reloadAllTimelines()`. Timeline policy
  otherwise `.after(15 minutes)`.

### 6.4 Views (SwiftUI)
- Families: `.systemSmall`, `.systemMedium`, `.systemLarge`, `.systemExtraLarge` (see `07-macos-sizes-modes.png`).
- Background: `.containerBackground(for: .widget) { palette.surface }` in full-colour mode so the
  system applies its glass material; content uses vibrant text.
- Rendering modes: read `@Environment(\.widgetRenderingMode)`. `.fullColor` → palette tokens.
  `.accented` (tinted) and `.vibrant` (clear): no palette colours; mark the ring arc, primary button and
  hero numeral with `.widgetAccentable()`; keep hierarchy through weight and size; grade buttons keep text labels.
- Buttons: `Button(intent: RevealCardIntent(…))`, `GradeCardIntent(grade:)`, `NextCardIntent`;
  Answer aloud and tap-through use `widgetURL` / `Link` to `remonook://study?...`.
- Privacy: `.privacySensitive()` on question/answer text; when redacted show the private state (§4).
- Configuration: `AppIntentConfiguration` with parameters **Deck** (from snapshot decks) and
  **Colours** (`App`, `Marigold Ink`, `Electric Iris`, `Forest & Peach`, `Graphite & Coral`).
- Palettes from the generated `WidgetPalettes.swift`.

### 6.5 macOS testing
Xcode previews for every family × palette × mode; a UI screenshot set attached to the PR; signed
staging DMG installs, widget appears in the gallery, reveal/grade/next work, grades reach the app
after launch, locked/redacted state hides text.

---

## 7. Acceptance checklist (each phase's PR)

- [x] Matches the referenced images in layout, spacing, hierarchy and copy; colours only from `palettes.json`.
- [x] All four palettes selectable: app default and per-widget override; App option follows the default.
- [x] Light and dark follow the system; tinted/clear (macOS) and dynamic colour (Android 12+) handled.
- [x] Existing study widget behaviour unchanged: private review exchange, durability, locking, paging, messages.
- [x] Touch targets ≥ 48 dp / 44 pt; every icon button labelled; 200% font scale works.
- [x] `npm test` (incl. `tests/widget-palettes.test.mjs`), `cargo test`, Android/desktop CI green.
- [x] Docs updated: this file, `docs/ANDROID-STUDY-WIDGET.md`, `docs/ENVIRONMENTS.md` release record.
- [x] Released to **staging only** (`android.yml` / `desktop.yml` with environment=staging); no production, no merge to `main`.


Phase 1 verification (23 November 2026): Android-only acceptance above is covered
by the API 33 native rendering suite, API 28 resource tests, 645 JavaScript tests,
16 Rust tests and the staging APK build. See
[the screenshots and verification limitations](widgets/screenshots/README.md).
macOS tinted/clear modes and desktop CI are outside Phase 1. Real launcher,
TalkBack, wallpaper colours and physical microphone checks remain device acceptance;
the checked items describe implementation and automated coverage, not those checks.


### Phase 2 acceptance

Separate branch `codex/android-widget-suite`, based on the phone-confirmed Phase 1
staging branch. Includes five additional Android providers, schema 3, shared
palettes/privacy, canonical Focus/Capture deep links and durable Today completion.
See [the protocol](ANDROID-STUDY-WIDGET.md#snapshot-and-completion-protocol).

- [x] Today, Quick capture, Focus, Study rhythm and Resurface providers implemented.
- [x] Shared palette, per-instance override, lock/private states and resize paths.
- [x] Schema 1/2 compatibility; schema 3 bounded and validated in JS/Rust/Kotlin.
- [x] Today actions preserved through the existing inbox, save, receipt and archive path.
- [ ] Full app, Rust and native tests passed; native screenshots reviewed.
- [ ] Signed APK resource retention verified and released to Android staging.
- [ ] Release record and PR screenshots attached.

Phone confirmation: the owner reports the Phase 1 startup recovery build 0.1.36
works on their phone. This confirms startup recovery, not every physical-launcher
or accessibility acceptance case for these new widgets.
