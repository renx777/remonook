//! Local AI apps (MCP) for the desktop app.
//!
//! When turned on in Settings → Desktop, the app listens on 127.0.0.1 for MCP requests
//! (Streamable HTTP, JSON responses) carrying its access token. Each request is handed to the
//! app window, which runs the same tools as the cloud MCP on the open workspace and saves through
//! the normal editor path. `connection.json` in the app data folder holds the port and token so
//! that `RemoNook --mcp` (a stdio bridge for apps that start their MCP servers as commands) can
//! reach the running app, starting it in the tray if needed.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};

const PREFERRED_PORT: u16 = 47913;
const MAX_BODY: usize = 1024 * 1024;
const REPLY_TIMEOUT: Duration = Duration::from_secs(60);
pub const CONNECTION_FILE: &str = "connection.json";

#[derive(Default)]
pub struct Server {
    running: Mutex<Option<Running>>,
    pending: Arc<Mutex<HashMap<u64, Sender<String>>>>,
    next: AtomicU64,
    /// The app window is listening (set by `local_mcp_ready`; cleared while it reloads).
    ready: std::sync::atomic::AtomicBool,
}
struct Running {
    port: u16,
    stop: Arc<std::sync::atomic::AtomicBool>,
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
/// The program AI apps should start. A Linux AppImage runs from a temporary mount, so its own
/// file (APPIMAGE) is the stable path; elsewhere it is the running program.
fn app_path() -> Option<PathBuf> {
    std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|p| p.is_file()).or_else(|| std::env::current_exe().ok())
}
fn connection_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    Some(app.path().app_data_dir().ok()?.join(CONNECTION_FILE))
}

/// Request line, headers and body of one HTTP request (bounded).
pub(crate) struct Request {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}
pub(crate) fn read_request(stream: &mut TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let (method, path) = (parts.next()?.to_string(), parts.next()?.to_string());
    let mut headers = HashMap::new();
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h).ok()? == 0 || headers.len() > 64 {
            return None;
        }
        let h = h.trim_end();
        if h.is_empty() {
            break;
        }
        let (k, v) = h.split_once(':')?;
        headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
    }
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return None;
    }
    let mut body = vec![0; len];
    reader.read_exact(&mut body).ok()?;
    Some(Request { method, path, headers, body })
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

/// Only local apps with the token: browsers always send Origin on a cross-site POST, so any
/// request with an Origin header is refused, and the Host must be the loopback address.
pub(crate) fn authorized(req: &Request, port: u16, token: &str) -> Result<(), &'static str> {
    if req.headers.contains_key("origin") {
        return Err("403 Forbidden");
    }
    let host = req.headers.get("host").map(String::as_str).unwrap_or("");
    if host != format!("127.0.0.1:{port}") && host != format!("localhost:{port}") {
        return Err("403 Forbidden");
    }
    if req.headers.get("authorization").map(String::as_str) != Some(&format!("Bearer {token}")) {
        return Err("401 Unauthorized");
    }
    Ok(())
}

fn handle(app: &tauri::AppHandle, mut stream: TcpStream, port: u16, token: &str) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
    let Some(req) = read_request(&mut stream) else { return respond(&mut stream, "400 Bad Request", r#"{"error":"Bad request"}"#) };
    if let Err(status) = authorized(&req, port, token) {
        return respond(&mut stream, status, r#"{"error":"Use the address and token from RemoNook Settings, Desktop."}"#);
    }
    if req.path != "/mcp" {
        return respond(&mut stream, "404 Not Found", r#"{"error":"Not found"}"#);
    }
    if req.method != "POST" {
        let _ = write!(stream, "HTTP/1.1 405 Method Not Allowed\r\nAllow: POST\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return;
    }
    let server = app.state::<Server>();
    // Just after start the window may still be loading the workspace: wait for it.
    for _ in 0..60 {
        if server.ready.load(Ordering::Relaxed) {
            break;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    if !server.ready.load(Ordering::Relaxed) {
        return respond(&mut stream, "503 Service Unavailable", r#"{"error":"RemoNook is still opening. Try again."}"#);
    }
    let id = server.next.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = channel();
    server.pending.lock().unwrap().insert(id, tx);
    let body = String::from_utf8_lossy(&req.body).into_owned();
    if app.emit_to("main", "local-mcp", serde_json::json!({ "id": id, "body": body })).is_err() {
        server.pending.lock().unwrap().remove(&id);
        return respond(&mut stream, "503 Service Unavailable", r#"{"error":"RemoNook is starting. Try again."}"#);
    }
    match rx.recv_timeout(REPLY_TIMEOUT) {
        Ok(reply) if reply.is_empty() => {
            let _ = write!(stream, "HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        }
        Ok(reply) => respond(&mut stream, "200 OK", &reply),
        Err(_) => {
            server.pending.lock().unwrap().remove(&id);
            respond(&mut stream, "504 Gateway Timeout", r#"{"error":"RemoNook did not answer in time. Is the app still starting?"}"#)
        }
    }
}

fn start(app: &tauri::AppHandle, token: String) -> Result<u16, String> {
    let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, PREFERRED_PORT)))
        .or_else(|_| TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))))
        .map_err(|e| format!("Could not start local AI apps: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let (handle_app, stopped) = (app.clone(), stop.clone());
    std::thread::spawn(move || {
        while !stopped.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let (app, token) = (handle_app.clone(), token.clone());
                    let _ = stream.set_nonblocking(false);
                    std::thread::spawn(move || handle(&app, stream, port, &token));
                }
                Err(_) => std::thread::sleep(Duration::from_millis(50)),
            }
        }
    });
    *app.state::<Server>().running.lock().unwrap() = Some(Running { port, stop });
    Ok(port)
}
fn stop(app: &tauri::AppHandle) {
    if let Some(r) = app.state::<Server>().running.lock().unwrap().take() {
        r.stop.store(true, Ordering::Relaxed);
    }
    if let Some(f) = connection_file(app) {
        let _ = std::fs::remove_file(f);
    }
}

#[derive(serde::Serialize)]
pub struct Status {
    on: bool,
    url: Option<String>,
    token: Option<String>,
    command: String,
}
fn status(app: &tauri::AppHandle) -> Status {
    let s = app.state::<crate::desktop::State>().0.lock().unwrap().clone();
    let port = app.state::<Server>().running.lock().unwrap().as_ref().map(|r| r.port);
    let exe = app_path().map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|| "RemoNook".into());
    Status { on: port.is_some(), url: port.map(|p| format!("http://127.0.0.1:{p}/mcp")), token: port.map(|_| s.local_mcp_token.clone()), command: exe }
}

/// Starts the server at launch when it was left on.
pub fn setup(app: &tauri::AppHandle) {
    let s = app.state::<crate::desktop::State>().0.lock().unwrap().clone();
    if s.local_mcp && !s.local_mcp_token.is_empty() {
        if let Ok(port) = start(app, s.local_mcp_token.clone()) {
            if let Some(f) = connection_file(app) {
                let _ = std::fs::write(f, serde_json::json!({ "port": port, "token": s.local_mcp_token }).to_string());
            }
        }
    }
}

#[tauri::command]
pub fn local_mcp_status(app: tauri::AppHandle) -> Status {
    status(&app)
}

/// Turns local AI apps on or off. `new_token` replaces the token, disconnecting every app.
#[tauri::command]
pub fn local_mcp_set(app: tauri::AppHandle, on: bool, new_token: bool) -> Result<Status, String> {
    stop(&app);
    let token = {
        let state = app.state::<crate::desktop::State>();
        let mut s = state.0.lock().unwrap();
        s.local_mcp = on;
        if new_token || s.local_mcp_token.is_empty() {
            s.local_mcp_token = random_token()?;
        }
        crate::desktop::store(&app, &s);
        s.local_mcp_token.clone()
    };
    if on {
        let port = start(&app, token.clone())?;
        if let Some(f) = connection_file(&app) {
            std::fs::write(f, serde_json::json!({ "port": port, "token": token }).to_string()).map_err(|e| e.to_string())?;
        }
    }
    Ok(status(&app))
}

/// The app window starts (or stops, while it reloads) answering requests.
#[tauri::command]
pub fn local_mcp_ready(app: tauri::AppHandle, ready: bool) {
    app.state::<Server>().ready.store(ready, Ordering::Relaxed);
}

/// The app window's answer to one request (an empty string for a notification).
#[tauri::command]
pub fn local_mcp_reply(app: tauri::AppHandle, id: u64, body: String) {
    if let Some(tx) = app.state::<Server>().pending.lock().unwrap().remove(&id) {
        let _ = tx.send(body);
    }
}

// ---------- `RemoNook --mcp`: stdio bridge ----------

fn post(port: u16, token: &str, body: &str) -> std::io::Result<(u16, String)> {
    let mut stream = TcpStream::connect_timeout(&SocketAddr::from((Ipv4Addr::LOCALHOST, port)), Duration::from_secs(2))?;
    stream.set_read_timeout(Some(REPLY_TIMEOUT + Duration::from_secs(5)))?;
    write!(
        stream,
        "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nAccept: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    let mut raw = String::new();
    stream.read_to_string(&mut raw)?;
    let status = raw.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let body = raw.split_once("\r\n\r\n").map(|(_, b)| b.to_string()).unwrap_or_default();
    Ok((status, body))
}

fn read_connection(file: &PathBuf) -> Option<(u16, String)> {
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()?;
    Some((v.get("port")?.as_u64()? as u16, v.get("token")?.as_str()?.to_string()))
}

fn rpc_error(id: &serde_json::Value, message: &str) -> String {
    serde_json::json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": message } }).to_string()
}

/// Reads JSON-RPC messages from stdin (one per line) and answers each on stdout.
pub fn bridge(identifier: &str) {
    // The app data folder, as Tauri chooses it on each system.
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).filter(|p| p.is_absolute()).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
    };
    let Some(file) = base.map(|b| b.join(identifier).join(CONNECTION_FILE)) else { return };
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    let mut launched = false;
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let id = serde_json::from_str::<serde_json::Value>(&line).ok().and_then(|v| v.get("id").cloned()).unwrap_or(serde_json::Value::Null);
        let mut answer = None;
        for attempt in 0..60 {
            if let Some((port, token)) = read_connection(&file) {
                if let Ok((status, body)) = post(port, &token, &line) {
                    if status == 503 {
                        std::thread::sleep(Duration::from_millis(500));
                        continue;
                    }
                    answer = Some(match status {
                        200 => body,
                        202 => String::new(),
                        401 | 403 => rpc_error(&id, "RemoNook refused this connection. Turn local AI apps on again in RemoNook Settings, Desktop."),
                        _ => rpc_error(&id, "RemoNook could not answer. Try again."),
                    });
                    break;
                }
            }
            // Start RemoNook in the tray, then wait for it (up to about 30 seconds).
            if attempt == 0 && !launched {
                launched = true;
                if let Some(exe) = app_path() {
                    use std::process::Stdio;
                    let _ = std::process::Command::new(exe).arg(crate::desktop::BACKGROUND_ARG).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        let answer = answer.unwrap_or_else(|| rpc_error(&id, "RemoNook is not reachable. Open RemoNook and turn on local AI apps in Settings, Desktop."));
        if !answer.is_empty() && !id.is_null() {
            let _ = writeln!(out, "{}", answer.replace('\n', " "));
            let _ = out.flush();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(headers: &[(&str, &str)]) -> Request {
        Request { method: "POST".into(), path: "/mcp".into(), headers: headers.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(), body: vec![] }
    }

    #[test]
    fn only_local_apps_with_the_token_are_accepted() {
        let ok = [("host", "127.0.0.1:5000"), ("authorization", "Bearer abc")];
        assert!(authorized(&request(&ok), 5000, "abc").is_ok());
        assert!(authorized(&request(&[("host", "localhost:5000"), ("authorization", "Bearer abc")]), 5000, "abc").is_ok());
        assert_eq!(authorized(&request(&[("host", "127.0.0.1:5000"), ("authorization", "Bearer abd")]), 5000, "abc"), Err("401 Unauthorized"));
        assert_eq!(authorized(&request(&[("host", "127.0.0.1:5000")]), 5000, "abc"), Err("401 Unauthorized"));
        assert_eq!(authorized(&request(&[("host", "evil.example:5000"), ("authorization", "Bearer abc")]), 5000, "abc"), Err("403 Forbidden"));
        assert_eq!(authorized(&request(&[("origin", "https://evil.example"), ("host", "127.0.0.1:5000"), ("authorization", "Bearer abc")]), 5000, "abc"), Err("403 Forbidden"));
    }

    #[test]
    fn requests_are_parsed_and_bounded() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
            write!(s, "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 7\r\n\r\n{{\"a\":1}}").unwrap();
            let mut s2 = TcpStream::connect(("127.0.0.1", port)).unwrap();
            write!(s2, "POST /mcp HTTP/1.1\r\nContent-Length: 99999999\r\n\r\n").unwrap();
        });
        let (mut a, _) = listener.accept().unwrap();
        let r = read_request(&mut a).unwrap();
        assert_eq!((r.method.as_str(), r.path.as_str(), r.body.as_slice()), ("POST", "/mcp", br#"{"a":1}"#.as_slice()));
        let (mut b, _) = listener.accept().unwrap();
        assert!(read_request(&mut b).is_none());
    }
}
