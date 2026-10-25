# Workflowy UI comparison

Reviewed the user's open Workflowy notes screen and Remo at the same 1920px viewport. Reference documentation: [bullets](https://workflowy.com/help/bullets), [sidebar navigation](https://workflowy.com/help/sidebar-navigation), and [navigation](https://workflowy.com/help/navigate-around).

## Implemented

| Area | Previous Remo gap | Result |
| --- | --- | --- |
| Outline density | Every bullet occupied at least 48px | Rows follow reading size: 28px at 16px, 31px at 18px. Wrapped text and attachments retain measured heights. |
| Typography and page position | Content started immediately beneath the toolbar; no home title | 27px page title, 47px space beneath the toolbar, system sans serif, consistent 24px nested indentation. Existing font and size preferences remain honored. |
| Theme | Green-tinted surfaces and hard-coded white text/dots | Neutral light and dark surfaces; titles, bullets, guides, menus, and controls use theme colors. |
| Bullet controls | Disclosure controls misaligned for nested rows; duplicate actions at the right | Small dots, aligned disclosure gutters, faint hierarchy guides, hover actions on the left, and right-click access. Dragging suppresses the following zoom click. |
| Page actions | Large modal covering the outline | A compact anchored menu with complete, star, expand/collapse, zoom, indent/outdent, list/type choices, Q&A, and Trash. Supports Escape, arrow keys, outside dismissal, and focus return. |
| Sidebar | Flat root-note shortcuts | Expandable outline tree with child creation and a Home action. Navigating to a nested note reveals its ancestors. |
| Favorites | No starred section | Starred notes and searches, persisted as web workspace metadata and retained in full backups. |
| Quick navigation | No quick-jump picker | Ctrl/Cmd+K opens a searchable picker with parent context, arrow navigation, and Enter to open. |
| View controls | No branch-wide controls | Outline options menu offers expand all, collapse all, completed visibility, sidebar visibility, and shortcuts. |
| Search presentation | No highlighted hits; scoped empty search resembled an empty document | Search highlights preserve rich text. Empty scoped results show an explicit no-results message. |
| Capture | Plus button only inside zoomed branches | Plus at the end of the home outline as well; sidebar New node and per-parent child buttons. |
| Editing chrome | Permanent status/shortcut footer and large rounded formatting bar | Quiet save indicator with full status available on hover and to assistive technology; pending/failure state remains text. Compact floating formatting controls and a shortcuts dialog. |
| Small screens | Toolbar could overflow | Collapsible search, reduced gutters, reachable actions, and menus constrained to the viewport. |

New workspaces default to 16px reading size, matching the inspected Workflowy outline. Existing users retain their saved size. The 48px toolbar, page position, and 28px default row spacing are based on the inspected UI.

## Remaining product differences

This pass matches the core notes/outline interface. Workflowy's boards, tables, multiple panes, mirrors/backlinks, separate bullet notes, heading/paragraph node types, slash-command picker, cloud collaboration, and account/sync UI are not implemented. They require additional product/data behavior and are not represented by inactive controls. Remo retains Calendar, Study Desk, local storage, Q&A tools, and backup workflows.

## Verification

Production TypeScript/Vite build and regression suite, including added coverage for sidebar expansion, persisted stars, and Ctrl+K navigation. Browser review covers the live notes page, anchored actions, quick jump, light/dark appearance, and a narrow viewport. No reference-account note content was copied into Remo.
