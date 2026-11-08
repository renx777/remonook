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
- **Versions:** every workflow build is `0.1.<run number>`. The workflow uploads the signed
  installer, then `latest.json` last.
- **Without the key secret,** builds still work but are not published as updates.

## Locally (Linux)
Install the WebKitGTK development packages, then run `npm run build:staging` followed by
`npx tauri build --config src-tauri/tauri.staging.json --bundles deb`.

## Roadmap
1. Shell, email sign-in, Windows installers. **Done.**
2. Google sign-in through the system browser. **Done.**
3. Device-only workspaces stored as files on disk; Markdown export folder.
4. Quick capture (global shortcut), tray, launch at login.
- Automatic updates (signed, per channel). **Done.**
5. Local AI connection (MCP) to device-only workspaces.
