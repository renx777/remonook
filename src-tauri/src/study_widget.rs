//! Private, durable bridge for native study surfaces. Only the main window owns
//! scheduling and workspace writes. Secondary windows submit immutable intents.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

pub const DIRECTORY: &str = "remonook-study-widget";
const SNAPSHOT_LIMIT: usize = 4 * 1024 * 1024;
const INTENT_LIMIT: usize = 128 * 1024;
#[derive(Default)]
pub struct Broker(pub Mutex<()>);
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub schema: u32,
    pub scope: Option<String>,
    pub workspace_name: String,
    pub updated_at: u64,
    pub revision: u64,
    pub decks: Vec<Deck>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Deck { pub id: String, pub title: String, pub cards: Vec<Card> }
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Card { pub id: String, pub fingerprint: String, pub question: String, pub answer: String }
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Intent {
    pub schema: u32,
    pub id: String,
    pub scope: String,
    pub deck_id: String,
    pub card_id: String,
    pub fingerprint: String,
    pub grade: String,
    pub reviewed_at: u64,
    pub question: String,
    pub answer: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub widget_id: Option<String>,
}
#[derive(Serialize)]
pub struct View { snapshot: Option<Snapshot>, pending: usize }
fn bounded(s: &str, max: usize) -> bool { !s.is_empty() && s.len() <= max && !s.contains('\0') }
fn event_id(s: &str) -> bool {
    if !bounded(s,128) || !s.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'||c==b'_'){return false;}
    let upper=s.to_ascii_uppercase();
    !["CON","PRN","AUX","NUL"].contains(&upper.as_str()) && !(upper.len()==4 && (upper.starts_with("COM")||upper.starts_with("LPT")) && upper.as_bytes()[3].is_ascii_digit())
}
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn snapshot_valid(s: &Snapshot) -> bool {
    if s.schema != 1 || s.workspace_name.len() > 200 || s.decks.len() > 100 || s.updated_at > 9_007_199_254_740_991 || s.revision > 9_007_199_254_740_991 { return false; }
    if s.scope.is_none() { return s.decks.is_empty(); }
    if !s.scope.as_ref().map(|v| bounded(v,200)).unwrap_or(false) { return false; }
    let mut ids=std::collections::HashSet::new();
    for d in &s.decks {
        if !bounded(&d.id,200) || d.title.len()>500 || !ids.insert(&d.id) || d.cards.len()>30 { return false; }
        let mut cards=std::collections::HashSet::new();
        for c in &d.cards { if !bounded(&c.id,200) || !bounded(&c.fingerprint,200) || !bounded(&c.question,20_000) || !bounded(&c.answer,80_000) || !cards.insert(&c.id) { return false; } }
    }
    true
}
fn intent_shape_valid(i: &Intent) -> bool {
    i.schema==1 && event_id(&i.id) && bounded(&i.scope,200) && bounded(&i.deck_id,200) && bounded(&i.card_id,200) && bounded(&i.fingerprint,200)
    && ["AGAIN","HARD","GOOD","EASY"].contains(&i.grade.as_str())
    && bounded(&i.question,20_000) && bounded(&i.answer,80_000) && i.widget_id.as_ref().map(|v| bounded(v,200)).unwrap_or(true)
}
fn intent_valid(i:&Intent,clock:u64)->bool{intent_shape_valid(i)&&i.reviewed_at<=clock.saturating_add(5*60*1000)}
fn main_only(window: &tauri::WebviewWindow) -> Result<(),String> { if window.label()=="main" { Ok(()) } else { Err("Only the main app can update study storage.".into()) } }
fn root(app: &tauri::AppHandle) -> Result<PathBuf,String> {
    let dir=app.path().app_data_dir().map_err(|_|"Private study storage is unavailable.")?.join(DIRECTORY);
    private_dir(&dir)?;private_dir(&dir.join("inbox"))?;private_dir(&dir.join("processed"))?;Ok(dir)
}
fn private_dir(path: &Path) -> Result<(),String> {
    fs::create_dir_all(path).map_err(|_|"Could not prepare private study storage.")?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt;fs::set_permissions(path,fs::Permissions::from_mode(0o700)).map_err(|_|"Could not protect study storage.")?; }
    Ok(())
}
fn read_value(path: &Path, limit: usize) -> Result<Value,String> {
    let f=File::open(path).map_err(|_|"Could not read study storage; retained data was not removed.")?;
    if f.metadata().map_err(|_|"Could not inspect study storage.")?.len() > limit as u64 { return Err("Study storage exceeds its safety limit; retained data was not removed.".into()); }
    let mut bytes=Vec::new();f.take((limit+1) as u64).read_to_end(&mut bytes).map_err(|_|"Could not read study storage.")?;
    if bytes.len()>limit {return Err("Study storage exceeds its safety limit.".into());}
    serde_json::from_slice(&bytes).map_err(|_|"Unreadable widget review retained on this device; no review was removed.".into())
}
fn open_new(path: &Path) -> Result<File,std::io::Error> {
    let mut options=OpenOptions::new();options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt;options.mode(0o600); }
    options.open(path)
}
fn sync_dir(path:&Path)->Result<(),String>{
    #[cfg(unix)] {File::open(path).and_then(|d|d.sync_all()).map_err(|_|"Could not finalize durable study storage. The review is retained; retry.")?;}
    #[cfg(not(unix))] let _=path;
    Ok(())
}
/// Publish one immutable review across processes. A hard link never replaces an
/// existing event, unlike rename on Unix; only a fully fsynced inode is visible.
fn write_intent(dir:&Path,intent:&Intent)->Result<(),String>{
    let bytes=serde_json::to_vec(intent).map_err(|_|"Could not encode the review.")?;
    if bytes.len()>INTENT_LIMIT{return Err("This review exceeds the study storage limit.".into());}
    let mut random=[0u8;12];getrandom::fill(&mut random).map_err(|_|"Could not secure the review.")?;
    let suffix:String=random.iter().map(|b|format!("{b:02x}")).collect();
    let temporary=dir.join(format!("{}.{}.tmp",intent.id,suffix));let final_path=dir.join(format!("{}.json",intent.id));
    let mut f=open_new(&temporary).map_err(|_|"Could not save this review.")?;
    f.write_all(&bytes).and_then(|_|f.sync_all()).map_err(|_|"Could not save this review. Keep the study window open and retry.")?;drop(f);
    match fs::hard_link(&temporary,&final_path){
        Ok(())=>{},
        Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>{
            let previous:Intent=serde_json::from_value(read_value(&final_path,INTENT_LIMIT)?).map_err(|_|"A retained review needs attention.")?;
            if previous!=*intent{return Err("A different review already uses this operation id; both versions are retained.".into());}
        },
        Err(_)=>return Err("Could not publish this review safely. It is retained; retry before closing.".into()),
    }
    sync_dir(dir)?;let _=fs::remove_file(&temporary);Ok(())
}
#[cfg(windows)]
fn replace_snapshot(from:&Path,to:&Path)->Result<(),String>{
    use std::os::windows::ffi::OsStrExt;
    // MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH. Existing readers may
    // make replacement fail, in which case both old cache and new temp remain.
    #[link(name="kernel32")]
    extern "system" { fn MoveFileExW(existing:*const u16,replacement:*const u16,flags:u32)->i32; }
    let old:Vec<u16>=from.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let new:Vec<u16>=to.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let ok=unsafe{MoveFileExW(old.as_ptr(),new.as_ptr(),0x1|0x8)};
    if ok==0{return Err("Could not replace the study cache. The previous cache and new temporary were retained; retry.".into());}Ok(())
}
#[cfg(not(windows))]
fn replace_snapshot(from:&Path,to:&Path)->Result<(),String>{fs::rename(from,to).map_err(|_|"Could not finish saving the study cache. The previous cache and new temporary were retained; retry.".into())}
fn sync_saved_file(path:&Path)->Result<(),String>{
    // Windows FlushFileBuffers requires a write-capable handle. No bytes are
    // changed; this flush happens after creating the archive link, before unlink.
    OpenOptions::new().read(true).write(true).open(path).and_then(|f|f.sync_all()).map_err(|_|"Could not finalize the review archive. Pending data was retained.".into())
}
fn atomic_json(path: &Path, value: &impl Serialize, limit: usize) -> Result<(),String> {
    let bytes=serde_json::to_vec(value).map_err(|_|"Could not encode study storage.")?;
    if bytes.len()>limit {return Err("Study storage exceeds its safety limit.".into());}
    let mut random=[0u8;12];getrandom::fill(&mut random).map_err(|_|"Could not secure study storage.")?;
    let suffix:String=random.iter().map(|b|format!("{b:02x}")).collect();
    let tmp=path.with_extension(format!("{suffix}.tmp"));
    let mut f=open_new(&tmp).map_err(|_|"Could not save study storage.")?;
    f.write_all(&bytes).and_then(|_|f.sync_all()).map_err(|_|"Could not save study storage. Retry before closing.")?;drop(f);
    replace_snapshot(&tmp,path)?;
    if let Some(parent)=path.parent(){sync_dir(parent)?;}
    Ok(())
}
fn snapshot_at(dir: &Path) -> Result<Option<Snapshot>,String> {
    let path=dir.join("snapshot.json");if !path.exists(){return Ok(None);}
    let s:Snapshot=serde_json::from_value(read_value(&path,SNAPSHOT_LIMIT)?).map_err(|_|"The study cache needs a refresh from the main app.")?;
    if !snapshot_valid(&s){return Err("The study cache needs a refresh from the main app.".into());}Ok(Some(s))
}
fn inbox_at(dir: &Path,scope:&str) -> Result<Vec<Value>,String> {
    let mut values=Vec::new();
    for entry in fs::read_dir(dir.join("inbox")).map_err(|_|"Could not read pending study reviews.")? {
        let path=entry.map_err(|_|"Could not read pending study reviews.")?.path();
        if path.extension().and_then(|s|s.to_str())!=Some("json"){continue;}
        let v=match read_value(&path,INTENT_LIMIT){Ok(v)=>v,Err(_)=>{values.push(serde_json::json!({"schema":0,"widgetIssue":"An unreadable widget review is retained on this device."}));continue;}};
        match v.get("scope").and_then(Value::as_str){Some(owner) if owner==scope=>values.push(v),Some(_)=>{},None=>values.push(serde_json::json!({"schema":0,"widgetIssue":"A widget review with no workspace identity is retained on this device."}))}
    }
    values.sort_by(|a,b|a.get("reviewedAt").and_then(Value::as_u64).unwrap_or(0).cmp(&b.get("reviewedAt").and_then(Value::as_u64).unwrap_or(0)).then_with(||a.get("id").and_then(Value::as_str).cmp(&b.get("id").and_then(Value::as_str))));
    Ok(values)
}
fn notify_widget(app:&tauri::AppHandle){let _=app.emit_to("study-widget","study-widget-updated",());}
fn notify_review(app:&tauri::AppHandle){notify_widget(app);let _=app.emit_to("main","study-widget-review",());}

#[tauri::command]
pub fn study_widget_publish(app:tauri::AppHandle,window:tauri::WebviewWindow,state:tauri::State<Broker>,snapshot:Snapshot)->Result<(),String>{
    main_only(&window)?;if !snapshot_valid(&snapshot){return Err("Invalid study cache. Notes were not changed.".into());}
    let _lock=state.0.lock().map_err(|_|"Study storage is busy.")?;let dir=root(&app)?;
    atomic_json(&dir.join("snapshot.json"),&snapshot,SNAPSHOT_LIMIT)?;notify_widget(&app);Ok(())
}
#[tauri::command]
pub fn study_widget_state(app:tauri::AppHandle,window:tauri::WebviewWindow,state:tauri::State<Broker>)->Result<View,String>{
    if !["main","study-widget"].contains(&window.label()){return Err("Study storage is unavailable in this window.".into());}
    let _lock=state.0.lock().map_err(|_|"Study storage is busy.")?;let dir=root(&app)?;let mut snapshot=snapshot_at(&dir)?;let mut pending=0;
    if let Some(ref mut s)=snapshot {if let Some(ref scope)=s.scope {
        let events=inbox_at(&dir,scope)?;pending=events.iter().filter(|v|v.get("scope").and_then(Value::as_str)==Some(scope.as_str())).count();
        for deck in &mut s.decks {deck.cards.retain(|card|!events.iter().any(|v|v.get("cardId").and_then(Value::as_str)==Some(card.id.as_str())&&v.get("fingerprint").and_then(Value::as_str)==Some(card.fingerprint.as_str())));}
    }}Ok(View{snapshot,pending})
}
#[tauri::command]
pub fn study_widget_submit(app:tauri::AppHandle,window:tauri::WebviewWindow,state:tauri::State<Broker>,intent:Intent)->Result<(),String>{
    if !["main","study-widget"].contains(&window.label()){return Err("Study actions are unavailable in this window.".into());}
    if !intent_shape_valid(&intent){return Err("Invalid study review. The draft was retained; refresh and try again.".into());}
    let _lock=state.0.lock().map_err(|_|"Study storage is busy.")?;let dir=root(&app)?;
    // Repeated commands are idempotent, including after acknowledgement.
    for folder in ["inbox","processed"] {let p=dir.join(folder).join(format!("{}.json",intent.id));if p.exists(){let prior:Intent=serde_json::from_value(read_value(&p,INTENT_LIMIT)?).map_err(|_|"A retained review needs attention.")?;return if prior==intent{Ok(())}else{Err("A different review already uses this operation id.".into())};}}
    // A retry of an already durable immutable event succeeds even after the
    // device clock moved backwards. New events still obey the live clock bound.
    if !intent_valid(&intent,now()){return Err("Could not save this review. Check the device clock and try again.".into());}
    let s=snapshot_at(&dir)?.ok_or("Open RemoNook once to choose a study deck.")?;
    let card=s.decks.iter().find(|d|d.id==intent.deck_id).and_then(|d|d.cards.iter().find(|c|c.id==intent.card_id));
    if s.scope.as_deref()!=Some(intent.scope.as_str()) || !card.map(|c|c.fingerprint==intent.fingerprint&&c.question==intent.question&&c.answer==intent.answer).unwrap_or(false){return Err("This card changed. Refresh and reveal it again before grading.".into());}
    write_intent(&dir.join("inbox"),&intent)?;notify_review(&app);Ok(())
}
#[tauri::command]
pub fn study_widget_inbox(app:tauri::AppHandle,window:tauri::WebviewWindow,state:tauri::State<Broker>,scope:String)->Result<Vec<Value>,String>{
    main_only(&window)?;if !bounded(&scope,200){return Err("Invalid study workspace.".into());}
    let _lock=state.0.lock().map_err(|_|"Study storage is busy.")?;inbox_at(&root(&app)?,&scope)
}
#[tauri::command]
pub fn study_widget_ack(app:tauri::AppHandle,window:tauri::WebviewWindow,state:tauri::State<Broker>,scope:String,ids:Vec<String>)->Result<(),String>{
    main_only(&window)?;if !bounded(&scope,200)||ids.len()>1000||ids.iter().any(|id|!event_id(id)){return Err("Invalid study acknowledgement.".into());}
    let _lock=state.0.lock().map_err(|_|"Study storage is busy.")?;let dir=root(&app)?;
    for id in ids {let path=dir.join("inbox").join(format!("{id}.json"));if !path.exists(){continue;}
        let value=read_value(&path,INTENT_LIMIT)?;if value.get("scope").and_then(Value::as_str)!=Some(scope.as_str()){return Err("The study workspace changed; this review was retained.".into());}
        let dest=dir.join("processed").join(format!("{id}.json"));
        match fs::hard_link(&path,&dest){
            Ok(())=>{},
            Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>{if read_value(&dest,INTENT_LIMIT)?!=value{return Err("A retained review differs from its archive. Both were preserved.".into());}},
            Err(_)=>return Err("Could not archive a saved review. It remains pending.".into()),
        }
        // Archive durability precedes removal from the pending queue.
        sync_saved_file(&dest)?;
        sync_dir(&dir.join("processed"))?;
        fs::remove_file(&path).map_err(|_|"Could not finish archiving a saved review.")?;
        sync_dir(&dir.join("inbox"))?;
    }notify_widget(&app);Ok(())
}
#[cfg(desktop)]
pub fn open(app:&tauri::AppHandle)->Result<(),String>{
    use tauri::{WebviewUrl,WebviewWindowBuilder};
    let window=match app.get_webview_window("study-widget"){Some(w)=>w,None=>WebviewWindowBuilder::new(app,"study-widget",WebviewUrl::App("index.html#study-widget".into()))
        .title("Study widget · RemoNook").inner_size(400.0,520.0).min_inner_size(320.0,360.0).resizable(true).always_on_top(true).skip_taskbar(false).visible(false).build().map_err(|_|"Could not open the study window.")?};
    let _=window.unminimize();window.show().map_err(|_|"Could not show the study window.")?;let _=window.set_focus();let _=app.emit_to("main","study-widget-refresh",());Ok(())
}
#[tauri::command]
#[cfg(desktop)]
pub fn study_widget_open(app:tauri::AppHandle)->Result<(),String>{open(&app)}
#[tauri::command]
#[cfg(desktop)]
pub fn study_widget_hide(app:tauri::AppHandle,window:tauri::WebviewWindow)->Result<(),String>{if window.label()!="study-widget"{return Err("Not a study window.".into());}app.get_webview_window("study-widget").ok_or("Study window is unavailable.")?.hide().map_err(|_|"Could not hide the study window.".into())}

#[cfg(test)]
mod tests{
 use super::*;
 fn sample()->Snapshot{Snapshot{schema:1,scope:Some("account/workspace".into()),workspace_name:"Notes".into(),updated_at:1,revision:1,decks:vec![Deck{id:"deck".into(),title:"Deck".into(),cards:vec![Card{id:"card".into(),fingerprint:"v1".into(),question:"Question".into(),answer:"Answer".into()}]}]}}
 #[test]fn snapshot_bounds_and_privacy(){assert!(snapshot_valid(&sample()));let mut s=sample();s.scope=None;assert!(!snapshot_valid(&s));s.decks.clear();assert!(snapshot_valid(&s));let mut s=sample();s.decks[0].cards[0].answer="x".repeat(80_001);assert!(!snapshot_valid(&s));}
 #[test]fn intent_ids_and_clock(){let i=Intent{schema:1,id:"a-b_c123".into(),scope:"scope".into(),deck_id:"deck".into(),card_id:"card".into(),fingerprint:"v1".into(),grade:"GOOD".into(),reviewed_at:100,question:"Q".into(),answer:"A".into(),widget_id:None};assert!(intent_valid(&i,100));let mut bad=i.clone();bad.id="../escape".into();assert!(!intent_valid(&bad,100));for name in ["CON","prn","AUX","NUL","COM1","lpt9"]{assert!(!event_id(name));}let mut bad=i.clone();bad.grade="PRACTICE".into();assert!(!intent_valid(&bad,100));let mut bad=i;bad.reviewed_at=300_101;assert!(!intent_valid(&bad,100));}
 #[test]fn atomic_roundtrip_preserves_events(){let dir=std::env::temp_dir().join(format!("remonook-widget-test-{}-{}",std::process::id(),now()));private_dir(&dir).unwrap();private_dir(&dir.join("inbox")).unwrap();atomic_json(&dir.join("snapshot.json"),&sample(),SNAPSHOT_LIMIT).unwrap();assert_eq!(snapshot_at(&dir).unwrap().unwrap().revision,1);atomic_json(&dir.join("snapshot.json"),&sample(),SNAPSHOT_LIMIT).unwrap();let v=serde_json::json!({"id":"retained","scope":"account/workspace","grade":"BAD","reviewedAt":0});atomic_json(&dir.join("inbox/retained.json"),&v,INTENT_LIMIT).unwrap();assert_eq!(inbox_at(&dir,"account/workspace").unwrap(),vec![v]);assert_eq!(inbox_at(&dir,"other").unwrap().len(),0);fs::write(dir.join("inbox/broken.json"),b"{invalid").unwrap();let values=inbox_at(&dir,"account/workspace").unwrap();assert_eq!(values.len(),2);assert!(values.iter().any(|v|v.get("widgetIssue").is_some()));assert!(dir.join("inbox/broken.json").exists());fs::remove_dir_all(dir).unwrap();}
 #[test]fn immutable_review_cannot_replace_another_event(){
  let dir=std::env::temp_dir().join(format!("remonook-widget-immutable-{}-{}",std::process::id(),now()));private_dir(&dir).unwrap();
  let intent=Intent{schema:1,id:"event".into(),scope:"scope".into(),deck_id:"deck".into(),card_id:"card".into(),fingerprint:"v1".into(),grade:"GOOD".into(),reviewed_at:1,question:"Q".into(),answer:"A".into(),widget_id:None};
  write_intent(&dir,&intent).unwrap();write_intent(&dir,&intent).unwrap();let mut competing=intent.clone();competing.grade="AGAIN".into();assert!(write_intent(&dir,&competing).is_err());
  let stored:Intent=serde_json::from_value(read_value(&dir.join("event.json"),INTENT_LIMIT).unwrap()).unwrap();assert_eq!(stored,intent);assert!(fs::read_dir(&dir).unwrap().count()>=2,"competing retained temporary must remain available");fs::remove_dir_all(dir).unwrap();
 }

}
