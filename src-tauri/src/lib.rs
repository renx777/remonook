//! RemoNook desktop: the RemoNook web app in a native window.
//!
//! The window shows the same app as remonook.com, bundled so it works offline. Links to other
//! sites open in the system browser (the opener plugin). Around it:
//! - Google sign-in through the system browser (`google`);
//! - signed automatic updates (updater plugin; the app offers a restart);
//! - workspaces kept in a folder on this computer (`folders`);
//! - tray icon, close to tray, quick capture shortcut and launch at login (`desktop`);
//! - local AI apps over MCP, and `RemoNook --mcp`, a stdio bridge to them (`local_mcp`).

mod desktop;
mod folders;
mod google;
mod local_mcp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    // `RemoNook --mcp`: the stdio bridge for AI apps, instead of the app.
    if std::env::args().any(|a| a == "--mcp") {
        local_mcp::bridge(&context.config().identifier);
        return;
    }
    let background = std::env::args().any(|a| a == desktop::BACKGROUND_ARG);
    tauri::Builder::default()
        // A second launch shows the open app instead of starting another copy.
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !args.iter().any(|a| a == desktop::BACKGROUND_ARG) {
                desktop::show_main(app);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![desktop::BACKGROUND_ARG])))
        .manage(google::Pending::default())
        .manage(folders::Allowed::default())
        .manage(local_mcp::Server::default())
        .setup(move |app| {
            let handle = app.handle();
            folders::load_allowed(handle);
            desktop::setup(handle)?;
            local_mcp::setup(handle);
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
        ])
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
