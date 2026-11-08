# RemoNook desktop app

A Tauri 2 shell (`src-tauri/`) around the same app as remonook.com. The built web app (`dist/`)
is bundled, so the desktop app works offline and needs no service worker.

## Behaviour (`src/desktop.ts`)
- **Start-up:** opens straight into the app; there is no website landing page.
- **Links:** links to other sites, and `window.open` calls for them, open in the system
  browser (opener plugin, limited to http, https and mailto by `capabilities/default.json`).
- **Sign-in:** email and password only for now. Google blocks sign-in inside embedded app
  windows, so Google sign-in through the system browser is phase 2. Firebase Auth is created
  without the pop-up helper in the desktop app, because that helper loads a page from the auth
  domain that never completes in the app window and held up start-up.
- **Label:** the sidebar label reads DESKTOP.

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

## Locally (Linux)
Install the WebKitGTK development packages, then run `npm run build:staging` followed by
`npx tauri build --config src-tauri/tauri.staging.json --bundles deb`.

## Roadmap
1. Shell, email sign-in, Windows installers. **Done.**
2. Google sign-in through the system browser.
3. Device-only workspaces stored as files on disk; Markdown export folder.
4. Quick capture (global shortcut), tray, launch at login.
5. Local AI connection (MCP) to device-only workspaces.
