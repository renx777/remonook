# Navigation, study widgets and PKM research — 15 November 2026

## Recommendation

Ship the navigation and Settings refinements first. Prototype a real Android home-screen study widget next, and a desktop study mini-window for Windows/macOS using the existing Tauri app. Investigate a genuine macOS WidgetKit extension after that. Windows' native Widgets board is a separate surface; a widget in that board is not a floating desktop widget.

The native widgets below are a feasibility/design recommendation, not shipped functionality. Platform SDKs, signing, packaging and background execution must be validated on physical devices before promising support. No paid inference or third-party API is necessary for reviewing existing decks.

## A flashcard widget that can actually study

| Platform | Suitable technology | In-widget review | Important limits |
| --- | --- | --- | --- |
| Android home screen | Kotlin + Jetpack Glance/AppWidget | Reveal, Again/Hard/Good/Easy, Next through background action callbacks | Restricted RemoteViews-based UI, host sizing and background limits; cannot embed the existing Tauri web editor. Test launcher variations and process death. |
| macOS desktop/Notification Center | SwiftUI WidgetKit + App Intents, macOS 14+ for the proposed interactive baseline | Buttons invoke App Intents without opening the app UI | Native extension and App Group entitlements; finite widget layouts and refresh scheduling; cannot reuse an arbitrary webview. Confirm extension packaging and helper execution with the current Tauri distribution/signing. |
| Windows 11 Widgets board | Windows App SDK widget provider + Adaptive Cards/actions | Provider handles actions and updates card content; prototype Reveal/grade/Next | Widgets board placement, package identity and provider lifecycle. Verify the exact supported Windows/SDK versions. This is not a Windows 10 desktop-gadget API. |
| Windows/macOS desktop mini-window | Existing Tauri window/tray integration | Full existing study controls, rich content and canonical scheduler | It is an app window, not an OS widget. The main app window can stay closed while the background app runs. Best first desktop option for code reuse and correctness. |

**MVP:** choose a workspace and one deck per instance; see the question, Reveal answer, grade with four buttons, then move to the next card. Show remaining reviews and a small saved/pending status. Medium/large layouts support readable answers; small layouts can show due count and open the study surface. Use text-only supported cards initially; unsupported media, long answers and advanced editors offer Open in app rather than truncating answers silently. MCQs should be a later explicit mode with four selectable options and an explanation, never mixed into flashcard queues accidentally.

**Correctness comes before native polish:**

- Widget actions carry stable event IDs, account/workspace/deck/card IDs and the source revision/content fingerprint. Duplicate taps/retries must not produce multiple grades. Changing an answer between Reveal and grade invalidates that revealed version and asks the user to review the updated card.
- The existing scheduler and note mutations remain authoritative. A desktop mini-window should send intents to a single shared writer/broker and subscribe to its projections; do not launch another independent document-save loop on the same workspace. It can reuse the existing study engine and UI behind that bridge. For native extensions, prove a shared headless scheduling/persistence bridge first, or collect immutable review intents into a durable local inbox and reconcile them through the existing engine. Do not create independent Swift/Kotlin/Windows FSRS implementations that drift from the app.
- An offline intent is honestly “Review saved on this device · sync pending”; it is not “Synced”. Exclude locally graded cards from the cached queue until reconciled, and expose pending activity in the app. Do not claim a next interval before the canonical engine has calculated it.
- On reconciliation, resolve source deletion, stale schedules, deck changes, device time changes and concurrent reviews using the existing sync rules. Preserve journaled events and both devices' edits. The durable outbox and server acknowledgements remain intact.
- Separate caches/inboxes by account and workspace; wipe widget content on sign-out/workspace removal. Keep auth tokens in platform secure storage, not widget JSON. Offer a hide-answers/privacy setting and use privacy-sensitive presentation where the OS supports it.
- Validate force-stop/reboot, duplicate actions, offline reconnect, two devices grading the same card, undo/history, daylight-saving changes, logout, card deletion and native accessibility. Native build success alone is not acceptance.

Other useful widgets: quick capture, today's tasks/reminders, daily reading entry/progress, habit check-in and a focus timer. Quotes can be a lightweight glanceable widget. Keep multi-step writing, Canvas and PDF annotation in the app.

## PKM inspiration worth adapting

These are capability comparisons from official product material, not independently verified app-store ratings or a claim that one product is universally best.

| Priority | Inspiration and source | What RemoNook should adopt | Value / effort |
| --- | --- | --- | --- |
| 1 | Obsidian properties/Bases; Capacities objects | Optional typed properties on a note/branch and saved table/list views. Begin with status, subject, source and review date, with filters and sorting. | High: makes existing knowledge actionable. Large: requires a carefully versioned data model and sync/backup tests. |
| 1 | Daily-note workflows in outline PKM tools | Reusable, user-owned templates for daily notes, meeting notes and weekly review. Insert through ordinary outline mutations and undo, not snapshot replacement. | High / medium. First audit existing insertion shortcuts so this adds reusable structure rather than another capture UI. |
| 1 | Reader/Readwise workflow | A review queue for existing book/article highlights: resurface a passage, add a thought, optionally turn it into a source-linked question. | High / medium; builds on Bookshelf, bookmarks and Study Desk already present. No external Readwise API required. |
| 2 | Obsidian backlinks and Capacities linked objects | Improve context around existing connections: previews of referring bullets, unlinked mention suggestions and “where did I use this idea?”. Do not add a second competing backlinks panel. | High / medium; benchmark search on large accounts and keep suggestions explicit. |
| 2 | Focused outline and research workflows | A persistent reading/study mini-window and a keyboard-first capture inbox with a lightweight later filing/review step. | High / medium. Reuse existing quick capture, panes and command palette; avoid creating a parallel notes database. |
| 2 | Saved views and collections | Pin useful views such as unanswered questions, due tasks, recently captured sources, and notes lacking a topic. | High / medium once query/property primitives are stable. Keep Flashcards, MCQs, calendar and plain-note categories distinct. |
| 3 | Spatial PKM | Extend existing Canvas with deliberate note placement, source previews and portable export improvements. | Medium. Canvas already exists; building another graph or canvas would duplicate work. |

Avoid a large feature grab: another global graph, a second task system, an automatic paid-AI layer, or complex object schemas before common capture/review/navigation paths are comfortable. The clearest product loop is **capture → connect → study → apply**.

## UI implementation in this branch

- A phone navigation trigger opens a modal drawer containing the same navigation, workspace switcher, starred notes, tags and footer tools as the desktop sidebar. Native dialog focus handling, Escape and existing Android back-stack integration are reused. Opening it does not change the persisted desktop sidebar setting.
- Desktop Calendar retains its existing per-device collapse preference, with an accessible disclosure control. Phones start with the supporting month/agenda area collapsed, and can reveal it explicitly; the day heading remains above it. Phone disclosure state does not overwrite the desktop preference. This is an inline mobile disclosure, keeping editing and navigation available rather than opening another full-screen modal.
- Settings keeps the existing section navigation and persistence. Spacing, typography, inputs, file pickers and backup actions use the app's quiet surfaces, restrained borders and consistent sizing. No settings or backups are removed.

No native widget, infrastructure change, production deployment or app-store submission is included in these UI changes.

## Official sources checked

- [Apple: adding interactivity to widgets and Live Activities](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities). The documentation explicitly describes buttons/toggles offering functionality without launching the app. Its structured documentation was also read because the page is client-rendered.
- [Android: Jetpack Glance](https://developer.android.com/develop/ui/compose/glance) and [handling interaction](https://developer.android.com/develop/ui/compose/glance/user-interaction): native widget layout and action callback model.
- [Microsoft: widget providers](https://learn.microsoft.com/en-us/windows/apps/develop/widgets/widget-providers): provider lifecycle, user actions and optional interfaces. Check the linked implementation guides against the chosen SDK during the spike.
- [Obsidian: Backlinks](https://help.obsidian.md/plugins/backlinks), with its [official Markdown source](https://github.com/obsidianmd/obsidian-help/blob/master/en/Plugins/Backlinks.md) checked for linked/unlinked mentions and filtering. The [official Bases introduction source](https://github.com/obsidianmd/obsidian-help/blob/master/en/Bases/Introduction%20to%20Bases.md) confirms database-like table/card views, filtering and property editing; verify detailed syntax during implementation.
- [Capacities product overview](https://capacities.io/product): object types, properties, views, links and daily notes. Its unavailable legacy objects documentation route was not used as evidence.
- [Readwise Reader](https://readwise.io/read): reading, highlights and cross-device reading workflow. This recommendation reuses RemoNook's own highlights; it does not imply a free Readwise integration.
