//! Desktop conveniences: the tray icon, closing to the tray, quick capture with a global
//! shortcut, and launching at login. The choices are kept in `settings.json` in the app data
//! folder and changed from Settings → Desktop.

#![cfg_attr(mobile, allow(dead_code))]

use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};
#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt as _;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const CAPTURE_SHORTCUT: &str = "CommandOrControl+Shift+Space";
/// Passed when the app starts at login or for an AI app: open in the tray, not on screen.
pub const BACKGROUND_ARG: &str = "--background";

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub keep_in_tray: bool,
    pub quick_capture: bool,
    pub local_mcp: bool,
    pub local_mcp_token: String,
    pub local_sync: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Settings { keep_in_tray: true, quick_capture: true, local_mcp: false, local_mcp_token: String::new(), local_sync: false }
    }
}
pub struct State(pub Mutex<Settings>);

fn settings_file(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("settings.json"))
}
pub fn load(app: &tauri::AppHandle) -> Settings {
    settings_file(app).and_then(|f| fs::read_to_string(f).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}
pub fn store(app: &tauri::AppHandle, settings: &Settings) {
    if let Some(f) = settings_file(app) {
        let _ = fs::write(f, serde_json::to_string_pretty(settings).unwrap());
    }
}

pub fn show_main(app: &tauri::AppHandle) {
    #[cfg(desktop)]
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    #[cfg(mobile)]
    let _ = app;
}

/// Opens the quick capture box, creating its window the first time.
#[cfg(desktop)]
pub fn open_capture(app: &tauri::AppHandle) {
    let window = match app.get_webview_window("capture") {
        Some(w) => w,
        None => match WebviewWindowBuilder::new(app, "capture", WebviewUrl::App("index.html#quick-capture".into()))
            .title("Quick capture · RemoNook")
            .inner_size(560.0, 196.0)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .center()
            .visible(false)
            .build()
        {
            Ok(w) => w,
            Err(_) => return,
        },
    };
    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("capture-open", ());
}

#[cfg(desktop)]
fn apply_shortcut(app: &tauri::AppHandle, on: bool) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let shortcut: Shortcut = CAPTURE_SHORTCUT.parse().map_err(|e| format!("{e}"))?;
    let registered = shortcuts.is_registered(shortcut);
    if on && !registered {
        shortcuts
            .on_shortcut(shortcut, |app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    open_capture(app);
                }
            })
            .map_err(|_| "Another app already uses this shortcut, so quick capture cannot use it.".to_string())?;
    } else if !on && registered {
        let _ = shortcuts.unregister(shortcut);
    }
    Ok(())
}

/// Asks the app window to save pending edits, then quits (after 4 seconds at most).
#[cfg(desktop)]
fn request_quit(app: &tauri::AppHandle) {
    if app.emit_to("main", "app-quit", ()).is_err() {
        return app.exit(0);
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));
        app.exit(0);
    });
}
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// The settings, and on desktop the tray icon, close-to-tray and the capture shortcut, set up
/// once at start.
pub fn setup(app: &tauri::AppHandle) -> tauri::Result<()> {
    let settings = load(app);
    app.manage(State(Mutex::new(settings.clone())));
    #[cfg(desktop)]
    setup_tray(app, &settings)?;
    Ok(())
}
#[cfg(desktop)]
fn setup_tray(app: &tauri::AppHandle, settings: &Settings) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open RemoNook", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Quick capture", true, Some(CAPTURE_SHORTCUT))?;
    let quit = MenuItem::with_id(app, "quit", "Quit RemoNook", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture, &quit])?;
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("RemoNook")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "capture" => open_capture(app),
            "quit" => request_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    if settings.quick_capture {
        let _ = apply_shortcut(app, true);
    }
    Ok(())
}

/// Closing the main window hides it to the tray (when chosen), so quick capture and AI apps keep
/// working. The capture box only ever hides.
pub fn on_close(window: &tauri::Window, api: &tauri::CloseRequestApi) {
    let keep = window.label() == "capture" || window.app_handle().state::<State>().0.lock().unwrap().keep_in_tray;
    if keep {
        api.prevent_close();
        let _ = window.hide();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    keep_in_tray: bool,
    quick_capture: bool,
    launch_at_login: bool,
    shortcut: &'static str,
}
fn view(app: &tauri::AppHandle) -> View {
    let s = app.state::<State>().0.lock().unwrap().clone();
    #[cfg(desktop)]
    let launch_at_login = app.autolaunch().is_enabled().unwrap_or(false);
    #[cfg(mobile)]
    let launch_at_login = false;
    View { keep_in_tray: s.keep_in_tray, quick_capture: s.quick_capture, launch_at_login, shortcut: CAPTURE_SHORTCUT }
}

#[tauri::command]
pub fn desktop_settings(app: tauri::AppHandle) -> View {
    view(&app)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    keep_in_tray: Option<bool>,
    quick_capture: Option<bool>,
    launch_at_login: Option<bool>,
}
#[tauri::command]
pub fn desktop_settings_set(app: tauri::AppHandle, change: Change) -> Result<View, String> {
    #[cfg(desktop)]
    if let Some(on) = change.quick_capture {
        apply_shortcut(&app, on)?;
    }
    #[cfg(desktop)]
    if let Some(on) = change.launch_at_login {
        let auto = app.autolaunch();
        if on { auto.enable() } else { auto.disable() }.map_err(|e| format!("Could not change launch at login: {e}"))?;
    }
    {
        let state = app.state::<State>();
        let mut s = state.0.lock().unwrap();
        if let Some(v) = change.keep_in_tray {
            s.keep_in_tray = v;
        }
        if let Some(v) = change.quick_capture {
            s.quick_capture = v;
        }
        store(&app, &s);
    }
    Ok(view(&app))
}

/// From the capture box: hand the text to the main window, which adds it to the open workspace.
#[tauri::command]
pub fn capture_submit(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if text.trim().is_empty() || text.len() > 100_000 {
        return Err("Nothing to save.".into());
    }
    app.emit_to("main", "quick-capture", text).map_err(|e| e.to_string())?;
    if let Some(w) = app.get_webview_window("capture") {
        let _ = w.hide();
    }
    Ok(())
}
#[tauri::command]
pub fn capture_hide(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("capture") {
        let _ = w.hide();
    }
}
#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) {
    show_main(&app);
}
