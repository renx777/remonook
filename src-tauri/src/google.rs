//! Google sign-in for the desktop app.
//!
//! Google refuses sign-in inside embedded app windows, so the app opens RemoNook's own sign-in
//! page (`<web>/?port=…&state=…#desktop-signin`) in the system browser. That page signs in with
//! Google as the website does and sends the resulting Google ID token to
//! `http://127.0.0.1:<port>/callback?state=…&id_token=…`. This listener accepts it only on the
//! loopback address, only with the random `state` it generated, and only once; it then hands the
//! token to the app, which signs in to Firebase with it.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};
use tauri_plugin_opener::OpenerExt;

const ALLOWED_WEB: [&str; 2] = ["https://remonook.com", "https://staging.remonook.com"];
const TIMEOUT: Duration = Duration::from_secs(300);

fn random_state() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|e| format!("Could not start sign-in: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Parses the request line of one HTTP request and returns the id token when `state` matches.
pub(crate) fn token_from_request(request_line: &str, state: &str) -> Option<String> {
    let path = request_line.strip_prefix("GET ")?.split(' ').next()?;
    let url = url::Url::parse(&format!("http://127.0.0.1{path}")).ok()?;
    if url.path() != "/callback" {
        return None;
    }
    let mut got_state = None;
    let mut token = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "state" => got_state = Some(value.into_owned()),
            "id_token" => token = Some(value.into_owned()),
            _ => {}
        }
    }
    // Constant-time comparison is not needed for a one-shot random value on loopback, but the
    // value must match exactly and the token must look like a JWT.
    if got_state.as_deref() != Some(state) {
        return None;
    }
    token.filter(|t| t.len() < 8192 && t.split('.').count() == 3)
}

fn respond(mut stream: TcpStream, ok: bool) {
    let body = if ok {
        "<!doctype html><meta charset=utf-8><title>Signed in</title><body style=\"font-family:system-ui;padding:48px;text-align:center\"><h1>You're signed in</h1><p>Return to the RemoNook app. You can close this tab.</p>"
    } else {
        "<!doctype html><meta charset=utf-8><title>Not signed in</title><body style=\"font-family:system-ui;padding:48px;text-align:center\"><h1>Sign-in link not recognised</h1><p>Start again from the RemoNook app.</p>"
    };
    let _ = write!(
        stream,
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{}",
        if ok { "200 OK" } else { "400 Bad Request" },
        body.len(),
        body
    );
}

/// Waits on the loopback listener for the browser to return the token (or gives up).
pub(crate) fn wait_for_token(listener: TcpListener, state: &str, timeout: Duration) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut line = String::new();
                if BufReader::new(&stream).read_line(&mut line).is_err() {
                    continue;
                }
                match token_from_request(&line, state) {
                    Some(token) => {
                        respond(stream, true);
                        return Ok(token);
                    }
                    // Browsers also ask for /favicon.ico and similar: answer and keep waiting.
                    None => respond(stream, false),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("Google sign-in timed out. Try again.".into())
}

/// A sign-in in progress: the loopback listener and its random state.
#[derive(Default)]
pub struct Pending(std::sync::Mutex<Option<(TcpListener, String)>>);

#[derive(serde::Serialize)]
pub struct Started {
    /// The address to open; shown to the person when the browser could not be opened.
    url: String,
    opened: bool,
}

/// Starts a sign-in: listens on loopback and opens the sign-in page in the system browser.
#[tauri::command]
pub fn google_sign_in_start(app: tauri::AppHandle, pending: tauri::State<'_, Pending>, web: String) -> Result<Started, String> {
    if !ALLOWED_WEB.contains(&web.as_str()) {
        return Err("Unknown RemoNook site.".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Could not start sign-in: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let state = random_state()?;
    let url = format!("{web}/?port={port}&state={state}#desktop-signin");
    *pending.0.lock().map_err(|_| "Sign-in is busy.".to_string())? = Some((listener, state));
    let opened = app.opener().open_url(url.clone(), None::<&str>).is_ok();
    Ok(Started { url, opened })
}

/// Waits for the browser to return the Google ID token (up to five minutes).
#[tauri::command]
pub async fn google_sign_in_wait(pending: tauri::State<'_, Pending>) -> Result<String, String> {
    let (listener, state) = pending.0.lock().map_err(|_| "Sign-in is busy.".to_string())?.take().ok_or("Start sign-in again.")?;
    tauri::async_runtime::spawn_blocking(move || wait_for_token(listener, &state, TIMEOUT))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    const JWT: &str = "aaa.bbb.ccc";

    #[test]
    fn accepts_only_the_matching_state_on_the_callback_path() {
        assert_eq!(token_from_request(&format!("GET /callback?state=s1&id_token={JWT} HTTP/1.1\r\n"), "s1"), Some(JWT.into()));
        assert_eq!(token_from_request(&format!("GET /callback?state=s2&id_token={JWT} HTTP/1.1\r\n"), "s1"), None);
        assert_eq!(token_from_request(&format!("GET /other?state=s1&id_token={JWT} HTTP/1.1\r\n"), "s1"), None);
        assert_eq!(token_from_request("GET /callback?state=s1&id_token=not-a-jwt HTTP/1.1\r\n", "s1"), None);
        assert_eq!(token_from_request(&format!("POST /callback?state=s1&id_token={JWT} HTTP/1.1\r\n"), "s1"), None);
    }

    #[test]
    fn listener_ignores_stray_requests_and_returns_the_token() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let client = std::thread::spawn(move || {
            for path in ["/favicon.ico", "/callback?state=wrong&id_token=a.b.c", "/callback?state=right&id_token=a.b.c"] {
                let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
                write!(s, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
                let mut reply = String::new();
                let _ = s.read_to_string(&mut reply);
            }
        });
        assert_eq!(wait_for_token(listener, "right", Duration::from_secs(10)), Ok("a.b.c".into()));
        client.join().unwrap();
    }

    #[test]
    fn listener_times_out() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        assert!(wait_for_token(listener, "x", Duration::from_millis(300)).is_err());
    }
}
