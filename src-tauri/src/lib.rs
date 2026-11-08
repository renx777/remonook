//! RemoNook desktop: the RemoNook web app in a native window.
//!
//! Phase 1 is a shell around the same app as remonook.com, bundled so it works offline.
//! Links to other sites open in the system browser (the opener plugin). Later phases add
//! notes on disk, quick capture and a local AI connection.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running RemoNook");
}
