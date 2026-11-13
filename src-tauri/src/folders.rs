//! Workspace folders: a device-only workspace can keep its copy in a folder on this computer.
//!
//! The folder holds `RemoNook workspace.json` (the whole workspace), `attachments/` (images and
//! other files, under the same paths as in a backup) and `Markdown/` (a readable copy of the
//! notes, one file per top-level bullet, rewritten after every save). The app chooses what to
//! write; this module only writes inside folders the person picked in the native folder dialog,
//! and only to file names it checks.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

pub const DOC_FILE: &str = "RemoNook workspace.json";
const ALLOWED_FILE: &str = "folders.json";

/// Folders the person has chosen; nothing outside them can be read or written.
#[derive(Default)]
pub struct Allowed(pub Mutex<HashSet<PathBuf>>);

fn allowed_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(ALLOWED_FILE))
}

pub fn load_allowed(app: &tauri::AppHandle) {
    let Ok(path) = allowed_path(app) else { return };
    let list: Vec<PathBuf> = fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
    app.state::<Allowed>().0.lock().unwrap().extend(list);
}

fn remember(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let state = app.state::<Allowed>();
    let mut set = state.0.lock().unwrap();
    set.insert(root.to_path_buf());
    let list: Vec<&PathBuf> = set.iter().collect();
    fs::write(allowed_path(app)?, serde_json::to_string(&list).unwrap()).map_err(|e| e.to_string())
}

fn root(app: &tauri::AppHandle, root: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root);
    if app.state::<Allowed>().0.lock().unwrap().contains(&path) {
        Ok(path)
    } else {
        Err("This folder was not chosen in RemoNook. Choose it again from the workspace menu.".into())
    }
}

/// A plain file name: no folders, no hidden files, nothing Windows reserves.
pub(crate) fn plain_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 120
        && !name.starts_with('.')
        && !name.ends_with('.')
        && !name.ends_with(' ')
        && name.chars().all(|c| !c.is_control() && !"<>:\"/\\|?*".contains(c))
}
/// An attachment path as used in backups: `media/…`, `emoji/…` or `articles/<hash>.json`.
pub(crate) fn asset_path(path: &str) -> bool {
    let mut parts = path.split('/');
    let (Some(dir), Some(file), None) = (parts.next(), parts.next(), parts.next()) else { return false };
    ["media", "emoji", "articles", "books"].contains(&dir)
        && file != "."
        && file != ".."
        && !file.is_empty()
        && file.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}

/// Changes whenever the workspace file changes (modified time and size).
fn stamp(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_nanos();
    Some(format!("{modified}-{}", meta.len()))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("Could not write to the workspace folder: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("Could not write to the workspace folder: {e}"))
}

#[derive(Serialize)]
pub struct Picked {
    path: String,
    name: String,
    /// The folder already holds a RemoNook workspace.
    existing: bool,
}

/// Shows the native folder dialog and allows the chosen folder.
#[tauri::command]
pub async fn folder_pick(app: tauri::AppHandle) -> Result<Option<Picked>, String> {
    let Some(picked) = app.dialog().file().set_title("Choose a folder for this workspace").blocking_pick_folder() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let path = fs::canonicalize(&path).unwrap_or(path);
    remember(&app, &path)?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(Some(Picked { existing: path.join(DOC_FILE).is_file(), name, path: path.to_string_lossy().into_owned() }))
}

#[derive(Serialize)]
pub struct Read {
    doc: Option<String>,
    stamp: Option<String>,
}

#[tauri::command]
pub fn folder_read(app: tauri::AppHandle, path: String) -> Result<Read, String> {
    let file = root(&app, &path)?.join(DOC_FILE);
    if !file.is_file() {
        return Ok(Read { doc: None, stamp: None });
    }
    let doc = fs::read_to_string(&file).map_err(|e| format!("Could not read the workspace folder: {e}"))?;
    Ok(Read { stamp: stamp(&file), doc: Some(doc) })
}

#[tauri::command]
pub fn folder_stamp(app: tauri::AppHandle, path: String) -> Result<Option<String>, String> {
    Ok(stamp(&root(&app, &path)?.join(DOC_FILE)))
}

#[derive(Deserialize)]
pub struct Write {
    doc: String,
    /// The stamp the app last saw; the write is refused if the file changed since.
    expect: Option<String>,
    markdown: Vec<(String, String)>,
    /// New attachments: (path, base64 bytes).
    assets: Vec<(String, String)>,
    remove_assets: Vec<String>,
}

#[tauri::command]
pub fn folder_write(app: tauri::AppHandle, path: String, write: Write) -> Result<String, String> {
    write_folder(&root(&app, &path)?, &write)
}

/// Writes the workspace into `dir`: attachments, then the Markdown copy, then the workspace file.
/// Refused with `CHANGED` when the workspace file is not the one the app last saw.
pub(crate) fn write_folder(dir: &Path, write: &Write) -> Result<String, String> {
    let dir = dir.to_path_buf();
    if !dir.is_dir() {
        return Err("The workspace folder is missing. Reconnect it from the workspace menu.".into());
    }
    let file = dir.join(DOC_FILE);
    if stamp(&file) != write.expect {
        return Err("CHANGED".into());
    }
    let attachments = dir.join("attachments");
    for (name, data) in &write.assets {
        if !asset_path(name) {
            return Err(format!("Invalid attachment path {name}"));
        }
        let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
        let target = attachments.join(name);
        fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
        write_atomic(&target, &bytes)?;
    }
    for name in &write.remove_assets {
        if asset_path(name) {
            let _ = fs::remove_file(attachments.join(name));
        }
    }
    // The readable copy: rewrite changed files and remove ones for bullets that are gone.
    let md = dir.join("Markdown");
    fs::create_dir_all(&md).map_err(|e| e.to_string())?;
    let mut keep = HashSet::new();
    for (name, text) in &write.markdown {
        if !plain_name(name) || !name.ends_with(".md") {
            return Err(format!("Invalid Markdown file name {name}"));
        }
        keep.insert(name.clone());
        let target = md.join(name);
        if fs::read_to_string(&target).ok().as_deref() != Some(text.as_str()) {
            write_atomic(&target, text.as_bytes())?;
        }
    }
    if let Ok(entries) = fs::read_dir(&md) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with(".md") && !keep.contains(&name) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    // The workspace file last, so a reader never sees it ahead of its attachments.
    write_atomic(&file, write.doc.as_bytes())?;
    stamp(&file).ok_or_else(|| "Could not read back the workspace folder.".into())
}

/// Attachment paths stored in the folder.
#[tauri::command]
pub fn folder_assets(app: tauri::AppHandle, path: String) -> Result<Vec<String>, String> {
    let dir = root(&app, &path)?.join("attachments");
    let mut out = vec![];
    for sub in ["media", "emoji", "articles", "books"] {
        if let Ok(entries) = fs::read_dir(dir.join(sub)) {
            for entry in entries.flatten() {
                let name = format!("{sub}/{}", entry.file_name().to_string_lossy());
                if asset_path(&name) && entry.path().is_file() {
                    out.push(name);
                }
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn folder_read_asset(app: tauri::AppHandle, path: String, asset: String) -> Result<String, String> {
    if !asset_path(&asset) {
        return Err("Invalid attachment path".into());
    }
    let bytes = fs::read(root(&app, &path)?.join("attachments").join(&asset)).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Opens the folder in Explorer (Finder, Files).
#[tauri::command]
pub fn folder_show(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = root(&app, &path)?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("remonook-folder-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
    fn write(doc: &str, expect: Option<String>, markdown: &[(&str, &str)], assets: &[(&str, &[u8])], remove: &[&str]) -> Write {
        Write {
            doc: doc.into(),
            expect,
            markdown: markdown.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect(),
            assets: assets.iter().map(|(p, b)| (p.to_string(), base64::engine::general_purpose::STANDARD.encode(b))).collect(),
            remove_assets: remove.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn writes_the_workspace_and_refuses_a_file_changed_elsewhere() {
        let dir = temp_dir("write");
        let first = write_folder(&dir, &write("{\"v\":1}", None, &[("Trip.md", "# Trip\n"), ("Old.md", "x")], &[("media/a.png", b"png")], &[])).unwrap();
        assert_eq!(fs::read_to_string(dir.join(DOC_FILE)).unwrap(), "{\"v\":1}");
        assert_eq!(fs::read(dir.join("attachments/media/a.png")).unwrap(), b"png");
        assert!(dir.join("Markdown/Old.md").is_file());
        // The next write names the version it replaces; Markdown files for removed bullets go.
        std::thread::sleep(std::time::Duration::from_millis(20));
        let second = write_folder(&dir, &write("{\"v\":22}", Some(first.clone()), &[("Trip.md", "# Trip 2\n")], &[], &["media/a.png"])).unwrap();
        assert_ne!(first, second);
        assert!(!dir.join("Markdown/Old.md").exists());
        assert!(!dir.join("attachments/media/a.png").exists());
        assert_eq!(fs::read_to_string(dir.join("Markdown/Trip.md")).unwrap(), "# Trip 2\n");
        // Written with an out-of-date stamp (the file changed elsewhere): refused, nothing written.
        assert_eq!(write_folder(&dir, &write("{\"v\":3}", Some(first), &[], &[], &[])), Err("CHANGED".into()));
        assert_eq!(fs::read_to_string(dir.join(DOC_FILE)).unwrap(), "{\"v\":22}");
        // Unsafe names are refused.
        assert!(write_folder(&dir, &write("{}", Some(second.clone()), &[("../x.md", "")], &[], &[])).is_err());
        assert!(write_folder(&dir, &write("{}", Some(second), &[], &[("../x.png", b"")], &[])).is_err());
        assert!(!dir.parent().unwrap().join("x.md").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn names_and_paths_are_checked() {
        assert!(plain_name("Trip to Bengaluru.md"));
        for bad in ["", "../x.md", "a/b.md", "a\\b.md", ".hidden.md", "con:.md", "x.md.", "tab\t.md"] {
            assert!(!plain_name(bad), "{bad}");
        }
        assert!(asset_path("media/abc_1.png"));
        assert!(asset_path("articles/0123abcd.json"));
        assert!(asset_path("books/0123abcd.pdf"));
        for bad in ["media/../x", "media/a/b.png", "other/a.png", "media/", "media/a b.png", "/media/a.png"] {
            assert!(!asset_path(bad), "{bad}");
        }
    }
}
