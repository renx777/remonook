# Selection editing design

## Research

- [Notion: styling content](https://www.notion.com/help/customize-and-style-your-content) exposes text editing when text is highlighted.
- [Workflowy: add, edit and format](https://workflowy.com/help/add-edit-format) exposes colors, highlights and underline through a selection toolbar.
- [Tiptap: bubble menu](https://tiptap.dev/docs/editor/extensions/functionality/bubble-menu) describes selection-triggered contextual formatting and customizable visibility.

These sources support the interaction pattern, rather than a claim that one exact visual design is best for every editor.

## Design decisions

Keep the editing surface quiet until the user selects actual text. Show a compact, theme-aware bubble with four text styles, separate A (text color) and H (highlight) controls, and clear formatting. Use subtle separators, consistent hit areas, active states, shortcut hints, and a restrained shadow.

Text styles and color are selection actions. Nesting, tasks, media, equation insertion, and diagram insertion are bullet actions and live in the bullet menu. Tab and Shift+Tab still nest and outdent directly from the editor.

Center the bubble above the selection, flip below when there is insufficient room, and clamp both bubble and color picker to the viewport. Show it after pointer selection finishes rather than following every drag movement.

Each picker contains 24 named presets, six recently used colors, and a reset action. Yellow is available for both text and highlights. Selected swatches are outlined. Choosing a swatch closes the picker while preserving the selected text. The separate A and H controls avoid mode switching and remove the need for a custom-color dialog.

## Behavior checks

- A focused caret, an empty bullet, normal typing, and whitespace-only selections do not open the menu.
- Selecting text opens it; collapsing the selection hides it.
- Formatting preserves the selected range and updates active states.
- Clicking outside or pressing Escape dismisses it.
- Alt+F10 transfers keyboard focus to the menu for a selected range; arrows navigate controls.
- Equations continue inheriting formatting from their editable source.

Automated coverage uses a real Tiptap editor with a simulated browser document. Chrome visual checks cover the compact bubble, the color picker, and selection-to-caret dismissal.
