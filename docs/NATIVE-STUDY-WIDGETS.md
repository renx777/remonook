# Native study widgets

## Platform surfaces and release scope

RemoNook uses a native Android home-screen widget and a compact study window on
macOS, Windows and Linux. The desktop window is a real app window with its own
small study UI; it is **not** a WidgetKit, Windows Widgets-board, KDE Plasma or
GNOME-shell widget. It can study while the main RemoNook window stays hidden.
The background app process must remain running for desktop review reconciliation.
Quitting the app stops that engine; it does not erase durable review intents.

| Platform | Surface in this implementation | Important boundary |
| --- | --- | --- |
| Android | Native AppWidget/RemoteViews home-screen widget | Launcher-hosted native layout; no webview or independent native FSRS implementation. Cached study can continue while the main activity is closed. Native review intents await the canonical app engine. |
| macOS | Resizable desktop study mini-window | Works with the existing Tauri app distribution. Always-on-top requests, window activation and Spaces behavior are subject to macOS window policy. It does not appear in the system widget gallery. |
| Windows | Resizable desktop study mini-window | A compact app window, not a Windows 11 Widgets-board provider or a Windows 10 desktop gadget. Pinning applies within the normal desktop, not secure desktops or every fullscreen surface. |
| Linux | Resizable desktop study mini-window | Supported by the existing Linux app build. A window manager/compositor may ignore always-on-top and placement requests. GNOME may require an AppIndicator extension to show the tray; the main app must also expose a study-window action. |

The release record in `ENVIRONMENTS.md` is authoritative for which packages have
actually built and been published. Browser tests and cross-platform compilation
are not physical-device or desktop-shell certification.

## Study and durability requirements

The widget's question and answer are bounded, device-local material from a selected
workspace/deck. Widget copies are an intentional user opt-in to presenting that
material outside the main app. They must not contain auth tokens, provider keys or
sign-in URLs. A snapshot belongs to one exact account/workspace scope and is not a
second notes database. Unsupported card content offers an explicit app fallback;
MCQs do not enter the ordinary flashcard queue.

Reveal changes presentation only. A grade creates a stable, immutable review
intent before the UI advances. The canonical RemoNook study engine applies that
intent through ordinary note/review persistence and the durable sync outbox.
Native buttons do not implement a competing scheduler or mark pending grades as
synced. A successful local enqueue means **saved on this device**, not necessarily
applied to the schedule or acknowledged by the cloud. The UI must say so.

A repeated action is the same event, not another grade. A review binds to the
source card's fingerprint, deck and scope. During reconciliation, missing/stale
source material must preserve the intent and its reviewed text for recovery; it
cannot be silently discarded to clear a pending count. Account/workspace changes
clear or replace presentation immediately and do not route old-scope events into
the new workspace. Pending events remain scoped and retained until the original
scope can be reconciled or an explicit recovery path preserves them.

Desktop views send intents to the one canonical app engine rather than opening
another independent document-save loop. Native event files are acknowledged only
after the normal canonical save succeeds; an acknowledgement is not a substitute
for the cloud protocol's server acknowledgement. `AGENTS.md`, `SYNC.md` and
`SYNC-V3.md` continue to apply.

## macOS WidgetKit extension investigation

Apple supports buttons/toggles that perform App Intents without opening the app
UI. A genuine interactive study widget is therefore feasible. That does not make
a Tauri window a WidgetKit widget or make an extension shippable automatically.

The repository's current distribution has these concrete constraints:

- `src-tauri/tauri.conf.json` sets `bundle.macOS.signingIdentity` to `"-"`
  (ad-hoc signing) and the base deployment target to macOS 11.0.
- There is no WidgetKit extension target, Swift App Intent target, extension
  `Info.plist`, App Group entitlement or shared-container integration.
- `.github/workflows/desktop.yml` builds one universal Apple silicon/Intel Tauri
  app and DMG on `macos-15-intel`. Its updater signing key authenticates updates;
  it is not an Apple Developer signing identity or an App Group provisioning
  configuration.
- The existing `Info.plist` describes local-network permission and Bonjour only.

Adding an uncompiled Swift folder would not solve these packaging or runtime
requirements, so this implementation does not pretend to ship an `.appex`.
The mini-window can retain the app's current deployment target and distribution
flow while the extension is developed separately.

A genuine WidgetKit milestone needs:

1. A native SwiftUI/WidgetKit extension and App Intents with a tested macOS 14+
   interactive baseline. Preserve the ordinary app's supported macOS range;
   gate extension availability instead of silently raising the whole app's OS
   requirement.
2. An Apple developer team, suitable app/extension identifiers and a tested
   signing/provisioning path. Configure host and extension shared-container
   entitlements under the owner's actual team; do not invent identifiers or
   commit credentials. Keep staging and production groups separate.
3. Build the universal extension, embed it under the host app's `Contents/PlugIns`,
   sign nested code and the host correctly, and validate installation, registration,
   upgrade and notarization behavior for the intended distribution channel.
4. Move/copy only opted-in widget material into the permissioned App Group
   container. Preserve older private pending events during migration. The
   extension is sandboxed even if the Tauri host is not; sharing requires an
   explicit supported container, not guessed access to the host's private files.
5. Give App Intents a small, durable action path. Return after durable enqueue and
   update the widget timeline from persisted state. Widget code runs separately
   from the app, and a SwiftUI binding is not a live subscription to RemoNook's
   webview. Do not assume the OS will launch a hidden JavaScript scheduler on demand.
6. Validate adding multiple instances from the widget gallery, Reveal and all four
   grades with the app UI closed, sleep/wake, logout, delayed timeline refresh,
   offline actions, process termination, duplicate taps and restart recovery on
   real Apple silicon and Intel hardware where supported.

The present blocker is an unconfigured native extension/signing/entitlement and
release path, not a need for a paid model or inference API. Owner-supplied Apple
configuration and a successful signed build are needed before promising a system
widget release. Development/simulator experiments alone do not meet that bar.

## Linux investigation

There is no single OS home-screen widget API shared by Linux desktops. A KDE
Plasma plasmoid and a GNOME Shell extension are separate products with different
runtime/lifecycle/versioning and packaging. AppIndicator/tray availability also
varies by shell. The desktop study window therefore gives the broadest useful
first release and reuses the same review engine and persistence contract.

On X11, a keep-above request is a window-manager hint. On Wayland, activation,
positioning and stacking are compositor-controlled and may be more restricted.
A successful Tauri `set_always_on_top`/creation call is not evidence that every
compositor actually pinned the window. The app should remain usable as an ordinary
resizable window and never require pinning for study correctness.

Acceptance should cover Ubuntu GNOME on X11 and Wayland, KDE Plasma where
available, no tray extension, multiple monitors, fractional scale, keyboard-only
study and closing the main window with keep-in-tray enabled/disabled. If a shell
refuses tray/pinning behavior, report it as a shell limitation without concealing
review persistence failures.

## Platform acceptance checklist

- Question/answer text, source/deck identity, Reveal and all four grades work at
  small and enlarged sizes; unsupported rich content has a truthful fallback.
- Duplicate clicks, delayed callbacks and process restart cannot grade twice.
- No queue/interval is advertised as current while a review is only queued.
- Closing/hiding a desktop study window does not quit the main engine or discard
  a pending write, including when the main window's keep-in-tray preference is off.
- Tray and in-app launch paths work without bringing the main window forward.
- Logout/workspace switch does not expose one account's material in another scope;
  pending events are retained rather than deleted during privacy reset.
- Offline reviews survive native/app process death and later reconcile through
  the canonical engine. Source changes/deletions preserve reviewed content.
- Existing app, workspace, backup, sync and scheduler regressions pass. Native
  builds/signatures and live download/update manifests are verified separately.
- Real Android launchers and desktop shells are checked after installation;
  limitations are recorded honestly instead of treating build success as UX proof.

## Official platform references

Checked during this implementation:

- [Apple — Adding interactivity to widgets and Live Activities](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities):
  buttons and toggles use App Intents; widget views run independently, and timeline
  updates need persisted results. Its structured documentation was read because
  the normal documentation page is client-rendered.
- [Apple — Configuring app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups):
  shared containers allow communication between a sandboxed extension and its
  sandboxed or nonsandboxed host, with explicit group configuration.
- [GTK — `gtk_window_set_keep_above`](https://docs.gtk.org/gtk3/method.Window.set_keep_above.html):
  explicitly warns that not all window managers support keeping a window above.
- [Android — App widgets overview](https://developer.android.com/develop/ui/views/appwidgets/overview):
  native home-screen widget hosting and lifecycle.
- [Microsoft — Widget providers](https://learn.microsoft.com/en-us/windows/apps/develop/widgets/widget-providers):
  a Windows Widgets-board provider is a different surface from a Tauri app window.
