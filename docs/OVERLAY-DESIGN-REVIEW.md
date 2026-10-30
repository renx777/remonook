# Menus, popovers and editor palettes

## Findings and implementation

| Surface | Finding | Implementation |
| --- | --- | --- |
| Bullet actions and view options | A manually positioned non-modal dialog duplicated outside-click/focus logic, closed on resize, and treated arrow presses in text inputs as focus navigation. | Radix Popover owns the layer, portal, focus lifecycle and collision-aware positioning. Search, category navigation, selects and buttons retain dialog semantics. Escape first clears search or returns to categories, then closes. Outside focus stays where the user put it. |
| Dashboard widget actions | The portal already used Floating UI, but menu semantics, keyboard navigation and dismissal were maintained separately. | Shared `ActionMenu` uses Radix Dropdown Menu with real triggers/items, roving focus, disabled-item skipping, Home/End, typeahead and Escape. Existing widget commands remain unchanged. |
| Study card actions | Hand-written menu keyboard handling and absolute positioning duplicated the dashboard pattern. | Same `ActionMenu`, portaled inside the study-session root so native fullscreen and focus view retain their menu. Escape closes the menu without also invoking the app’s study-exit handler. |
| Text/highlight, divider and sketch palettes | Three copies of manual rectangle calculations tracked only selected viewport changes. | Shared Floating UI `autoUpdate`, `offset`, `flip`, `shift` and `size`, active only while a palette is open. Tracks ancestor scrolling/resizing and element-size/layout changes; bounds height and enables scrolling. Pointer interaction keeps the editor's selected range. Escape closes the palette before its parent toolbar. |

Radix is unstyled: existing RemoNook surfaces, spacing, theme variables and icons stay in use. Both packages are bundled locally; no CDN, new service, data schema or sync changes are involved. Versions are pinned in package-lock.json and license notices retained.

## Scope decisions

Use command-menu semantics only for commands. Bullet actions deliberately remain a searchable non-modal dialog because they include editable text and native selects. Editor palettes retain native details/summary disclosure and selection behavior rather than introducing a second focus manager over ProseMirror. Native selects remain native.

The reader's More menu mixes commands with zoom controls and a native sizing select; it is not a command-only dropdown. The calendar picker and editor slash/emoji suggestions have specialized navigation. These were audited but are not migrated to a command-menu primitive in this release. The shared primitives can support future work without imposing inappropriate menu roles on forms or editor suggestions.

## Validation

- Regression coverage for nested Escape, outside focus, command navigation, disabled items, typeahead and focus return in `tests/overlays.test.mjs`.
- Existing app, dashboard, study, divider, formatting and sketch tests retain their behavior. jsdom fixtures use same-realm DOM constructors for Radix events; keyboard tests account for deferred roving focus.
- Real Chromium checks at 1280px and 390px: bottom/right edge collisions, category/search Escape, outside input focus, keyboard/typeahead, opening an editable dialog from a menu, selected-text color application, native fullscreen containment, and no page errors.
- Full TypeScript/build and application regression suite before staging release.

## References

- [Radix Popover](https://www.radix-ui.com/primitives/docs/components/popover): controlled non-modal layers, focus hooks, portals and collisions.
- [Radix Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu): trigger/item composition and command keyboard navigation.
- [Floating UI autoUpdate](https://floating-ui.com/docs/autoupdate): subscribe while mounted/open, clean up when closed.
- [Floating UI middleware](https://floating-ui.com/docs/middleware): offset, flip, shift and size.
