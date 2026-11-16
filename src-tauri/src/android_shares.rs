//! Durable incoming Android shares. Presentation/receipt writes stay in the canonical app.
use std::{fs,io::{Read,Write},path::PathBuf};
use tauri::Manager;
use serde_json::Value;
fn root(app:&tauri::AppHandle)->Result<PathBuf,String>{
 let root=app.path().app_data_dir().map_err(|_|"Share storage is unavailable.")?.join("remonook-shares");
 for part in ["inbox","saved","claims"]{fs::create_dir_all(root.join(part)).map_err(|_|"Could not open share storage.")?;}
 Ok(root)
}
fn main_only(window:&tauri::WebviewWindow)->Result<(),String>{if window.label()=="main"{Ok(())}else{Err("Only the main app can receive shares.".into())}}
fn read(path:&std::path::Path)->Result<Value,String>{
 let file=fs::File::open(path).map_err(|_|"Could not read a retained share.")?;
 if file.metadata().map_err(|_|"Could not inspect a retained share.")?.len()>2*1024*1024{return Err("A large share is retained on this device.".into())}
 let mut data=Vec::new();file.take(2*1024*1024+1).read_to_end(&mut data).map_err(|_|"Could not read a retained share.")?;
 serde_json::from_slice(&data).map_err(|_|"An unreadable share is retained on this device.".into())
}
#[tauri::command]
pub fn android_share_inbox(app:tauri::AppHandle,window:tauri::WebviewWindow,scope:String)->Result<Vec<Value>,String>{
 main_only(&window)?;valid_scope(&scope)?;let root=root(&app)?;let mut values=Vec::new();
 for entry in fs::read_dir(root.join("inbox")).map_err(|_|"Could not read incoming shares.")?{
  let path=entry.map_err(|_|"Could not inspect incoming shares.")?.path();
  if path.extension().and_then(|s|s.to_str())!=Some("json"){continue}
  let claim=root.join("claims").join(path.file_name().ok_or("Invalid incoming share path.")?);
  if claim.exists(){match read(&claim){Ok(value) if value.get("scope").and_then(Value::as_str)==Some(scope.as_str())=>{},Ok(_)=>continue,Err(_)=>{values.push(serde_json::json!({"shareIssue":"An incoming share with an unreadable destination is retained on this device."}));continue}}}
  match read(&path){Ok(value)=>values.push(value),Err(_)=>values.push(serde_json::json!({"shareIssue":"An unreadable incoming share is retained on this device."}))}
 }
 values.sort_by_key(|v|v.get("receivedAt").and_then(Value::as_u64).unwrap_or(0));Ok(values)
}
#[tauri::command]
pub fn android_share_ack(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,scope:String)->Result<(),String>{
 main_only(&window)?;
 if id.len()!=36||!id.bytes().all(|c|c.is_ascii_hexdigit()||c==b'-'){return Err("Invalid share identity.".into())}
 valid_scope(&scope)?;let root=root(&app)?;
 let claim=read(&root.join("claims").join(format!("{id}.json")))?;
 if claim.get("scope").and_then(Value::as_str)!=Some(scope.as_str()){return Err("This share remains assigned to its original workspace.".into())}
 let source=root.join("inbox").join(format!("{id}.json"));let target=root.join("saved").join(format!("{id}.json"));
 if !source.exists(){return if target.exists(){Ok(())}else{Err("The incoming share is unavailable.".into())}}
 let value=read(&source)?;if value.get("id").and_then(Value::as_str)!=Some(id.as_str()){return Err("This share was retained because its identity differs.".into())}
 // Android forbids hard links in app storage (EACCES), so archive by rename (atomic, same volume).
 if target.exists(){
  if read(&target)?!=value{return Err("Both versions of this share were retained.".into())}
  fs::remove_file(&source).map_err(|_|"Could not finish archiving this saved share.")?;
 }else{fs::rename(&source,&target).map_err(|_|"Could not archive this share. It remains pending.")?;}
 fs::File::open(root.join("saved")).and_then(|f|f.sync_all()).map_err(|_|"Could not finalize this share. It remains pending.")?;
 fs::File::open(root.join("inbox")).and_then(|f|f.sync_all()).map_err(|_|"Could not finalize share storage.")?;Ok(())
}

fn valid_scope(scope:&str)->Result<(),String>{if !scope.is_empty()&&scope.len()<=200&&!scope.contains('\0'){Ok(())}else{Err("Invalid share workspace.".into())}}
#[tauri::command]
pub fn android_share_claim(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,scope:String)->Result<(),String>{
 main_only(&window)?;valid_scope(&scope)?;
 if id.len()!=36||!id.bytes().all(|c|c.is_ascii_hexdigit()||c==b'-'){return Err("Invalid share identity.".into())}
 let root=root(&app)?;let path=root.join("claims").join(format!("{id}.json"));
 let expected=serde_json::json!({"id":id,"scope":scope});
 if path.exists(){
  if read(&path)?!=expected{return Err("This share remains assigned to its original workspace.".into())}
  fs::File::open(root.join("claims")).and_then(|f|f.sync_all()).map_err(|_|"Could not finalize the share destination. Retry saving.")?;return Ok(())
 }
 let source=read(&root.join("inbox").join(format!("{id}.json")))?;
 if source.get("id").and_then(Value::as_str)!=Some(id.as_str()){return Err("The incoming share identity differs. It was retained.".into())}
 let mut random=[0u8;12];getrandom::fill(&mut random).map_err(|_|"Could not secure the share destination.")?;
 let suffix:String=random.iter().map(|v|format!("{v:02x}")).collect();let temp=root.join("claims").join(format!("{id}.{suffix}.tmp"));
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|_|"Could not save the share destination.")?;
 file.write_all(serde_json::to_string(&expected).map_err(|_|"Could not encode share destination.")?.as_bytes()).and_then(|_|file.sync_all()).map_err(|_|"Could not save the share destination.")?;drop(file);
 // No hard links on Android (EACCES): publish the claim by rename, unless one appeared meanwhile.
 if path.exists(){let _=fs::remove_file(&temp);if read(&path)?!=expected{return Err("The original share destination was retained. Retry in its workspace.".into())}}
 else if fs::rename(&temp,&path).is_err(){let _=fs::remove_file(&temp);return Err("Could not save the share destination. Retry saving.".into())}
 fs::File::open(root.join("claims")).and_then(|f|f.sync_all()).map_err(|_|"Could not finalize the share destination. Retry saving.")?;
 let _=fs::remove_file(temp);Ok(())
}
