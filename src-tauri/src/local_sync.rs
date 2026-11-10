//! Local sync: RemoNook apps on the same network sync device-only workspaces directly, without
//! RemoNook cloud or any other service.
//!
//! This module is only the transport. The app window (src/local-sync.ts) decides what to send:
//! it exchanges CRDT state vectors and updates, so edits from every device merge automatically.
//!
//! - **Identity:** each app has a random device id and an X25519 key pair (`local-sync.json` in
//!   the app data folder). Paired devices are remembered by id, name and public key.
//! - **Pairing:** device A asks device B to pair. B shows a 6-digit code, which the person types
//!   on A. The two run SPAKE2 with that code, so a wrong code fails and nobody watching the
//!   network can guess it offline. Each side then proves its public key with the shared key.
//! - **Sessions:** Noise XX (25519, ChaChaPoly, BLAKE2s). After the handshake the other side's
//!   static key must belong to a paired device, otherwise the connection is closed. Everything
//!   after that is encrypted and authenticated.
//! - **Discovery:** mDNS (`_remonook._tcp`), with the app's identifier in the record so staging
//!   and production apps never meet. A device can also be reached by address.
//! - **Wire:** frames are a 2-byte length and one Noise message. A message is split into
//!   chunks of at most 60,000 bytes; the first byte of each chunk says whether more follow.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const NOISE: &str = "Noise_XX_25519_ChaChaPoly_BLAKE2s";
const SERVICE: &str = "_remonook._tcp.local.";
const PREFERRED_PORT: u16 = 47914;
const CHUNK: usize = 60_000;
const MAX_MESSAGE: usize = 64 * 1024 * 1024;
const PAIR_TIMEOUT: Duration = Duration::from_secs(180);
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub public_key: String,
    /// Where it was reached when pairing, used when discovery finds nothing (some networks
    /// block it).
    #[serde(default)]
    pub address: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    device_id: String,
    name: String,
    private_key: String,
    public_key: String,
    #[serde(default)]
    peers: Vec<Peer>,
}

#[derive(Clone, Serialize)]
pub struct Nearby {
    id: String,
    name: String,
    address: String,
}

struct Conn {
    writer: Mutex<TcpStream>,
    noise: Mutex<snow::TransportState>,
    closed: AtomicBool,
}

struct Running {
    port: u16,
    stop: Arc<AtomicBool>,
    mdns: Option<mdns_sd::ServiceDaemon>,
}

struct Pending {
    stream: TcpStream,
    peer: Peer,
    started: Instant,
}

#[derive(Default)]
pub struct LocalSync {
    stored: Mutex<Option<Stored>>,
    conns: Mutex<HashMap<String, Arc<Conn>>>,
    nearby: Mutex<HashMap<String, (Nearby, Vec<SocketAddr>)>>,
    running: Mutex<Option<Running>>,
    pairing: Mutex<HashMap<u64, Pending>>,
    next: AtomicU64,
}

fn random_hex(bytes: usize) -> Result<String, String> {
    let mut b = vec![0u8; bytes];
    getrandom::fill(&mut b).map_err(|e| e.to_string())?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// ---------- framing ----------

pub(crate) fn write_frame(s: &mut impl Write, data: &[u8]) -> std::io::Result<()> {
    if data.len() > u16::MAX as usize {
        return Err(std::io::Error::other("frame too large"));
    }
    s.write_all(&(data.len() as u16).to_be_bytes())?;
    s.write_all(data)
}
pub(crate) fn read_frame(s: &mut impl Read) -> std::io::Result<Vec<u8>> {
    let mut len = [0u8; 2];
    s.read_exact(&mut len)?;
    let mut buf = vec![0u8; u16::from_be_bytes(len) as usize];
    s.read_exact(&mut buf)?;
    Ok(buf)
}

/// Encrypts and writes one message as chunks.
pub(crate) fn send_message(stream: &mut impl Write, noise: &Mutex<snow::TransportState>, data: &[u8]) -> Result<(), String> {
    let mut out = vec![0u8; u16::MAX as usize];
    let chunks: Vec<&[u8]> = if data.is_empty() { vec![&[][..]] } else { data.chunks(CHUNK).collect() };
    for (i, chunk) in chunks.iter().enumerate() {
        let mut plain = Vec::with_capacity(chunk.len() + 1);
        plain.push(if i + 1 == chunks.len() { 1 } else { 0 });
        plain.extend_from_slice(chunk);
        let n = noise.lock().unwrap().write_message(&plain, &mut out).map_err(err)?;
        write_frame(stream, &out[..n]).map_err(err)?;
    }
    stream.flush().map_err(err)
}
/// Reads one whole message (None for a keep-alive).
pub(crate) fn receive_message(stream: &mut impl Read, noise: &Mutex<snow::TransportState>) -> Result<Option<Vec<u8>>, String> {
    let mut message = Vec::new();
    let mut plain = vec![0u8; u16::MAX as usize];
    loop {
        let frame = read_frame(stream).map_err(err)?;
        let n = noise.lock().unwrap().read_message(&frame, &mut plain).map_err(err)?;
        if n == 0 {
            return Err("empty frame".into());
        }
        match plain[0] {
            2 => return Ok(None),
            0 | 1 => {
                message.extend_from_slice(&plain[1..n]);
                if message.len() > MAX_MESSAGE {
                    return Err("message too large".into());
                }
                if plain[0] == 1 {
                    return Ok(Some(message));
                }
            }
            _ => return Err("bad frame".into()),
        }
    }
}

// ---------- handshake ----------

#[derive(Serialize, Deserialize)]
pub(crate) struct Hello {
    id: String,
    channel: String,
}

/// Noise XX as initiator (`initiator`) or responder. Returns the transport, the other side's
/// device id and its static public key.
pub(crate) fn handshake(stream: &mut TcpStream, private_key: &[u8], me: &Hello, initiator: bool) -> Result<(snow::TransportState, String, Vec<u8>), String> {
    let builder = snow::Builder::new(NOISE.parse().map_err(err)?).local_private_key(private_key);
    let mut hs = if initiator { builder.build_initiator() } else { builder.build_responder() }.map_err(err)?;
    let mut buf = vec![0u8; u16::MAX as usize];
    let payload = serde_json::to_vec(me).map_err(err)?;
    let mut theirs = None;
    // XX: -> e ; <- e, ee, s, es (+ responder hello) ; -> s, se (+ initiator hello)
    if initiator {
        let n = hs.write_message(&[], &mut buf).map_err(err)?;
        write_frame(stream, &buf[..n]).map_err(err)?;
        let n = hs.read_message(&read_frame(stream).map_err(err)?, &mut buf).map_err(err)?;
        theirs = Some(buf[..n].to_vec());
        let n = hs.write_message(&payload, &mut buf).map_err(err)?;
        write_frame(stream, &buf[..n]).map_err(err)?;
    } else {
        hs.read_message(&read_frame(stream).map_err(err)?, &mut buf).map_err(err)?;
        let n = hs.write_message(&payload, &mut buf).map_err(err)?;
        write_frame(stream, &buf[..n]).map_err(err)?;
        let n = hs.read_message(&read_frame(stream).map_err(err)?, &mut buf).map_err(err)?;
        theirs = theirs.or(Some(buf[..n].to_vec()));
    }
    let hello: Hello = serde_json::from_slice(&theirs.unwrap_or_default()).map_err(|_| "bad hello".to_string())?;
    if hello.channel != me.channel {
        return Err("This device runs a different RemoNook (staging and production do not sync).".into());
    }
    let key = hs.get_remote_static().ok_or("no key")?.to_vec();
    Ok((hs.into_transport_mode().map_err(err)?, hello.id, key))
}

// ---------- pairing ----------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PairHello {
    id: String,
    name: String,
    public_key: String,
    channel: String,
    /// The port this device listens on for sync.
    #[serde(default)]
    port: u16,
}

fn seal(key: &[u8], direction: u8, data: &[u8]) -> Result<Vec<u8>, String> {
    use chacha20poly1305::aead::{Aead, KeyInit};
    let cipher = chacha20poly1305::ChaCha20Poly1305::new_from_slice(&key[..32]).map_err(err)?;
    let mut nonce = [0u8; 12];
    nonce[0] = direction;
    cipher.encrypt(&nonce.into(), data).map_err(err)
}
fn open(key: &[u8], direction: u8, data: &[u8]) -> Result<Vec<u8>, String> {
    use chacha20poly1305::aead::{Aead, KeyInit};
    let cipher = chacha20poly1305::ChaCha20Poly1305::new_from_slice(&key[..32]).map_err(err)?;
    let mut nonce = [0u8; 12];
    nonce[0] = direction;
    cipher.decrypt(&nonce.into(), data).map_err(|_| "The code did not match. Try again.".to_string())
}
fn spake(code: &str, a: &str, b: &str, initiator: bool) -> (spake2::Spake2<spake2::Ed25519Group>, Vec<u8>) {
    use spake2::{Ed25519Group, Identity, Password, Spake2};
    let (pw, ia, ib) = (Password::new(code.as_bytes()), Identity::new(a.as_bytes()), Identity::new(b.as_bytes()));
    if initiator { Spake2::<Ed25519Group>::start_a(&pw, &ia, &ib) } else { Spake2::<Ed25519Group>::start_b(&pw, &ia, &ib) }
}

/// The side that typed the code: SPAKE2 A, then proves its key and checks the other's.
pub(crate) fn pair_initiator(stream: &mut TcpStream, me: &PairHello, them: &PairHello, code: &str) -> Result<(), String> {
    let (state, msg) = spake(code, &me.id, &them.id, true);
    write_frame(stream, &msg).map_err(err)?;
    let key = state.finish(&read_frame(stream).map_err(err)?).map_err(|_| "The code did not match. Try again.".to_string())?;
    write_frame(stream, &seal(&key, 1, me.public_key.as_bytes())?).map_err(err)?;
    // The other side closes the connection when the code was wrong.
    let reply = read_frame(stream).map_err(|_| "The code did not match. Try again.".to_string())?;
    let proof = open(&key, 2, &reply)?;
    if proof != them.public_key.as_bytes() {
        return Err("The other device could not be verified.".into());
    }
    Ok(())
}
/// The side that showed the code: SPAKE2 B.
pub(crate) fn pair_responder(stream: &mut TcpStream, me: &PairHello, them: &PairHello, code: &str) -> Result<(), String> {
    let (state, msg) = spake(code, &them.id, &me.id, false);
    write_frame(stream, &msg).map_err(err)?;
    let key = state.finish(&read_frame(stream).map_err(err)?).map_err(|_| "The code did not match.".to_string())?;
    let proof = open(&key, 1, &read_frame(stream).map_err(err)?)?;
    if proof != them.public_key.as_bytes() {
        return Err("The other device could not be verified.".into());
    }
    write_frame(stream, &seal(&key, 2, me.public_key.as_bytes())?).map_err(err)?;
    Ok(())
}

// ---------- the service ----------

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(err)?;
    std::fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir.join("local-sync.json"))
}
fn save(app: &tauri::AppHandle, s: &Stored) -> Result<(), String> {
    let path = store_path(app)?;
    std::fs::write(&path, serde_json::to_vec_pretty(s).map_err(err)?).map_err(err)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}
fn identity(app: &tauri::AppHandle) -> Result<Stored, String> {
    let state = app.state::<LocalSync>();
    let mut slot = state.stored.lock().unwrap();
    if let Some(s) = slot.as_ref() {
        return Ok(s.clone());
    }
    let path = store_path(app)?;
    let s = match std::fs::read(&path).ok().and_then(|b| serde_json::from_slice::<Stored>(&b).ok()) {
        Some(s) => s,
        None => {
            let keys = snow::Builder::new(NOISE.parse().map_err(err)?).generate_keypair().map_err(err)?;
            let name = gethostname::gethostname().to_string_lossy().trim().chars().take(60).collect::<String>();
            let s = Stored { device_id: random_hex(16)?, name: if name.is_empty() { "This computer".into() } else { name }, private_key: B64.encode(keys.private), public_key: B64.encode(keys.public), peers: vec![] };
            save(app, &s)?;
            s
        }
    };
    *slot = Some(s.clone());
    Ok(s)
}
fn update_stored(app: &tauri::AppHandle, f: impl FnOnce(&mut Stored)) -> Result<Stored, String> {
    let mut s = identity(app)?;
    f(&mut s);
    save(app, &s)?;
    *app.state::<LocalSync>().stored.lock().unwrap() = Some(s.clone());
    Ok(s)
}
fn channel(app: &tauri::AppHandle) -> String {
    app.config().identifier.clone()
}
fn changed(app: &tauri::AppHandle) {
    let _ = app.emit_to("main", "local-sync-status", ());
}

/// Registers a live session with a paired device and reads its messages until it closes.
fn run_session(app: &tauri::AppHandle, stream: TcpStream, noise: snow::TransportState, peer: String) {
    let Ok(reader) = stream.try_clone() else { return };
    let _ = stream.set_nodelay(true);
    let conn = Arc::new(Conn { writer: Mutex::new(stream), noise: Mutex::new(noise), closed: AtomicBool::new(false) });
    {
        let state = app.state::<LocalSync>();
        let mut conns = state.conns.lock().unwrap();
        if conns.get(&peer).is_some_and(|c| !c.closed.load(Ordering::Relaxed)) {
            return; // already connected (the other side connected at the same moment)
        }
        conns.insert(peer.clone(), conn.clone());
    }
    changed(app);
    // Keep-alive, so a vanished device is noticed.
    let ping = conn.clone();
    std::thread::spawn(move || {
        while !ping.closed.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_secs(20));
            let mut w = ping.writer.lock().unwrap();
            let mut out = vec![0u8; 64];
            let n = match ping.noise.lock().unwrap().write_message(&[2], &mut out) { Ok(n) => n, Err(_) => break };
            if write_frame(&mut *w, &out[..n]).is_err() {
                let _ = w.shutdown(std::net::Shutdown::Both);
                break;
            }
        }
    });
    let mut reader = reader;
    let _ = reader.set_read_timeout(Some(Duration::from_secs(60)));
    loop {
        match receive_message(&mut reader, &conn.noise) {
            Ok(Some(bytes)) => {
                let data = String::from_utf8_lossy(&bytes).into_owned();
                let _ = app.emit_to("main", "local-sync-message", serde_json::json!({ "peer": peer, "data": data }));
            }
            Ok(None) => {}
            Err(_) => break,
        }
    }
    conn.closed.store(true, Ordering::Relaxed);
    let _ = conn.writer.lock().unwrap().shutdown(std::net::Shutdown::Both);
    {
        let state = app.state::<LocalSync>();
        let mut conns = state.conns.lock().unwrap();
        if conns.get(&peer).is_some_and(|c| Arc::ptr_eq(c, &conn)) {
            conns.remove(&peer);
        }
    }
    changed(app);
}

fn hello(app: &tauri::AppHandle) -> Result<(Stored, Hello), String> {
    let s = identity(app)?;
    let h = Hello { id: s.device_id.clone(), channel: channel(app) };
    Ok((s, h))
}

/// Opens a session to a paired device.
fn connect(app: &tauri::AppHandle, addrs: &[SocketAddr], expect: &Peer) -> Result<(), String> {
    let mut last = String::from("not reachable");
    for addr in addrs {
        match TcpStream::connect_timeout(addr, Duration::from_secs(4)) {
            Ok(mut stream) => {
                let (s, me) = hello(app)?;
                let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
                stream.write_all(b"S").map_err(err)?;
                let (noise, id, key) = handshake(&mut stream, &B64.decode(&s.private_key).map_err(err)?, &me, true)?;
                if id != expect.id || B64.encode(&key) != expect.public_key {
                    return Err("unexpected device".into());
                }
                let app = app.clone();
                std::thread::spawn(move || run_session(&app, stream, noise, id));
                return Ok(());
            }
            Err(e) => last = e.to_string(),
        }
    }
    Err(last)
}

fn accept(app: &tauri::AppHandle, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
    let mut mode = [0u8; 1];
    if stream.read_exact(&mut mode).is_err() {
        return;
    }
    match mode[0] {
        b'S' => {
            let Ok((s, me)) = hello(app) else { return };
            let Ok(key) = B64.decode(&s.private_key) else { return };
            let Ok((noise, id, remote)) = handshake(&mut stream, &key, &me, false) else { return };
            let remote = B64.encode(remote);
            // Only paired devices, and only with the key they paired with.
            if !s.peers.iter().any(|p| p.id == id && p.public_key == remote) {
                return;
            }
            run_session(app, stream, noise, id);
        }
        b'P' => accept_pairing(app, stream),
        _ => {}
    }
}

fn pair_hello(app: &tauri::AppHandle) -> Result<PairHello, String> {
    let s = identity(app)?;
    let port = app.state::<LocalSync>().running.lock().unwrap().as_ref().map(|r| r.port).unwrap_or(0);
    Ok(PairHello { id: s.device_id, name: s.name, public_key: s.public_key, channel: channel(app), port })
}

/// Shown on this device: someone asked to pair. Shows a code and waits for it to be typed there.
fn accept_pairing(app: &tauri::AppHandle, mut stream: TcpStream) {
    let result = (|| -> Result<Peer, String> {
        let them: PairHello = serde_json::from_slice(&read_frame(&mut stream).map_err(err)?).map_err(err)?;
        let me = pair_hello(app)?;
        if them.channel != me.channel || them.id == me.id || them.id.len() > 64 || them.name.len() > 200 {
            return Err("This device cannot pair with that one.".into());
        }
        write_frame(&mut stream, &serde_json::to_vec(&me).map_err(err)?).map_err(err)?;
        let mut n = [0u8; 4];
        getrandom::fill(&mut n).map_err(err)?;
        let code = format!("{:06}", u32::from_le_bytes(n) % 1_000_000);
        let _ = app.emit_to("main", "local-sync-pair-request", serde_json::json!({ "name": them.name, "code": code }));
        desktop_show(app);
        let _ = stream.set_read_timeout(Some(PAIR_TIMEOUT));
        pair_responder(&mut stream, &me, &them, &code)?;
        let address = stream.peer_addr().ok().filter(|_| them.port != 0).map(|a| SocketAddr::new(a.ip(), them.port).to_string());
        Ok(Peer { id: them.id, name: them.name, public_key: them.public_key, address })
    })();
    finish_pairing(app, result);
}

fn finish_pairing(app: &tauri::AppHandle, result: Result<Peer, String>) {
    match result {
        Ok(peer) => {
            let saved = update_stored(app, |s| {
                s.peers.retain(|p| p.id != peer.id);
                s.peers.push(peer.clone());
            });
            match saved {
                Ok(_) => {
                    let _ = app.emit_to("main", "local-sync-paired", serde_json::json!({ "id": peer.id, "name": peer.name }));
                }
                Err(e) => {
                    let _ = app.emit_to("main", "local-sync-pair-failed", serde_json::json!({ "message": e }));
                }
            }
        }
        Err(e) => {
            let _ = app.emit_to("main", "local-sync-pair-failed", serde_json::json!({ "message": e }));
        }
    }
    changed(app);
}

fn desktop_show(app: &tauri::AppHandle) {
    crate::desktop::show_main(app);
}

fn start(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<LocalSync>();
    if state.running.lock().unwrap().is_some() {
        return Ok(());
    }
    let s = identity(app)?;
    let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, PREFERRED_PORT)))
        .or_else(|_| TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, 0))))
        .map_err(|e| format!("Could not start local sync: {e}"))?;
    let port = listener.local_addr().map_err(err)?.port();
    listener.set_nonblocking(true).map_err(err)?;
    let stop = Arc::new(AtomicBool::new(false));
    {
        let (app, stop) = (app.clone(), stop.clone());
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let _ = stream.set_nonblocking(false);
                        let app = app.clone();
                        std::thread::spawn(move || accept(&app, stream));
                    }
                    Err(_) => std::thread::sleep(Duration::from_millis(100)),
                }
            }
        });
    }
    // Discovery. A failure here (no multicast) still leaves connecting by address.
    let mdns = mdns_sd::ServiceDaemon::new().ok();
    if let Some(daemon) = &mdns {
        let host = format!("remonook-{}.local.", &s.device_id[..12]);
        let props = [("id", s.device_id.as_str()), ("name", s.name.as_str()), ("chan", app.config().identifier.as_str())];
        if let Ok(info) = mdns_sd::ServiceInfo::new(SERVICE, &s.device_id, &host, "", port, &props[..]) {
            let _ = daemon.register(info.enable_addr_auto());
        }
        if let Ok(events) = daemon.browse(SERVICE) {
            let (app, stop, me) = (app.clone(), stop.clone(), s.device_id.clone());
            std::thread::spawn(move || {
                while !stop.load(Ordering::Relaxed) {
                    let Ok(event) = events.recv_timeout(Duration::from_millis(500)) else { continue };
                    match event {
                        mdns_sd::ServiceEvent::ServiceResolved(info) => {
                            let (Some(id), Some(chan)) = (info.get_property_val_str("id"), info.get_property_val_str("chan")) else { continue };
                            if id == me || chan != app.config().identifier {
                                continue;
                            }
                            let name = info.get_property_val_str("name").unwrap_or("RemoNook").to_string();
                            let mut addrs: Vec<SocketAddr> = info.get_addresses().iter().map(|ip| SocketAddr::new(*ip, info.get_port())).collect();
                            addrs.sort_by_key(|a| !matches!(a.ip(), IpAddr::V4(_)));
                            let shown = addrs.first().map(|a| a.to_string()).unwrap_or_default();
                            app.state::<LocalSync>().nearby.lock().unwrap().insert(id.to_string(), (Nearby { id: id.to_string(), name, address: shown }, addrs));
                            changed(&app);
                        }
                        mdns_sd::ServiceEvent::ServiceRemoved(_, fullname) => {
                            let id = fullname.split('.').next().unwrap_or("").to_string();
                            if app.state::<LocalSync>().nearby.lock().unwrap().remove(&id).is_some() {
                                changed(&app);
                            }
                        }
                        _ => {}
                    }
                }
            });
        }
    }
    // Connect to paired devices that are nearby. Only the device with the smaller id dials, so
    // two devices never race to open two sessions.
    {
        let (app, stop) = (app.clone(), stop.clone());
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                if let Ok(s) = identity(&app) {
                    let state = app.state::<LocalSync>();
                    let nearby = state.nearby.lock().unwrap().clone();
                    for peer in &s.peers {
                        let connected = state.conns.lock().unwrap().get(&peer.id).is_some_and(|c| !c.closed.load(Ordering::Relaxed));
                        if connected || s.device_id >= peer.id {
                            continue;
                        }
                        let mut addrs = nearby.get(&peer.id).map(|(_, a)| a.clone()).unwrap_or_default();
                        if let Some(a) = peer.address.as_ref().and_then(|a| a.parse::<SocketAddr>().ok()) {
                            if !addrs.contains(&a) {
                                addrs.push(a);
                            }
                        }
                        if !addrs.is_empty() {
                            let _ = connect(&app, &addrs, peer);
                        }
                    }
                }
                std::thread::sleep(Duration::from_secs(5));
            }
        });
    }
    *state.running.lock().unwrap() = Some(Running { port, stop, mdns });
    changed(app);
    Ok(())
}

fn stop(app: &tauri::AppHandle) {
    let state = app.state::<LocalSync>();
    if let Some(r) = state.running.lock().unwrap().take() {
        r.stop.store(true, Ordering::Relaxed);
        if let Some(d) = r.mdns {
            let _ = d.shutdown();
        }
    }
    for (_, c) in state.conns.lock().unwrap().drain() {
        c.closed.store(true, Ordering::Relaxed);
        let _ = c.writer.lock().unwrap().shutdown(std::net::Shutdown::Both);
    }
    state.nearby.lock().unwrap().clear();
    changed(app);
}

pub fn setup(app: &tauri::AppHandle) {
    if app.state::<crate::desktop::State>().0.lock().unwrap().local_sync {
        let _ = start(app);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerView {
    id: String,
    name: String,
    online: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    enabled: bool,
    device_id: String,
    device_name: String,
    port: Option<u16>,
    /// This computer's address on the network, for pairing by address.
    address: Option<String>,
    peers: Vec<PeerView>,
    nearby: Vec<Nearby>,
}

fn status(app: &tauri::AppHandle) -> Result<Status, String> {
    let s = identity(app)?;
    let state = app.state::<LocalSync>();
    let port = state.running.lock().unwrap().as_ref().map(|r| r.port);
    let conns = state.conns.lock().unwrap();
    let peers = s.peers.iter().map(|p| PeerView { id: p.id.clone(), name: p.name.clone(), online: conns.get(&p.id).is_some_and(|c| !c.closed.load(Ordering::Relaxed)) }).collect();
    let nearby = state.nearby.lock().unwrap().values().filter(|(n, _)| !s.peers.iter().any(|p| p.id == n.id)).map(|(n, _)| n.clone()).collect();
    // The address the system would use to reach the network (no packet is sent).
    let address = port.and_then(|_| {
        let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
        socket.connect("192.0.2.1:9").ok()?;
        Some(socket.local_addr().ok()?.ip().to_string())
    });
    Ok(Status { enabled: port.is_some(), device_id: s.device_id, device_name: s.name, port, address, peers, nearby })
}

#[tauri::command]
pub fn local_sync_status(app: tauri::AppHandle) -> Result<Status, String> {
    status(&app)
}

#[tauri::command]
pub fn local_sync_set(app: tauri::AppHandle, on: bool) -> Result<Status, String> {
    if on { start(&app)? } else { stop(&app) }
    {
        let state = app.state::<crate::desktop::State>();
        let mut s = state.0.lock().unwrap();
        s.local_sync = on;
        crate::desktop::store(&app, &s);
    }
    status(&app)
}

#[tauri::command]
pub fn local_sync_rename(app: tauri::AppHandle, name: String) -> Result<Status, String> {
    let name = name.trim().chars().take(60).collect::<String>();
    if name.is_empty() {
        return Err("Give this computer a name.".into());
    }
    update_stored(&app, |s| s.name = name)?;
    status(&app)
}

#[derive(Serialize)]
pub struct PairStarted {
    session: u64,
    name: String,
}

/// Asks a nearby device (by id) or an address ("192.168.1.20:47914") to pair. The other device
/// then shows a code.
#[tauri::command]
pub async fn local_sync_pair_start(app: tauri::AppHandle, target: String) -> Result<PairStarted, String> {
    let addrs: Vec<SocketAddr> = match app.state::<LocalSync>().nearby.lock().unwrap().get(&target) {
        Some((_, a)) => a.clone(),
        None => {
            let t = if target.contains(':') { target.clone() } else { format!("{target}:{PREFERRED_PORT}") };
            t.to_socket_addrs().map_err(|_| "Enter an address such as 192.168.1.20".to_string())?.collect()
        }
    };
    let (mut stream, reached) = addrs.iter().find_map(|a| TcpStream::connect_timeout(a, Duration::from_secs(4)).ok().map(|s| (s, *a))).ok_or("That device did not answer. Is RemoNook open there with local sync on?")?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
    let me = pair_hello(&app)?;
    stream.write_all(b"P").map_err(err)?;
    write_frame(&mut stream, &serde_json::to_vec(&me).map_err(err)?).map_err(err)?;
    let them: PairHello = serde_json::from_slice(&read_frame(&mut stream).map_err(|_| "That device did not answer.".to_string())?).map_err(err)?;
    if them.channel != me.channel {
        return Err("That device runs a different RemoNook (staging and production do not sync).".into());
    }
    let state = app.state::<LocalSync>();
    let session = state.next.fetch_add(1, Ordering::Relaxed) + 1;
    let mut pairing = state.pairing.lock().unwrap();
    pairing.retain(|_, p| p.started.elapsed() < PAIR_TIMEOUT);
    let address = Some(SocketAddr::new(reached.ip(), if them.port != 0 { them.port } else { reached.port() }).to_string());
    pairing.insert(session, Pending { stream, peer: Peer { id: them.id, name: them.name.clone(), public_key: them.public_key, address }, started: Instant::now() });
    Ok(PairStarted { session, name: them.name })
}

/// Finishes pairing with the code the other device shows.
#[tauri::command]
pub async fn local_sync_pair_finish(app: tauri::AppHandle, session: u64, code: String) -> Result<PeerView, String> {
    let code: String = code.chars().filter(|c| c.is_ascii_digit()).collect();
    if code.len() != 6 {
        return Err("Enter the 6-digit code shown on the other device.".into());
    }
    let Pending { mut stream, peer, .. } = app.state::<LocalSync>().pairing.lock().unwrap().remove(&session).ok_or("Pairing timed out. Start again.")?;
    let me = pair_hello(&app)?;
    let them = PairHello { id: peer.id.clone(), name: peer.name.clone(), public_key: peer.public_key.clone(), channel: me.channel.clone(), port: 0 };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(20)));
    let result = pair_initiator(&mut stream, &me, &them, &code).map(|_| peer.clone());
    let failed = result.as_ref().err().cloned();
    finish_pairing(&app, result);
    if let Some(e) = failed {
        return Err(e);
    }
    Ok(PeerView { id: peer.id, name: peer.name, online: false })
}

#[tauri::command]
pub fn local_sync_pair_cancel(app: tauri::AppHandle, session: u64) {
    if let Some(p) = app.state::<LocalSync>().pairing.lock().unwrap().remove(&session) {
        let _ = p.stream.shutdown(std::net::Shutdown::Both);
    }
}

#[tauri::command]
pub fn local_sync_unpair(app: tauri::AppHandle, id: String) -> Result<Status, String> {
    update_stored(&app, |s| s.peers.retain(|p| p.id != id))?;
    if let Some(c) = app.state::<LocalSync>().conns.lock().unwrap().remove(&id) {
        c.closed.store(true, Ordering::Relaxed);
        let _ = c.writer.lock().unwrap().shutdown(std::net::Shutdown::Both);
    }
    status(&app)
}

/// Sends one message to a connected paired device.
#[tauri::command]
pub async fn local_sync_send(app: tauri::AppHandle, peer: String, data: String) -> Result<(), String> {
    let conn = app.state::<LocalSync>().conns.lock().unwrap().get(&peer).cloned().ok_or("not connected")?;
    let mut w = conn.writer.lock().unwrap();
    send_message(&mut *w, &conn.noise, data.as_bytes()).inspect_err(|_| {
        let _ = w.shutdown(std::net::Shutdown::Both);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keypair() -> snow::Keypair {
        snow::Builder::new(NOISE.parse().unwrap()).generate_keypair().unwrap()
    }
    fn pair_of_streams() -> (TcpStream, TcpStream) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let a = TcpStream::connect(l.local_addr().unwrap()).unwrap();
        let (b, _) = l.accept().unwrap();
        (a, b)
    }
    fn ph(id: &str, key: &[u8]) -> PairHello {
        PairHello { id: id.into(), name: id.into(), public_key: B64.encode(key), channel: "test".into(), port: 0 }
    }

    #[test]
    fn pairing_succeeds_only_with_the_right_code() {
        let (ka, kb) = (keypair(), keypair());
        let (a, b) = (ph("aaa", &ka.public), ph("bbb", &kb.public));
        for (typed, ok) in [("123456", true), ("123457", false)] {
            let (mut sa, mut sb) = pair_of_streams();
            let (a2, b2) = (a.clone(), b.clone());
            let t = std::thread::spawn(move || pair_responder(&mut sb, &b2, &a2, "123456"));
            let ra = pair_initiator(&mut sa, &a, &b, typed);
            drop(sa);
            let rb = t.join().unwrap();
            assert_eq!(ra.is_ok(), ok, "initiator with {typed}: {ra:?}");
            assert_eq!(rb.is_ok(), ok, "responder with {typed}: {rb:?}");
        }
    }

    #[test]
    fn sessions_are_encrypted_and_carry_large_messages() {
        let (ka, kb) = (keypair(), keypair());
        let (mut sa, mut sb) = pair_of_streams();
        let kb_private = kb.private.clone();
        let t = std::thread::spawn(move || {
            let (noise, id, key) = handshake(&mut sb, &kb_private, &Hello { id: "bbb".into(), channel: "test".into() }, false).unwrap();
            let noise = Mutex::new(noise);
            let got = receive_message(&mut sb, &noise).unwrap().unwrap();
            assert!(receive_message(&mut sb, &noise).unwrap().is_none(), "keep-alive");
            send_message(&mut sb, &noise, &got).unwrap();
            (id, key)
        });
        let (noise, id, key) = handshake(&mut sa, &ka.private, &Hello { id: "aaa".into(), channel: "test".into() }, true).unwrap();
        assert_eq!((id.as_str(), key), ("bbb", kb.public.clone()));
        let noise = Mutex::new(noise);
        let big: Vec<u8> = (0..250_000u32).map(|i| (i % 251) as u8).collect();
        send_message(&mut sa, &noise, &big).unwrap();
        let mut out = vec![0u8; 64];
        let n = noise.lock().unwrap().write_message(&[2], &mut out).unwrap();
        write_frame(&mut sa, &out[..n]).unwrap();
        assert_eq!(receive_message(&mut sa, &noise).unwrap().unwrap(), big);
        let (their_id, their_key) = t.join().unwrap();
        assert_eq!((their_id.as_str(), their_key), ("aaa", ka.public));
    }

    #[test]
    fn different_channels_do_not_connect() {
        let (ka, kb) = (keypair(), keypair());
        let (mut sa, mut sb) = pair_of_streams();
        let t = std::thread::spawn(move || handshake(&mut sb, &kb.private, &Hello { id: "b".into(), channel: "production".into() }, false).map(|_| ()));
        let r = handshake(&mut sa, &ka.private, &Hello { id: "a".into(), channel: "staging".into() }, true);
        assert!(r.is_err());
        assert!(t.join().unwrap().is_err());
    }
}
