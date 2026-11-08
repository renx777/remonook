# RemoNook desktop app

A Tauri 2 shell (`src-tauri/`) around the same app as remonook.com. The built web app (`dist/`)
is bundled, so the desktop app works offline and needs no service worker.

## Behaviour (`src/desktop.ts`)
- **Start-up:** opens straight into the app; there is no website landing page.
- **Links:** links to other sites, and `window.open` calls for them, open in the system
  browser (opener plugin, limited to http, https and mailto by `capabilities/default.json`).
- **Sign-in:** email and password, or Google through the system browser (Google refuses
  sign-in inside embedded app windows). Firebase Auth is created without the pop-up helper in
  the desktop app, because that helper loads a page from the auth domain that never completes in
  the app window and held up start-up.

## Google sign-in (`src-tauri/src/google.rs`, `src/DesktopSignIn.tsx`)
1. `google_sign_in_start` binds a one-time listener on `127.0.0.1:<random port>`, generates a
   random 48-hex `state`, and opens `<site>/?port=…&state=…#desktop-signin` in the system browser.
   The site is `https://remonook.com` or `https://staging.remonook.com`; no other value is
   accepted. If no browser opens, the dialog shows the link to open by hand.
2. That page (the website's own origin, already authorised with Google) signs in with the
   Google pop-up, takes the Google ID token, signs the website back out if it was signed out
   before, and redirects to `http://127.0.0.1:<port>/callback?state=…&id_token=…`. Only a
   loopback port with a valid state is accepted.
3. `google_sign_in_wait` accepts only that callback (exact state, `/callback` path, JWT-shaped
   token), answers other requests with 400, and times out after 5 minutes. The listener is
   loopback-only, so other machines cannot connect.
4. The app signs in to Firebase with `GoogleAuthProvider.credential(idToken)`.
- **Label:** the sidebar label reads DESKTOP.

## Folder workspaces (`src/workspace-folder.ts`, `src-tauri/src/folders.rs`)
A device-only workspace can keep its copy in a folder on this computer (workspace menu: **New
workspace in a folder…**, **Open a workspace folder…**, or **Keep “…” in a folder…**).
- **Folder contents:**
  - `RemoNook workspace.json`: the whole workspace (format `remonook-workspace`, version 1), with
    a random `saveId` per write;
  - `attachments/`: images and files, under the same paths as in a backup;
  - `Markdown/`: one `.md` file per top-level bullet, rewritten after each save and never read
    back.
- **Writing:** the app keeps working from its own storage. 1.2 s after a save (and on start when
  the folder is behind), the whole workspace is written: attachments, Markdown, then the
  workspace file last (written to a temporary file, then renamed).
- **Changes made elsewhere:** each write names the file version it last saw (modified time and
  size). If the file changed (a restored backup, a copy from another computer, a sync tool), the
  write is refused and the app opens the folder's version instead. The same check runs at start
  and when the window comes to the front. The app's previous copy is kept as its recovery copy.
  Two computers editing the same synced folder at once are not merged: the last write wins.
- **Safety:** Rust reads and writes only inside folders picked in the native dialog (remembered
  in `folders.json` in the app data folder), and checks every file name.
- **Stop using the folder** keeps the workspace in the app; the folder keeps its last copy.
  Deleting a folder workspace never deletes the folder.

## Tray, quick capture and start at login (`src-tauri/src/desktop.rs`)
- **Tray icon:** Open RemoNook, Quick capture, Quit. Quit saves pending edits and the folder copy
  first (4 s at most).
- **Close to tray** (on by default): closing the window hides it, so quick capture and AI apps keep
  working.
- **Quick capture:** Ctrl+Shift+Space anywhere opens a small box (`src/QuickCapture.tsx`). Enter
  saves under an **Inbox** bullet at the top of the open workspace (`src/quick-capture.mjs`,
  created on first use); each line is a bullet and Markdown works as in AI writes. Shift+Enter
  adds a line; Escape or clicking away closes it.
- **Start at login** (off by default) opens RemoNook in the tray (`--background`).
- **One copy:** starting RemoNook again shows the open window instead of a second copy.
- Choices live in Settings → Desktop and in `settings.json` in the app data folder.

## Local AI apps (`src/local-mcp.ts`, `src-tauri/src/local_mcp.rs`)
Off by default; turned on in Settings → Desktop.
- **Server:** listens on `127.0.0.1:47913` (or a free port) for MCP over Streamable HTTP with a
  random bearer token. Requests with an `Origin` header (browsers) or a non-loopback `Host` are
  refused.
- **Tools:** the same as the cloud MCP (`src/mcp-tools.mjs` is shared), on the workspace that is
  open in the app, including device-only and folder workspaces.
  - Writes go through the editor's normal save, so they can be undone and, in the synced
    workspace, sync like any edit.
  - The access level (read; read and write; read, write and delete) is chosen in Settings.
  - Requests are answered one at a time.
- **`RemoNook --mcp`:** a stdio bridge for apps that start MCP servers as commands (Claude
  Desktop, Claude Code, Codex). It reads `connection.json` (port and token) from the app data
  folder, starts RemoNook in the tray if it is closed, and waits for it to be ready (about 30 s
  at most).

## Origins
The app's origin is `http://tauri.localhost` on Windows and `tauri://localhost` on macOS and
Linux. Both are in the sync Worker's `ALLOWED_ORIGINS`: staging is deployed; production needs
the next `remo-sync` deploy.

## Builds
The **Desktop app** workflow (`.github/workflows/desktop.yml`) is started by hand:
- **Choose** `staging` or `production`.
- **Output:** Windows installers (NSIS `.exe` and `.msi`), uploaded as a run artifact.
- **Two apps:** staging builds are named "RemoNook Staging" (`com.remonook.desktop.staging`),
  so they install alongside the production app.
- **Unsigned:** Windows SmartScreen warns on first launch (More info → Run anyway).

## Automatic updates
- **Plugins:** the updater plugin checks the channel's `latest.json` 15 s after start and every
  6 hours, downloads in the background, then shows "Update ready · Restart to update"
  (`src/DesktopUpdate.tsx`). It flushes edits, installs (Windows: passive installer) and
  relaunches. Nothing installs until the person chooses it.
- **Signatures:** updates are signed. The public key is in `tauri.conf.json` and
  `tauri.staging.json`; the private key is the `TAURI_SIGNING_PRIVATE_KEY` secret (no
  password). An update whose signature does not match is refused.
- **Channels:** each channel has its own update file:
  - staging: `https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/latest.json`;
  - production: `https://remo-sync.remo-978fb.workers.dev/desktop/production/latest.json`.

  The sync Worker serves `desktop/<channel>/<file>` from R2 publicly (only that prefix and
  plain file names).
- **Versions:** every workflow build is `0.1.<run number>`. A separate `publish` job uploads
  the signed installer, then `latest.json` last. Its Cloudflare token (`CLOUDFLARE_API_TOKEN`,
  or `CLOUDFLARE_PRODUCTION_API_TOKEN` for production) needs the account permission
  **Workers R2 Storage: Edit**. If the upload fails, fix the token and use **Re-run failed
  jobs**: that repeats only the upload, not the 15-minute build.
- **Without the key secret,** builds still work but are not published as updates.

## Locally (Linux)
Install the WebKitGTK development packages, then run `npm run build:staging` followed by
`npx tauri build --config src-tauri/tauri.staging.json --bundles deb`.

## Roadmap
1. Shell, email sign-in, Windows installers. **Done.**
2. Google sign-in through the system browser. **Done.**
3. Workspaces kept in a folder, with a Markdown copy. **Done.**
4. Quick capture (global shortcut), tray, start at login. **Done.**
5. Local AI apps (MCP) on this computer. **Done.**
- Automatic updates (signed, per channel). **Done.**
- Later: macOS builds; choosing the quick capture shortcut and destination.
