//! RemoNook desktop: the RemoNook web app in a native window.
//!
//! The window shows the same app as remonook.com, bundled so it works offline. Links to other
//! sites open in the system browser (the opener plugin). Around it:
//! - Google sign-in through the system browser (`google`);
//! - signed automatic updates (updater plugin; the app offers a restart);
//! - workspaces kept in a folder on this computer (`folders`);
//! - tray icon, close to tray, quick capture shortcut and launch at login (`desktop`);
//! - local AI apps over MCP, and `RemoNook --mcp`, a stdio bridge to them (`local_mcp`);
//! - local sync between paired devices on the same network (`local_sync`).

//!
//! The same crate builds the Android app (`npm run android:build`): there the window is the
//! whole screen and the desktop-only parts (tray, shortcut, launch at login, folders, local MCP,
//! the updater) are left out. Local sync and Google sign-in work the same way.

mod local_article;
mod desktop;
#[cfg(desktop)]
mod folders;
mod google;
#[cfg(desktop)]
mod local_mcp;
mod local_sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    #[cfg(desktop)]
    {
        // `RemoNook --mcp`: the stdio bridge for AI apps, instead of the app.
        if std::env::args().any(|a| a == "--mcp") {
            local_mcp::bridge(&context.config().identifier);
            return;
        }
    }
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(google::Pending::default())
        .manage(local_sync::LocalSync::default());
    #[cfg(desktop)]
    let builder = desktop_builder(builder);
    #[cfg(mobile)]
    let builder = mobile_builder(builder);
    builder
        .build(context)
        .expect("error while starting RemoNook")
        .run(|_app, _event| {
            // macOS: clicking the Dock icon brings back a window hidden to the tray.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                desktop::show_main(_app);
            }
        });
}

#[cfg(desktop)]
fn desktop_builder(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    let background = std::env::args().any(|a| a == desktop::BACKGROUND_ARG);
    builder
        // A second launch shows the open app instead of starting another copy.
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !args.iter().any(|a| a == desktop::BACKGROUND_ARG) {
                desktop::show_main(app);
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![desktop::BACKGROUND_ARG])))
        .manage(folders::Allowed::default())
        .manage(local_mcp::Server::default())
        .setup(move |app| {
            let handle = app.handle();
            folders::load_allowed(handle);
            desktop::setup(handle)?;
            local_mcp::setup(handle);
            local_sync::setup(handle);
            if !background {
                desktop::show_main(handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                desktop::on_close(window, api);
            }
        })
        .invoke_handler(tauri::generate_handler![
            local_article::local_article_fetch,
            google::google_sign_in_start,
            google::google_sign_in_wait,
            folders::folder_pick,
            folders::folder_read,
            folders::folder_stamp,
            folders::folder_write,
            folders::folder_assets,
            folders::folder_read_asset,
            folders::folder_show,
            desktop::desktop_settings,
            desktop::desktop_settings_set,
            desktop::capture_submit,
            desktop::capture_hide,
            desktop::show_main_window,
            desktop::quit_app,
            local_mcp::local_mcp_status,
            local_mcp::local_mcp_set,
            local_mcp::local_mcp_reply,
            local_mcp::local_mcp_ready,
            local_sync::local_sync_status,
            local_sync::local_sync_set,
            local_sync::local_sync_rename,
            local_sync::local_sync_pair_start,
            local_sync::local_sync_pair_finish,
            local_sync::local_sync_pair_cancel,
            local_sync::local_sync_unpair,
            local_sync::local_sync_send,
        ])
}

/// Android (and later iPad): the app fills the screen; settings and local sync only.
#[cfg(mobile)]
fn mobile_builder(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .setup(|app| {
            let handle = app.handle();
            desktop::setup(handle)?;
            local_sync::setup(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            local_article::local_article_fetch,
            google::google_sign_in_start,
            google::google_sign_in_wait,
            local_sync::local_sync_status,
            local_sync::local_sync_set,
            local_sync::local_sync_rename,
            local_sync::local_sync_pair_start,
            local_sync::local_sync_pair_finish,
            local_sync::local_sync_pair_cancel,
            local_sync::local_sync_unpair,
            local_sync::local_sync_send,
        ])
}
