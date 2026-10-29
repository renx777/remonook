# Dashboard usability review

The review preserves the restrained design, existing widgets, saved desktop layouts, habit history, and timer deadlines. Implementation targets staging first.

## Findings addressed

| Finding | Result |
| --- | --- |
| Custom phone pointer handlers lack keyboard sorting and edge auto-scroll. | dnd-kit sortable handles touch, keyboard, cancellation, focus, and named screen-reader announcements. Dedicated grips preserve normal page scrolling elsewhere. |
| Phone order has no reusable domain operation; Tidy saves an unused phone grid. | Ordering is applied to the latest document through a domain helper, independently of desktop order and positions. Tidy appears on desktop/tablet only. |
| Widget action menus can extend below the screen, and transformed grid items contain them. | Floating UI positions a portal under the app theme root, flips and shifts it into view, and tracks scrolling/resizing. Existing keyboard controls and focus return are retained. |
| Compact Habits hides additional habits behind an inert count; the weekly phone table is difficult to use. | Show all exposes every habit. Expanded phone history uses a scrollable seven-day selector with touch-sized controls and readable habit rows. |
| Phone habit archival requires the desktop table. | The habit editor includes Archive habit; existing restore and check-in history are preserved. |
| Today counts an already-truncated reminder array, making Show more unreachable. | Counts use the complete array. Three-item previews expand to the full list; overdue task dates are explicit. |
| Every second rerenders all widgets, including expensive study lookups. | Clock and timer ticks are local and boundary-aligned. Dashboard ticks by minute, and hidden tabs stop ticking until return. |
| Small clock/timer defaults clip content, and some phone size presets have no visible effect. | Clock gets a modest extra grid row, analog faces scale within desktop cells, timer spacing fits its default height, and phone presets appear where they control extra content. |

## Library research and choice

- **react-grid-layout 2.3.0** remains responsible for desktop/tablet layout, collision handling, and free resize; its existing persisted layouts remain valid.
- **@dnd-kit/core 6.3.1**, **sortable 10.0.0**, and **utilities 3.2.2** provide the phone stack's drag behavior. Official documentation covers pointer and keyboard sensors, sorting variable-size items, auto-scroll, and accessibility. npm peer ranges support React 19; licenses are MIT.
- **@floating-ui/react-dom 2.1.9** provides only positioning primitives (offset, flip, shift, autoUpdate). The existing menu supplies keyboard behavior. npm peer ranges support React 19; license is MIT.
- A chart or timer library would add little to the existing seven-day study bars and persisted deadline timer. Both retain their current implementation.

The lazy Dashboard JavaScript chunk grew from approximately 31.4 KB to 53.6 KB gzip in the measured local build (about 22 KB added). These libraries load with Dashboard, rather than on the initial Notes route.

References: [dnd-kit architecture and accessibility](https://github.com/clauderic/dnd-kit), [sortable preset](https://docs.dndkit.com/presets/sortable), [Floating UI React DOM positioning](https://floating-ui.com/docs/react-dom).

## Verification

Domain/app regressions cover phone order independence, stale drag targets, settings/history preservation, full reminder counts and expansion, phone habit history and archival, and inactive size preset removal. Existing timer, backup, CRDT, and widget tests remain in place.

Chromium checks use synthetic data at 320, 393, 768, and 1440 pixels in light/dark themes. They cover real touch and keyboard reorder, habit history/check-in/archive, all-habits access, reminder expansion, page overflow, viewport menu placement and focus return. A long-board touch check confirms edge auto-scroll and cancellation without committing a reorder. Physical iOS/Android device testing remains separate from Chromium emulation.
