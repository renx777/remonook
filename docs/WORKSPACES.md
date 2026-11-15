# Workspaces

RemoNook has one **main workspace** and any number of **device-only workspaces**.

| | Main workspace | Device-only workspace |
|---|---|---|
| Where | Synced to your account (or this device when signed out) | Only this browser's IndexedDB (desktop app: optionally also a folder) |
| Other devices | Yes | Desktop app: only paired computers, directly, when "Sync with my devices" is on |
| AI apps (MCP) | Yes | Desktop app only: AI apps on the same computer |
| Contents | Everything | Everything, separately: notes, flashcards, calendar, tags, attachments, PDF/EPUB books |

- **Choosing:** the sync setting is chosen when a workspace is created and never changes.
  There are no moves between workspaces, so nothing can race an offline edit.
- **Copy to…** (bullet actions → Organize branch) copies a bullet and everything under it into
  another workspace, as new bullets at its top level (`src/workspace-copy.ts`):
  - the copy goes through the target's normal save, so a synced target queues it and uploads
    it the next time it is open;
  - a synced account must have synced once on this device first, so its first sync cannot
    replace the copy;
  - mirror links are dropped;
  - images and attachments are not copied yet.
- **Implementation:** `src/workspaces.ts` keeps the registry and the active choice in
  localStorage. A device-only workspace's databases are named `remo-web-local-<id>`.
- **No sync code path:** when a device-only workspace is open, the auth gate gives the app no
  cloud user, so sync never starts. The end-to-end check (`scripts/e2e-sync.mjs`) asserts that
  a device-only workspace makes no sync requests and that its text never appears in any
  request.
- **Switching** saves pending edits, then reloads into the chosen workspace (the same path as
  an account change).
- **Deleting** removes the workspace's databases and its localStorage keys, after typing its
  name, including its private book cache and reading checkpoints.
- **Browser storage:** browsers may clear site storage, so opening a device-only workspace asks
  for persistent storage, and the create dialog points to backups.

- **Desktop app:** a device-only workspace can also:
  - be kept in a folder on the computer, with a readable Markdown copy;
  - sync directly with the person's paired computers on the same network ("Sync with my
    devices"), never through RemoNook cloud.

  AI apps on the computer can use the open workspace. See docs/DESKTOP.md.

Bookshelf and Settings → Storage require no sign-in for local workspaces. PDF and
EPUB originals can be imported and read offline, with highlights and comments
saved as ordinary notes. Available originals are included in full backups, folder
copies and optional paired-device transfers; no book request goes to the cloud.

## Later
- A one-way "Turn on sync for this workspace" (upload only, which is safe).
- The Android app storing device-only workspaces as files.
- Optional same-Wi-Fi or encrypted sync per workspace.
