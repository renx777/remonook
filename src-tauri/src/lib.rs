//! RemoNook desktop: the RemoNook web app in a native window.
//!
//! Phase 1 is a shell around the same app as remonook.com, bundled so it works offline.
//! Links to other sites open in the system browser (the opener plugin).
//! Phase 2 adds Google sign-in through the system browser (`google_sign_in_start` / `_wait`).
//! Updates: the updater plugin checks the channel's latest.json (signed builds only) and the
//! app offers a restart once an update has downloaded.

mod google;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(google::Pending::default())
        .invoke_handler(tauri::generate_handler![google::google_sign_in_start, google::google_sign_in_wait])
        .run(tauri::generate_context!())
        .expect("error while running RemoNook");
}
