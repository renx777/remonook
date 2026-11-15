# RemoNook for Android

The Android app is the RemoNook app in a full-screen window, built from the same code as the
desktop apps (Tauri 2; the Android project is `src-tauri/gen/android`). It works offline, syncs
through your account like the website, and syncs device-only workspaces directly with your
computers on the same Wi-Fi (local sync).

What the phone app does not have: the tray, quick capture shortcut, launch at login, folder
workspaces and the AI-apps server. Those stay desktop features.

## Install (staging)

1. On the phone, open the download link from the latest **Android app** workflow run (or
   `https://remo-sync-staging.remo-978fb.workers.dev/desktop/staging/android.json` shows it).
2. Open the downloaded file. Android asks once to allow installing apps from your browser:
   allow it, then choose **Install**.
3. The app is called **RemoNook Staging** and installs next to a production RemoNook.

Updates: the app checks for a newer build and shows **Update available → Download**. Open the
downloaded file and choose **Update**. Your notes stay: Android keeps the app's storage when an
update is installed over it. (This only works while every build is signed with the same key;
see below. Uninstalling the app deletes notes kept only on the phone.)

## Local sync with your computers

Settings → **This device** on the phone, Settings → **Desktop** on the computer. Turn on local
sync on both and pair as between two computers. The phone syncs while RemoNook is open; Android
pauses apps in the background, so it catches up within seconds of opening the app.

A staging phone pairs only with staging computers, and production only with production
(`REMONOOK_CHANNEL`, set by the workflow).

## The signing key (one-time setup)

Android only installs an update over the app if both are signed with the same key, so the
workflow needs one fixed release key in the repository secrets. Create it once on your own
computer (it never goes into the repository):

1. Install a Java runtime if you have none (Windows: `winget install Microsoft.OpenJDK.21`).
2. Create the key (choose a strong password and keep it in your password manager):

   ```
   keytool -genkeypair -v -keystore remonook-release.jks -alias remonook -keyalg RSA -keysize 4096 -validity 10000
   ```

3. Turn it into text for GitHub:
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("remonook-release.jks")) | Set-Clipboard`
   - macOS: `base64 -i remonook-release.jks | pbcopy`
   - Linux: `base64 -w0 remonook-release.jks`
4. In GitHub: the repository → **Settings → Secrets and variables → Actions → New repository
   secret**, add:
   - `ANDROID_KEYSTORE_BASE64`: the text from step 3
   - `ANDROID_KEYSTORE_PASSWORD`: the keystore password
   - `ANDROID_KEY_ALIAS`: `remonook`
   - `ANDROID_KEY_PASSWORD`: the key password (the same one if keytool did not ask separately)
5. Keep `remonook-release.jks` and its password safe (a backup outside this computer). The
   Play Store also needs this key later; losing it means people must reinstall the app.

## Build

- CI: Actions → **Android app** → Run workflow (staging or production). It builds one APK for
  phones (arm64, armv7) and the emulator (x86_64), signs it, uploads it to the sync server's
  storage and updates `android.json`.
- Locally (Android SDK, NDK 28 and Java 17+ installed; `ANDROID_HOME` and `NDK_HOME` set):

  ```
  npm run build:staging
  ORG_GRADLE_PROJECT_remonookChannel=staging REMONOOK_CHANNEL=com.remonook.desktop.staging \
    npx tauri android build --debug --apk --target aarch64
  ```

  A debug build is signed with your own debug key, so remove it before installing a release
  build (export anything kept only on the phone first).

## Notes for changing the app

- `tauri.android.conf.json` gives the Android app its own identifier (`com.remonook.app`); the
  Kotlin package and the Rust entry point depend on it, so it is the same for staging and
  production. Staging gets `.staging` added to the installed app id by Gradle.
- `MainActivity.kt` keeps the app clear of the status bar, navigation bar and keyboard, and holds
  the Wi-Fi multicast lock local sync needs to find devices.
- In the web code, `isApp()` is any RemoNook app, `isDesktop()` the desktop app only and
  `isMobileApp()` the Android app (src/desktop.ts).
