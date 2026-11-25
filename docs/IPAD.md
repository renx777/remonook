# RemoNook for iPad (and iPhone)

The iPad app is the same app as Android and desktop. The web app is wrapped by Tauri 2 for iOS
(`src-tauri`, `tauri.ios.conf.json`, `Info.ios.plist`). It is not on the App Store. It is built
**unsigned** and installed by **sideloading**: Sideloadly (or AltStore) signs it with your own
Apple ID on your computer, so no Apple developer account is needed to build it.

## Install (staging)

1. Download the latest build on your computer. The current version and link are in
   `https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/ipad.json`.
2. Connect the iPad with a cable, open **Sideloadly**, drop in the `.ipa`, choose the iPad and
   enter your Apple ID, then press **Start**.
3. On the iPad, open **Settings → General → VPN & Device Management**, trust your Apple ID, and
   turn on **Developer Mode** if iPadOS asks (Settings → Privacy & Security). iPadOS restarts.
4. Open **RemoNook Staging** (bundle `com.remonook.ipad.staging`).

**Updates:** the app notices a newer build and says so. Install the new `.ipa` with Sideloadly
over the old one, using the same Apple ID. Notes stored on the iPad are kept.

**The 7-day limit:** with a free Apple ID, sideloaded apps stop opening after 7 days until they are
reinstalled or refreshed. Sideloadly's auto-refresh can do this while the iPad is on the same
Wi-Fi. A paid Apple developer account extends this to a year. Synced notes are safe either way,
because they are on the sync server. Back up anything kept only on the iPad.

## What works differently from desktop

- It is treated as a mobile app, like Android: no tray, quick capture shortcut, folder workspaces,
  local AI-app (MCP) server or self-updater. iPadOS web views report themselves as a Mac, so the
  app recognises the iPad by its touch screen (`isIosApp` in `src/desktop.ts`).
- The camera (photo to notes), microphone (dictation, voice review), photo library and local
  network (local sync) ask for permission the first time. Their reasons are in `src-tauri/Info.ios.plist`.
- **To check on the device:** Google sign-in opens Safari and returns to the app through a local
  callback, as on Android. iPadOS may pause the app while Safari is open. If sign-in does not
  complete, use email sign-in and report it, so we can move sign-in to an in-app
  authentication session.

## Build

The **iPad app** workflow (`.github/workflows/ios.yml`, manual: Actions → iPad app → Run workflow
→ staging) runs on a macOS runner. It builds the web app for the channel, runs
`tauri ios init --ci`, then `tauri ios build --no-sign --target aarch64`. It checks the `.ipa`
(bundle id, version, device family, usage descriptions) and publishes it with `ipad.json` to
`desktop/<channel>/` on the sync server, next to the Android APK. The Xcode project
(`src-tauri/gen/apple`) is generated fresh in each build and is not committed.

The iPad cannot be built on Linux: the Tauri CLI only has `ios` commands on macOS.
